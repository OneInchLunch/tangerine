export interface DescriptorOption {
  value: string;
  label: string;
}

export type FieldDescriptor =
  | {
      key: string;
      label: string;
      type: "text";
      placeholder?: string;
      help?: string;
      required?: boolean;
    }
  | {
      key: string;
      label: string;
      type: "number";
      placeholder?: string;
      help?: string;
      min?: number;
      max?: number;
    }
  | {
      key: string;
      label: string;
      type: "boolean";
      help?: string;
    }
  | {
      key: string;
      label: string;
      type: "select";
      options: DescriptorOption[];
      help?: string;
      emptyLabel?: string;
    }
  | {
      key: string;
      label: string;
      type: "json";
      placeholder?: string;
      help?: string;
    }
  | {
      key: string;
      label: string;
      type: "signing-service";
      help?: string;
    }
  | {
      key: string;
      label: string;
      type: "string-list";
      placeholder?: string;
      help?: string;
    };

export type DescriptorValue = string | boolean;
export type DescriptorValues = Record<string, DescriptorValue>;

export class FieldValueError extends Error {
  readonly fieldKey: string;

  constructor(fieldKey: string, message: string) {
    super(message);
    this.name = "FieldValueError";
    this.fieldKey = fieldKey;
  }
}

/** Values shown in the form, seeded from an existing resource or defaults. */
export function initialDescriptorValues(
  fields: readonly FieldDescriptor[],
  source?: Record<string, unknown>,
): DescriptorValues {
  const values: DescriptorValues = {};
  for (const field of fields) {
    const raw = source?.[field.key];
    if (field.type === "boolean") {
      values[field.key] = raw === true;
      continue;
    }
    if (raw === undefined || raw === null) {
      values[field.key] = "";
      continue;
    }
    if (Array.isArray(raw)) {
      values[field.key] = raw.map((item) => String(item)).join(", ");
    } else if (typeof raw === "object") {
      values[field.key] = JSON.stringify(raw, null, 2);
    } else {
      values[field.key] = String(raw);
    }
  }
  return values;
}

/**
 * Convert raw form values into a Pulp request body. Empty optional values are
 * omitted so Pulp defaults stay in effect. On edit, pass `clearKeys` for fields
 * the user emptied so the PATCH sends an explicit `null` instead of leaving the
 * previous value in place.
 */
export function buildDescriptorBody(
  fields: readonly FieldDescriptor[],
  values: DescriptorValues,
  options: { clearKeys?: Iterable<string> } = {},
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const clearKeys = new Set(options.clearKeys ?? []);

  for (const field of fields) {
    const raw = values[field.key];

    if (field.type === "boolean") {
      body[field.key] = raw === true;
      continue;
    }

    const text = typeof raw === "string" ? raw.trim() : "";
    if (!text) {
      if (clearKeys.has(field.key)) {
        body[field.key] = null;
      }
      continue;
    }

    switch (field.type) {
      case "number": {
        const parsed = Number(text);
        if (!Number.isFinite(parsed)) {
          throw new FieldValueError(field.key, `${field.label} must be a number.`);
        }
        body[field.key] = parsed;
        break;
      }
      case "json": {
        try {
          body[field.key] = JSON.parse(text);
        } catch {
          throw new FieldValueError(field.key, `${field.label} must be valid JSON.`);
        }
        break;
      }
      case "string-list": {
        body[field.key] = text
          .split(/[\n,]/)
          .map((item) => item.trim())
          .filter(Boolean);
        break;
      }
      case "text":
      case "select":
      case "signing-service":
        body[field.key] = text;
        break;
    }
  }

  return body;
}
