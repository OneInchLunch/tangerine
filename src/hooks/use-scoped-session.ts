import { useAuth } from "@/auth/auth-context";

export interface ScopedSession {
  /** True when the gateway resolved repository PRN scopes for this session. */
  repositoryAdmin: boolean;
  /** CSRF token for `/sso/scope/*` writes; undefined for non-scoped sessions. */
  csrfToken: string | undefined;
  /** Assigned repository PRNs; undefined for non-scoped sessions. */
  prns: string[] | undefined;
}

/**
 * One source for the scoped-session fields used by write paths and repository
 * pickers, replacing the repeated
 * `session?.capabilities?.repositoryAdmin ? session.csrfToken : undefined`
 * expression.
 */
export function useScopedSession(): ScopedSession {
  const { session } = useAuth();
  const repositoryAdmin = Boolean(session?.capabilities?.repositoryAdmin);
  return {
    repositoryAdmin,
    csrfToken: repositoryAdmin ? session?.csrfToken : undefined,
    prns: repositoryAdmin ? session?.repositoryPrns : undefined,
  };
}
