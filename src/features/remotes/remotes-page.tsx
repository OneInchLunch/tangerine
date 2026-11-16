import { remoteTypeFromHref } from "@/api/resources";
import type { GenericRemote } from "@/api/types";
import { useApiDataPane } from "@/components/api-data-pane";
import { Badge } from "@/components/ui/badge";
import { IconButton } from "@/components/ui/icon-button";
import { ResourceList } from "@/components/resource-list";
import { useApiRoot, useScopedRepositoryHrefs } from "@/hooks/queries";
import { useAuth } from "@/auth/auth-context";
import { formatRelative, truncate } from "@/lib/format";
import { encodeListReturn } from "@/lib/list-url-state";
import { cn } from "@/lib/utils";
import { Link, useSearch } from "@tanstack/react-router";
import { Braces, CloudDownload, Plus } from "lucide-react";
import { getRemoteType, REMOTE_TYPES, remoteRootKey, remoteTypeLabel } from "./remote-types";

export function RemotesPage() {
  const { openApiData } = useApiDataPane();
  const { session } = useAuth();
  const scoped = Boolean(session?.capabilities?.repositoryAdmin);
  const scopedRepositories = useScopedRepositoryHrefs(scoped ? session?.repositoryPrns : undefined);
  const scopedRemoteHrefs = (scopedRepositories.data?.results ?? [])
    .map((repository) => repository.remote)
    .filter((href): href is string => Boolean(href));
  const routeSearch = useSearch({ strict: false }) as Record<string, unknown>;
  const returnSearch = encodeListReturn(routeSearch);
  const apiRoot = useApiRoot();
  const availableTypes = apiRoot.data
    ? REMOTE_TYPES.filter((type) => Object.hasOwn(apiRoot.data!, remoteRootKey(type)))
    : REMOTE_TYPES;

  return (
    <ResourceList<GenericRemote>
      title="Remotes"
      description="Upstream sources that repositories can synchronize content from."
      endpoint="remotes"
      icon={CloudDownload}
      searchParam="name__contains"
      searchPlaceholder="Search remotes…"
      selectFilter={{
        param: "pulp_type",
        label: "Filter remotes by type",
        allLabel: "All remote types",
        options: availableTypes.map((type) => ({
          value: type.pulpType ?? type.id,
          label: type.label,
        })),
      }}
      params={{
        ordering: "-pulp_last_updated",
        ...(scoped
          ? {
              pulp_href__in: scopedRemoteHrefs.length > 0 ? scopedRemoteHrefs.join(",") : "none",
            }
          : {}),
      }}
      getRowKey={(row) => row.pulp_href ?? row.name}
      countLabel={(count) => `${count} ${count === 1 ? "remote" : "remotes"}`}
      headerActions={
        <Link
          to="/remotes/new"
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-orange-600 px-3 text-xs font-medium text-white shadow-sm transition-colors hover:bg-orange-500 active:bg-orange-700"
        >
          <Plus className="size-4" />
          Create remote
        </Link>
      }
      emptyTitle="No remotes configured"
      emptyDescription="Create a remote to give repositories an upstream source to synchronize from."
      emptyAction={
        <Link
          to="/remotes/new"
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-orange-600 px-3 text-xs font-medium text-white shadow-sm transition-colors hover:bg-orange-500 active:bg-orange-700"
        >
          <Plus className="size-4" />
          Create remote
        </Link>
      }
      columns={[
        {
          header: "Name",
          sortKey: "name",
          cell: (row) => {
            const typeId = remoteTypeFromHref(row.pulp_href);
            const type = getRemoteType(typeId);
            return (
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg",
                    type?.tone === "danger"
                      ? "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400"
                      : type?.tone === "info"
                        ? "bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400"
                        : type?.tone === "success"
                          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
                          : type?.tone === "warning"
                            ? "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400"
                            : "bg-orange-50 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400",
                  )}
                >
                  <CloudDownload className="size-4" />
                </span>
                <div className="min-w-0">
                  {row.pulp_href ? (
                    <Link
                      to="/remotes/detail"
                      search={
                        {
                          href: row.pulp_href,
                          ...(returnSearch ? { from: returnSearch } : {}),
                        } as never
                      }
                      className="block truncate font-medium text-zinc-900 hover:text-orange-600 dark:text-zinc-100 dark:hover:text-orange-400"
                    >
                      {row.name}
                    </Link>
                  ) : (
                    <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                      {row.name}
                    </p>
                  )}
                  <p className="truncate font-mono text-micro text-zinc-400 dark:text-zinc-500">
                    {row.pulp_href}
                  </p>
                </div>
              </div>
            );
          },
        },
        {
          header: "Type",
          cell: (row) => {
            const typeId = remoteTypeFromHref(row.pulp_href);
            const type = getRemoteType(typeId);
            return (
              <Badge tone={type?.tone ?? "neutral"} className="capitalize">
                {remoteTypeLabel(typeId)}
              </Badge>
            );
          },
        },
        {
          header: "URL",
          className: "hidden max-w-xs lg:table-cell",
          cell: (row) => (
            <span className="block truncate font-mono text-meta text-zinc-500 dark:text-zinc-400">
              {truncate(row.url, 64)}
            </span>
          ),
        },
        {
          header: "Policy",
          className: "hidden sm:table-cell",
          cell: (row) =>
            row.policy ? (
              <Badge tone="neutral">{row.policy}</Badge>
            ) : (
              <span className="text-zinc-400">—</span>
            ),
        },
        {
          header: "TLS",
          className: "hidden xl:table-cell",
          cell: (row) => (
            <Badge tone={row.tls_validation ? "success" : "warning"}>
              {row.tls_validation ? "On" : "Off"}
            </Badge>
          ),
        },
        {
          header: "Updated",
          sortKey: "pulp_last_updated",
          className: "hidden md:table-cell text-xs text-zinc-500 dark:text-zinc-400",
          cell: (row) => formatRelative(row.pulp_last_updated),
        },
        {
          header: "",
          className: "w-10",
          cell: (row) =>
            row.pulp_href ? (
              <IconButton
                label={`View API data for ${row.name}`}
                title="View API data"
                icon={Braces}
                onClick={() => openApiData({ href: row.pulp_href!, title: row.name })}
              />
            ) : null,
        },
      ]}
    />
  );
}
