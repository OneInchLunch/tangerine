import { mutateAndWait, repositoryTypeFromHref } from "@/api/resources";
import { useCanConfigureSigning } from "@/hooks/use-can-configure-signing";
import { scopeRepositoryAction } from "@/api/gateway";
import { useScopedSession } from "@/hooks/use-scoped-session";
import type { RepositoryDetail } from "@/api/types";
import { FormError } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";
import { queryKeys } from "@/lib/query-keys";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { repositoryAutopublishSupport } from "@/lib/repositories";
import { Pencil } from "lucide-react";
import { useState, type FormEvent } from "react";
import { RepositoryFormFields, type RepositoryFormValue } from "./repository-form-fields";
import { isDirtyValue, useFormState } from "@/lib/use-form-state";
import {
  OsvConfigFields,
  osvConfigError,
  parseOsvConfig,
  serializeOsvConfig,
  type OsvConfigRow,
} from "./osv-config-fields";

export function EditRepositoryModal({
  repository,
  onClose,
}: {
  repository: RepositoryDetail;
  onClose: () => void;
}) {
  const href = repository.pulp_href;
  const canConfigureSigning = useCanConfigureSigning();
  const { csrfToken: scopeToken } = useScopedSession();
  const repositoryType = repositoryTypeFromHref(href);
  const autopublishSupport = repositoryAutopublishSupport(repositoryType);
  const form = useFormState<RepositoryFormValue>({
    name: repository.name,
    description: repository.description ?? "",
    remote: repository.remote ?? "",
    autopublish: Boolean(repository.autopublish),
    metadataSigningService:
      typeof repository.metadata_signing_service === "string"
        ? repository.metadata_signing_service
        : "",
  });
  const [osvConfig, setOsvConfig] = useState<OsvConfigRow[]>(() =>
    parseOsvConfig(repository.osv_config),
  );
  const [retainVersions, setRetainVersions] = useState(
    repository.retain_repo_versions != null ? String(repository.retain_repo_versions) : "",
  );
  const [retainCheckpoints, setRetainCheckpoints] = useState(
    repository.retain_checkpoints != null ? String(repository.retain_checkpoints) : "",
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [initial] = useState(() => ({
    osv: parseOsvConfig(repository.osv_config),
    retainVersions:
      repository.retain_repo_versions != null ? String(repository.retain_repo_versions) : "",
    retainCheckpoints:
      repository.retain_checkpoints != null ? String(repository.retain_checkpoints) : "",
  }));

  const save = useApiMutation<unknown, Record<string, unknown>>({
    mutationFn: async (body) => {
      const target = href ?? "";
      if (scopeToken) {
        return scopeRepositoryAction("PATCH", target, body, scopeToken);
      }
      return mutateAndWait(target, { method: "PATCH", body });
    },
    invalidation: [queryKeys.repository(href), queryKeys.repositories.all],
    successMessage: "Repository updated",
    errorMode: "inline",
    onSuccess: onClose,
  });

  const error =
    validationError ??
    (save.error
      ? save.error instanceof Error
        ? save.error.message
        : "Unable to update repository."
      : null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!href) {
      return;
    }
    setValidationError(null);
    const retainVersionsValue = retainVersions.trim() ? Number(retainVersions) : null;
    const retainCheckpointsValue = retainCheckpoints.trim() ? Number(retainCheckpoints) : null;
    if (
      (retainVersionsValue !== null &&
        (!Number.isInteger(retainVersionsValue) || retainVersionsValue < 1)) ||
      (retainCheckpointsValue !== null &&
        (!Number.isInteger(retainCheckpointsValue) || retainCheckpointsValue < 1))
    ) {
      setValidationError("Retention values must be positive whole numbers.");
      return;
    }
    if (repositoryType === "rpm") {
      const osvError = osvConfigError(osvConfig);
      if (osvError) {
        setValidationError(osvError);
        return;
      }
    }

    save.mutate({
      name: form.value.name.trim(),
      description: form.value.description.trim() || null,
      remote: form.value.remote || null,
      retain_repo_versions: retainVersionsValue,
      retain_checkpoints: retainCheckpointsValue,
      ...(autopublishSupport ? { autopublish: form.value.autopublish } : {}),
      ...(repositoryType === "rpm" && canConfigureSigning
        ? { metadata_signing_service: form.value.metadataSigningService || null }
        : {}),
      ...(repositoryType === "rpm" ? { osv_config: serializeOsvConfig(osvConfig) } : {}),
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${repository.name}`}
      description="Update the repository name, description, remote, version retention policy, and auto-publish setting."
      className="max-w-2xl"
      dirty={
        form.isDirty ||
        isDirtyValue(osvConfig, initial.osv) ||
        retainVersions !== initial.retainVersions ||
        retainCheckpoints !== initial.retainCheckpoints
      }
      footer={
        <>
          <ModalCancelButton disabled={save.isPending}>Cancel</ModalCancelButton>
          <SubmitButton
            form="edit-repository-form"
            isSubmitting={save.isPending}
            label="Save changes"
            busyLabel="Saving…"
            icon={Pencil}
            disabled={!href || !form.value.name.trim()}
          />
        </>
      }
    >
      <form id="edit-repository-form" className="space-y-4" onSubmit={handleSubmit}>
        <RepositoryFormFields
          idPrefix="edit-repository"
          value={form.value}
          onChange={form.patch}
          repositoryType={repositoryType}
          autopublishSupport={autopublishSupport}
          disabled={save.isPending}
        />
        {repositoryType === "rpm" ? (
          <OsvConfigFields
            idPrefix="edit-repository"
            rows={osvConfig}
            onChange={setOsvConfig}
            disabled={save.isPending}
          />
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-repository-retain-versions">Retain repository versions</Label>
            <Input
              id="edit-repository-retain-versions"
              type="number"
              min={1}
              value={retainVersions}
              onChange={(event) => setRetainVersions(event.target.value)}
              placeholder="All versions"
            />
            <p className="text-meta text-zinc-400 dark:text-zinc-500">
              Leave blank to retain every version. Otherwise keep the newest N versions.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-repository-retain-checkpoints">Retain checkpoints</Label>
            <Input
              id="edit-repository-retain-checkpoints"
              type="number"
              min={1}
              value={retainCheckpoints}
              onChange={(event) => setRetainCheckpoints(event.target.value)}
              placeholder="All checkpoints"
            />
            <p className="text-meta text-zinc-400 dark:text-zinc-500">
              Leave blank to retain every checkpoint publication.
            </p>
          </div>
        </div>
        {error ? <FormError>{error}</FormError> : null}
      </form>
    </Modal>
  );
}
