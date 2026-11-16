import type { Distribution } from "@/api/types";
import { useAuth } from "@/auth/auth-context";
import { useScopedRepositoryHrefs } from "@/hooks/queries";
import { useApiDataPane } from "@/components/api-data-pane";
import { Badge } from "@/components/ui/badge";
import { IconButton } from "@/components/ui/icon-button";
import { ResourceList } from "@/components/resource-list";
import {
  distributionDisplayName,
  distributionIsEditable,
  distributionTypeLabel,
  isSystemDistribution,
} from "@/lib/distributions";
import { formatRelative, truncate } from "@/lib/format";
import { encodeListReturn } from "@/lib/list-url-state";
import { Link, useSearch } from "@tanstack/react-router";
import { Braces, ExternalLink, Pencil, Share2 } from "lucide-react";
import { useState } from "react";
import { EditDistributionModal, type DistributionEditMode } from "./edit-distribution-modal";

function canEditDistribution(row: Distribution): boolean {
  return Boolean(row.name) && distributionIsEditable(row.pulp_href);
}

export function DistributionsPage() {
  const { openApiData } = useApiDataPane();
  const { session } = useAuth();
  const scoped = Boolean(session?.capabilities?.repositoryAdmin);
  const scopedRepositories = useScopedRepositoryHrefs(scoped ? session?.repositoryPrns : undefined);
  const scopedHrefs = (scopedRepositories.data?.results ?? [])
    .map((repository) => repository.pulp_href)
    .filter((href): href is string => Boolean(href));
  const routeSearch = useSearch({ strict: false }) as Record<string, unknown>;
  const returnSearch = encodeListReturn(routeSearch);
  const [editingDistribution, setEditingDistribution] = useState<Distribution | null>(null);
  const [editMode, setEditMode] = useState<DistributionEditMode>("metadata");

  return (
    <>
      <ResourceList<Distribution>
        title="Distributions"
        description="Published content endpoints that clients can consume from the Pulp content app."
        endpoint="distributions"
        icon={Share2}
        searchParam="name__contains"
        searchPlaceholder="Search distributions…"
        params={{
          ordering: "-pulp_last_updated",
          ...(scoped ? { repository__in: scopedHrefs.join(",") } : {}),
        }}
        enabled={!scoped || scopedHrefs.length > 0}
        getRowKey={(row) => row.pulp_href ?? `${row.name}-${row.base_path}`}
        countLabel={(count) => `${count} ${count === 1 ? "distribution" : "distributions"}`}
        emptyTitle="No distributions configured"
        emptyDescription="Create one from a repository's detail page, or use the API admin console for plugin-specific settings."
        columns={[
          {
            header: "Name",
            sortKey: "name",
            cell: (row) => {
              const displayName = distributionDisplayName(row.name, row.pulp_href);
              return (
                <div className="flex items-center gap-2.5">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                    <Share2 className="size-4" />
                  </span>
                  <div className="min-w-0">
                    {row.pulp_href ? (
                      <Link
                        to="/distributions/detail"
                        search={
                          {
                            href: row.pulp_href,
                            ...(returnSearch ? { from: returnSearch } : {}),
                          } as never
                        }
                        className="block truncate font-medium text-zinc-900 hover:text-orange-600 dark:text-zinc-100 dark:hover:text-orange-400"
                      >
                        {displayName}
                      </Link>
                    ) : (
                      <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                        {displayName}
                      </p>
                    )}
                    <p className="truncate font-mono text-micro text-zinc-400 dark:text-zinc-500">
                      {row.base_path}
                    </p>
                  </div>
                </div>
              );
            },
          },
          {
            header: "Type",
            cell: (row) =>
              isSystemDistribution(row.pulp_href) ? (
                <Badge tone="neutral" title="Pulp internal artifact distribution">
                  System
                </Badge>
              ) : (
                <Badge tone="brand">{distributionTypeLabel(row.pulp_href)}</Badge>
              ),
          },
          {
            header: "Content URL",
            className: "hidden max-w-sm lg:table-cell",
            cell: (row) =>
              row.base_url ? (
                isSystemDistribution(row.pulp_href) ? (
                  <span
                    className="flex items-center gap-1 truncate font-mono text-meta text-zinc-500 dark:text-zinc-400"
                    title="Pulp serves artifacts from this base path with signed URLs; it cannot be opened directly."
                  >
                    {truncate(row.base_url.replace(/^https?:\/\//, ""), 48)}
                  </span>
                ) : (
                  <a
                    href={row.base_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 truncate font-mono text-meta text-orange-600 hover:underline dark:text-orange-400"
                    title={row.base_url}
                  >
                    {truncate(row.base_url.replace(/^https?:\/\//, ""), 48)}
                    <ExternalLink className="size-3 shrink-0" />
                  </a>
                )
              ) : (
                <span className="text-xs text-zinc-400">—</span>
              ),
          },
          {
            header: "Repository",
            className: "hidden sm:table-cell",
            cell: (row) =>
              row.repository ? (
                <Badge tone="success">Attached</Badge>
              ) : (
                <Badge tone="neutral">No repository</Badge>
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
            className: "w-20",
            cell: (row) =>
              row.pulp_href ? (
                <div className="flex items-center justify-end gap-0.5">
                  {canEditDistribution(row) ? (
                    <IconButton
                      label={`Edit ${row.name}`}
                      icon={Pencil}
                      onClick={() => {
                        setEditMode("metadata");
                        setEditingDistribution(row);
                      }}
                    />
                  ) : null}
                  <IconButton
                    label={`View API data for ${row.name}`}
                    title="View API data"
                    icon={Braces}
                    onClick={() => openApiData({ href: row.pulp_href!, title: row.name })}
                  />
                </div>
              ) : null,
          },
        ]}
      />
      {editingDistribution ? (
        <EditDistributionModal
          key={editingDistribution.pulp_href}
          distribution={editingDistribution}
          mode={editMode}
          onSwitchMode={setEditMode}
          onClose={() => setEditingDistribution(null)}
        />
      ) : null}
    </>
  );
}
