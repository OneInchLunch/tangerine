import { useApiMutation, type SuccessMessage } from "@/hooks/use-api-mutation";
import { useScopedSession } from "@/hooks/use-scoped-session";
import type { Invalidation } from "@/lib/invalidations";

export interface ScopedMutationOptions<TData, TVars> {
  /** Gateway-backed write used when the session has repository PRN scopes. */
  scope: (vars: TVars, csrfToken: string) => Promise<TData>;
  /** Direct Pulp write used for administrators and local sessions. */
  direct: (vars: TVars) => Promise<TData>;
  invalidation?: Invalidation<TData, TVars>;
  onSuccess?: (data: TData, vars: TVars) => void;
  onError?: (error: unknown, vars: TVars) => void;
  successMessage?: SuccessMessage<TData, TVars>;
  errorMessage?: string | ((error: unknown, vars: TVars) => string);
  errorMode?: "toast" | "inline";
  taskAction?: boolean;
}

/**
 * One write path for actions that Pulp cannot authorize by repository.
 *
 * It picks the `/sso/scope/*` endpoint for a repository-scoped session and the
 * direct Pulp call otherwise, supplies the CSRF token, and owns invalidation.
 * Task policy stays with the caller: scoped gateway calls wait server-side,
 * while direct calls use the task-aware resource helpers.
 */
export function useScopedMutation<TData = unknown, TVars = void>({
  scope,
  direct,
  invalidation,
  onSuccess,
  onError,
  successMessage,
  errorMessage,
  errorMode,
  taskAction,
}: ScopedMutationOptions<TData, TVars>) {
  const { csrfToken } = useScopedSession();
  return useApiMutation<TData, TVars>({
    mutationFn: (vars) => (csrfToken ? scope(vars, csrfToken) : direct(vars)),
    invalidation,
    onSuccess,
    onError,
    successMessage,
    errorMessage,
    errorMode,
    taskAction,
  });
}
