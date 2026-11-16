import { resourceIdFromHref } from "@/api/resources";
import { useScopedSession } from "@/hooks/use-scoped-session";
import type { DistributionDetail, Publication, Repository } from "@/api/types";
import { FormError } from "@/components/ui/alert";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Combobox } from "@/components/ui/combobox";
import { SubmitButton } from "@/components/ui/submit-button";
import { useLoadMoreList, usePublication } from "@/hooks/queries";
import { useListSearch } from "@/hooks/use-list-search";
import {
  distributionSupportsPublications,
  distributionTypeInfo,
  publicationTypeLabel,
} from "@/lib/distributions";
import { truncate } from "@/lib/format";
import { repositoryFilterTypes } from "@/lib/plugins";
import { cn } from "@/lib/utils";
import { Save } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { dialogCopy, publicationLabel, useDistributionSave } from "./edit-distribution-shared";

const SOURCE_CARD_CLASS_NAME = "rounded-lg border p-3 transition-colors";
const ACTIVE_CARD_CLASS_NAME =
  "border-orange-500 bg-orange-50/60 dark:border-orange-500/60 dark:bg-orange-950/20";
const IDLE_CARD_CLASS_NAME = "border-zinc-200 dark:border-zinc-800";
const DISABLED_CARD_CLASS_NAME =
  "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/30";

type ContentSource = "repository" | "publication" | "none";

function sourceCardClassName(active: boolean, disabled = false): string {
  if (disabled) {
    return cn(SOURCE_CARD_CLASS_NAME, DISABLED_CARD_CLASS_NAME);
  }
  return cn(SOURCE_CARD_CLASS_NAME, active ? ACTIVE_CARD_CLASS_NAME : IDLE_CARD_CLASS_NAME);
}

export function EditDistributionSourceDialog({
  distribution,
  onClose,
}: {
  distribution: DistributionDetail;
  onClose: () => void;
}) {
  const href = distribution.pulp_href;
  const copy = dialogCopy(distribution.name, "source");
  const { error, isSubmitting, saveChanges } = useDistributionSave(href ?? "", onClose);
  const supportsPublications = distributionSupportsPublications(href);
  const typeInfo = distributionTypeInfo(href);
  const compatibleRepositoryTypes = repositoryFilterTypes(typeInfo?.repositoryType).join(",");

  const currentPublication = usePublication(distribution.publication ?? undefined);
  const { prns: scopedPrns } = useScopedSession();
  const repositorySearchSearch = useListSearch();
  const repositories = useLoadMoreList<Repository>(
    "repositories",
    {
      pulp_type__in: compatibleRepositoryTypes,
      name__contains: repositorySearchSearch.queryParam,
      prn__in: scopedPrns?.join(","),
      ordering: "name",
    },
    { enabled: Boolean(compatibleRepositoryTypes) },
  );

  const [source, setSource] = useState<ContentSource>(
    distribution.publication ? "publication" : distribution.repository ? "repository" : "none",
  );
  const [repositoryHref, setRepositoryHref] = useState(distribution.repository ?? "");
  const [publicationHref, setPublicationHref] = useState(distribution.publication ?? "");

  const publicationScopeHref = repositoryHref || currentPublication.data?.repository || undefined;
  const publicationTypes = typeInfo?.publicationTypes.join(",") || undefined;
  const publications = useLoadMoreList<Publication>(
    "publications",
    {
      repository: publicationScopeHref,
      pulp_type__in: publicationTypes,
      ordering: "-pulp_created",
    },
    { enabled: supportsPublications },
  );

  const repositoriesById = new Map(
    (repositories.data?.results ?? []).flatMap((repository) =>
      repository.pulp_href ? [[resourceIdFromHref(repository.pulp_href), repository] as const] : [],
    ),
  );

  const repositoryOptions = (repositories.data?.results ?? []).flatMap((repository) =>
    repository.pulp_href ? [{ value: repository.pulp_href, label: repository.name }] : [],
  );
  if (
    distribution.repository &&
    !repositoryOptions.some((option) => option.value === distribution.repository)
  ) {
    repositoryOptions.unshift({
      value: distribution.repository,
      label: `${truncate(distribution.repository, 36)} (current)`,
    });
  }

  const publicationOptions = (publications.data?.results ?? []).flatMap((publication) =>
    publication.pulp_href
      ? [
          {
            value: publication.pulp_href,
            label: publicationLabel(publication, repositoriesById),
          },
        ]
      : [],
  );
  if (
    distribution.publication &&
    !publicationOptions.some((option) => option.value === distribution.publication)
  ) {
    publicationOptions.unshift({
      value: distribution.publication,
      label: `${publicationTypeLabel(distribution.publication)} — ${truncate(distribution.publication, 36)} (current)`,
    });
  }

  const firstRepositoryValue = repositoryOptions[0]?.value;
  const firstPublicationValue = publicationOptions[0]?.value;

  useEffect(() => {
    if (source === "repository" && !repositoryHref && firstRepositoryValue) {
      setRepositoryHref(firstRepositoryValue);
    }
  }, [source, repositoryHref, firstRepositoryValue]);

  useEffect(() => {
    if (source === "publication" && !publicationHref && firstPublicationValue) {
      setPublicationHref(firstPublicationValue);
    }
  }, [source, publicationHref, firstPublicationValue]);

  useEffect(() => {
    if (!repositoryHref && currentPublication.data?.repository) {
      setRepositoryHref(currentPublication.data.repository);
    }
  }, [repositoryHref, currentPublication.data?.repository]);

  const sourceIsValid =
    source === "none" ||
    (source === "repository" && Boolean(repositoryHref)) ||
    (source === "publication" && supportsPublications && Boolean(publicationHref));
  const initialSource: ContentSource = distribution.publication
    ? "publication"
    : distribution.repository
      ? "repository"
      : "none";
  const dirty =
    source !== initialSource ||
    repositoryHref !== (distribution.repository ?? "") ||
    publicationHref !== (distribution.publication ?? "");
  const canSubmit = Boolean(href) && sourceIsValid && !isSubmitting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    const body: Record<string, unknown> = {
      repository: source === "repository" ? repositoryHref : null,
    };
    if (supportsPublications) {
      body.publication = source === "publication" ? publicationHref : null;
    }
    await saveChanges(body, "Unable to update the content source.");
  }

  let repositoryHelper = "No compatible repositories are configured.";
  if (repositories.isLoading) {
    repositoryHelper = "Loading repositories…";
  } else if (repositories.isError) {
    repositoryHelper = "Could not load repositories.";
  } else if (repositoryOptions.length) {
    repositoryHelper = supportsPublications
      ? "This distribution will serve the repository's newest publication."
      : "This distribution will serve the repository's content directly.";
  } else if (repositorySearchSearch.term) {
    repositoryHelper = "No compatible repositories match this search.";
  }

  let publicationHelper = "No publications are available yet.";
  if (!supportsPublications) {
    publicationHelper = "This distribution type does not support Pulp publications.";
  } else if (publications.isLoading) {
    publicationHelper = "Loading publications…";
  } else if (publications.isError) {
    publicationHelper = "Could not load publications.";
  } else if (publicationOptions.length) {
    publicationHelper = "Pinning freezes the distribution at this publication version.";
  } else if (publicationScopeHref) {
    publicationHelper =
      "No publications exist for this repository yet. Publish a version or enable auto-publish first.";
  } else {
    publicationHelper = "Select a repository or publish a version to see publications.";
  }

  const publicationCardDisabled = !supportsPublications || publicationOptions.length === 0;

  return (
    <Modal
      open
      onClose={onClose}
      title={copy.title}
      description={copy.description}
      className="max-w-2xl"
      busy={isSubmitting}
      dirty={dirty}
      footer={
        <>
          <ModalCancelButton disabled={isSubmitting}>Cancel</ModalCancelButton>
          <SubmitButton
            form="edit-distribution-source-form"
            isSubmitting={isSubmitting}
            label="Save content source"
            busyLabel="Saving…"
            icon={Save}
            disabled={!canSubmit}
          />
        </>
      }
    >
      <form id="edit-distribution-source-form" className="space-y-4" onSubmit={handleSubmit}>
        <fieldset className="space-y-3">
          <legend className="sr-only">Content source</legend>

          <div className={sourceCardClassName(source === "repository")}>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="radio"
                name="distribution-source"
                value="repository"
                checked={source === "repository"}
                onChange={() => setSource("repository")}
                className="mt-0.5 size-4 border-zinc-300 text-orange-600 focus:ring-orange-500"
              />
              <span>
                <span className="block text-xs font-medium text-zinc-800 dark:text-zinc-200">
                  Follow repository
                </span>
                <span className="block text-meta text-zinc-500 dark:text-zinc-400">
                  {supportsPublications
                    ? "Serves the repository's newest publication and updates automatically."
                    : "Serves the repository's content directly from its latest version."}
                </span>
              </span>
            </label>
            {source === "repository" ? (
              <div className="mt-3 pl-7">
                <Combobox
                  id="source-repository"
                  label="Repository"
                  value={repositoryHref}
                  onChange={setRepositoryHref}
                  options={repositoryOptions}
                  emptyLabel="Select a repository…"
                  searchValue={repositorySearchSearch.input}
                  onSearchChange={repositorySearchSearch.setInput}
                  searchPlaceholder="Search repositories…"
                  isLoading={repositories.isLoading}
                  isError={repositories.isError}
                  onRetry={() => void repositories.refetch()}
                  helper={repositoryHelper}
                  disabled={isSubmitting}
                  required
                  hasMore={repositories.hasMore}
                  loadedCount={repositoryOptions.length}
                  totalCount={repositories.total}
                  onLoadMore={repositories.loadMore}
                />
              </div>
            ) : null}
          </div>

          {supportsPublications ? (
            <div className={sourceCardClassName(source === "publication", publicationCardDisabled)}>
              <label
                className={cn(
                  "flex items-start gap-3",
                  publicationCardDisabled ? "cursor-not-allowed" : "cursor-pointer",
                )}
              >
                <input
                  type="radio"
                  name="distribution-source"
                  value="publication"
                  checked={source === "publication"}
                  onChange={() => setSource("publication")}
                  disabled={publicationCardDisabled}
                  className="mt-0.5 size-4 border-zinc-300 text-orange-600 focus:ring-orange-500"
                />
                <span>
                  <span className="block text-xs font-medium text-zinc-800 dark:text-zinc-200">
                    Pin a publication
                  </span>
                  <span className="block text-meta text-zinc-500 dark:text-zinc-400">
                    Freezes this distribution at one publication version.
                  </span>
                </span>
              </label>
              {source === "publication" ? (
                <div className="mt-3 pl-7">
                  <Combobox
                    id="source-publication"
                    label="Publication"
                    value={publicationHref}
                    onChange={setPublicationHref}
                    options={publicationOptions}
                    emptyLabel="Select a publication…"
                    isLoading={publications.isLoading}
                    isError={publications.isError}
                    onRetry={() => void publications.refetch()}
                    helper={publicationHelper}
                    disabled={isSubmitting}
                    required
                    hasMore={publications.hasMore}
                    loadedCount={publicationOptions.length}
                    totalCount={publications.total}
                    onLoadMore={publications.loadMore}
                  />
                </div>
              ) : publicationCardDisabled ? (
                <p className="mt-2 pl-7 text-meta text-zinc-500 dark:text-zinc-400">
                  {publicationHelper}
                </p>
              ) : null}
            </div>
          ) : null}

          <div
            className={cn(
              SOURCE_CARD_CLASS_NAME,
              source === "none"
                ? "border-amber-400 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-950/20"
                : IDLE_CARD_CLASS_NAME,
            )}
          >
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="radio"
                name="distribution-source"
                value="none"
                checked={source === "none"}
                onChange={() => setSource("none")}
                className="mt-0.5 size-4 border-zinc-300 text-orange-600 focus:ring-orange-500"
              />
              <span>
                <span className="block text-xs font-medium text-zinc-800 dark:text-zinc-200">
                  No content source
                </span>
                <span className="block text-meta text-zinc-500 dark:text-zinc-400">
                  The content app returns 404 until a repository or publication is attached.
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        {error ? <FormError>{error}</FormError> : null}
      </form>
    </Modal>
  );
}
