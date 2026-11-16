import { repositoryVersionNumber, resourceIdFromHref } from "@/api/resources";
import type { DistributionDetail, Publication, Repository } from "@/api/types";
import { mutateAndWait } from "@/api/resources";
import { formatApiError } from "@/lib/errors";
import { truncate } from "@/lib/format";
import { distributionSupportsPublications, publicationTypeLabel } from "@/lib/distributions";
import { queryKeys } from "@/lib/query-keys";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useAuth } from "@/auth/auth-context";
import { scopeMutateObject } from "@/api/gateway";
import { useRef } from "react";

export type DistributionEditMode = "metadata" | "source";

export function dialogCopy(name: string, mode: DistributionEditMode) {
  if (mode === "source") {
    return {
      title: `Content source for ${name}`,
      description:
        "Choose how this distribution serves content, then save. The distribution name and base path are unchanged.",
    };
  }
  return {
    title: `Edit ${name}`,
    description:
      "Update the distribution name, base path, and visibility. Use Change to update its content source.",
  };
}

export function sourceSummary(distribution: DistributionDetail): string {
  if (distribution.publication) {
    return `Pinned to a ${publicationTypeLabel(distribution.publication)} publication`;
  }
  if (distribution.repository) {
    return distributionSupportsPublications(distribution.pulp_href)
      ? "Follows the repository and serves its newest publication"
      : "Follows the repository and serves its content directly";
  }
  return "No content source";
}

export function publicationLabel(
  publication: Publication,
  repositoriesById: Map<string, Repository>,
): string {
  const repository = repositoriesById.get(resourceIdFromHref(publication.repository));
  const repositoryLabel =
    repository?.name ??
    (publication.repository ? truncate(publication.repository, 28) : "No repository");
  const version = repositoryVersionNumber(publication.repository_version);
  const versionLabel = version === "—" ? "" : ` · v${version}`;
  return `${repositoryLabel} — ${publicationTypeLabel(publication.pulp_href)}${versionLabel}`;
}

/** Shared save state for the split metadata and source dialogs. */
export function useDistributionSave(href: string, onClose: () => void) {
  const fallbackMessage = useRef("Unable to update distribution.");
  const { session } = useAuth();
  const save = useApiMutation<unknown, Record<string, unknown>>({
    mutationFn: async (body) => {
      if (session?.capabilities?.repositoryAdmin) {
        if (!session.csrfToken) {
          throw new Error("The gateway session is missing its CSRF token.");
        }
        await scopeMutateObject("PATCH", href, body, session.csrfToken);
        return body;
      }
      await mutateAndWait(href, { method: "PATCH", body });
      return body;
    },
    invalidation: [
      queryKeys.distribution(href),
      queryKeys.apiList.endpoint("distributions"),
      queryKeys.repositoryDistributionsAll,
      queryKeys.counts.resource("distributions"),
    ],
    successMessage: "Distribution updated",
    errorMode: "inline",
    onSuccess: onClose,
  });

  function saveChanges(body: Record<string, unknown>, nextFallbackMessage: string) {
    if (!href) {
      return;
    }
    fallbackMessage.current = nextFallbackMessage;
    save.mutate(body);
  }

  return {
    error: save.error ? formatApiError(save.error, fallbackMessage.current) : null,
    isSubmitting: save.isPending,
    saveChanges,
  };
}
