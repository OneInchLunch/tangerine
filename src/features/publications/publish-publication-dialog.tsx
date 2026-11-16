import { repositoryTypeFromHref } from "@/api/resources";
import { useCanConfigureSigning } from "@/hooks/use-can-configure-signing";
import { useScopedSession } from "@/hooks/use-scoped-session";
import type { Repository, RepositoryVersion, SigningService } from "@/api/types";
import { FormError } from "@/components/ui/alert";
import { DescriptorFields } from "@/components/ui/descriptor-fields";
import { Label } from "@/components/ui/label";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Combobox } from "@/components/ui/combobox";
import { Spinner } from "@/components/ui/spinner";
import { SubmitButton } from "@/components/ui/submit-button";
import { useLoadMoreList, useRepository } from "@/hooks/queries";
import { useListSearch } from "@/hooks/use-list-search";
import {
  buildDescriptorBody,
  initialDescriptorValues,
  type DescriptorValues,
  FieldValueError,
} from "@/lib/field-descriptors";
import {
  publicationFieldsForRepositoryType,
  publicationRepositoryPulpTypes,
  repositoryTypeLabel,
} from "@/lib/plugins";
import { formatApiError } from "@/lib/errors";
import { PackageCheck } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { usePublishPublication } from "./publication-publish";

export function PublishPublicationDialog({
  repositoryHref,
  repositoryName,
  versionHref,
  onClose,
}: {
  repositoryHref?: string;
  repositoryName?: string;
  versionHref?: string;
  onClose: () => void;
}) {
  const publish = usePublishPublication();
  const { prns: scopedPrns } = useScopedSession();
  const [selectedRepository, setSelectedRepository] = useState(repositoryHref ?? "");
  const repositorySearchSearch = useListSearch();
  const repositories = useLoadMoreList<Repository>(
    "repositories",
    {
      pulp_type__in: publicationRepositoryPulpTypes().join(","),
      name__contains: repositorySearchSearch.queryParam,
      prn__in: scopedPrns?.join(","),
      ordering: "name",
    },
    { enabled: !repositoryHref },
  );
  const repository = useRepository(selectedRepository || undefined);
  const currentRepository = repositoryHref
    ? undefined
    : (repositories.data?.results ?? []).find((item) => item.pulp_href === selectedRepository);
  const selectedRepositoryData = repositoryHref ? repository.data : currentRepository;
  const repositoryType = repositoryTypeFromHref(selectedRepository);
  const canConfigureSigning = useCanConfigureSigning();
  const fields = useMemo(
    () => publicationFieldsForRepositoryType(repositoryType),
    [repositoryType],
  );
  // Signing is a maintainer-only trust operation; hide the selector from other
  // sessions even though the gateway also rejects signing fields for them.
  const visibleFields = useMemo(
    () => fields.filter((field) => field.type !== "signing-service" || canConfigureSigning),
    [fields, canConfigureSigning],
  );
  const hasSigningService = visibleFields.some((field) => field.type === "signing-service");
  const signingServices = useLoadMoreList<SigningService>(
    "signing-services",
    { ordering: "name" },
    { enabled: hasSigningService },
  );

  const [version, setVersion] = useState(versionHref ?? "");
  const versions = useLoadMoreList<RepositoryVersion>(
    `${selectedRepository}versions`,
    { ordering: "-number" },
    { enabled: Boolean(selectedRepository) },
  );
  const [values, setValues] = useState<DescriptorValues>(() =>
    initialDescriptorValues(visibleFields),
  );
  const [error, setError] = useState<string | null>(null);
  const dirty =
    selectedRepository !== (repositoryHref ?? "") ||
    (Boolean(versionHref) && version !== versionHref) ||
    Object.values(values).some((value) => String(value ?? "").trim().length > 0);

  useEffect(() => {
    setValues(initialDescriptorValues(visibleFields));
    setVersion(versionHref ?? "");
  }, [selectedRepository, visibleFields, versionHref]);

  useEffect(() => {
    if (!version && selectedRepositoryData?.latest_version_href) {
      setVersion(selectedRepositoryData.latest_version_href);
    }
  }, [selectedRepositoryData?.latest_version_href, version]);

  const versionOptions = (versions.data?.results ?? []).flatMap((item) =>
    item.pulp_href ? [{ value: item.pulp_href, label: `Version ${item.number ?? "?"}` }] : [],
  );
  const repositoryOptions = (repositories.data?.results ?? []).flatMap((item) =>
    item.pulp_href
      ? [
          {
            value: item.pulp_href,
            label: `${item.name} — ${repositoryTypeLabel(repositoryTypeFromHref(item.pulp_href))}`,
          },
        ]
      : [],
  );
  const signingOptions = (signingServices.data?.results ?? []).flatMap((service) =>
    service.pulp_href ? [{ value: service.pulp_href, label: service.name }] : [],
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRepository || !version) {
      setError("Select a repository and version to publish.");
      return;
    }
    setError(null);
    try {
      const body = buildDescriptorBody(visibleFields, values);
      publish.mutate(
        { repositoryHref: selectedRepository, versionHref: version, settings: body },
        { onSuccess: onClose },
      );
    } catch (caught) {
      if (caught instanceof FieldValueError) {
        setError(caught.message);
      } else {
        setError(formatApiError(caught, "Unable to publish."));
      }
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Publish repository version"
      description="Create an immutable publication. Custom settings are fixed at creation time."
      className="max-w-2xl"
      busy={publish.isPending}
      dirty={dirty}
      footer={
        <>
          <ModalCancelButton disabled={publish.isPending}>Cancel</ModalCancelButton>
          <SubmitButton
            form="publish-publication-form"
            isSubmitting={publish.isPending}
            label="Publish"
            busyLabel="Publishing…"
            icon={PackageCheck}
            disabled={!selectedRepository || !version}
          />
        </>
      }
    >
      <form id="publish-publication-form" className="space-y-4" onSubmit={handleSubmit}>
        {repositoryHref ? (
          <div className="space-y-1.5">
            <Label>Repository</Label>
            <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950/40">
              {repositoryName ?? repositoryHref}
            </p>
          </div>
        ) : (
          <Combobox
            id="publish-repository"
            label="Repository"
            value={selectedRepository}
            onChange={setSelectedRepository}
            options={repositoryOptions}
            emptyLabel="Select a repository…"
            searchValue={repositorySearchSearch.input}
            onSearchChange={repositorySearchSearch.setInput}
            searchPlaceholder="Search repositories…"
            isLoading={repositories.isLoading}
            isError={repositories.isError}
            onRetry={() => void repositories.refetch()}
            helper="Only repository types that support publications are listed."
            hasMore={repositories.hasMore}
            loadedCount={repositoryOptions.length}
            totalCount={repositories.total}
            onLoadMore={repositories.loadMore}
            disabled={publish.isPending}
          />
        )}

        <Combobox
          id="publish-version"
          label="Version"
          value={version}
          onChange={setVersion}
          options={versionOptions}
          emptyLabel={versions.isLoading ? "Loading versions…" : "Select a version…"}
          isLoading={versions.isLoading}
          isError={versions.isError}
          onRetry={() => void versions.refetch()}
          helper={
            versions.isLoading
              ? "Loading repository versions…"
              : versions.isError
                ? "Could not load repository versions."
                : "The latest version is selected by default."
          }
          hasMore={versions.hasMore}
          loadedCount={versionOptions.length}
          totalCount={versions.total}
          onLoadMore={versions.loadMore}
          disabled={!selectedRepository || publish.isPending}
        />

        {visibleFields.length ? (
          <div className="space-y-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <h3 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              Publication settings
            </h3>
            <DescriptorFields
              idPrefix="publish-publication"
              fields={visibleFields}
              values={values}
              onChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
              disabled={publish.isPending}
              signingServices={signingOptions}
            />
          </div>
        ) : null}

        {error || publish.error ? (
          <FormError>{error ?? formatApiError(publish.error, "Unable to publish.")}</FormError>
        ) : null}
        {publish.isPending ? (
          <p className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <Spinner />
            Waiting for Pulp to create the publication…
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
