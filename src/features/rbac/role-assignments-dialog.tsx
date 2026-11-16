import type { Role, RoleAssignment } from "@/api/types";
import { FormError, InlineAlert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Spinner } from "@/components/ui/spinner";
import { useAllList, useLoadMoreList } from "@/hooks/queries";
import { formatApiError } from "@/lib/errors";
import { queryKeys } from "@/lib/query-keys";
import { truncate } from "@/lib/format";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { KeySquare, Plus, X } from "lucide-react";
import { useState } from "react";
import { addRoleAssignment, deleteRoleAssignment } from "./rbac-api";

function isSystemRole(role: string): boolean {
  return role.startsWith("core.task_");
}

export function RoleAssignmentsDialog({
  subject,
  ssoManaged = false,
  onClose,
}: {
  subject: { kind: "user" | "group"; href: string; name: string };
  ssoManaged?: boolean;
  onClose: () => void;
}) {
  const roles = useAllList<Role>("roles", { ordering: "name" });
  const roleOptions: ComboboxOption[] = (roles.data?.results ?? [])
    .filter((role) => !isSystemRole(role.name))
    .map((role) => ({ value: role.name, label: role.name }));

  const [roleFilter, setRoleFilter] = useState("");
  const [roleToAdd, setRoleToAdd] = useState("");
  const [contentObject, setContentObject] = useState("");
  const [removing, setRemoving] = useState<RoleAssignment | null>(null);

  const assignments = useLoadMoreList<RoleAssignment>(
    `${subject.href}roles`,
    {
      role: roleFilter || undefined,
      ordering: "-pulp_created",
    },
    {
      enabled: roles.isSuccess && Boolean(roleFilter),
    },
  );

  const assignmentEndpoint = queryKeys.apiList.endpoint(`${subject.href}roles`);

  const add = useApiMutation<void, { role: string; contentObject: string }>({
    mutationFn: ({ role, contentObject }) => addRoleAssignment(subject.href, role, contentObject),
    invalidation: [assignmentEndpoint],
    successMessage: "Role assigned",
    errorMode: "inline",
    onSuccess: (_data, vars) => {
      setRoleFilter(vars.role);
      setContentObject("");
    },
  });

  const remove = useApiMutation<void, string>({
    mutationFn: (href) => deleteRoleAssignment(href),
    invalidation: [assignmentEndpoint],
    successMessage: "Role assignment removed",
    errorMode: "inline",
    onSuccess: async () => {
      await assignments.refetch();
      setRemoving(null);
    },
  });

  const rows = assignments.data?.results ?? [];

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={`Role assignments for ${subject.name}`}
        description={`Manage ${subject.kind}-level and object-scoped roles. Task-scoped system roles are hidden.`}
        className="max-w-3xl"
        footer={
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        }
      >
        <div className="space-y-5">
          {ssoManaged ? (
            <InlineAlert tone="info" title="Managed by SSO">
              This account is provisioned by the identity provider. Change its groups, roles, and
              access in Settings → SSO instead of assigning them here.
            </InlineAlert>
          ) : (
            <div className="space-y-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <h3 className="flex items-center gap-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                <Plus className="size-3.5" />
                Add assignment
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Combobox
                  id="assignment-role"
                  label="Role"
                  value={roleToAdd}
                  onChange={setRoleToAdd}
                  options={roleOptions}
                  placeholder="Select a role…"
                  searchPlaceholder="Search roles…"
                  isLoading={roles.isLoading}
                  isError={roles.isError}
                  onRetry={() => void roles.refetch()}
                  disabled={add.isPending || roles.isLoading}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="assignment-object">Object scope (optional)</Label>
                  <Input
                    id="assignment-object"
                    value={contentObject}
                    onChange={(event) => setContentObject(event.target.value)}
                    placeholder="/pulp/api/v3/repositories/file/file/…/"
                    className="font-mono text-xs"
                    disabled={add.isPending}
                  />
                  <p className="text-meta text-zinc-400 dark:text-zinc-500">
                    Leave blank for a model-level assignment. Paste an object API href to scope it.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!roleToAdd || roles.isLoading || add.isPending}
                onClick={() => add.mutate({ role: roleToAdd, contentObject })}
              >
                {add.isPending ? <Spinner /> : <Plus className="size-3.5" />}
                {add.isPending ? "Adding…" : "Add role"}
              </Button>
              {add.error ? (
                <FormError>
                  {formatApiError(add.error, "The role assignment could not be added.")}
                </FormError>
              ) : null}
            </div>
          )}

          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div className="w-full sm:max-w-xs">
                <Combobox
                  id="assignment-filter"
                  label="Filter by role"
                  value={roleFilter}
                  onChange={setRoleFilter}
                  options={roleOptions}
                  emptyLabel="All non-task roles"
                  placeholder="All non-task roles"
                  searchPlaceholder="Search roles…"
                  isLoading={roles.isLoading}
                  isError={roles.isError}
                  onRetry={() => void roles.refetch()}
                />
              </div>
              <p className="text-meta text-zinc-400 dark:text-zinc-500">
                {roleFilter
                  ? assignments.isLoading
                    ? "Loading…"
                    : `${assignments.total} assignment(s)`
                  : "Choose a role to list assignments"}
              </p>
            </div>

            {!roleFilter ? (
              <p className="rounded-lg border border-dashed border-zinc-200 p-4 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                Select a role above to view its assignments. Task-scoped system roles are hidden.
              </p>
            ) : assignments.isError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                {formatApiError(assignments.error, "Assignments could not be loaded.")}
                <button
                  type="button"
                  onClick={() => void assignments.refetch()}
                  className="ml-2 font-medium underline underline-offset-2"
                >
                  Retry
                </button>
              </div>
            ) : rows.length ? (
              <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {rows.map((assignment) => (
                  <li
                    key={assignment.pulp_href ?? `${assignment.role}:${assignment.content_object}`}
                    className="flex items-start justify-between gap-3 p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone="brand">
                          <KeySquare className="size-3" />
                          {assignment.role}
                        </Badge>
                        {assignment.permissions?.length ? (
                          <Badge tone="neutral">{assignment.permissions.length} permissions</Badge>
                        ) : null}
                      </div>
                      <p
                        className="mt-1 break-all font-mono text-micro text-zinc-400 dark:text-zinc-500"
                        title={assignment.content_object ?? "Global assignment"}
                      >
                        {assignment.content_object
                          ? truncate(assignment.content_object, 80)
                          : "Global assignment"}
                      </p>
                    </div>
                    {ssoManaged ? null : (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${assignment.role} assignment`}
                        title="Remove assignment"
                        onClick={() => {
                          remove.reset();
                          setRemoving(assignment);
                        }}
                      >
                        <X className="size-4" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed border-zinc-200 p-4 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                No assignments match this filter.
              </p>
            )}

            {assignments.hasMore ? (
              <Button
                variant="outline"
                size="sm"
                onClick={assignments.loadMore}
                disabled={assignments.isFetching}
              >
                {assignments.isFetching ? "Loading…" : "Load more assignments"}
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
          title="Remove role assignment"
          description="The subject immediately loses the permissions granted by this role for the selected scope."
          itemName={removing.role}
          confirmLabel="Remove assignment"
          busyLabel="Removing…"
          isDeleting={remove.isPending}
          error={
            remove.error
              ? formatApiError(remove.error, "The role assignment could not be removed.")
              : null
          }
          requireName={false}
          onConfirm={() => {
            if (removing.pulp_href) {
              remove.mutate(removing.pulp_href);
            }
          }}
        />
      ) : null}
    </>
  );
}
