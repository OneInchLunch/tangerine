import { useAuth } from "@/auth/auth-context";

/**
 * Whether the current session may attach signing services.
 *
 * - Gateway superusers (maintainers) are recognized by `is_superuser`, which the
 *   gateway session merges into the Pulp user.
 * - Local Pulp staff are the break-glass administrators; Pulp does not expose
 *   `is_superuser` on its user record, so the UI treats staff as trusted unless
 *   they are a repository-scoped gateway admin.
 * - Repository-scoped admins never qualify, and the gateway additionally
 *   rejects signing fields in scoped writes.
 *
 * This is a UI gate; the durable control is the gateway deny plus the trust
 * placed in who receives a local staff account.
 */
export function useCanConfigureSigning(): boolean {
  const { user, session } = useAuth();
  if (user?.is_superuser) {
    return true;
  }
  if (!user?.is_staff) {
    return false;
  }
  return !session?.capabilities?.repositoryAdmin;
}
