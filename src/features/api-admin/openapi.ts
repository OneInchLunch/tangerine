import {
  exampleFromSchema,
  resolveSchema,
  type JsonSchema,
  type OpenApiDocument,
} from "@/lib/openapi-schema";

export type {
  JsonSchema,
  OpenApiDocument,
} from "@/lib/openapi-schema";
export { exampleFromSchema, resolveSchema };

export const HTTP_METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
  "trace",
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface OpenApiParameter {
  name?: string;
  in?: "query" | "header" | "path" | "cookie" | string;
  required?: boolean;
  description?: string;
  schema?: JsonSchema;
}

export interface OpenApiRequestBody {
  required?: boolean;
  content?: Record<string, { schema?: JsonSchema }>;
}

export interface OpenApiOperation {
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
  deprecated?: boolean;
}

export interface OpenApiPathItem {
  parameters?: OpenApiParameter[];
  get?: OpenApiOperation;
  post?: OpenApiOperation;
  put?: OpenApiOperation;
  patch?: OpenApiOperation;
  delete?: OpenApiOperation;
  head?: OpenApiOperation;
  options?: OpenApiOperation;
  trace?: OpenApiOperation;
}

export interface Endpoint {
  method: HttpMethod;
  path: string;
  operation: OpenApiOperation;
  parameters: OpenApiParameter[];
}

export function flattenEndpoints(document: OpenApiDocument): Endpoint[] {
  const endpoints: Endpoint[] = [];
  const paths = document.paths as Record<string, OpenApiPathItem>;

  for (const [path, pathItem] of Object.entries(paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) {
        continue;
      }
      endpoints.push({
        method,
        path,
        operation,
        parameters: [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])],
      });
    }
  }

  return endpoints.sort((a, b) => {
    if (a.path === b.path) {
      return HTTP_METHODS.indexOf(a.method) - HTTP_METHODS.indexOf(b.method);
    }
    return a.path.localeCompare(b.path);
  });
}

export function pathParameterNames(path: string): string[] {
  return Array.from(path.matchAll(/\{([^}]+)\}/g), (match) => match[1]);
}

export function requestBodyExample(document: OpenApiDocument, operation: OpenApiOperation): string {
  const content = operation.requestBody?.content;
  if (!content) {
    return "";
  }
  const schema =
    content["application/json"]?.schema ??
    content["application/x-www-form-urlencoded"]?.schema ??
    Object.values(content)[0]?.schema;
  const example = exampleFromSchema(document, schema);
  if (example === null || example === undefined) {
    return "";
  }
  return JSON.stringify(example, null, 2);
}
