import type { Role } from "@/api/types";
import { FormError } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { MultiCombobox } from "@/components/ui/combobox";
import { SubmitButton } from "@/components/ui/submit-button";
import { useAllList } from "@/hooks/queries";
import { formatApiError } from "@/lib/errors";
import { queryKeys } from "@/lib/query-keys";
import { isDirtyValue } from "@/lib/use-form-state";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { Plus, Save } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { createRole, updateRole } from "./rbac-api";

export function RoleFormDialog({ role, onClose }: { role?: Role; onClose: () => void }) {
  const roles = useAllList<Role>("roles", { ordering: "name" });
  const allPermissions = useMemo(() => {
    const values = new Set<string>();
    for (const item of roles.data?.results ?? []) {
      for (const permission of item.permissions) {
        values.add(permission);
      }
    }
    for (const permission of role?.permissions ?? []) {
      values.add(permission);
    }
    return Array.from(values).sort();
  }, [role?.permissions, roles.data?.results]);

  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [permissions, setPermissions] = useState<string[]>(role?.permissions ?? []);
  const [customPermission, setCustomPermission] = useState("");
  const dirty = isDirtyValue(
    { name, description, permissions, customPermission },
    {
      name: role?.name ?? "",
      description: role?.description ?? "",
      permissions: role?.permissions ?? [],
      customPermission: "",
    },
  );

  const save = useApiMutation<
    unknown,
    { name: string; description: string | null; permissions: string[] }
  >({
    mutationFn: (body) => (role?.pulp_href ? updateRole(role.pulp_href, body) : createRole(body)),
    invalidation: [queryKeys.apiList.endpoint("roles")],
    successMessage: role ? "Role updated" : "Role created",
    errorMode: "inline",
    onSuccess: onClose,
  });

  const options = Array.from(new Set([...allPermissions, ...permissions]))
    .sort()
    .map((permission) => ({ value: permission, label: permission }));

  function addCustomPermission() {
    const permission = customPermission.trim();
    if (!permission || permissions.includes(permission)) {
      return;
    }
    setPermissions((current) => [...current, permission]);
    setCustomPermission("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate({
      name: name.trim(),
      description: description.trim() || null,
      permissions,
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={role ? `Edit ${role.name}` : "Create role"}
      description="Roles are named permission sets assigned to users, groups, or objects. Built-in roles are read-only."
      className="max-w-2xl"
      busy={save.isPending}
      dirty={dirty}
      footer={
        <>
          <ModalCancelButton disabled={save.isPending}>Cancel</ModalCancelButton>
          <SubmitButton
            form="role-form"
            isSubmitting={save.isPending}
            label={role ? "Save changes" : "Create role"}
            busyLabel="Saving…"
            icon={role ? Save : Plus}
            disabled={!name.trim() || !permissions.length}
          />
        </>
      }
    >
      <form id="role-form" className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-1.5">
          <Label htmlFor="role-name">Name</Label>
          <Input
            id="role-name"
            required
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="role-description">Description</Label>
          <Input
            id="role-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <MultiCombobox
          id="role-permissions"
          label="Permissions"
          values={permissions}
          onChange={setPermissions}
          options={options}
          searchPlaceholder="Search permissions…"
          emptyMessage="No permissions are known yet."
          isLoading={roles.isLoading}
          isError={roles.isError}
          onRetry={() => void roles.refetch()}
        />
        <div className="flex gap-2">
          <Input
            value={customPermission}
            onChange={(event) => setCustomPermission(event.target.value)}
            placeholder="app.add_permission"
            aria-label="Custom permission"
            className="font-mono text-xs"
          />
          <Button
            type="button"
            variant="outline"
            onClick={addCustomPermission}
            disabled={!customPermission.trim()}
          >
            Add
          </Button>
        </div>
        <p className="text-meta text-zinc-400 dark:text-zinc-500">
          Pulp has no standalone permission catalog endpoint, so the list is built from the
          permissions used by installed roles. Add any missing permission explicitly.
        </p>
        {save.error ? (
          <FormError>{formatApiError(save.error, "The role could not be saved.")}</FormError>
        ) : null}
      </form>
    </Modal>
  );
}
