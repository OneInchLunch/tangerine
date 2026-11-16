import type { Role } from "@/api/types";
import { useApiDataPane } from "@/components/api-data-pane";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import { IconButton } from "@/components/ui/icon-button";
import { Modal } from "@/components/ui/modal";
import { ResourceList } from "@/components/resource-list";
import { formatApiError } from "@/lib/errors";
import { queryKeys } from "@/lib/query-keys";
import { usePulpDelete } from "@/hooks/use-api-mutation";
import { RoleFormDialog } from "@/features/rbac/role-form-dialog";
import { Braces, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { entityIcons } from "@/lib/icons";
import { useState } from "react";

export function RolesPage() {
  const { openApiData } = useApiDataPane();
  const [selected, setSelected] = useState<Role | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [deletingRole, setDeletingRole] = useState<Role | null>(null);
  const remove = usePulpDelete<{ href: string }>({
    path: ({ href }) => href,
    invalidation: [queryKeys.apiList.endpoint("roles")],
    successMessage: "Role deleted",
    errorMode: "inline",
    onSuccess: () => setDeletingRole(null),
  });

  function handleDelete() {
    if (!deletingRole?.pulp_href) {
      return;
    }
    remove.mutate({ href: deletingRole.pulp_href });
  }

  return (
    <>
      <ResourceList<Role>
        title="Roles"
        description="Named sets of permissions that can be assigned to users, groups, and objects."
        endpoint="roles"
        icon={entityIcons.roles}
        searchParam="name__contains"
        searchPlaceholder="Search roles…"
        params={{ ordering: "name" }}
        getRowKey={(row) => row.pulp_href ?? row.name}
        countLabel={(count) => `${count} ${count === 1 ? "role" : "roles"}`}
        headerActions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Create role
          </Button>
        }
        emptyTitle="No roles found"
        emptyDescription="Roles are usually created by installed plugins. Create a custom role to grant a specific permission set."
        columns={[
          {
            header: "Role",
            sortKey: "name",
            cell: (row) => (
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400">
                  <entityIcons.roles className="size-4" />
                </span>
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => setSelected(row)}
                    className="truncate text-left font-medium text-zinc-900 hover:text-orange-600 dark:text-zinc-100 dark:hover:text-orange-400"
                  >
                    {row.name}
                  </button>
                  <p className="truncate text-meta text-zinc-500 dark:text-zinc-400">
                    {row.description || `${row.permissions.length} permissions`}
                  </p>
                </div>
              </div>
            ),
          },
          {
            header: "Permissions",
            className: "hidden md:table-cell",
            cell: (row) => (
              <div className="flex flex-wrap gap-1">
                {row.permissions.slice(0, 2).map((permission) => (
                  <Badge key={permission} tone="neutral" className="font-mono">
                    {permission}
                  </Badge>
                ))}
                {row.permissions.length > 2 ? (
                  <Badge tone="neutral">+{row.permissions.length - 2}</Badge>
                ) : null}
              </div>
            ),
          },
          {
            header: "Kind",
            cell: (row) =>
              row.locked ? (
                <Badge tone="warning">
                  <Lock className="size-3" />
                  Built-in
                </Badge>
              ) : (
                <Badge tone="brand">Custom</Badge>
              ),
          },
          {
            header: "",
            className: "w-28",
            cell: (row) =>
              row.pulp_href ? (
                <div className="flex items-center justify-end gap-0.5">
                  {!row.locked ? (
                    <>
                      <IconButton
                        label={`Edit ${row.name}`}
                        icon={Pencil}
                        onClick={() => setEditingRole(row)}
                      />
                      <IconButton
                        label={`Delete ${row.name}`}
                        title="Delete custom role"
                        icon={Trash2}
                        tone="danger"
                        onClick={() => {
                          remove.reset();
                          setDeletingRole(row);
                        }}
                      />
                    </>
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

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.name ?? "Role"}
        description={selected?.description ?? "Permissions granted by this role."}
        className="max-w-2xl"
        footer={
          <Button variant="outline" onClick={() => setSelected(null)}>
            Close
          </Button>
        }
      >
        {selected ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={selected.locked ? "warning" : "brand"}>
                {selected.locked ? "Built-in role" : "Custom role"}
              </Badge>
              <Badge tone="neutral">{selected.permissions.length} permissions</Badge>
            </div>
            <div className="max-h-80 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              {selected.permissions.length ? (
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {selected.permissions.map((permission) => (
                    <li
                      key={permission}
                      className="px-3 py-2 font-mono text-meta text-zinc-600 dark:text-zinc-300"
                    >
                      {permission}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="p-3 text-xs text-zinc-500 dark:text-zinc-400">
                  This role has no permissions.
                </p>
              )}
            </div>
            {selected.pulp_href ? (
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  openApiData({ href: selected.pulp_href!, title: selected.name });
                }}
                className="inline-flex items-center gap-1 text-xs text-orange-600 hover:underline dark:text-orange-400"
              >
                View role API data
                <Braces className="size-3" />
              </button>
            ) : null}
          </div>
        ) : null}
      </Modal>

      {createOpen ? <RoleFormDialog onClose={() => setCreateOpen(false)} /> : null}
      {editingRole ? (
        <RoleFormDialog
          key={editingRole.pulp_href ?? editingRole.name}
          role={editingRole}
          onClose={() => setEditingRole(null)}
        />
      ) : null}
      {deletingRole ? (
        <ConfirmDeleteModal
          open
          onClose={() => {
            setDeletingRole(null);
            remove.reset();
          }}
          title="Delete custom role"
          description="The role is removed. Any remaining assignments must be cleaned up separately."
          itemName={deletingRole.name}
          confirmLabel="Delete role"
          isDeleting={remove.isPending}
          error={
            remove.error ? formatApiError(remove.error, "The role could not be deleted.") : null
          }
          requireName={false}
          onConfirm={handleDelete}
        />
      ) : null}
    </>
  );
}
