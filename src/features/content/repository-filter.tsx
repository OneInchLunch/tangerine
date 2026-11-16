import { repositoryTypeFromHref } from "@/api/resources";
import type { QueryParams, Repository } from "@/api/types";
import { MultiCombobox, type ComboboxOption } from "@/components/ui/combobox";
import { useApiList, useLoadMoreList, useScopedRepositoryHrefs } from "@/hooks/queries";
import { useAuth } from "@/auth/auth-context";
import { useListSearch } from "@/hooks/use-list-search";
import {
  buildRepositoryContentQuery,
  MAX_CONTENT_REPOSITORY_FILTERS,
  parseRepositoryHrefs,
  serializeRepositoryHrefs,
} from "@/lib/content-repositories";
import { truncate } from "@/lib/format";
import { mergeListSearch } from "@/lib/list-url-state";
import { repositoryTypeLabelForType } from "@/lib/repositories";
import { useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useCallback, useMemo } from "react";

const REPOSITORY_FIELDS = "pulp_href,name,latest_version_href";

export interface ContentRepositorySelection {
  selected: string[];
  setSelected: (values: string[]) => void;
}

/** Read and write the `repos` URL parameter without fetching repositories. */
export function useContentRepositorySelection(): ContentRepositorySelection {
  const search = useSearch({ strict: false }) as { repos?: unknown };
  const navigate = useNavigate();
  const location = useLocation();
  const selected = useMemo(() => parseRepositoryHrefs(search.repos), [search.repos]);

  const setSelected = useCallback(
    (values: string[]) => {
      void navigate({
        to: location.pathname,
        replace: true,
        search: (previous: unknown) =>
          mergeListSearch(previous as Record<string, unknown>, {
            repos: serializeRepositoryHrefs(values),
            page: undefined,
          }),
      });
    },
    [location.pathname, navigate],
  );

  return { selected, setSelected };
}

export interface ContentRepositoryFilter extends ContentRepositorySelection {
  options: ComboboxOption[];
  selectedOptions: ComboboxOption[];
  selectedRepos: Repository[];
  filterableRepos: Repository[];
  search: string;
  setSearch: (value: string) => void;
  repositories: ReturnType<typeof useLoadMoreList<Repository>>;
  isLoading: boolean;
  isResolvingError: boolean;
  isBlocked: boolean;
  listEnabled: boolean;
  params: QueryParams;
}

function repositoryOption(repository: Repository): ComboboxOption | null {
  if (!repository.pulp_href) {
    return null;
  }
  const type = repositoryTypeLabelForType(repositoryTypeFromHref(repository.pulp_href));
  return {
    value: repository.pulp_href,
    label: repository.name,
    description: repository.latest_version_href ? type : `${type} · no versions yet`,
    disabled: !repository.latest_version_href,
  };
}

/** Repository scope shared by the content units and package views. */
export function useContentRepositoryFilter(): ContentRepositoryFilter {
  const { session } = useAuth();
  const scoped = Boolean(session?.capabilities?.repositoryAdmin);
  const scopedRepositories = useScopedRepositoryHrefs(scoped ? session?.repositoryPrns : undefined);
  const scopedHrefs = useMemo(
    () =>
      (scopedRepositories.data?.results ?? [])
        .map((repository) => repository.pulp_href)
        .filter((href): href is string => Boolean(href)),
    [scopedRepositories.data?.results],
  );
  const { selected: urlSelected, setSelected: setUrlSelected } = useContentRepositorySelection();
  const selected = scoped ? scopedHrefs : urlSelected;
  const setSelected = scoped ? () => undefined : setUrlSelected;
  const listSearch = useListSearch();

  const repositories = useLoadMoreList<Repository>(
    "repositories",
    {
      ordering: "name",
      fields: REPOSITORY_FIELDS,
      name__contains: listSearch.queryParam,
    },
    { pageSize: 50 },
  );

  const selectedQuery = useApiList<Repository>(
    "repositories",
    selected.length
      ? {
          pulp_href__in: selected.join(","),
          fields: REPOSITORY_FIELDS,
          limit: selected.length,
        }
      : {},
    { enabled: selected.length > 0 },
  );

  const selectedRepos = useMemo(() => {
    if (!selected.length) {
      return [];
    }
    const byHref = new Map(
      (selectedQuery.data?.results ?? []).flatMap((repository) =>
        repository.pulp_href ? [[repository.pulp_href, repository] as const] : [],
      ),
    );
    return selected.flatMap((href) => byHref.get(href) ?? []);
  }, [selected, selectedQuery.data?.results]);

  const filterableRepos = useMemo(
    () => selectedRepos.filter((repository) => Boolean(repository.latest_version_href)),
    [selectedRepos],
  );

  const options = useMemo(
    () =>
      (repositories.data?.results ?? []).flatMap((repository) => {
        const option = repositoryOption(repository);
        return option ? [option] : [];
      }),
    [repositories.data?.results],
  );

  const selectedOptions = useMemo(
    () =>
      selectedRepos.flatMap((repository) => {
        const option = repositoryOption(repository);
        return option ? [{ ...option, disabled: false }] : [];
      }),
    [selectedRepos],
  );

  const isLoading =
    (scoped && scopedRepositories.isLoading) || (selected.length > 0 && selectedQuery.isLoading);
  const isResolvingError = selected.length > 0 && selectedQuery.isError;
  const isBlocked =
    selected.length > 0 && selectedQuery.isSuccess && !isLoading && filterableRepos.length === 0;
  const listEnabled = scoped
    ? scopedHrefs.length > 0 && selectedQuery.isSuccess && filterableRepos.length > 0
    : selected.length === 0 || (selectedQuery.isSuccess && filterableRepos.length > 0);

  const params = useMemo(
    () =>
      buildRepositoryContentQuery(
        filterableRepos.flatMap((repository) => repository.pulp_href ?? []),
      ),
    [filterableRepos],
  );

  return {
    selected,
    setSelected,
    options,
    selectedOptions,
    selectedRepos,
    filterableRepos,
    search: listSearch.input,
    setSearch: listSearch.setInput,
    repositories,
    isLoading,
    isResolvingError,
    isBlocked,
    listEnabled,
    params,
  };
}

/** Compact multi-select trigger and selected chips for the content toolbars. */
export function RepositoryFilter({ filter }: { filter: ContentRepositoryFilter }) {
  const { selected, selectedRepos, repositories } = filter;
  const atLimit = selected.length >= MAX_CONTENT_REPOSITORY_FILTERS;

  let helper = "Filtering uses each repository's latest version.";
  if (filter.isResolvingError) {
    helper = "Could not resolve the selected repositories.";
  } else if (repositories.isError) {
    helper = "Could not load repositories.";
  } else if (filter.isBlocked) {
    helper = "The selected repositories have no versions yet.";
  }

  return (
    <div className="w-full sm:max-w-sm">
      <MultiCombobox
        id="content-repository-filter"
        label="Repositories"
        values={selected}
        onChange={filter.setSelected}
        options={filter.options}
        selectedOptions={filter.selectedOptions}
        placeholder="All repositories"
        searchValue={filter.search}
        onSearchChange={filter.setSearch}
        searchPlaceholder="Search repositories…"
        isLoading={repositories.isLoading}
        isError={repositories.isError}
        onRetry={() => void repositories.refetch()}
        helper={helper}
        hasMore={repositories.hasMore}
        loadedCount={filter.options.length}
        totalCount={repositories.total}
        onLoadMore={repositories.loadMore}
        maxSelected={MAX_CONTENT_REPOSITORY_FILTERS}
        maxSelectedMessage={`Filter up to ${MAX_CONTENT_REPOSITORY_FILTERS} repositories at a time.`}
        emptyMessage="No repositories match this search."
        hideLabel
      />
      {selected.length ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {selected.map((href) => {
              const repository = selectedRepos.find((item) => item.pulp_href === href);
              const label = repository?.name ?? truncate(href, 32);
              const empty = repository ? !repository.latest_version_href : false;
              return (
                <span
                  key={href}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-meta text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                  title={empty ? `${label} has no versions yet` : label}
                >
                  <span className="truncate">{label}</span>
                  {empty ? <span className="text-amber-600">no versions</span> : null}
                  <button
                    type="button"
                    aria-label={`Remove ${label} from the repository filter`}
                    onClick={() => filter.setSelected(selected.filter((item) => item !== href))}
                    className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              );
            })}
            <button
              type="button"
              onClick={() => filter.setSelected([])}
              className="rounded-full px-2 py-0.5 text-meta font-medium text-zinc-500 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Clear
            </button>
          </div>
          <p role="status" className="mt-1 text-meta text-zinc-500 dark:text-zinc-400">
            Showing content from {selected.length}{" "}
            {selected.length === 1 ? "repository" : "repositories"}.
          </p>
        </>
      ) : null}
      {atLimit ? (
        <p className="text-meta text-amber-600 dark:text-amber-400">
          Up to {MAX_CONTENT_REPOSITORY_FILTERS} repositories can be combined.
        </p>
      ) : null}
    </div>
  );
}
