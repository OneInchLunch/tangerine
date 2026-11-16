import type { QueryParams } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorPanel } from "@/components/ui/error-panel";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { RefreshButton } from "@/components/ui/refresh-button";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  SortableTableHead,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApiList } from "@/hooks/queries";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useListUrlState } from "@/hooks/use-list-url-state";
import { errorMessage } from "@/lib/errors";
import { Search, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

export interface ResourceColumn<T> {
  header: string;
  /** Pulp `ordering` field for this column. Omit to keep the column unsortable. */
  sortKey?: string;
  cell: (row: T) => ReactNode;
  className?: string;
  headClassName?: string;
  /**
   * Hide the column when every loaded row reports true. Used for content
   * fields a plugin serializer does not expose (for example File versions or
   * artifact sizes), so the table does not show a column of dashes.
   */
  hideWhenEmpty?: (row: T) => boolean;
}

interface ResourceListProps<T> {
  title: string;
  description: string;
  headerMode?: "page" | "section";
  endpoint: string;
  icon: LucideIcon;
  columns: ResourceColumn<T>[];
  getRowKey: (row: T) => string;
  params?: QueryParams;
  searchParam?: string;
  /** Filter the loaded page when the API has no text-search filter. */
  clientFilter?: (row: T, query: string) => boolean;
  /** Update the search as the user types (debounced) instead of only on submit. */
  liveSearch?: boolean;
  searchPlaceholder?: string;
  selectFilter?: {
    param: string;
    label: string;
    options: Array<{ value: string; label: string }>;
    allLabel?: string;
    isLoading?: boolean;
    isError?: boolean;
    onRetry?: () => void;
    searchValue?: string;
    onSearchChange?: (value: string) => void;
    searchPlaceholder?: string;
    hasMore?: boolean;
    loadedCount?: number;
    total?: number;
    onLoadMore?: () => void;
  };
  /** Extra controls rendered beside the search field. */
  filters?: ReactNode;
  /** Rendered before the title in section mode, for leading controls such as a close button. */
  leading?: ReactNode;
  headerActions?: ReactNode;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: ReactNode;
  pageSize?: number;
  countLabel?: (count: number) => string;
  /** Keep the toolbar mounted while skipping the request, for example while a parent filter resolves. */
  enabled?: boolean;
  /** Show the table skeleton instead of an empty state while the request is gated. */
  loading?: boolean;
}

export function ResourceList<T>({
  title,
  description,
  headerMode = "page",
  endpoint,
  icon,
  columns,
  getRowKey,
  params,
  searchParam,
  clientFilter,
  liveSearch = false,
  searchPlaceholder = "Search…",
  selectFilter,
  filters,
  leading,
  headerActions,
  emptyTitle,
  emptyDescription,
  emptyAction,
  pageSize,
  countLabel = (count) => `${count} ${count === 1 ? "item" : "items"}`,
  enabled = true,
  loading = false,
}: ResourceListProps<T>) {
  const {
    page,
    pageSize: urlPageSize,
    query: search,
    filter,
    ordering,
    setPage,
    setPageSize,
    setQuery,
    setFilter,
    setSort,
  } = useListUrlState();
  const effectivePageSize = pageSize ?? urlPageSize;
  const [searchInput, setSearchInput] = useState(search);
  const debouncedInput = useDebouncedValue(searchInput, 300);
  const lastLiveSearch = useRef(search);

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  useEffect(() => {
    if (!liveSearch) {
      return;
    }
    const next = debouncedInput.trim();
    if (next === lastLiveSearch.current) {
      return;
    }
    lastLiveSearch.current = next;
    setQuery(next);
  }, [debouncedInput, liveSearch, setQuery]);

  const queryParams: QueryParams = {
    ...params,
    limit: effectivePageSize,
    offset: page * effectivePageSize,
    ...(ordering ? { ordering } : {}),
    ...(searchParam && search ? { [searchParam]: search } : {}),
    ...(selectFilter && filter ? { [selectFilter.param]: filter } : {}),
  };

  const query = useApiList<T>(endpoint, queryParams, { enabled });
  const total = query.data?.count ?? 0;
  const rows = query.data?.results ?? [];
  const activeSearch = clientFilter && liveSearch ? searchInput.trim() : search;
  const visibleRows =
    clientFilter && activeSearch ? rows.filter((row) => clientFilter(row, activeSearch)) : rows;
  const pageFiltering = Boolean(clientFilter && activeSearch);
  const hasSearch = Boolean(searchParam || clientFilter);
  const shownColumns = columns.filter(
    (column) =>
      !column.hideWhenEmpty ||
      rows.length === 0 ||
      visibleRows.some((row) => !column.hideWhenEmpty?.(row)),
  );

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = searchInput.trim();
    lastLiveSearch.current = next;
    setQuery(next);
  }

  const actions = (
    <>
      {headerActions}
      <RefreshButton isFetching={query.isFetching} onClick={() => void query.refetch()} />
    </>
  );

  return (
    <div className="space-y-5">
      {headerMode === "section" ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-2">
            {leading ? <div className="flex shrink-0 items-start pt-0.5">{leading}</div> : null}
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                {title}
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
                {description}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        </div>
      ) : (
        <PageHeader title={title} description={description} actions={actions} />
      )}

      <Card>
        <div className="flex flex-col gap-3 border-b border-zinc-200 p-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-start">
            {hasSearch ? (
              <form className="relative w-full sm:max-w-xs" onSubmit={submitSearch}>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
                <Input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder={searchPlaceholder}
                  className="pl-9"
                  aria-label={searchPlaceholder}
                />
              </form>
            ) : null}
            {selectFilter ? (
              <Combobox
                id={`${endpoint}-select-filter`}
                label={selectFilter.label}
                value={filter}
                onChange={setFilter}
                options={selectFilter.options}
                placeholder={selectFilter.allLabel ?? "All"}
                emptyLabel={selectFilter.allLabel ?? "All"}
                searchValue={selectFilter.searchValue}
                onSearchChange={selectFilter.onSearchChange}
                searchPlaceholder={
                  selectFilter.searchPlaceholder ?? `Search ${selectFilter.label.toLowerCase()}…`
                }
                isLoading={selectFilter.isLoading}
                isError={selectFilter.isError}
                onRetry={selectFilter.onRetry}
                hasMore={selectFilter.hasMore}
                loadedCount={selectFilter.loadedCount}
                totalCount={selectFilter.total}
                onLoadMore={selectFilter.onLoadMore}
                hideLabel
                className="w-full sm:max-w-56"
              />
            ) : null}
            {filters}
            {!hasSearch && !selectFilter && !filters ? (
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Data is loaded directly from the Pulp REST API.
              </div>
            ) : null}
          </div>
          <p
            className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400"
            title={
              pageFiltering
                ? "Pulp does not expose a text filter for this type; this filters the current page."
                : undefined
            }
          >
            {query.isLoading || loading
              ? "Loading…"
              : pageFiltering
                ? `${visibleRows.length} of ${rows.length} on this page`
                : countLabel(total)}
          </p>
        </div>

        {query.isError ? (
          <div className="p-4">
            <ErrorPanel
              title={`Could not load ${title.toLowerCase()}`}
              message={errorMessage(query.error)}
              onRetry={() => void query.refetch()}
            />
          </div>
        ) : query.isLoading || loading ? (
          <TableSkeleton rows={5} />
        ) : rows.length && visibleRows.length ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  {shownColumns.map((column) =>
                    column.sortKey ? (
                      <SortableTableHead
                        key={column.header}
                        label={column.header}
                        sortKey={column.sortKey}
                        ordering={ordering}
                        onSort={setSort}
                        className={column.headClassName}
                      />
                    ) : (
                      <TableHead key={column.header} className={column.headClassName}>
                        {column.header}
                      </TableHead>
                    ),
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((row) => (
                  <TableRow key={getRowKey(row)}>
                    {shownColumns.map((column) => (
                      <TableCell key={column.header} className={column.className}>
                        {column.cell(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Pagination
              page={page}
              pageSize={effectivePageSize}
              total={total}
              hasNext={Boolean(query.data?.next)}
              onPageChange={setPage}
              onPageSizeChange={pageSize === undefined ? setPageSize : undefined}
            />
          </>
        ) : (
          <EmptyState
            icon={icon}
            title={activeSearch ? `No ${title.toLowerCase()} match your search` : emptyTitle}
            description={
              activeSearch ? "Try a different search term or clear the search." : emptyDescription
            }
            action={
              activeSearch ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    lastLiveSearch.current = "";
                    setSearchInput("");
                    setQuery("");
                  }}
                >
                  Clear search
                </Button>
              ) : (
                emptyAction
              )
            }
          />
        )}
      </Card>
    </div>
  );
}
