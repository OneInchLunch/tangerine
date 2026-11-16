import type { QueryParams } from "@/api/types";
import type { ApiDataSelection } from "@/components/api-data-pane";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorPanel } from "@/components/ui/error-panel";
import { Input } from "@/components/ui/input";
import { RefreshButton } from "@/components/ui/refresh-button";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApiPages } from "@/hooks/queries";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useListUrlState } from "@/hooks/use-list-url-state";
import { contentPluginLabel, contentTypeLabel } from "@/lib/content-labels";
import {
  buildPackageGroups,
  markTrailingGroup,
  type PackageGroup,
  type PackageTypeConfig,
} from "@/lib/content-packages";
import { contentSearchConfig } from "@/lib/content-search";
import { errorMessage } from "@/lib/errors";
import { formatRelative, truncate } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import { Braces, ChevronRight, Layers, Search, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ContentTypeEntry } from "./content-entry";
import { RepositoryFilter, type ContentRepositoryFilter } from "./repository-filter";
import { ContentViewToggle } from "./view-toggle";

type ContentRow = Record<string, unknown>;

const PAGE_SIZE = 250;

function useLiveSearch() {
  const { query: search, setQuery } = useListUrlState();
  const [searchInput, setSearchInput] = useState(search);
  const debouncedInput = useDebouncedValue(searchInput, 300);
  const lastLiveSearch = useRef(search);

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  useEffect(() => {
    const next = debouncedInput.trim();
    if (next === lastLiveSearch.current) {
      return;
    }
    lastLiveSearch.current = next;
    setQuery(next);
  }, [debouncedInput, setQuery]);

  return { search, searchInput, setSearchInput };
}

export function PackageList({
  entry,
  config,
  onOpenPackage,
  onOpenApiData,
  onClose,
  onShowUnits,
  onUpload,
  focusKey,
  repositoryFilter,
}: {
  entry: ContentTypeEntry;
  config: PackageTypeConfig;
  onOpenPackage: (group: PackageGroup) => void;
  onOpenApiData: (selection: ApiDataSelection) => void;
  onClose: () => void;
  onShowUnits: () => void;
  onUpload: () => void;
  focusKey?: string | null;
  repositoryFilter: ContentRepositoryFilter;
}) {
  const { search, searchInput, setSearchInput } = useLiveSearch();
  const searchConfig = contentSearchConfig(entry.plugin, entry.type);
  const serverSearchParam = searchConfig.parameter;
  const pageScoped = !serverSearchParam;
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusedRef = useRef(false);

  const params: QueryParams = {
    ordering: config.ordering,
    fields: config.projection.join(","),
    ...(serverSearchParam && search ? { [serverSearchParam]: search } : {}),
    ...repositoryFilter.params,
  };
  const pages = useApiPages<ContentRow>(entry.key, params, {
    pageSize: PAGE_SIZE,
    enabled: repositoryFilter.listEnabled,
  });

  const groups = useMemo(() => {
    const built = buildPackageGroups(pages.items, config);
    return markTrailingGroup(built, pages.items, config, pages.hasMore);
  }, [pages.items, config, pages.hasMore]);

  const needle = pageScoped ? search.trim().toLowerCase() : "";
  const visibleGroups = useMemo(() => {
    if (!needle) {
      return groups;
    }
    return groups.filter((group) =>
      [group.label, group.highest, ...group.details].join(" ").toLowerCase().includes(needle),
    );
  }, [groups, needle]);

  useEffect(() => {
    focusedRef.current = false;
  }, [focusKey]);

  useEffect(() => {
    if (focusedRef.current) {
      return;
    }
    const encoded = focusKey ? encodeURIComponent(focusKey) : null;
    const target = encoded
      ? containerRef.current?.querySelector<HTMLElement>(`[data-package-key="${encoded}"]`)
      : null;
    if (!target && pages.isLoading) {
      return;
    }
    (target ?? headingRef.current)?.focus();
    focusedRef.current = true;
  }, [focusKey, pages.isLoading, visibleGroups.length]);

  const unitCount = pages.items.length;
  const countLabel =
    pageScoped && needle
      ? `${visibleGroups.length} of ${groups.length} loaded ${groups.length === 1 ? "package" : "packages"}`
      : `${visibleGroups.length} ${visibleGroups.length === 1 ? "package" : "packages"} · ${unitCount}${
          pages.hasMore ? ` of ${pages.total}` : ""
        } ${pages.total === 1 ? "unit" : "units"}`;

  return (
    <div ref={containerRef} className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          <div className="flex shrink-0 items-start pt-0.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close content pane"
              title="Close"
            >
              <X className="size-4" />
            </Button>
          </div>
          <div>
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="text-lg font-semibold tracking-tight text-zinc-900 outline-none dark:text-zinc-50"
            >
              {contentPluginLabel(entry.plugin)} · {contentTypeLabel(entry.type)}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
              One row per package name. Open a package to see every available variant.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <ContentViewToggle
            view="packages"
            onChange={(next) => {
              if (next === "units") {
                onShowUnits();
              }
            }}
          />
          <Button variant="outline" size="sm" onClick={onUpload}>
            <Upload className="size-3.5" />
            Upload content
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              onOpenApiData({
                href: `${entry.key}/`,
                title: `${contentPluginLabel(entry.plugin)} ${contentTypeLabel(entry.type)} API data`,
              })
            }
          >
            <Braces className="size-3.5" />
            API data
          </Button>
          <RefreshButton
            isFetching={pages.isFetching}
            onClick={() => void queryClient.resetQueries({ queryKey: pages.queryKey })}
          />
        </div>
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-zinc-200 p-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-start">
            <form
              className="relative w-full sm:max-w-xs"
              onSubmit={(event) => {
                event.preventDefault();
                setSearchInput(searchInput.trim());
              }}
            >
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={pageScoped ? "Filter loaded packages…" : searchConfig.placeholder}
                className="pl-9"
                aria-label={pageScoped ? "Filter loaded packages" : searchConfig.placeholder}
              />
            </form>
            <RepositoryFilter filter={repositoryFilter} />
          </div>
          <p
            className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400"
            title={
              pageScoped
                ? "Pulp does not expose a text filter for this type; this filters the packages loaded so far."
                : undefined
            }
          >
            {pages.isLoading || repositoryFilter.isLoading ? "Loading…" : countLabel}
          </p>
        </div>

        {pages.isError ? (
          <div className="p-4">
            <ErrorPanel
              title="Could not load packages"
              message={errorMessage(pages.error)}
              onRetry={() => void pages.refetch()}
            />
          </div>
        ) : pages.isLoading || repositoryFilter.isLoading ? (
          <TableSkeleton rows={5} />
        ) : repositoryFilter.isBlocked ? (
          <EmptyState
            icon={Layers}
            title="No packages in the selected repositories"
            description="The selected repositories have no versions yet. Sync content or change the repository filter."
          />
        ) : visibleGroups.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Package</TableHead>
                <TableHead>Highest version</TableHead>
                <TableHead className="hidden sm:table-cell">Details</TableHead>
                <TableHead className="w-24">Variants</TableHead>
                <TableHead className="hidden lg:table-cell">Updated</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleGroups.map((group) => (
                <TableRow key={group.key}>
                  <TableCell>
                    <button
                      type="button"
                      data-package-key={encodeURIComponent(group.key)}
                      onClick={() => onOpenPackage(group)}
                      title="View versions"
                      className="group flex items-center gap-2 text-left"
                    >
                      <span className="min-w-0 truncate font-medium text-zinc-900 group-hover:text-orange-700 dark:text-zinc-100 dark:group-hover:text-orange-300">
                        {truncate(group.label, 72)}
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-zinc-400" />
                    </button>
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-meta text-zinc-600 dark:text-zinc-400">
                    {group.partial ? (
                      <span
                        className="text-zinc-400 dark:text-zinc-500"
                        title="Load more packages to confirm the highest version"
                      >
                        —
                      </span>
                    ) : (
                      truncate(group.highest, 40)
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex flex-wrap items-center gap-1">
                      {group.details.slice(0, 3).map((detail) => (
                        <Badge key={detail} tone="neutral" className="font-normal">
                          {truncate(detail, 24)}
                        </Badge>
                      ))}
                      {group.details.length > 3 ? (
                        <span
                          className="text-meta text-zinc-400"
                          title={group.details.slice(3).join(", ")}
                        >
                          +{group.details.length - 3}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge tone="info" title={`${group.versionCount} distinct versions`}>
                      {group.variants}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-xs text-zinc-500 dark:text-zinc-400 lg:table-cell">
                    {formatRelative(group.updated)}
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="size-4 text-zinc-300 dark:text-zinc-600" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            icon={Layers}
            title={needle ? "No loaded packages match" : "No packages of this type"}
            description={
              needle
                ? "Load more packages, or search for another name."
                : "Sync a repository to populate this content type."
            }
            action={
              needle ? (
                <Button variant="outline" size="sm" onClick={() => setSearchInput("")}>
                  Clear filter
                </Button>
              ) : undefined
            }
          />
        )}

        {pages.hasMore ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800">
            <p className="text-meta text-zinc-500 dark:text-zinc-400">
              Loaded {unitCount} of {pages.total} {pages.total === 1 ? "unit" : "units"}.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={pages.loadMore}
              disabled={pages.isFetchingMore}
            >
              {pages.isFetchingMore ? "Loading…" : "Load more packages"}
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
