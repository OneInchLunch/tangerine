import { changeObjectRole, getUserByUsername } from "@/features/rbac/rbac-api";
import type { Group, ObjectRole, Role, User } from "@/api/types";
import { FormError } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useAllList, useLoadMoreList, useObjectRoles } from "@/hooks/queries";
import { useListSearch } from "@/hooks/use-list-search";
import { formatApiError } from "@/lib/errors";
import { queryKeys } from "@/lib/query-keys";
import { getConfig } from "@/lib/config";
import { isSsoManagedUser } from "@/lib/sso";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { KeySquare, Plus, UserRound, UsersRound, X } from "lucide-react";
import { useState, type ReactNode } from "react";

interface Removal {
  role: string;
  kind: "users" | "groups";
  name: string;
}

export function ObjectRolesCard({
  objectHref,
  objectName,
}: {
  objectHref: string | undefined;
  objectName: string;
}) {
  const rolesQuery = useObjectRoles(objectHref);
  const roles = useAllList<Role>("roles", { ordering: "name" });
  const [role, setRole] = useState("");
  const [kind, setKind] = useState<"users" | "groups">("users");
  const listSearch = useListSearch();
  const users = useLoadMoreList<User>(
    "users",
    { username__contains: listSearch.queryParam, ordering: "username" },
    { enabled: kind === "users" },
  );
  const groups = useLoadMoreList<Group>(
    "groups",
    { name__contains: listSearch.queryParam, ordering: "name" },
    { enabled: kind === "groups" },
  );
  const [principal, setPrincipal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Removal | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const roleEntries = rolesQuery.data?.roles ?? [];
  const roleOptions = (roles.data?.results ?? []).filter(
    (item) => !item.name.startsWith("core.task_"),
  );
  const principalOptions =
    kind === "users"
      ? (users.data?.results ?? []).map((user) => ({
          value: user.username,
          label: user.username,
        }))
      : (groups.data?.results ?? []).flatMap((group) =>
          group.name ? [{ value: group.name, label: group.name }] : [],
        );
  const activeQuery = kind === "users" ? users : groups;

  const add = useApiMutation<void, { role: string; principal: string; kind: "users" | "groups" }>({
    mutationFn: async ({ role, principal, kind }) => {
      if (kind === "users") {
        const config = getConfig();
        const user = await getUserByUsername(principal);
        if (isSsoManagedUser(user, config.ssoManagedGroup)) {
          throw new Error(
            "This account is managed by SSO. Change the provider mapping in Settings → SSO instead.",
          );
        }
      }
      await changeObjectRole(
        objectHref!,
        "add_role",
        kind === "users" ? { role, users: [principal] } : { role, groups: [principal] },
      );
    },
    invalidation: [queryKeys.objectRoles(objectHref)],
    successMessage: "Role assigned",
    onSuccess: () => setPrincipal(""),
    onError: (caught) => setError(formatApiError(caught, "The role could not be assigned.")),
  });

  const remove = useApiMutation<void, Removal>({
    mutationFn: async (removal) => {
      if (removal.kind === "users") {
        const config = getConfig();
        const user = await getUserByUsername(removal.name);
        if (isSsoManagedUser(user, config.ssoManagedGroup)) {
          throw new Error(
            "This account is managed by SSO. Change the provider mapping in Settings → SSO instead.",
          );
        }
      }
      await changeObjectRole(
        objectHref!,
        "remove_role",
        removal.kind === "users"
          ? { role: removal.role, users: [removal.name] }
          : { role: removal.role, groups: [removal.name] },
      );
    },
    invalidation: [queryKeys.objectRoles(objectHref)],
    successMessage: "Role assignment removed",
    onSuccess: () => setRemoving(null),
    onError: (caught) =>
      setRemoveError(formatApiError(caught, "The role assignment could not be removed.")),
  });

  function addRole() {
    if (!objectHref || !role || !principal) {
      return;
    }
    setError(null);
    add.mutate({ role, principal, kind });
  }

  function removeRole() {
    if (!objectHref || !removing) {
      return;
    }
    setRemoveError(null);
    remove.mutate(removing);
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeySquare className="size-4 text-zinc-400" />
            Roles and permissions
          </CardTitle>
          <CardDescription>
            Users and groups with roles on {objectName}. Object roles are separate from global
            assignments.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${objectHref}-role`}>Role</Label>
              <Select
                id={`${objectHref}-role`}
                value={role}
                onChange={(event) => setRole(event.target.value)}
                disabled={add.isPending || roles.isLoading}
              >
                <option value="">Select a role…</option>
                {roleOptions.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${objectHref}-kind`}>Assign to</Label>
              <Select
                id={`${objectHref}-kind`}
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value as "users" | "groups");
                  setPrincipal("");
                  listSearch.setInput("");
                }}
                disabled={add.isPending}
              >
                <option value="users">User</option>
                <option value="groups">Group</option>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Combobox
                id={`${objectHref}-principal`}
                label={kind === "users" ? "User" : "Group"}
                value={principal}
                onChange={setPrincipal}
                options={principalOptions}
                emptyLabel={`Select a ${kind === "users" ? "user" : "group"}…`}
                searchValue={listSearch.input}
                onSearchChange={listSearch.setInput}
                searchPlaceholder={`Search ${kind}…`}
                isLoading={activeQuery.isLoading}
                isError={activeQuery.isError}
                onRetry={() => void activeQuery.refetch()}
                helper={
                  activeQuery.isLoading
                    ? "Loading options…"
                    : activeQuery.isError
                      ? "Could not load options."
                      : undefined
                }
                hasMore={activeQuery.hasMore}
                loadedCount={principalOptions.length}
                totalCount={activeQuery.total}
                onLoadMore={activeQuery.loadMore}
                disabled={add.isPending}
              />
            </div>
            <div className="sm:col-span-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!objectHref || !role || !principal || add.isPending}
                onClick={addRole}
              >
                {add.isPending ? <Spinner /> : <Plus className="size-3.5" />}
                {add.isPending ? "Assigning…" : "Assign role"}
              </Button>
            </div>
            {error ? <FormError>{error}</FormError> : null}
          </div>

          {rolesQuery.isError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
              {formatApiError(rolesQuery.error, "Object roles could not be loaded.")}
              <button
                type="button"
                onClick={() => void rolesQuery.refetch()}
                className="ml-2 font-medium underline underline-offset-2"
              >
                Retry
              </button>
            </div>
          ) : rolesQuery.isLoading ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Loading roles…</p>
          ) : roleEntries.length ? (
            <div className="space-y-3">
              {roleEntries.map((entry) => (
                <ObjectRoleRow
                  key={entry.role}
                  entry={entry}
                  onRemove={(kind, name) => {
                    setRemoveError(null);
                    setRemoving({ role: entry.role, kind, name });
                  }}
                />
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-zinc-200 p-4 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              No object-level roles are assigned.
            </p>
          )}
        </CardContent>
      </Card>

      {removing ? (
        <ConfirmDeleteModal
          open
          onClose={() => {
            setRemoving(null);
            setRemoveError(null);
          }}
          title="Remove object role"
          description="The principal loses this role on this object only; global and other object assignments are unchanged."
          itemName={removing.name}
          confirmLabel="Remove role"
          busyLabel="Removing…"
          isDeleting={remove.isPending}
          error={removeError}
          requireName={false}
          onConfirm={removeRole}
        />
      ) : null}
    </>
  );
}

function ObjectRoleRow({
  entry,
  onRemove,
}: {
  entry: ObjectRole;
  onRemove: (kind: "users" | "groups", name: string) => void;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <Badge tone="brand">
        <KeySquare className="size-3" />
        {entry.role}
      </Badge>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {entry.users.map((user) => (
          <PrincipalChip
            key={`user:${user}`}
            icon={<UserRound className="size-3" />}
            label={user}
            onRemove={() => onRemove("users", user)}
          />
        ))}
        {entry.groups.map((group) => (
          <PrincipalChip
            key={`group:${group}`}
            icon={<UsersRound className="size-3" />}
            label={`group:${group}`}
            onRemove={() => onRemove("groups", group)}
          />
        ))}
      </div>
    </div>
  );
}

function PrincipalChip({
  icon,
  label,
  onRemove,
}: {
  icon: ReactNode;
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-meta text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-300">
      {icon}
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="rounded-full p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}
