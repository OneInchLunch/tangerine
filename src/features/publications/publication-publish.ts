import { publishRepositoryVersion } from "@/features/repositories/repository-publish";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useAuth } from "@/auth/auth-context";
import { scopeCreateObject } from "@/api/gateway";
import { publicationResourceForRepositoryFromHref } from "@/lib/repositories";
import { queryKeys } from "@/lib/query-keys";
import type { Task } from "@/api/types";

interface PublishVariables {
  repositoryHref: string;
  versionHref: string;
  settings?: Record<string, unknown>;
}

/** Single publication mutation path for every publish entry point. */
export function usePublishPublication() {
  const { session } = useAuth();
  return useApiMutation<Task, PublishVariables>({
    mutationFn: async ({ repositoryHref, versionHref, settings }) => {
      if (session?.capabilities?.repositoryAdmin) {
        const resource = publicationResourceForRepositoryFromHref(repositoryHref);
        if (!resource) {
          throw new Error("This repository type does not support publications.");
        }
        if (!session.csrfToken) {
          throw new Error("The gateway session is missing its CSRF token.");
        }
        const response = await scopeCreateObject(
          resource,
          { repository_version: versionHref, ...settings },
          session.csrfToken,
        );
        return response.result as Task;
      }
      return publishRepositoryVersion(repositoryHref, versionHref, settings);
    },
    invalidation: (_task, vars) => [
      queryKeys.repository(vars.repositoryHref),
      queryKeys.repositories.all,
      queryKeys.apiList.endpoint("publications"),
      queryKeys.apiList.endpoint("distributions"),
      queryKeys.counts.resource("publications"),
    ],
    successMessage: "Publication created",
    errorMode: "inline",
    taskAction: false,
  });
}
