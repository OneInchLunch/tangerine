import { deleteAndWait } from "@/api/resources";
import { scopeMutateObject } from "@/api/gateway";
import { usePulpWrite } from "@/hooks/use-api-mutation";
import { useScopedMutation } from "@/hooks/use-scoped-mutation";
import { queryKeys } from "@/lib/query-keys";

/**
 * Delete and auto-publish mutations for distribution detail. Extracted from the
 * page so the component stays composition plus cards.
 */
export function useDistributionActions({
  onDeleted,
  onAutopublishError,
}: {
  onDeleted: () => void | Promise<void>;
  onAutopublishError: (message: string) => void;
}) {
  const remove = useScopedMutation<void, { href: string }>({
    scope: async ({ href: target }, csrfToken) => {
      await scopeMutateObject("DELETE", target, null, csrfToken);
    },
    direct: async ({ href: target }) => {
      await deleteAndWait(target);
    },
    invalidation: [
      queryKeys.apiList.endpoint("distributions"),
      queryKeys.repositoryDistributionsAll,
      queryKeys.counts.resource("distributions"),
    ],
    successMessage: "Distribution deleted",
    errorMode: "inline",
    onSuccess: onDeleted,
  });

  const autopublish = usePulpWrite<{ repositoryHref: string; enabled: boolean }>({
    method: "PATCH",
    path: ({ repositoryHref }) => repositoryHref,
    body: ({ enabled }) => ({ autopublish: enabled }),
    invalidation: (_data, vars) => [
      queryKeys.repository(vars.repositoryHref),
      queryKeys.repositories.all,
      queryKeys.apiList.endpoint("distributions"),
    ],
    successMessage: (_data, vars) =>
      vars.enabled ? "Auto-publish enabled" : "Auto-publish disabled",
    onError: (caught, vars) =>
      onAutopublishError(
        caught instanceof Error
          ? caught.message
          : `Auto-publish could not be ${vars.enabled ? "enabled" : "disabled"}.`,
      ),
  });

  return { remove, autopublish };
}
