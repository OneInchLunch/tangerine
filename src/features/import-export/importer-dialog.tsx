import type { PulpImporter } from "@/api/types";
import { FormError } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { formatApiError } from "@/lib/errors";
import { queryKeys } from "@/lib/query-keys";
import { isDirtyValue } from "@/lib/use-form-state";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useScopedSession } from "@/hooks/use-scoped-session";
import { Plus, Save } from "lucide-react";
import { useState, type FormEvent } from "react";
import { createPulpImporter, PULP_IMPORTERS, updatePulpImporter } from "./import-export-api";

export function PulpImporterDialog({
  importer,
  onClose,
}: {
  importer?: PulpImporter;
  onClose: () => void;
}) {
  const { csrfToken: scopeToken } = useScopedSession();
  const [name, setName] = useState(importer?.name ?? "");
  const [mapping, setMapping] = useState(
    importer?.repo_mapping ? JSON.stringify(importer.repo_mapping, null, 2) : "",
  );
  const [error, setError] = useState<string | null>(null);

  const dirty = isDirtyValue(
    { name, mapping },
    {
      name: importer?.name ?? "",
      mapping: importer?.repo_mapping ? JSON.stringify(importer.repo_mapping, null, 2) : "",
    },
  );

  const save = useApiMutation<
    unknown,
    { name: string; repo_mapping: Record<string, string> | undefined }
  >({
    mutationFn: (body) =>
      importer?.pulp_href
        ? updatePulpImporter(importer.pulp_href, body, scopeToken)
        : createPulpImporter(body, scopeToken),
    invalidation: [queryKeys.apiList.endpoint(PULP_IMPORTERS)],
    successMessage: "Importer saved",
    errorMode: "inline",
    onSuccess: onClose,
    onError: (caught) => setError(formatApiError(caught, "The importer could not be saved.")),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    let repoMapping: Record<string, string> | undefined;
    if (mapping.trim()) {
      try {
        repoMapping = JSON.parse(mapping) as Record<string, string>;
        if (!repoMapping || Array.isArray(repoMapping) || typeof repoMapping !== "object") {
          throw new Error("Repository mapping must be a JSON object.");
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Invalid repository mapping JSON.");
        return;
      }
    }
    save.mutate({ name: name.trim(), repo_mapping: repoMapping });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={importer ? `Edit ${importer.name}` : "Create Pulp importer"}
      description="Importers read Pulp export files from a server-side path."
      className="max-w-2xl"
      busy={save.isPending}
      dirty={dirty}
      footer={
        <>
          <ModalCancelButton disabled={save.isPending}>Cancel</ModalCancelButton>
          <SubmitButton
            form="pulp-importer-form"
            isSubmitting={save.isPending}
            label={importer ? "Save changes" : "Create importer"}
            busyLabel="Saving…"
            icon={importer ? Save : Plus}
            disabled={!name.trim()}
          />
        </>
      }
    >
      <form id="pulp-importer-form" className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-1.5">
          <Label htmlFor="pulp-importer-name">Name</Label>
          <Input
            id="pulp-importer-name"
            required
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pulp-importer-mapping">Repository mapping (JSON)</Label>
          <Textarea
            id="pulp-importer-mapping"
            rows={5}
            value={mapping}
            onChange={(event) => setMapping(event.target.value)}
            className="font-mono text-xs"
            placeholder='{"exported-repo": "existing-repo"}'
          />
          <p className="text-meta text-zinc-400 dark:text-zinc-500">
            Optional map of repository names in the export file to repository names in Pulp.
          </p>
        </div>
        {error ? <FormError>{error}</FormError> : null}
      </form>
    </Modal>
  );
}
