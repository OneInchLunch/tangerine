import { repositoryTypeFromHref } from "@/api/resources";
import {
  pluginForRepositoryType,
  publicationResourceForRepositoryType,
  repositorySupportsAutopublish as registrySupportsAutopublish,
  repositorySupportsPublications as registrySupportsPublications,
  repositoryTypeLabel as registryTypeLabel,
} from "@/lib/plugins";

export interface RepositoryAutopublishSupport {
  type: string;
  label: string;
  deprecated: boolean;
}

export function repositoryAutopublishSupport(
  type?: string | null,
): RepositoryAutopublishSupport | undefined {
  const plugin = pluginForRepositoryType(type);
  if (!plugin?.autopublish) {
    return undefined;
  }
  return {
    type: plugin.id,
    label: plugin.label,
    deprecated: plugin.autopublish.deprecated,
  };
}

export function repositorySupportsAutopublishFromHref(href?: string | null): boolean {
  return registrySupportsAutopublish(repositoryTypeFromHref(href));
}

export function repositorySupportsPublicationsFromHref(href?: string | null): boolean {
  return registrySupportsPublications(repositoryTypeFromHref(href));
}

export function repositoryTypeLabelForType(type?: string | null): string {
  return registryTypeLabel(type);
}

export function publicationResourceForRepositoryFromHref(href?: string | null): string | undefined {
  return publicationResourceForRepositoryType(repositoryTypeFromHref(href));
}
