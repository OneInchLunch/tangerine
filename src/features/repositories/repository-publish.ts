import { apiRequest } from "@/api/client";
import { waitForTask } from "@/api/resources";
import type { AsyncOperationResponse, Task } from "@/api/types";
import { publicationResourceForRepositoryFromHref } from "@/lib/repositories";

/**
 * Create a publication for a specific repository version.
 *
 * Autopublish only applies to versions created after the flag is enabled, so
 * existing repositories need an explicit publication before repo-backed
 * distributions can serve content.
 */
export async function publishRepositoryVersion(
  repositoryHref: string,
  versionHref: string,
  settings: Record<string, unknown> = {},
): Promise<Task> {
  const resource = publicationResourceForRepositoryFromHref(repositoryHref);
  if (!resource) {
    throw new Error("This repository type does not support publications.");
  }
  const response = await apiRequest<AsyncOperationResponse>(resource, {
    method: "POST",
    body: { repository_version: versionHref, ...settings },
  });
  if (!response?.task) {
    throw new Error("Pulp did not return a task for the publication.");
  }
  return waitForTask(response.task);
}
