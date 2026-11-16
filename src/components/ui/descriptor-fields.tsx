import { CheckboxField } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { DescriptorOption, DescriptorValues, FieldDescriptor } from "@/lib/field-descriptors";

export function DescriptorFields({
  idPrefix,
  fields,
  values,
  onChange,
  disabled = false,
  signingServices = [],
}: {
  idPrefix: string;
  fields: readonly FieldDescriptor[];
  values: DescriptorValues;
  onChange: (key: string, value: string | boolean) => void;
  disabled?: boolean;
  signingServices?: DescriptorOption[];
}) {
  if (!fields.length) {
    return null;
  }

  return (
    <div className="space-y-3">
      {fields.map((field) => {
        const id = `${idPrefix}-${field.key}`;
        const helpId = `${id}-help`;
        const value = values[field.key];

        if (field.type === "boolean") {
          return (
            <CheckboxField
              key={field.key}
              id={id}
              checked={value === true}
              onChange={(checked) => onChange(field.key, checked)}
              label={field.label}
              description={field.help}
              disabled={disabled}
            />
          );
        }

        if (field.type === "signing-service") {
          return (
            <Combobox
              key={field.key}
              id={id}
              label={field.label}
              value={typeof value === "string" ? value : ""}
              onChange={(next) => onChange(field.key, next)}
              options={signingServices}
              placeholder="No signing service"
              emptyLabel="No signing service"
              pinnedLabel="Current signing service"
              disabled={disabled}
              helper={field.help}
              helperId={field.help ? helpId : undefined}
            />
          );
        }

        if (field.type === "select") {
          return (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={id}>{field.label}</Label>
              <Select
                id={id}
                value={typeof value === "string" ? value : ""}
                onChange={(event) => onChange(field.key, event.target.value)}
                disabled={disabled}
                aria-describedby={field.help ? helpId : undefined}
              >
                <option value="">{field.emptyLabel ?? "Default"}</option>
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              {field.help ? (
                <p id={helpId} className="text-meta text-zinc-400 dark:text-zinc-500">
                  {field.help}
                </p>
              ) : null}
            </div>
          );
        }

        if (field.type === "json" || field.type === "string-list") {
          return (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={id}>{field.label}</Label>
              <Textarea
                id={id}
                rows={field.type === "json" ? 4 : 2}
                value={typeof value === "string" ? value : ""}
                onChange={(event) => onChange(field.key, event.target.value)}
                placeholder={field.placeholder}
                disabled={disabled}
                spellCheck={field.type === "string-list"}
                className="font-mono text-xs"
                aria-describedby={field.help ? helpId : undefined}
              />
              {field.help ? (
                <p id={helpId} className="text-meta text-zinc-400 dark:text-zinc-500">
                  {field.help}
                </p>
              ) : null}
            </div>
          );
        }

        return (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={id}>{field.label}</Label>
            <Input
              id={id}
              type={field.type === "number" ? "number" : "text"}
              value={typeof value === "string" ? value : ""}
              onChange={(event) => onChange(field.key, event.target.value)}
              placeholder={field.placeholder}
              disabled={disabled}
              required={field.type === "text" ? field.required : undefined}
              min={field.type === "number" ? field.min : undefined}
              max={field.type === "number" ? field.max : undefined}
              aria-describedby={field.help ? helpId : undefined}
            />
            {field.help ? (
              <p id={helpId} className="text-meta text-zinc-400 dark:text-zinc-500">
                {field.help}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
