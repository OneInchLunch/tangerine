import { resolveSchema, type JsonSchema, type OpenApiDocument } from "@/lib/openapi-schema";

export type MultipartFieldKind = "file" | "boolean" | "text" | "json";

export interface MultipartFieldDescriptor {
  name: string;
  label: string;
  kind: MultipartFieldKind;
  required: boolean;
  description?: string;
  defaultValue?: unknown;
}

const SKIP_FIELDS = new Set(["pulp_href", "prn", "pulp_created", "pulp_last_updated"]);

function fieldKind(schema: JsonSchema): MultipartFieldKind {
  if (schema.format === "binary") {
    return "file";
  }
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  if (type === "boolean") {
    return "boolean";
  }
  if (type === "object" || type === "array" || (!type && !schema.enum)) {
    return "json";
  }
  return "text";
}

function labelFor(name: string): string {
  return name.replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function multipartFieldsForSchema(
  document: OpenApiDocument,
  schema: JsonSchema | undefined,
): MultipartFieldDescriptor[] {
  const resolved = resolveSchema(document, schema);
  if (!resolved?.properties) {
    return [];
  }
  const required = new Set(resolved.required ?? []);
  return Object.entries(resolved.properties).flatMap(([name, property]) => {
    const field = resolveSchema(document, property);
    if (!field || SKIP_FIELDS.has(name)) {
      return [];
    }
    return [
      {
        name,
        label: labelFor(name),
        kind: fieldKind(field),
        required: required.has(name),
        description:
          typeof field.description === "string" ? field.description.split("\n")[0] : undefined,
        defaultValue: field.default,
      },
    ];
  });
}

export function multipartContentForOperation(
  document: OpenApiDocument,
  operation: { requestBody?: { content?: Record<string, { schema?: JsonSchema }> } },
): { fields: MultipartFieldDescriptor[]; hasBinary: boolean } | null {
  const content = operation.requestBody?.content;
  const multipart = content?.["multipart/form-data"];
  if (!multipart) {
    return null;
  }
  const fields = multipartFieldsForSchema(document, multipart.schema);
  return {
    fields,
    hasBinary: fields.some((field) => field.kind === "file"),
  };
}

export function buildMultipartForm(
  fields: readonly MultipartFieldDescriptor[],
  values: Record<string, string | boolean>,
  files: Record<string, File | null>,
): FormData {
  const form = new FormData();

  for (const field of fields) {
    if (field.kind === "file") {
      const file = files[field.name];
      if (file) {
        form.append(field.name, file);
      } else if (field.required) {
        throw new Error(`${field.label} is required.`);
      }
      continue;
    }

    if (field.kind === "boolean") {
      form.append(field.name, values[field.name] === true ? "true" : "false");
      continue;
    }

    const text = typeof values[field.name] === "string" ? String(values[field.name]).trim() : "";
    if (!text) {
      if (field.required) {
        throw new Error(`${field.label} is required.`);
      }
      continue;
    }

    if (field.kind === "json") {
      try {
        form.append(field.name, JSON.stringify(JSON.parse(text)));
      } catch {
        throw new Error(`${field.label} must be valid JSON.`);
      }
    } else {
      form.append(field.name, text);
    }
  }

  return form;
}
