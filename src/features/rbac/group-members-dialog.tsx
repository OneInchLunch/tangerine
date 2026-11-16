import type { Group, GroupUser, User } from "@/api/types";
import { FormError } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import { Modal } from "@/components/ui/modal";
import { Combobox } from "@/components/ui/combobox";
import { Spinner } from "@/components/ui/spinner";
import { useLoadMoreList } from "@/hooks/queries";
import { useListSearch } from "@/hooks/use-list-search";
import { formatApiError } from "@/lib/errors";
import { queryKeys } from "@/lib/query-keys";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { getConfig } from "@/lib/config";
import { isSsoManagedUser } from "@/lib/sso";
import { Plus, UserMinus, UsersRound } from "lucide-react";
import { useState } from "react";
import { addGroupMember, deleteGroupMember, getUserByUsername } from "./rbac-api";

export function GroupMembersDialog({ group, onClose }: { group: Group; onClose: () => void }) {
  const href = group.pulp_href;
  const members = useLoadMoreList<GroupUser>(`${href}users`);
  const listSearch = useListSearch();
  const users = useLoadMoreList<User>(
    "users",
    {
      username__contains: listSearch.queryParam,
      ordering: "username",
    },
    { enabled: Boolean(href) },
  );
  const [username, setUsername] = useState("");
  const [removing, setRemoving] = useState<GroupUser | null>(null);

  const memberEndpoint = queryKeys.apiList.endpoint(`${href}users`);
  const userOptions = (users.data?.results ?? []).flatMap((user) =>
    user.username ? [{ value: user.username, label: user.username }] : [],
  );
  const rows = members.data?.results ?? [];

  async function assertMutableUser(username: string): Promise<void> {
    const config = getConfig();
    if (!config.ssoManagedGroup) {
      return;
    }
    const user = await getUserByUsername(username);
    if (isSsoManagedUser(user, config.ssoManagedGroup)) {
      throw new Error(
        "This account is managed by SSO. Change the provider mapping in Settings → SSO instead.",
      );
    }
  }

  const add = useApiMutation<void, string>({
    mutationFn: async (name) => {
      if (!href) {
        return;
      }
      await assertMutableUser(name);
      await addGroupMember(href, name);
    },
    invalidation: [memberEndpoint, queryKeys.apiList.endpoint("users")],
    successMessage: "Member added",
    errorMode: "inline",
    onSuccess: async () => {
      await members.refetch();
      setUsername("");
    },
  });

  const remove = useApiMutation<void, GroupUser>({
    mutationFn: async (member) => {
      await assertMutableUser(member.username);
      if (member.pulp_href) {
        await deleteGroupMember(member.pulp_href);
      }
    },
    invalidation: [memberEndpoint, queryKeys.apiList.endpoint("users")],
    successMessage: "Member removed",
    errorMode: "inline",
    onSuccess: async () => {
      await members.refetch();
      setRemoving(null);
    },
  });

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={`Members of ${group.name}`}
        description="Local group membership. Groups synchronized from an identity provider may be overwritten by that provider."
        className="max-w-2xl"
        footer={
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        }
      >
        <div className="space-y-5">
          <div className="space-y-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <h3 className="flex items-center gap-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              <Plus className="size-3.5" />
              Add member
            </h3>
            <Combobox
              id="group-member-user"
              label="User"
              value={username}
              onChange={setUsername}
              options={userOptions}
              emptyLabel="Select a user…"
              searchValue={listSearch.input}
              onSearchChange={listSearch.setInput}
              searchPlaceholder="Search users…"
              isLoading={users.isLoading}
              isError={users.isError}
              onRetry={() => void users.refetch()}
              helper={
                users.isLoading
                  ? "Loading users…"
                  : users.isError
                    ? "Could not load users."
                    : "Choose the account to add to this group."
              }
              hasMore={users.hasMore}
              loadedCount={userOptions.length}
              totalCount={users.total}
              onLoadMore={users.loadMore}
              disabled={!href || add.isPending}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!href || !username || add.isPending}
              onClick={() => add.mutate(username)}
            >
              {add.isPending ? <Spinner /> : <Plus className="size-3.5" />}
              {add.isPending ? "Adding…" : "Add member"}
            </Button>
            {add.error ? (
              <FormError>
                {formatApiError(add.error, "The user could not be added to the group.")}
              </FormError>
            ) : null}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                <UsersRound className="size-3.5" />
                Members
              </h3>
              <Badge tone="neutral">
                {members.isLoading ? "Loading…" : `${members.total} members`}
              </Badge>
            </div>

            {members.isError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                {formatApiError(members.error, "Members could not be loaded.")}
                <button
                  type="button"
                  onClick={() => void members.refetch()}
                  className="ml-2 font-medium underline underline-offset-2"
                >
                  Retry
                </button>
              </div>
            ) : rows.length ? (
              <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {rows.map((member) => (
                  <li
                    key={member.pulp_href ?? member.username}
                    className="flex items-center justify-between gap-3 p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex size-8 items-center justify-center rounded-full bg-orange-50 text-meta font-semibold uppercase text-orange-700 dark:bg-orange-950/50 dark:text-orange-300">
                        {member.username.slice(0, 2)}
                      </span>
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {member.username}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${member.username} from ${group.name}`}
                      title="Remove member"
                      onClick={() => {
                        remove.reset();
                        setRemoving(member);
                      }}
                    >
                      <UserMinus className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed border-zinc-200 p-4 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                This group has no members.
              </p>
            )}

            {members.hasMore ? (
              <Button
                variant="outline"
                size="sm"
                onClick={members.loadMore}
                disabled={members.isFetching}
              >
                {members.isFetching ? "Loading…" : "Load more members"}
              </Button>
            ) : null}
          </div>
        </div>
      </Modal>

      {removing ? (
        <ConfirmDeleteModal
          open
          onClose={() => {
            setRemoving(null);
            remove.reset();
          }}
          title="Remove group member"
          description="The user keeps direct role assignments but loses permissions granted through this group."
          itemName={removing.username}
          confirmLabel="Remove member"
          busyLabel="Removing…"
          isDeleting={remove.isPending}
          error={
            remove.error
              ? formatApiError(remove.error, "The group member could not be removed.")
              : null
          }
          requireName={false}
          onConfirm={() => {
            if (removing.pulp_href) {
              remove.mutate(removing);
            }
          }}
        />
      ) : null}
    </>
  );
}
