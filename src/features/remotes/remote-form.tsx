import type { RemoteDetail } from "@/api/types";
import { FormError } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { allRemoteFields, type RemoteField, type RemoteTypeDefinition } from "./remote-types";
import { useState, type FormEvent } from "react";

type FormValue = string | boolean;
type FormValues = Record<string, FormValue>;

interface RemoteFormProps {
  type: RemoteTypeDefinition;
  remote?: RemoteDetail;
  isEdit?: boolean;
  isSubmitting: boolean;
  error: string | null;
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}

function serializeKeyValue(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }
  return Object.entries(value as Record<string, unknown>)
    .map(([key, entry]) => `${key}=${entry ?? ""}`)
    .join("\n");
}

function serializeList(value: unknown): string {
  return Array.isArray(value) ? value.map((entry) => String(entry)).join("\n") : "";
}

function serializeJson(value: unknown): string {
  return value === null || value === undefined ? "" : JSON.stringify(value, null, 2);
}

function initialValue(field: RemoteField, remote: RemoteDetail | undefined): FormValue {
  const raw = remote?.[field.key];

  if (field.kind === "boolean") {
    return typeof raw === "boolean" ? raw : Boolean(field.defaultValue ?? false);
  }
  if (field.kind === "keyValue") {
    return serializeKeyValue(raw);
  }
  if (field.kind === "stringList") {
    return serializeList(raw);
  }
  if (field.kind === "json") {
    return serializeJson(raw);
  }
  if (raw !== null && raw !== undefined) {
    return String(raw);
  }
  return field.defaultValue !== undefined ? String(field.defaultValue) : "";
}

function initialValues(type: RemoteTypeDefinition, remote?: RemoteDetail): FormValues {
  const values: FormValues = {};
  for (const field of allRemoteFields(type)) {
    values[field.key] = initialValue(field, remote);
  }
  return values;
}

function parseKeyValue(label: string, value: string): Record<string, string | null> {
  const output: Record<string, string | null> = {};
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      throw new Error(`${label}: use one key=value pair per line.`);
    }
    const key = trimmed.slice(0, separator).trim();
    const entry = trimmed.slice(separator + 1).trim();
    output[key] = entry === "" ? null : entry;
  }
  return output;
}

function parseList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseJsonField(label: string, value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error(`${label}: enter valid JSON.`);
  }
}

function buildBody(
  type: RemoteTypeDefinition,
  values: FormValues,
  dirty: Set<string>,
  isEdit: boolean,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  for (const field of allRemoteFields(type)) {
    // Create sends every field so UI defaults are not silently replaced by
    // server defaults. Edit only sends changed fields, which preserves
    // write-only values that Pulp does not return.
    if (isEdit && !dirty.has(field.key)) {
      continue;
    }

    const value = values[field.key];

    if (field.kind === "boolean") {
      body[field.key] = Boolean(value);
      continue;
    }

    const text = String(value ?? "");

    if (field.kind === "number") {
      if (text.trim() === "") {
        body[field.key] = null;
        continue;
      }
      const parsed = Number(text);
      if (!Number.isFinite(parsed)) {
        throw new Error(`${field.label}: enter a valid number.`);
      }
      body[field.key] = parsed;
      continue;
    }
    if (field.kind === "stringList") {
      body[field.key] = parseList(text);
      continue;
    }
    if (field.kind === "keyValue") {
      body[field.key] = parseKeyValue(field.label, text);
      continue;
    }
    if (field.kind === "json") {
      body[field.key] = parseJsonField(field.label, text);
      continue;
    }

    if (field.secret && text === "") {
      continue;
    }

    body[field.key] = text.trim() === "" && !field.required ? null : text;
  }

  return body;
}

function isWideField(field: RemoteField): boolean {
  return (
    field.kind === "textarea" ||
    field.kind === "stringList" ||
    field.kind === "keyValue" ||
    field.kind === "json"
  );
}

function fieldControlClass(field: RemoteField): string {
  return field.mono ? "font-mono text-xs" : "";
}

function RemoteFormField({
  field,
  value,
  isEdit,
  isSet,
  onChange,
}: {
  field: RemoteField;
  value: FormValue;
  isEdit: boolean;
  isSet: boolean;
  onChange: (value: FormValue) => void;
}) {
  const controlClass = fieldControlClass(field);
  const id = `remote-field-${field.key}`;
  const writeOnlyNote = field.writeOnly && isEdit;
  const required = field.required && !(isEdit && field.writeOnly);

  if (field.kind === "boolean") {
    return (
      <label
        htmlFor={id}
        className="flex items-start gap-2.5 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
      >
        <input
          id={id}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          aria-label={field.label}
          className="mt-0.5 size-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500"
        />
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-xs font-medium text-zinc-800 dark:text-zinc-200">
            {field.label}
            {writeOnlyNote ? (
              <Badge tone={isSet ? "success" : "neutral"}>{isSet ? "Set" : "Not set"}</Badge>
            ) : null}
          </span>
          {field.description ? (
            <span className="mt-0.5 block text-meta text-zinc-500 dark:text-zinc-400">
              {field.description}
            </span>
          ) : null}
        </span>
      </label>
    );
  }

  return (
    <div className={isWideField(field) ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>
          {field.label}
          {required ? <span className="ml-1 text-red-500">*</span> : null}
        </Label>
        {writeOnlyNote ? (
          <Badge tone={isSet ? "success" : "neutral"}>{isSet ? "Set" : "Not set"}</Badge>
        ) : null}
      </div>

      {field.kind === "select" ? (
        <Select
          id={id}
          value={String(value)}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          aria-label={field.label}
        >
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      ) : field.kind === "textarea" ||
        field.kind === "stringList" ||
        field.kind === "keyValue" ||
        field.kind === "json" ? (
        <Textarea
          id={id}
          value={String(value)}
          onChange={(event) => onChange(event.target.value)}
          rows={field.rows ?? 4}
          required={required}
          aria-label={field.label}
          placeholder={field.placeholder}
          spellCheck={false}
          className={cn(controlClass)}
        />
      ) : (
        <Input
          id={id}
          type={
            field.kind === "password" ? "password" : field.kind === "number" ? "number" : "text"
          }
          value={String(value)}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          min={field.min}
          step={field.step}
          placeholder={
            field.writeOnly && isEdit && isSet
              ? "Leave blank to keep the current value"
              : field.placeholder
          }
          autoComplete={field.kind === "password" ? "new-password" : "off"}
          aria-label={field.label}
          className={controlClass}
        />
      )}

      {field.description ? (
        <p className="text-meta text-zinc-400 dark:text-zinc-500">{field.description}</p>
      ) : null}
    </div>
  );
}

export function RemoteForm({
  type,
  remote,
  isEdit = false,
  isSubmitting,
  error,
  onSubmit,
  onCancel,
}: RemoteFormProps) {
  const [values, setValues] = useState<FormValues>(() => initialValues(type, remote));
  const [dirty, setDirty] = useState<Set<string>>(() => new Set());
  const [formError, setFormError] = useState<string | null>(null);
  const hiddenFields = new Set(
    (remote?.hidden_fields ?? []).filter((field) => field.is_set).map((field) => field.name),
  );

  function updateField(field: RemoteField, value: FormValue) {
    setValues((current) => ({ ...current, [field.key]: value }));
    setDirty((current) => {
      const next = new Set(current);
      next.add(field.key);
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    try {
      const body = buildBody(type, values, dirty, isEdit);
      await onSubmit(body);
    } catch (caught) {
      setFormError(errorMessage(caught, "Unable to submit the remote."));
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {type.groups.map((group) => (
        <Card key={group.id}>
          <CardHeader>
            <CardTitle>{group.title}</CardTitle>
            {group.description ? <CardDescription>{group.description}</CardDescription> : null}
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {group.fields.map((field) => (
              <RemoteFormField
                key={field.key}
                field={field}
                value={values[field.key] ?? ""}
                isEdit={isEdit}
                isSet={hiddenFields.has(field.key)}
                onChange={(value) => updateField(field, value)}
              />
            ))}
          </CardContent>
        </Card>
      ))}

      {error || formError ? <FormError>{error ?? formError}</FormError> : null}

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Spinner /> : null}
          {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Create remote"}
        </Button>
      </div>
    </form>
  );
}
