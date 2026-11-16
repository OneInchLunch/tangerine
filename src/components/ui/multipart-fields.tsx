import { CheckboxField } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { MultipartFieldDescriptor } from "@/lib/multipart";

export function MultipartFields({
  idPrefix,
  fields,
  values,
  files,
  onChange,
  onFileChange,
  disabled = false,
}: {
  idPrefix: string;
  fields: readonly MultipartFieldDescriptor[];
  values: Record<string, string | boolean>;
  files: Record<string, File | null>;
  onChange: (name: string, value: string | boolean) => void;
  onFileChange: (name: string, file: File | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-3">
      {fields.map((field) => {
        const id = `${idPrefix}-${field.name}`;
        if (field.kind === "boolean") {
          return (
            <CheckboxField
              key={field.name}
              id={id}
              checked={values[field.name] === true}
              onChange={(checked) => onChange(field.name, checked)}
              label={field.label}
              description={field.description}
              disabled={disabled}
            />
          );
        }
        if (field.kind === "file") {
          return (
            <div key={field.name} className="space-y-1.5">
              <Label htmlFor={id}>
                {field.label}
                {field.required ? " *" : ""}
              </Label>
              <Input
                id={id}
                type="file"
                required={field.required}
                disabled={disabled}
                onChange={(event) => onFileChange(field.name, event.target.files?.[0] ?? null)}
              />
              {files[field.name] ? (
                <p className="text-meta text-zinc-500 dark:text-zinc-400">
                  Selected: {files[field.name]?.name}
                </p>
              ) : null}
              {field.description ? (
                <p className="text-meta text-zinc-400 dark:text-zinc-500">{field.description}</p>
              ) : null}
            </div>
          );
        }
        if (field.kind === "json") {
          return (
            <div key={field.name} className="space-y-1.5">
              <Label htmlFor={id}>
                {field.label}
                {field.required ? " *" : ""}
              </Label>
              <Textarea
                id={id}
                rows={3}
                value={String(values[field.name] ?? "")}
                onChange={(event) => onChange(field.name, event.target.value)}
                className="font-mono text-xs"
                placeholder="{}"
                required={field.required}
                disabled={disabled}
              />
              {field.description ? (
                <p className="text-meta text-zinc-400 dark:text-zinc-500">{field.description}</p>
              ) : null}
            </div>
          );
        }
        return (
          <div key={field.name} className="space-y-1.5">
            <Label htmlFor={id}>
              {field.label}
              {field.required ? " *" : ""}
            </Label>
            <Input
              id={id}
              value={String(values[field.name] ?? "")}
              required={field.required}
              disabled={disabled}
              onChange={(event) => onChange(field.name, event.target.value)}
            />
            {field.description ? (
              <p className="text-meta text-zinc-400 dark:text-zinc-500">{field.description}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
