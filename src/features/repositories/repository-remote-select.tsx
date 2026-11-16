import { remoteTypeFromHref } from "@/api/resources";
import type { GenericRemote } from "@/api/types";
import { Combobox } from "@/components/ui/combobox";
import { remoteTypeLabel } from "@/features/remotes/remote-types";
import { useLoadMoreList } from "@/hooks/queries";
import { useListSearch } from "@/hooks/use-list-search";
import { repositoryRemoteFilterTypes } from "@/lib/plugins";

function remoteOptionLabel(remote: GenericRemote): string {
  const typeId = remoteTypeFromHref(remote.pulp_href);
  return `${remote.name} — ${remoteTypeLabel(typeId)}`;
}

export function RepositoryRemoteSelect({
  id,
  repositoryType,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  repositoryType: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const filterTypes = repositoryRemoteFilterTypes(repositoryType);
  const listSearch = useListSearch();
  const remotes = useLoadMoreList<GenericRemote>(
    "remotes",
    {
      pulp_type__in: filterTypes.join(","),
      name__contains: listSearch.queryParam,
      ordering: "name",
    },
    { enabled: filterTypes.length > 0 },
  );
  const options = (remotes.data?.results ?? []).flatMap((remote) =>
    remote.pulp_href ? [{ value: remote.pulp_href, label: remoteOptionLabel(remote) }] : [],
  );
  const isLoading = filterTypes.length > 0 && remotes.isLoading;
  const helperId = `${id}-description`;

  let helper =
    "Optional upstream source used by default when syncing. Only remotes from the same Pulp plugin are listed.";
  if (filterTypes.length === 0) {
    helper = "Remote selection is not available for this repository type.";
  } else if (isLoading) {
    helper = "Loading compatible remotes…";
  } else if (remotes.isError) {
    helper =
      "Could not load compatible remotes. You can still save the repository without changing its remote.";
  } else if (options.length === 0) {
    helper = listSearch.term
      ? "No compatible remotes match this search."
      : "No compatible remotes are configured. You can assign one later after creating a remote.";
  } else if (listSearch.term) {
    helper = `${remotes.total} compatible ${remotes.total === 1 ? "remote matches" : "remotes match"} “${listSearch.term}”.`;
  }

  return (
    <Combobox
      id={id}
      label="Remote"
      value={value}
      onChange={onChange}
      options={options}
      emptyLabel="No remote"
      pinnedLabel="Current remote (not listed)"
      searchValue={listSearch.input}
      onSearchChange={listSearch.setInput}
      searchPlaceholder="Search remotes…"
      isLoading={isLoading}
      isError={remotes.isError}
      onRetry={() => void remotes.refetch()}
      helper={helper}
      helperId={helperId}
      disabled={disabled || filterTypes.length === 0}
      hasMore={remotes.hasMore}
      loadedCount={options.length}
      totalCount={remotes.total}
      onLoadMore={remotes.loadMore}
    />
  );
}
