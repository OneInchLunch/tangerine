import { repositoryTypeFromHref } from "@/api/resources";
import type { FieldDescriptor } from "@/lib/field-descriptors";
import { PLUGINS, publicationTypeLabels } from "@/lib/plugins";

export interface DistributionTypeInfo {
  repositoryType: string;
  plugin: string;
  type: string;
  label: string;
  resource: string;
  publicationTypes: string[];
  fields: FieldDescriptor[];
}

function distributionEndpointParts(apiPath: string): [string, string] {
  const parts = apiPath.replace(/\/$/, "").split("/");
  return [parts[1] ?? "", parts[2] ?? ""];
}

/**
 * Distribution endpoints do not always use the same plugin/type pair as the
 * repository endpoint they serve. Python is the notable example: repository
 * content lives under python/python, while distributions and publications
 * live under python/pypi.
 */
const DISTRIBUTION_TYPES: DistributionTypeInfo[] = PLUGINS.flatMap((plugin) => {
  if (!plugin.distribution) {
    return [];
  }
  const [pluginName, type] = distributionEndpointParts(plugin.distribution.apiPath);
  return [
    {
      repositoryType: plugin.id,
      plugin: pluginName,
      type,
      label: plugin.distribution.label,
      resource: plugin.distribution.apiPath,
      publicationTypes: plugin.distribution.publicationTypes,
      fields: plugin.distribution.fields ?? [],
    },
  ];
});

function distributionHrefParts(href?: string | null): [string, string] | null {
  const match = href?.match(/\/distributions\/([^/]+)\/([^/]+)\//);
  return match ? [match[1], match[2]] : null;
}

export function distributionTypeForRepository(
  repositoryHref?: string | null,
): DistributionTypeInfo | undefined {
  const repositoryType = repositoryTypeFromHref(repositoryHref);
  return DISTRIBUTION_TYPES.find((item) => item.repositoryType === repositoryType);
}

export function distributionTypeInfo(href?: string | null): DistributionTypeInfo | undefined {
  const parts = distributionHrefParts(href);
  if (!parts) {
    return undefined;
  }
  const [plugin, type] = parts;
  return DISTRIBUTION_TYPES.find((item) => item.plugin === plugin && item.type === type);
}

/**
 * Pulp core creates a singleton artifact distribution at startup. It serves
 * stored artifacts by UUID through signed URLs, has no repository or
 * publication, and its API is read-only. Tangerine treats it as a system
 * endpoint instead of an editable distribution.
 */
export function isSystemDistribution(href?: string | null): boolean {
  const parts = distributionHrefParts(href);
  return parts?.[0] === "core" && parts?.[1] === "artifacts";
}

/** Display name for the read-only core artifact distribution. */
export const SYSTEM_DISTRIBUTION_NAME = "Pulp artifact serving";

export function distributionDisplayName(name: string, href?: string | null): string {
  return isSystemDistribution(href) ? SYSTEM_DISTRIBUTION_NAME : name;
}

export function distributionIsEditable(href?: string | null): boolean {
  return Boolean(href) && !isSystemDistribution(href);
}

export function distributionTypeFromHref(href?: string | null): string {
  const info = distributionTypeInfo(href);
  if (info) {
    return `${info.plugin}.${info.type}`;
  }
  const parts = distributionHrefParts(href);
  return parts ? `${parts[0]}.${parts[1]}` : "unknown";
}

export function distributionTypeLabel(href?: string | null): string {
  return distributionTypeInfo(href)?.label ?? distributionTypeFromHref(href);
}

export function distributionSupportsPublications(href?: string | null): boolean {
  return Boolean(distributionTypeInfo(href)?.publicationTypes.length);
}

export function distributionFieldsForHref(href?: string | null): FieldDescriptor[] {
  return distributionTypeInfo(href)?.fields ?? [];
}

export function publicationTypeFromHref(href?: string | null): string {
  const match = href?.match(/\/publications\/([^/]+)\/([^/]+)\//);
  return match ? `${match[1]}.${match[2]}` : "unknown";
}

const PUBLICATION_TYPE_LABELS = publicationTypeLabels();

export function publicationTypeLabel(href?: string | null): string {
  const type = publicationTypeFromHref(href);
  return PUBLICATION_TYPE_LABELS[type] ?? type;
}

export function distributionBasePathFromName(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "distribution";
}

/**
 * Build a default name/base path for a new distribution without colliding with
 * distributions already attached to the same repository. Pulp requires unique
 * names and base paths, so a second distribution cannot reuse the repository
 * name defaults.
 */
export function uniqueDistributionDefaults(
  repositoryName: string,
  existing: ReadonlyArray<{ name?: string | null; base_path?: string | null }>,
): { name: string; basePath: string } {
  const baseName = repositoryName.trim() || "distribution";
  const basePath = distributionBasePathFromName(baseName);
  const names = new Set(
    existing.map((item) => item.name).filter((value): value is string => Boolean(value)),
  );
  const paths = new Set(
    existing.map((item) => item.base_path).filter((value): value is string => Boolean(value)),
  );
  if (!names.has(baseName) && !paths.has(basePath)) {
    return { name: baseName, basePath };
  }
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const name = `${baseName}-${suffix}`;
    const path = `${basePath}-${suffix}`;
    if (!names.has(name) && !paths.has(path)) {
      return { name, basePath: path };
    }
  }
  const fallback = Date.now();
  return { name: `${baseName}-${fallback}`, basePath: `${basePath}-${fallback}` };
}
