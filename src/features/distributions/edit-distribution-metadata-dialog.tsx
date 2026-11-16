import type { DistributionDetail } from "@/api/types";
import { FormError } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DescriptorFields } from "@/components/ui/descriptor-fields";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";
import { DistributionMetadataFields } from "./distribution-metadata-fields";
import { distributionFieldsForHref } from "@/lib/distributions";
import {
  buildDescriptorBody,
  initialDescriptorValues,
  type DescriptorValues,
  FieldValueError,
} from "@/lib/field-descriptors";
import { Save } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { isDirtyValue } from "@/lib/use-form-state";
import { dialogCopy, sourceSummary, useDistributionSave } from "./edit-distribution-shared";

export function EditDistributionMetadataDialog({
  distribution,
  onSwitchMode,
  onClose,
}: {
  distribution: DistributionDetail;
  onSwitchMode: () => void;
  onClose: () => void;
}) {
  const href = distribution.pulp_href;
  const copy = dialogCopy(distribution.name, "metadata");
  const { error, isSubmitting, saveChanges } = useDistributionSave(href ?? "", onClose);
  const fields = distributionFieldsForHref(href);
  const [name, setName] = useState(distribution.name);
  const [basePath, setBasePath] = useState(distribution.base_path);
  const [hidden, setHidden] = useState(distribution.hidden);
  const initialAdvancedValues = useMemo(
    () => initialDescriptorValues(fields, distribution),
    [fields, distribution],
  );
  const [advancedValues, setAdvancedValues] = useState<DescriptorValues>(initialAdvancedValues);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const normalizedBasePath = basePath.trim().replace(/^\/+|\/+$/g, "");
  const dirty =
    name !== distribution.name ||
    normalizedBasePath !== distribution.base_path.replace(/^\/+|\/+$/g, "") ||
    hidden !== distribution.hidden ||
    isDirtyValue(advancedValues, initialAdvancedValues);
  const canSubmit =
    Boolean(href) && Boolean(name.trim()) && Boolean(normalizedBasePath) && !isSubmitting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    setFieldError(null);
    try {
      const cleared = fields
        .filter((field) => field.type !== "boolean")
        .filter((field) => {
          const initial = String(initialAdvancedValues[field.key] ?? "").trim();
          const current = String(advancedValues[field.key] ?? "").trim();
          return Boolean(initial) && !current;
        })
        .map((field) => field.key);
      const advanced = buildDescriptorBody(fields, advancedValues, {
        clearKeys: cleared,
      });
      await saveChanges(
        {
          name: name.trim(),
          base_path: normalizedBasePath,
          hidden,
          ...advanced,
        },
        "Unable to update distribution.",
      );
    } catch (caught) {
      setFieldError(
        caught instanceof FieldValueError ? caught.message : "Invalid distribution settings.",
      );
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={copy.title}
      description={copy.description}
      className="max-w-2xl"
      busy={isSubmitting}
      dirty={dirty}
      footer={
        <>
          <ModalCancelButton disabled={isSubmitting}>Cancel</ModalCancelButton>
          <SubmitButton
            form="edit-distribution-metadata-form"
            isSubmitting={isSubmitting}
            label="Save changes"
            busyLabel="Saving…"
            icon={Save}
            disabled={!canSubmit}
          />
        </>
      }
    >
      <form id="edit-distribution-metadata-form" className="space-y-4" onSubmit={handleSubmit}>
        <DistributionMetadataFields
          idPrefix="edit-distribution"
          name={name}
          onNameChange={setName}
          basePath={basePath}
          onBasePathChange={setBasePath}
          hidden={hidden}
          onHiddenChange={setHidden}
        />

        <DescriptorFields
          idPrefix="edit-distribution-advanced"
          fields={fields}
          values={advancedValues}
          onChange={(key, value) => setAdvancedValues((current) => ({ ...current, [key]: value }))}
          disabled={isSubmitting}
        />

        <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">Content source</p>
              <p className="mt-0.5 text-meta text-zinc-500 dark:text-zinc-400">
                {sourceSummary(distribution)}
              </p>
              {(distribution.publication ?? distribution.repository) ? (
                <p className="mt-1 break-all font-mono text-micro text-zinc-400 dark:text-zinc-500">
                  {distribution.publication ?? distribution.repository}
                </p>
              ) : null}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={onSwitchMode}>
              Change
            </Button>
          </div>
        </div>

        {fieldError || error ? <FormError>{fieldError ?? error}</FormError> : null}
      </form>
    </Modal>
  );
}
