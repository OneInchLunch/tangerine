export interface JsonSchema {
  $ref?: string;
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  default?: unknown;
  allOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  format?: string;
  nullable?: boolean;
  [key: string]: unknown;
}

export interface OpenApiDocument {
  openapi: string;
  info?: { title?: string; version?: string; description?: string };
  paths: Record<string, unknown>;
  components?: { schemas?: Record<string, JsonSchema> };
}

export function resolveSchema(
  document: OpenApiDocument,
  schema: JsonSchema | undefined,
  seen = new Set<string>(),
): JsonSchema | undefined {
  if (!schema) {
    return undefined;
  }
  if (schema.$ref) {
    if (seen.has(schema.$ref)) {
      return undefined;
    }
    const name = schema.$ref.replace(/^#\/components\/schemas\//, "");
    const resolved = document.components?.schemas?.[name];
    if (resolved) {
      return resolveSchema(document, resolved, new Set([...seen, schema.$ref]));
    }
    return undefined;
  }
  return schema;
}

export function exampleFromSchema(
  document: OpenApiDocument,
  schema: JsonSchema | undefined,
  depth = 0,
): unknown {
  if (!schema || depth > 6) {
    return null;
  }

  const resolved = resolveSchema(document, schema);
  if (!resolved) {
    return null;
  }

  if (resolved.default !== undefined) {
    return resolved.default;
  }
  if (resolved.enum?.length) {
    return resolved.enum[0];
  }
  if (resolved.allOf?.length) {
    const parts = resolved.allOf.map((part) => exampleFromSchema(document, part, depth + 1));
    const objects = parts.filter(
      (part): part is Record<string, unknown> =>
        typeof part === "object" && part !== null && !Array.isArray(part),
    );
    if (objects.length === parts.length) {
      return Object.assign({}, ...objects);
    }
    return parts.find((part) => part !== null) ?? null;
  }
  if (resolved.oneOf?.length) {
    return exampleFromSchema(document, resolved.oneOf[0], depth + 1);
  }
  if (resolved.anyOf?.length) {
    return exampleFromSchema(document, resolved.anyOf[0], depth + 1);
  }

  const type = Array.isArray(resolved.type) ? resolved.type[0] : resolved.type;

  switch (type) {
    case "object": {
      const properties = resolved.properties ?? {};
      const required = new Set(resolved.required ?? []);
      const result: Record<string, unknown> = {};
      for (const [key, property] of Object.entries(properties)) {
        if (required.has(key) || Object.keys(properties).length <= 6) {
          result[key] = exampleFromSchema(document, property, depth + 1);
        }
      }
      return result;
    }
    case "array":
      return [];
    case "integer":
    case "number":
      return 0;
    case "boolean":
      return false;
    case "null":
      return null;
    default:
      if (resolved.format === "date-time") {
        return "2024-01-01T00:00:00Z";
      }
      if (resolved.format === "email") {
        return "user@example.com";
      }
      if (resolved.format === "uri") {
        return "https://example.com";
      }
      if (resolved.format === "uuid") {
        return "00000000-0000-0000-0000-000000000000";
      }
      return "";
  }
}
