import { ApiError, apiRequest, type ApiRequestOptions } from "./client";
import type {
  AsyncOperationResponse,
  QueryParams,
  GenericRemote,
  Paginated,
  Repository,
  Status,
  Task,
  User,
  Worker,
} from "./types";
import { isTerminalTask } from "@/lib/task-state";

function buildQuery(params?: QueryParams): string {
  if (!params) {
    return "";
  }
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

/**
 * `GET /login/` returns only `prn`, `pulp_href`, and `username`. The full
 * record (email, `is_staff`, …) lives at the user href, but Pulp lets only
 * staff read it: a non-admin request returns 403. Fall back to the partial
 * record so the session still works; the missing flags simply read as
 * "not an administrator".
 */
async function expandSessionUser(
  sessionUser: Partial<User> & Pick<User, "username">,
): Promise<User> {
  if (sessionUser.pulp_href) {
    try {
      return await apiRequest<User>(sessionUser.pulp_href);
    } catch (error) {
      if (!(error instanceof ApiError) || (error.status !== 403 && error.status !== 404)) {
        throw error;
      }
    }
  }
  return {
    ...sessionUser,
    is_staff: sessionUser.is_staff ?? false,
    is_active: sessionUser.is_active ?? true,
  };
}

function encodeBasicCredentials(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function listResource<T>(
  resource: string,
  params?: QueryParams,
  options: ApiRequestOptions = {},
): Promise<Paginated<T>> {
  const absolute = resource.startsWith("/") || /^https?:\/\//i.test(resource);
  const normalized = absolute
    ? resource.replace(/\/+$/, "")
    : resource.replace(/^\/+/, "").replace(/\/+$/, "");
  return apiRequest<Paginated<T>>(`${normalized}/${buildQuery(params)}`, options);
}

/**
 * Fetch every page of a paginated endpoint. Use this for small summary lookups
 * where a fixed upper limit would silently hide records on large installations.
 */
export async function listAllResource<T>(
  resource: string,
  params?: QueryParams,
  options: ApiRequestOptions = {},
): Promise<Paginated<T>> {
  const first = await listResource<T>(resource, params, options);
  const results = [...first.results];
  const seen = new Set<string>();
  let next = first.next;

  while (next) {
    if (seen.has(next)) {
      throw new Error(`Pagination for ${resource} returned a repeated next link.`);
    }
    seen.add(next);
    const page = await apiRequest<Paginated<T>>(next, options);
    results.push(...page.results);
    next = page.next;
  }

  return {
    count: first.count,
    next: null,
    previous: null,
    results,
  };
}

/** Narrow a write response to Pulp's asynchronous task envelope. */
export function isTaskResponse(value: unknown): value is AsyncOperationResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "task" in value &&
    typeof (value as { task?: unknown }).task === "string"
  );
}

/**
 * Perform a write and, when Pulp answers with `202 { task }`, wait for the task
 * before callers refresh their queries.
 */
export async function mutateAndWait<T>(
  path: string,
  options: ApiRequestOptions,
): Promise<T | AsyncOperationResponse> {
  const response = await apiRequest<T | AsyncOperationResponse>(path, options);
  if (isTaskResponse(response)) {
    await waitForTask(response.task);
  }
  return response;
}

/**
 * Cancel a running or waiting Pulp task. Pulp accepts this through a PATCH on
 * the task detail endpoint even though the generated schema omits the action.
 */
export function cancelTask(taskHref: string): Promise<Task> {
  return apiRequest<Task>(taskHref, {
    method: "PATCH",
    body: { state: "canceled" },
  });
}

export async function deleteAndWait(path: string): Promise<AsyncOperationResponse | undefined> {
  const response = await apiRequest<AsyncOperationResponse | undefined>(path, {
    method: "DELETE",
  });
  if (isTaskResponse(response)) {
    await waitForTask(response.task);
  }
  return response;
}

export function apiRoot(options: ApiRequestOptions = {}): Promise<Record<string, string>> {
  return apiRequest<Record<string, string>>("", options);
}

export function openApiSchema(options: ApiRequestOptions = {}): Promise<unknown> {
  return apiRequest<unknown>("docs/api.json", options);
}

export const pulpApi = {
  status(options: ApiRequestOptions = {}): Promise<Status> {
    return apiRequest<Status>("status/", options);
  },

  root: apiRoot,
  openApiSchema,

  async currentUser(): Promise<User | null> {
    try {
      const sessionUser = await apiRequest<Partial<User> & Pick<User, "username">>("login/");
      return await expandSessionUser(sessionUser);
    } catch (error) {
      if (error instanceof ApiError && error.isUnauthorized) {
        return null;
      }
      throw error;
    }
  },

  async login(username: string, password: string): Promise<User> {
    await apiRequest<User>("login/", {
      method: "POST",
      headers: {
        Authorization: `Basic ${encodeBasicCredentials(username, password)}`,
      },
      body: {},
    });
    const user = await pulpApi.currentUser();
    if (!user) {
      throw new ApiError("The session could not be established.", {
        status: 401,
        detail: "The session could not be established.",
      });
    }
    return user;
  },

  logout(): Promise<void> {
    return apiRequest<void>("login/", { method: "DELETE" });
  },

  tasks(params?: QueryParams, options: ApiRequestOptions = {}): Promise<Paginated<Task>> {
    return apiRequest<Paginated<Task>>(
      `tasks/${buildQuery({ ordering: "-pulp_created", ...params })}`,
      options,
    );
  },

  task(id: string, options: ApiRequestOptions = {}): Promise<Task> {
    return apiRequest<Task>(`tasks/${id}/`, options);
  },

  repositories(
    params?: QueryParams,
    options: ApiRequestOptions = {},
  ): Promise<Paginated<Repository>> {
    return apiRequest<Paginated<Repository>>(
      `repositories/${buildQuery({ ordering: "-pulp_last_updated", ...params })}`,
      options,
    );
  },

  remotes(
    params?: QueryParams,
    options: ApiRequestOptions = {},
  ): Promise<Paginated<GenericRemote>> {
    return apiRequest<Paginated<GenericRemote>>(
      `remotes/${buildQuery({ ordering: "-pulp_last_updated", ...params })}`,
      options,
    );
  },

  workers(params?: QueryParams, options: ApiRequestOptions = {}): Promise<Paginated<Worker>> {
    return apiRequest<Paginated<Worker>>(`workers/${buildQuery(params)}`, options);
  },

  async count(resource: string, options: ApiRequestOptions = {}): Promise<number> {
    const response = await apiRequest<Paginated<unknown>>(
      `${resource}/${buildQuery({ limit: 1, offset: 0 })}`,
      options,
    );
    return response.count;
  },
};

export function repositoryTypeFromHref(href?: string | null): string {
  if (!href) {
    return "unknown";
  }
  return href.match(/\/repositories\/([^/]+)\//)?.[1] ?? "unknown";
}

export function remoteTypeFromHref(href?: string | null): string {
  if (!href) {
    return "unknown";
  }
  const match = href.match(/\/remotes\/([^/]+)\/([^/]+)\//);
  return match ? `${match[1]}.${match[2]}` : "unknown";
}

export function repositoryVersionNumber(href?: string | null): string {
  if (!href) {
    return "0";
  }
  return href.match(/\/versions\/(\d+)\/$/)?.[1] ?? "—";
}

export function resourceIdFromHref(href?: string | null): string {
  if (!href) {
    return "";
  }
  const parts = href.replace(/\/$/, "").split("/");
  return parts.at(-1) ?? "";
}

/**
 * Wait for an asynchronous Pulp operation to finish before refreshing lists.
 *
 * Delete and other write endpoints may return 202 with a task href. Refetching
 * immediately can race the task and cache the resource that is still being
 * removed.
 */
export async function waitForTask(
  taskHref: string,
  options: {
    timeoutMs?: number;
    intervalMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<Task> {
  const taskId = resourceIdFromHref(taskHref);
  const timeoutMs = options.timeoutMs ?? 120_000;
  const intervalMs = options.intervalMs ?? 1_000;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    options.signal?.throwIfAborted();
    const task = await pulpApi.task(taskId, { signal: options.signal });
    if (isTerminalTask(task.state)) {
      if (task.state === "failed" || task.state === "canceled") {
        throw new Error(`Task ${task.state}: ${JSON.stringify(task.error ?? "no error details")}`);
      }
      return task;
    }
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for the Pulp task to finish.");
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    options.signal?.throwIfAborted();
  }
}
