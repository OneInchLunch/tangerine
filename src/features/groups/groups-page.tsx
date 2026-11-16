import type { Group } from "@/api/types";
import { useApiDataPane } from "@/components/api-data-pane";
import { FormError } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { ResourceList } from "@/components/resource-list";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatApiError } from "@/lib/errors";
import { queryKeys } from "@/lib/query-keys";
import { usePulpWrite } from "@/hooks/use-api-mutation";
import { useFormState } from "@/lib/use-form-state";
import { GroupMembersDialog } from "@/features/rbac/group-members-dialog";
import { RoleAssignmentsDialog } from "@/features/rbac/role-assignments-dialog";
import { Braces, KeySquare, Pencil, Plus, Save, UserCog } from "lucide-react";
import { entityIcons } from "@/lib/icons";
import { useState, type FormEvent } from "react";

function GroupDialog({
  open,
  group,
  onClose,
}: {
  open: boolean;
  group?: Group;
  onClose: () => void;
}) {
  const editing = Boolean(group?.pulp_href);
  const href = group?.pulp_href;
  const form = useFormState<{ name: string }>({ name: group?.name ?? "" });

  const save = usePulpWrite<{ name: string }>({
    method: editing ? "PATCH" : "POST",
    path: editing ? (href ?? "") : "groups/",
    invalidation: [queryKeys.apiList.endpoint("groups")],
    successMessage: editing ? "Group updated" : "Group created",
    errorMode: "inline",
    onSuccess: () => {
      form.reset({ name: group?.name ?? "" });
      onClose();
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editing && !href) {
      return;
    }
    save.mutate({ name: form.value.name.trim() });
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        form.reset({ name: group?.name ?? "" });
        save.reset();
        onClose();
      }}
      dirty={form.isDirty}
      title={editing ? `Edit ${group?.name ?? ""}` : "Create group"}
      description={
        editing
          ? "Rename this group. Membership and role assignments are managed separately."
          : "Groups make it easier to grant the same permissions to multiple users."
      }
      footer={
        <>
          <ModalCancelButton disabled={save.isPending}>Cancel</ModalCancelButton>
          <SubmitButton
            form={editing ? "edit-group-form" : "create-group-form"}
            isSubmitting={save.isPending}
            label={editing ? "Save changes" : "Create group"}
            busyLabel={editing ? "Saving…" : "Creating…"}
            icon={editing ? Save : Plus}
            disabled={!form.value.name.trim() || (editing && !href)}
          />
        </>
      }
    >
      <form
        id={editing ? "edit-group-form" : "create-group-form"}
        className="space-y-4"
        onSubmit={handleSubmit}
      >
        <div className="space-y-1.5">
          <Label htmlFor={editing ? "edit-group-name" : "new-group-name"}>Group name</Label>
          <Input
            id={editing ? "edit-group-name" : "new-group-name"}
            autoFocus
            required
            value={form.value.name}
            onChange={(event) => form.patch({ name: event.target.value })}
            placeholder="e.g. release-engineers"
          />
        </div>
        {save.error ? (
          <FormError>
            {formatApiError(
              save.error,
              editing ? "Unable to update group." : "Unable to create group.",
            )}
          </FormError>
        ) : null}
      </form>
    </Modal>
  );
}

export function GroupsPage() {
  const { openApiData } = useApiDataPane();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [membersGroup, setMembersGroup] = useState<Group | null>(null);
  const [rolesGroup, setRolesGroup] = useState<Group | null>(null);

  return (
    <>
      <ResourceList<Group>
        title="Groups"
        description="Collections of users that can share role assignments and permissions."
        endpoint="groups"
        icon={entityIcons.groups}
        searchParam="name__contains"
        searchPlaceholder="Search groups…"
        params={{ ordering: "name" }}
        getRowKey={(row) => row.pulp_href ?? row.name}
        countLabel={(count) => `${count} ${count === 1 ? "group" : "groups"}`}
        headerActions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Create group
          </Button>
        }
        emptyTitle="No groups yet"
        emptyDescription="Create a group to manage permissions for multiple users at once."
        emptyAction={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Create group
          </Button>
        }
        columns={[
          {
            header: "Group",
            sortKey: "name",
            cell: (row) => (
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400">
                  <entityIcons.groups className="size-4" />
                </span>
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">{row.name}</p>
                  <p className="font-mono text-micro text-zinc-400 dark:text-zinc-500">
                    {row.pulp_href}
                  </p>
                </div>
              </div>
            ),
          },
          {
            header: "ID",
            className: "hidden sm:table-cell",
            cell: (row) => <Badge tone="neutral">#{row.id ?? "—"}</Badge>,
          },
          {
            header: "",
            className: "w-20",
            cell: (row) =>
              row.pulp_href ? (
                <div className="flex items-center justify-end gap-0.5">
                  <IconButton
                    label={`Manage members of ${row.name}`}
                    title="Manage members"
                    icon={UserCog}
                    onClick={() => setMembersGroup(row)}
                  />
                  <IconButton
                    label={`Manage roles for ${row.name}`}
                    title="Manage roles"
                    icon={KeySquare}
                    onClick={() => setRolesGroup(row)}
                  />
                  <IconButton
                    label={`Edit ${row.name}`}
                    icon={Pencil}
                    onClick={() => setEditingGroup(row)}
                  />
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
      <GroupDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      {editingGroup ? (
        <GroupDialog
          key={editingGroup.pulp_href ?? editingGroup.name}
          open
          group={editingGroup}
          onClose={() => setEditingGroup(null)}
        />
      ) : null}
      {membersGroup ? (
        <GroupMembersDialog
          key={`members:${membersGroup.pulp_href ?? membersGroup.name}`}
          group={membersGroup}
          onClose={() => setMembersGroup(null)}
        />
      ) : null}
      {rolesGroup?.pulp_href ? (
        <RoleAssignmentsDialog
          key={`roles:${rolesGroup.pulp_href}`}
          subject={{
            kind: "group",
            href: rolesGroup.pulp_href,
            name: rolesGroup.name,
          }}
          onClose={() => setRolesGroup(null)}
        />
      ) : null}
    </>
  );
}
