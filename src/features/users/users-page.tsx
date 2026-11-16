import type { User } from "@/api/types";
import { useApiDataPane } from "@/components/api-data-pane";
import { FormError } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { ResourceList } from "@/components/resource-list";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatApiError } from "@/lib/errors";
import { formatRelative } from "@/lib/format";
import { getConfig } from "@/lib/config";
import { isSsoManagedUser } from "@/lib/sso";
import { queryKeys } from "@/lib/query-keys";
import { usePulpWrite } from "@/hooks/use-api-mutation";
import { Braces, KeySquare, Pencil, Plus, Save, ShieldCheck, UserPlus } from "lucide-react";
import { entityIcons } from "@/lib/icons";
import { useState, type FormEvent } from "react";
import { RoleAssignmentsDialog } from "@/features/rbac/role-assignments-dialog";
import { UserFormFields, type UserFormValue } from "./user-form-fields";
import { useFormState } from "@/lib/use-form-state";

const EMPTY_USER: UserFormValue = {
  username: "",
  password: "",
  firstName: "",
  lastName: "",
  email: "",
  isStaff: false,
  isActive: true,
};

function userFormValue(user?: User): UserFormValue {
  return {
    username: user?.username ?? "",
    password: "",
    firstName: user?.first_name ?? "",
    lastName: user?.last_name ?? "",
    email: user?.email ?? "",
    isStaff: user?.is_staff ?? false,
    isActive: user?.is_active ?? true,
  };
}

function UserDialog({ open, user, onClose }: { open: boolean; user?: User; onClose: () => void }) {
  const config = getConfig();
  const editing = Boolean(user?.pulp_href);
  const href = user?.pulp_href;
  const ssoManaged = user ? isSsoManagedUser(user, config.ssoManagedGroup) : false;
  const form = useFormState<UserFormValue>(() => (user ? userFormValue(user) : EMPTY_USER));

  const save = usePulpWrite<Record<string, unknown>>({
    method: editing ? "PATCH" : "POST",
    path: editing ? (href ?? "") : "users/",
    invalidation: [queryKeys.apiList.endpoint("users")],
    successMessage: editing ? "User updated" : "User created",
    errorMode: "inline",
    onSuccess: () => {
      reset();
      onClose();
    },
  });

  function reset() {
    form.reset(user ? userFormValue(user) : EMPTY_USER);
    save.reset();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editing && !href) {
      return;
    }
    const body: Record<string, unknown> = {
      username: form.value.username.trim(),
      first_name: form.value.firstName.trim(),
      last_name: form.value.lastName.trim(),
      email: form.value.email.trim(),
      is_staff: form.value.isStaff,
      is_active: editing ? form.value.isActive : true,
    };
    if (!editing) {
      body.password = form.value.password;
    } else if (form.value.password && !ssoManaged) {
      body.password = form.value.password;
    }
    save.mutate(body);
  }

  const title = editing ? `Edit ${user?.username ?? ""}` : "Create user";
  const description = editing
    ? ssoManaged
      ? "This account is provisioned by your identity provider, so its password is managed externally."
      : "Update account details, access flags, or set a new password."
    : config.authMode === "gateway"
      ? "Local accounts sign in with a password; SSO accounts are provisioned by your identity provider."
      : "Users can sign in with a password and receive permissions through roles.";

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      dirty={form.isDirty}
      title={title}
      description={description}
      footer={
        <>
          <ModalCancelButton disabled={save.isPending}>Cancel</ModalCancelButton>
          <SubmitButton
            form={editing ? "edit-user-form" : "create-user-form"}
            isSubmitting={save.isPending}
            label={editing ? "Save changes" : "Create user"}
            busyLabel={editing ? "Saving…" : "Creating…"}
            icon={editing ? Save : UserPlus}
            disabled={
              !form.value.username.trim() ||
              (!editing && !form.value.password) ||
              (editing && !href)
            }
          />
        </>
      }
    >
      <form
        id={editing ? "edit-user-form" : "create-user-form"}
        className="space-y-4"
        onSubmit={handleSubmit}
      >
        <UserFormFields
          idPrefix={editing ? "edit-user" : "new-user"}
          value={form.value}
          onChange={form.patch}
          passwordRequired={!editing}
          passwordPlaceholder={editing ? "Leave blank to keep current" : undefined}
          passwordManagedBySso={ssoManaged}
          showActive={editing}
        />
        {save.error ? (
          <FormError>
            {formatApiError(
              save.error,
              editing ? "Unable to update user." : "Unable to create user.",
            )}
          </FormError>
        ) : null}
      </form>
    </Modal>
  );
}

export function UsersPage() {
  const { openApiData } = useApiDataPane();
  const config = getConfig();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [rolesUser, setRolesUser] = useState<User | null>(null);

  return (
    <>
      <ResourceList<User>
        title="Users"
        description={
          config.authMode === "gateway"
            ? "Accounts that authenticate to Pulp, either with a local password or through your identity provider."
            : "Accounts that can authenticate to Pulp and receive role-based permissions."
        }
        endpoint="users"
        icon={entityIcons.users}
        searchParam="username__contains"
        searchPlaceholder="Search users…"
        params={{ ordering: "username" }}
        getRowKey={(row) => row.pulp_href ?? row.username}
        countLabel={(count) => `${count} ${count === 1 ? "user" : "users"}`}
        headerActions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Create user
          </Button>
        }
        emptyTitle="No users found"
        emptyDescription="Create a user account to grant access to Pulp."
        emptyAction={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Create user
          </Button>
        }
        columns={[
          {
            header: "User",
            sortKey: "username",
            cell: (row) => (
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-full bg-orange-50 text-xs font-semibold uppercase text-orange-700 dark:bg-orange-950/50 dark:text-orange-300">
                  {row.username.slice(0, 2)}
                </span>
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">{row.username}</p>
                  <p className="text-meta text-zinc-500 dark:text-zinc-400">
                    {[row.first_name, row.last_name].filter(Boolean).join(" ") || "No display name"}
                  </p>
                </div>
              </div>
            ),
          },
          {
            header: "Email",
            className: "hidden sm:table-cell text-xs text-zinc-500 dark:text-zinc-400",
            cell: (row) => row.email || "—",
          },
          {
            header: "Status",
            cell: (row) => (
              <div className="flex flex-wrap gap-1">
                <Badge tone={row.is_active ? "success" : "danger"}>
                  {row.is_active ? "Active" : "Inactive"}
                </Badge>
                {row.is_staff ? (
                  <Badge tone="brand">
                    <ShieldCheck className="size-3" />
                    Admin
                  </Badge>
                ) : null}
                {isSsoManagedUser(row, config.ssoManagedGroup) ? (
                  <Badge tone="info">SSO</Badge>
                ) : null}
              </div>
            ),
          },
          {
            header: "Groups",
            className: "hidden lg:table-cell",
            cell: (row) =>
              row.groups?.length ? (
                <div className="flex flex-wrap gap-1">
                  {row.groups.slice(0, 3).map((group) => (
                    <Badge key={group.pulp_href ?? group.name} tone="neutral">
                      {group.name}
                    </Badge>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-zinc-400">None</span>
              ),
          },
          {
            header: "Joined",
            className: "hidden md:table-cell text-xs text-zinc-500 dark:text-zinc-400",
            cell: (row) => formatRelative(row.date_joined),
          },
          {
            header: "",
            className: "w-20",
            cell: (row) =>
              row.pulp_href ? (
                <div className="flex items-center justify-end gap-0.5">
                  <IconButton
                    label={`Manage roles for ${row.username}`}
                    title="Manage roles"
                    icon={KeySquare}
                    onClick={() => setRolesUser(row)}
                  />
                  <IconButton
                    label={`Edit ${row.username}`}
                    icon={Pencil}
                    onClick={() => setEditingUser(row)}
                  />
                  <IconButton
                    label={`View API data for ${row.username}`}
                    title="View API data"
                    icon={Braces}
                    onClick={() => openApiData({ href: row.pulp_href!, title: row.username })}
                  />
                </div>
              ) : null,
          },
        ]}
      />
      <UserDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      {editingUser ? (
        <UserDialog
          key={editingUser.pulp_href ?? editingUser.username}
          open
          user={editingUser}
          onClose={() => setEditingUser(null)}
        />
      ) : null}
      {rolesUser?.pulp_href ? (
        <RoleAssignmentsDialog
          key={rolesUser.pulp_href}
          subject={{
            kind: "user",
            href: rolesUser.pulp_href,
            name: rolesUser.username,
          }}
          ssoManaged={isSsoManagedUser(rolesUser, config.ssoManagedGroup)}
          onClose={() => setRolesUser(null)}
        />
      ) : null}
    </>
  );
}
