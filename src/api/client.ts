import { getConfig } from "@/lib/config";
import { getCookie } from "@/lib/utils";

const DEFAULT_API_PREFIX = "/pulp/api/v3/";

export class ApiError extends Error {
  readonly status: number;
  readonly detail?: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly correlationId?: string | null;
  readonly body?: unknown;

  constructor(
    message: string,
    options: {
      status: number;
      detail?: string;
      fieldErrors?: Record<string, string[]>;
      correlationId?: string | null;
      body?: unknown;
    },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.detail = options.detail;
    this.fieldErrors = options.fieldErrors;
    this.correlationId = options.correlationId;
    this.body = options.body;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

function normalizePath(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    const url = new URL(path);
    path = `${url.pathname}${url.search}`;
  }

  const config = getConfig();
  const apiBase = config.apiBasePath;

  if (path.startsWith(apiBase)) {
    return path;
  }
  if (path.startsWith(DEFAULT_API_PREFIX)) {
    return `${apiBase}${path.slice(DEFAULT_API_PREFIX.length)}`;
  }
  return `${apiBase}${path.replace(/^\/+/, "")}`;
}

/** Parse a Pulp error body into a human-readable detail and per-field errors. */
export function extractErrorPayload(payload: unknown): {
  detail?: string;
  fieldErrors?: Record<string, string[]>;
} {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }

  const record = payload as Record<string, unknown>;
  const fieldErrors: Record<string, string[]> = {};
  let detail: string | undefined;

  for (const [key, value] of Object.entries(record)) {
    if (key === "detail" && typeof value === "string") {
      detail = value;
      continue;
    }
    if (key === "non_field_errors" && Array.isArray(value)) {
      detail = value.map(String).join(" ");
      continue;
    }
    if (Array.isArray(value)) {
      fieldErrors[key] = value.map(String);
    } else if (typeof value === "string") {
      fieldErrors[key] = [value];
    }
  }

  return { detail, fieldErrors };
}

/** Convert a failed fetch response into an ApiError with parsed details. */
export async function toApiError(response: Response): Promise<ApiError> {
  const correlationId = response.headers.get("Correlation-ID");
  const text = await response.text();
  let payload: unknown = text;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      // Plain text or HTML error page.
    }
  }

  const { detail, fieldErrors } = extractErrorPayload(payload);
  const firstFieldError = fieldErrors ? Object.entries(fieldErrors)[0] : undefined;
  const message =
    detail ??
    (firstFieldError ? `${firstFieldError[0]}: ${firstFieldError[1].join(" ")}` : null) ??
    (typeof payload === "string" && payload.trim() ? payload.trim().slice(0, 300) : null) ??
    `${response.status} ${response.statusText}`;

  return new ApiError(message, {
    status: response.status,
    detail,
    fieldErrors,
    correlationId,
    body: payload,
  });
}

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await performRequest(path, options);
  return parseResponse<T>(response);
}

export async function apiRequestWithStatus<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<{ data: T; status: number }> {
  const response = await performRequest(path, options);
  const data = await parseResponse<T>(response);
  return { data, status: response.status };
}

async function performRequest(path: string, options: ApiRequestOptions): Promise<Response> {
  const method = (options.method ?? "GET").toUpperCase();
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");

  // Tangerine is session-only. Browsers can cache HTTP Basic credentials for
  // the origin after an API challenge, and cached Basic auth silently
  // re-authenticates every request so logout cannot stick. An explicit
  // non-Basic Authorization header suppresses that browser cache while still
  // allowing the session cookie to authenticate. Login overrides this header
  // with Basic auth, and callers that set their own Authorization header win.
  if (!headers.has("Authorization")) {
    headers.set("Authorization", "TangerineSession");
  }

  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    if (
      typeof options.body === "string" ||
      options.body instanceof FormData ||
      options.body instanceof Blob ||
      options.body instanceof ArrayBuffer
    ) {
      body = options.body;
    } else {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(options.body);
    }
  }

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrfToken = getCookie("csrftoken");
    if (csrfToken) {
      headers.set("X-CSRFToken", csrfToken);
    }
  }

  const response = await fetch(normalizePath(path), {
    ...options,
    method,
    headers,
    body,
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  return response;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return (await response.text()) as T;
  }

  return (await response.json()) as T;
}

export function apiUrl(path: string): string {
  return normalizePath(path);
}
