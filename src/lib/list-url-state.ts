export type ListSearchUpdates = Record<string, string | number | undefined>;

/** Page sizes offered by list toolbars. */
export const LIST_PAGE_SIZES = [25, 50, 100] as const;

export const DEFAULT_LIST_PAGE_SIZE = 25;

/** Parse the `page` search param into a non-negative integer. */
export function parseListPage(value: unknown): number {
  if (typeof value === "number") {
    return Math.max(0, Math.trunc(value));
  }
  return Math.max(0, Number.parseInt(String(value ?? "0"), 10) || 0);
}

/** Parse the `per` search param, accepting only the offered page sizes. */
export function parseListPageSize(value: unknown, fallback = DEFAULT_LIST_PAGE_SIZE): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return (LIST_PAGE_SIZES as readonly number[]).includes(parsed) ? parsed : fallback;
}

/**
 * Parse the `sort` search param. A leading `-` means descending, matching
 * Pulp's `ordering` convention.
 */
export function parseListSort(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return /^-?[A-Za-z0-9_.]+$/.test(trimmed) ? trimmed : "";
}

/** Toggle a sortable column: unsorted -> ascending -> descending -> unsorted. */
export function nextListSort(current: string, key: string): string {
  if (current === key) {
    return `-${key}`;
  }
  if (current === `-${key}`) {
    return "";
  }
  return key;
}

/**
 * Merge list updates into the previous search object. Empty strings and
 * `undefined` remove a key so the URL only carries meaningful state.
 */
export function mergeListSearch(
  previous: Record<string, unknown>,
  updates: ListSearchUpdates,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...previous };
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === "") {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  return next;
}

/** Whether a location carries list view state from a previous route. */
export function hasListSearchParams(search: Record<string, unknown>): boolean {
  return (
    "page" in search ||
    "per" in search ||
    "sort" in search ||
    "q" in search ||
    "filter" in search ||
    "plugin" in search ||
    "type" in search ||
    "package" in search ||
    "view" in search ||
    "repos" in search
  );
}

const LIST_RETURN_KEYS = ["q", "page", "per", "sort", "filter", "repos"] as const;

/** Encode the list view state so a detail page can link back to it. */
export function encodeListReturn(search: Record<string, unknown>): string | undefined {
  const params = new URLSearchParams();
  for (const key of LIST_RETURN_KEYS) {
    const value = search[key];
    if (typeof value === "string" && value) {
      params.set(key, value);
    } else if (typeof value === "number") {
      params.set(key, String(value));
    }
  }
  const encoded = params.toString();
  return encoded || undefined;
}

/** Decode a list view state captured by a detail link. */
export function decodeListReturn(value: unknown): Record<string, string> | undefined {
  if (typeof value !== "string" || !value) {
    return undefined;
  }
  const result: Record<string, string> = {};
  for (const [key, item] of new URLSearchParams(value)) {
    if (item) {
      result[key] = item;
    }
  }
  return Object.keys(result).length ? result : undefined;
}
