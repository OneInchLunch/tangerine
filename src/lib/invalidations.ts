import type { QueryKey } from "@tanstack/react-query";

/**
 * An invalidation is either a fixed list of query keys or a function that
 * derives them from the mutation result and variables.
 */
export type Invalidation<TData, TVars> = QueryKey[] | ((data: TData, vars: TVars) => QueryKey[]);

/**
 * Resolve the query keys a mutation should invalidate.
 *
 * Kept separate from the hook so the behaviour is unit-testable without a DOM.
 */
export function resolveInvalidations<TData, TVars>(
  invalidation: Invalidation<TData, TVars> | undefined,
  data: TData,
  vars: TVars,
): QueryKey[] {
  if (!invalidation) {
    return [];
  }
  return typeof invalidation === "function" ? invalidation(data, vars) : invalidation;
}
