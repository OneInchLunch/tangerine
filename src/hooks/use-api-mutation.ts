import { apiRequest } from "@/api/client";
import { deleteAndWait, isTaskResponse, mutateAndWait } from "@/api/resources";
import type { AsyncOperationResponse } from "@/api/types";
import { useAuth } from "@/auth/auth-context";
import { formatApiError } from "@/lib/errors";
import { resolveInvalidations, type Invalidation } from "@/lib/invalidations";
import { toast } from "@/lib/toast-store";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";

/**
 * Scoped repository admins cannot read Pulp tasks, so the gateway waits for the
 * task with its service account and the browser must not poll it.
 */
export function useTaskWaitEnabled(): boolean {
  const { session } = useAuth();
  return session?.capabilities?.tasksRead !== false;
}

/**
 * A success message: a fixed string, a factory over the response and variables,
 * or `false` to stay silent.
 */
export type SuccessMessage<TData, TVars> =
  | string
  | false
  | ((data: TData, vars: TVars) => string | false | undefined);

interface ApiMutationOptions<TData, TVars> {
  /** Perform the write. Throw to surface an error in the caller. */
  mutationFn: (vars: TVars) => Promise<TData>;
  /** Query keys to refresh after the write succeeds. */
  invalidation?: Invalidation<TData, TVars>;
  /** Runs after invalidation, for example to close a dialog. */
  onSuccess?: (data: TData, vars: TVars) => void;
  /** Runs when the write fails, for callers that keep a local error banner. */
  onError?: (error: unknown, vars: TVars) => void;
  /** Toast text after a successful write. Defaults to silence. */
  successMessage?: SuccessMessage<TData, TVars>;
  /** Override the error text; defaults to `formatApiError`. */
  errorMessage?: string | ((error: unknown, vars: TVars) => string);
  /**
   * Where failures are surfaced. `toast` (the default) adds a toast next to the
   * caller's own error handling; dialogs that show the message inline pass
   * `inline` so the same failure is not announced twice.
   */
  errorMode?: "toast" | "inline";
  /** Link the task Pulp created for this write. Defaults to true. */
  taskAction?: boolean;
}

function resolveSuccessMessage<TData, TVars>(
  message: SuccessMessage<TData, TVars> | undefined,
  data: TData,
  vars: TVars,
): string | undefined {
  if (message === undefined || message === false) {
    return undefined;
  }
  if (typeof message === "function") {
    const resolved = message(data, vars);
    return resolved || undefined;
  }
  return message;
}

function taskActionFor<TData>(
  data: TData,
  enabled: boolean,
): { label: string; taskHref: string } | undefined {
  if (!enabled || !isTaskResponse(data)) {
    return undefined;
  }
  return { label: "View task", taskHref: data.task };
}

/**
 * The shared write path. Wraps TanStack's `useMutation` so every screen gets the
 * same invalidate-then-succeed order, while still letting the caller render
 * `formatApiError(mutation.error, …)`.
 *
 * Success feedback is a toast by default; failures toast unless the caller owns
 * an inline error banner.
 */
export function useApiMutation<TData = unknown, TVars = void>({
  mutationFn,
  invalidation,
  onSuccess,
  onError,
  successMessage,
  errorMessage,
  errorMode,
  taskAction = true,
}: ApiMutationOptions<TData, TVars>): UseMutationResult<TData, unknown, TVars> {
  const queryClient = useQueryClient();

  return useMutation<TData, unknown, TVars>({
    mutationFn,
    onError: (error, vars) => {
      onError?.(error, vars);
      const mode = errorMode ?? "toast";
      if (mode === "toast") {
        toast.error(
          typeof errorMessage === "function"
            ? errorMessage(error, vars)
            : (errorMessage ?? formatApiError(error, "The request could not be completed.")),
        );
      }
    },
    onSuccess: async (data, vars) => {
      const keys = resolveInvalidations(invalidation, data, vars);
      if (keys.length > 0) {
        await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      }
      onSuccess?.(data, vars);

      const message = resolveSuccessMessage(successMessage, data, vars);
      if (message) {
        toast.success(message, { action: taskActionFor(data, taskAction) });
      }
    },
  });
}

interface PulpWriteOptions<TVars> {
  method: "POST" | "PATCH";
  /** A fixed href, or one derived from the mutation variables. */
  path: string | ((vars: TVars) => string);
  /** Request body. Defaults to the mutation variables. */
  body?: (vars: TVars) => unknown;
  invalidation?: Invalidation<unknown, TVars>;
  onSuccess?: (data: unknown, vars: TVars) => void;
  onError?: (error: unknown, vars: TVars) => void;
  successMessage?: SuccessMessage<unknown, TVars>;
  errorMessage?: string | ((error: unknown, vars: TVars) => string);
  errorMode?: "toast" | "inline";
  taskAction?: boolean;
}

/**
 * Task-aware Pulp write. `mutateAndWait` handles the `202 { task }` envelope so
 * callers never refresh a query while the server is still applying the change.
 */
export function usePulpWrite<TVars = Record<string, unknown>>({
  method,
  path,
  body,
  invalidation,
  onSuccess,
  onError,
  successMessage = "Saved",
  errorMessage,
  errorMode,
  taskAction,
}: PulpWriteOptions<TVars>): UseMutationResult<unknown, unknown, TVars> {
  const waitForCompletion = useTaskWaitEnabled();
  return useApiMutation<unknown, TVars>({
    mutationFn: (vars) => {
      const target = typeof path === "function" ? path(vars) : path;
      const options = {
        method,
        body: body ? body(vars) : (vars as unknown as Record<string, unknown> | undefined),
      };
      return waitForCompletion
        ? mutateAndWait<unknown>(target, options)
        : apiRequest<unknown>(target, options);
    },
    invalidation,
    onSuccess,
    onError,
    successMessage,
    errorMessage,
    errorMode,
    taskAction: waitForCompletion ? taskAction : false,
  });
}

interface PulpDeleteOptions<TVars> {
  /** A fixed href, or one derived from the mutation variables. */
  path: string | ((vars: TVars) => string);
  invalidation?: Invalidation<AsyncOperationResponse | undefined, TVars>;
  onSuccess?: (data: AsyncOperationResponse | undefined, vars: TVars) => void;
  onError?: (error: unknown, vars: TVars) => void;
  successMessage?: SuccessMessage<AsyncOperationResponse | undefined, TVars>;
  errorMessage?: string | ((error: unknown, vars: TVars) => string);
  errorMode?: "toast" | "inline";
  taskAction?: boolean;
}

/** Delete helper that accepts either a `204` or a `202 { task }` response. */
export function usePulpDelete<TVars = string>({
  path,
  invalidation,
  onSuccess,
  onError,
  successMessage = "Deleted",
  errorMessage,
  errorMode,
  taskAction,
}: PulpDeleteOptions<TVars>): UseMutationResult<
  AsyncOperationResponse | undefined,
  unknown,
  TVars
> {
  const waitForCompletion = useTaskWaitEnabled();
  return useApiMutation<AsyncOperationResponse | undefined, TVars>({
    mutationFn: (vars) => {
      const target = typeof path === "function" ? path(vars) : path;
      return waitForCompletion
        ? deleteAndWait(target)
        : apiRequest<AsyncOperationResponse | undefined>(target, {
            method: "DELETE",
          });
    },
    invalidation,
    onSuccess,
    onError,
    successMessage,
    errorMessage,
    errorMode,
    taskAction: waitForCompletion ? taskAction : false,
  });
}
