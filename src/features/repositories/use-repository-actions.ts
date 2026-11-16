import { apiRequest } from "@/api/client";
import { deleteAndWait, mutateAndWait } from "@/api/resources";
import { scopeRepositoryAction } from "@/api/gateway";
import type { AsyncOperationResponse } from "@/api/types";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useScopedMutation } from "@/hooks/use-scoped-mutation";
import { queryKeys } from "@/lib/query-keys";

/**
 * Scan, sync, auto-publish, and delete mutations for repository detail.
 * Extracted so the page stays composition plus cards.
 */
export function useRepositoryActions({
  href,
  onScanTask,
  onSyncTask,
  onDeleted,
  onError,
}: {
  href: string | undefined;
  onScanTask: (task: string) => void;
  onSyncTask: (task: string) => void;
  onDeleted: () => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const scan = useApiMutation<AsyncOperationResponse, string>({
    mutationFn: (versionHref) =>
      apiRequest<AsyncOperationResponse>(`${versionHref}scan/`, {
        method: "POST",
        body: {},
      }),
    invalidation: [queryKeys.vulnerabilityReportsAll],
    successMessage: "Vulnerability scan started",
    onSuccess: (response) => {
      if (response.task) {
        onScanTask(response.task);
      }
    },
    onError: (caught) =>
      onError(
        caught instanceof Error ? caught.message : "The vulnerability scan could not be started.",
      ),
  });

  const sync = useApiMutation<AsyncOperationResponse, void>({
    mutationFn: () =>
      apiRequest<AsyncOperationResponse>(`${href}sync/`, {
        method: "POST",
        body: {},
      }),
    invalidation: [queryKeys.tasks.all, queryKeys.counts.resource("tasks")],
    successMessage: "Sync started",
    onSuccess: (response) => {
      if (response.task) {
        onSyncTask(response.task);
      }
    },
    onError: (caught) =>
      onError(caught instanceof Error ? caught.message : "The sync could not be started."),
  });

  const autopublish = useScopedMutation<unknown, { enabled: boolean }>({
    scope: ({ enabled }, csrfToken) =>
      scopeRepositoryAction("PATCH", href ?? "", { autopublish: enabled }, csrfToken),
    direct: ({ enabled }) =>
      mutateAndWait(href ?? "", { method: "PATCH", body: { autopublish: enabled } }),
    invalidation: [
      queryKeys.repository(href),
      queryKeys.repositories.all,
      queryKeys.repositoryDistributions(href),
      queryKeys.apiList.endpoint("distributions"),
    ],
    successMessage: (_data, vars) =>
      vars.enabled ? "Auto-publish enabled" : "Auto-publish disabled",
    onError: (caught) =>
      onError(caught instanceof Error ? caught.message : "Auto-publish could not be updated."),
  });

  const remove = useScopedMutation<void, { href: string }>({
    scope: async ({ href: target }, csrfToken) => {
      await scopeRepositoryAction("DELETE", target, null, csrfToken);
    },
    direct: async ({ href: target }) => {
      await deleteAndWait(target);
    },
    invalidation: [queryKeys.repositories.all, queryKeys.counts.resource("repositories")],
    successMessage: "Repository deleted",
    onSuccess: onDeleted,
    onError: (caught) =>
      onError(caught instanceof Error ? caught.message : "The repository could not be deleted."),
  });

  return { scan, sync, autopublish, remove };
}
