import { repositoryVersionNumber } from "@/api/resources";
import type { Publication, Repository } from "@/api/types";
import { useApiDataPane } from "@/components/api-data-pane";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import { DetailRow } from "@/components/ui/detail-row";
import { IconButton } from "@/components/ui/icon-button";
import { ResourceList } from "@/components/resource-list";
import { useLoadMoreList, useRepository, useScopedRepositoryHrefs } from "@/hooks/queries";
import { useAuth } from "@/auth/auth-context";
import { useScopedMutation } from "@/hooks/use-scoped-mutation";
import { useListSearch } from "@/hooks/use-list-search";
import { publicationTypeLabel } from "@/lib/distributions";
import { errorMessage } from "@/lib/errors";
import { queryKeys } from "@/lib/query-keys";
import { scopeMutateObject } from "@/api/gateway";
import { deleteAndWait } from "@/api/resources";
import { formatRelative, truncate } from "@/lib/format";
import { Link, useSearch } from "@tanstack/react-router";
import { Braces, Plus, Trash2 } from "lucide-react";
import { entityIcons } from "@/lib/icons";
import { useState } from "react";
import { PublicationDetailPane } from "./publication-detail-pane";
import { PublishPublicationDialog } from "./publish-publication-dialog";

function PublicationRepositoryLink({ href }: { href: string }) {
  const repository = useRepository(href);
  if (!repository.data) {
    return (
      <span title={href} className="font-mono text-meta text-zinc-500 dark:text-zinc-400">
        {truncate(href, 40)}
      </span>
    );
  }
  return (
    <Link
      to="/repositories/detail"
      search={{ href }}
      className="font-medium text-zinc-900 hover:text-orange-600 dark:text-zinc-100 dark:hover:text-orange-400"
    >
      {repository.data.name}
    </Link>
  );
}

export function PublicationsPage() {
  const { openApiData } = useApiDataPane();
  const { session } = useAuth();
  const scoped = Boolean(session?.capabilities?.repositoryAdmin);
  const scopedRepositories = useScopedRepositoryHrefs(scoped ? session?.repositoryPrns : undefined);
  const scopedHrefs = (scopedRepositories.data?.results ?? [])
    .map((repository) => repository.pulp_href)
    .filter((href): href is string => Boolean(href));
  const search = useSearch({ strict: false }) as { filter?: string };
  const filter = typeof search.filter === "string" ? search.filter : "";
  const repositorySearchSearch = useListSearch();
  const repositories = useLoadMoreList<Repository>("repositories", {
    name__contains: repositorySearchSearch.queryParam,
    prn__in: scoped ? session?.repositoryPrns?.join(",") : undefined,
    ordering: "name",
  });
  const selectedRepository = useRepository(filter || undefined);
  const [deleting, setDeleting] = useState<Publication | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [detailHref, setDetailHref] = useState<string | null>(null);

  const repositoryOptions = (repositories.data?.results ?? []).flatMap((repository) =>
    repository.pulp_href ? [{ value: repository.pulp_href, label: repository.name }] : [],
  );
  if (
    filter &&
    selectedRepository.data &&
    !repositoryOptions.some((option) => option.value === filter)
  ) {
    repositoryOptions.unshift({ value: filter, label: selectedRepository.data.name });
  }

  const remove = useScopedMutation<void, { href: string }>({
    scope: async ({ href }, csrfToken) => {
      await scopeMutateObject("DELETE", href, null, csrfToken);
    },
    direct: async ({ href }) => {
      await deleteAndWait(href);
    },
    invalidation: [
      queryKeys.apiList.endpoint("publications"),
      queryKeys.publications.all,
      queryKeys.apiList.endpoint("distributions"),
    ],
    successMessage: "Publication deleted",
    errorMode: "inline",
    onSuccess: () => setDeleting(null),
  });

  function handleDelete() {
    if (!deleting?.pulp_href) {
      return;
    }
    remove.mutate({ href: deleting.pulp_href });
  }

  return (
    <>
      <ResourceList<Publication>
        title="Publications"
        description="Immutable snapshots of repository versions that distributions and content endpoints serve."
        endpoint="publications"
        icon={entityIcons.publications}
        params={{
          ordering: "-pulp_created",
          ...(scoped ? { repository__in: scopedHrefs.join(",") } : {}),
        }}
        enabled={!scoped || scopedHrefs.length > 0}
        headerActions={
          <Button size="sm" onClick={() => setPublishOpen(true)}>
            <Plus className="size-4" />
            Publish repository version
          </Button>
        }
        selectFilter={{
          param: "repository",
          label: "Repository",
          options: repositoryOptions,
          allLabel: "All repositories",
          searchValue: repositorySearchSearch.input,
          onSearchChange: repositorySearchSearch.setInput,
          searchPlaceholder: "Search repositories…",
          isLoading: repositories.isLoading,
          isError: repositories.isError,
          onRetry: () => void repositories.refetch(),
          hasMore: repositories.hasMore,
          loadedCount: repositoryOptions.length,
          total: repositories.total,
          onLoadMore: repositories.loadMore,
        }}
        getRowKey={(row) => row.pulp_href ?? row.prn ?? "publication"}
        countLabel={(count) => `${count} ${count === 1 ? "publication" : "publications"}`}
        emptyTitle="No publications yet"
        emptyDescription="Enable auto-publish on a repository or publish a version from the repository detail page."
        columns={[
          {
            header: "Type",
            cell: (row) => (
              <Badge tone="brand" className="capitalize">
                {publicationTypeLabel(row.pulp_href)}
              </Badge>
            ),
          },
          {
            header: "Repository",
            cell: (row) =>
              row.repository ? (
                <PublicationRepositoryLink href={row.repository} />
              ) : (
                <span className="text-xs text-zinc-400">—</span>
              ),
          },
          {
            header: "Version",
            className: "hidden sm:table-cell",
            cell: (row) => {
              const version = repositoryVersionNumber(row.repository_version);
              return version === "—" ? version : `v${version}`;
            },
          },
          {
            header: "Created",
            className: "hidden md:table-cell text-xs text-zinc-500 dark:text-zinc-400",
            cell: (row) => formatRelative(row.pulp_created),
          },
          {
            header: "",
            className: "w-20",
            cell: (row) =>
              row.pulp_href ? (
                <div className="flex items-center justify-end gap-0.5">
                  <IconButton
                    label={`Open ${publicationTypeLabel(row.pulp_href)} publication details`}
                    title="Publication details"
                    icon={entityIcons.publications}
                    onClick={() => setDetailHref(row.pulp_href!)}
                  />
                  <IconButton
                    label={`View API data for ${publicationTypeLabel(row.pulp_href)} publication`}
                    title="View API data"
                    icon={Braces}
                    onClick={() =>
                      openApiData({
                        href: row.pulp_href!,
                        title: `${publicationTypeLabel(row.pulp_href)} publication`,
                      })
                    }
                  />
                  <IconButton
                    label={`Delete ${publicationTypeLabel(row.pulp_href)} publication`}
                    title="Delete publication"
                    icon={Trash2}
                    tone="danger"
                    onClick={() => {
                      remove.reset();
                      setDeleting(row);
                    }}
                  />
                </div>
              ) : null,
          },
        ]}
      />

      {deleting ? (
        <ConfirmDeleteModal
          open
          onClose={() => {
            setDeleting(null);
            remove.reset();
          }}
          title="Delete publication"
          description="This permanently removes the publication. Distributions that reference it may stop serving content."
          itemName={deleting.pulp_href ?? "publication"}
          confirmLabel="Delete publication"
          isDeleting={remove.isPending}
          error={
            remove.error
              ? errorMessage(remove.error, "The publication could not be deleted.")
              : null
          }
          requireName={false}
          onConfirm={handleDelete}
        >
          <DetailRow label="Publication" value={deleting.pulp_href ?? "—"} mono />
          {deleting.repository ? (
            <DetailRow
              label="Repository version"
              value={repositoryVersionNumber(deleting.repository_version)}
            />
          ) : null}
        </ConfirmDeleteModal>
      ) : null}

      {publishOpen ? <PublishPublicationDialog onClose={() => setPublishOpen(false)} /> : null}
      {detailHref ? (
        <PublicationDetailPane href={detailHref} onClose={() => setDetailHref(null)} />
      ) : null}
    </>
  );
}
