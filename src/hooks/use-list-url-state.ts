import {
  DEFAULT_LIST_PAGE_SIZE,
  hasListSearchParams,
  mergeListSearch,
  parseListPage,
  parseListPageSize,
  parseListSort,
  type ListSearchUpdates,
} from "@/lib/list-url-state";
import { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate, useSearch } from "@tanstack/react-router";

interface ListUrlState {
  page: number;
  pageSize: number;
  query: string;
  filter: string;
  ordering: string;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  setQuery: (query: string) => void;
  setFilter: (filter: string) => void;
  setSort: (ordering: string) => void;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Keep list pagination, search, and filter state in the URL so refresh, back,
 * and shared links preserve the current view.
 */
export function useListUrlState(): ListUrlState {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const location = useLocation();
  const navigate = useNavigate();

  const page = parseListPage(search.page);
  const pageSize = parseListPageSize(search.per);
  const ordering = parseListSort(search.sort);

  const update = useCallback(
    (updates: ListSearchUpdates) => {
      void navigate({
        to: location.pathname,
        replace: true,
        search: (previous: unknown) =>
          mergeListSearch(previous as Record<string, unknown>, updates),
      });
    },
    [location.pathname, navigate],
  );

  // Browser back/forward restores a URL that should keep its list state. Track
  // the router's history index: a decrease is a traversal, while an increase or
  // the same index is a new navigation that must not inherit stale params.
  // Comparing indices is reliable even when the router's popstate handler runs
  // before the one registered here (production builds re-render first).
  const historyIndex = useRef<number | undefined>(
    typeof window === "undefined"
      ? undefined
      : (window.history.state as { __TSR_index?: number } | null)?.__TSR_index,
  );

  // Do not let list params bleed into another list when a link inherits the
  // current search string. Direct links and history restores with params still
  // work because only forward navigations are cleared.
  const previousPath = useRef(location.pathname);
  useEffect(() => {
    if (previousPath.current === location.pathname) {
      return;
    }
    previousPath.current = location.pathname;
    const currentIndex = (window.history.state as { __TSR_index?: number } | null)?.__TSR_index;
    const previousIndex = historyIndex.current;
    historyIndex.current = currentIndex;
    if (
      typeof currentIndex === "number" &&
      typeof previousIndex === "number" &&
      currentIndex < previousIndex
    ) {
      return;
    }
    if (hasListSearchParams(search)) {
      update({
        page: undefined,
        per: undefined,
        sort: undefined,
        q: undefined,
        filter: undefined,
        plugin: undefined,
        type: undefined,
        package: undefined,
        view: undefined,
        repos: undefined,
      });
    }
  }, [location.pathname, search, update]);

  return {
    page,
    pageSize,
    query: readString(search.q),
    filter: readString(search.filter),
    ordering,
    setPage: (next) => update({ page: next > 0 ? next : undefined }),
    setPageSize: (next) =>
      update({
        per: next === DEFAULT_LIST_PAGE_SIZE ? undefined : next,
        page: undefined,
      }),
    setQuery: (next) => update({ q: next.trim() || undefined, page: undefined }),
    setFilter: (next) => update({ filter: next || undefined, page: undefined }),
    setSort: (next) => update({ sort: next || undefined, page: undefined }),
  };
}
