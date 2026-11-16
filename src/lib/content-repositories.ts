import type { QueryParams } from "@/api/types";

/**
 * Pulp rejects filter expressions whose complexity exceeds 8. Each
 * `repository_version` term costs one, and the OR group adds one, so seven
 * repositories is the largest exact server-side union.
 */
export const MAX_CONTENT_REPOSITORY_FILTERS = 7;

/** Parse the comma-separated `repos` URL parameter into unique repo hrefs. */
export function parseRepositoryHrefs(value: unknown): string[] {
  if (typeof value !== "string") {
    return [];
  }
  const unique = new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
  return [...unique].slice(0, MAX_CONTENT_REPOSITORY_FILTERS);
}

/** Serialize repository hrefs for the URL, omitting an empty selection. */
export function serializeRepositoryHrefs(values: readonly string[]): string | undefined {
  const unique = [...new Set(values.filter(Boolean))].slice(0, MAX_CONTENT_REPOSITORY_FILTERS);
  return unique.length ? unique.join(",") : undefined;
}

function quoteFilterValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Build the Pulp query for the selected repositories. One repository uses the
 * typed filter; several use Pulp's expression filter so the count, ordering,
 * and pagination stay server-side.
 */
export function buildRepositoryContentQuery(
  repositoryHrefs: readonly string[],
  limit = MAX_CONTENT_REPOSITORY_FILTERS,
): QueryParams {
  const hrefs = [...new Set(repositoryHrefs.filter(Boolean))].slice(0, limit);
  if (!hrefs.length) {
    return {};
  }
  if (hrefs.length === 1) {
    return { repository_version: hrefs[0] };
  }
  return {
    q: hrefs.map((href) => `repository_version="${quoteFilterValue(href)}"`).join(" OR "),
  };
}
