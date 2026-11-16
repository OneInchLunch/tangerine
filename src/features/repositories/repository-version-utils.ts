import type { RepositoryVersion } from "@/api/types";

export type ContentSummarySection = "present" | "added" | "removed";

export interface ContentSummaryItem {
  contentType: string;
  href: string;
  label: string;
  count: number;
}

export function contentTypeSummaryLabel(contentType: string): string {
  if (contentType.includes(".")) {
    return contentType.replace(/\./g, " / ").replace(/[-_]+/g, " ");
  }
  const match = contentType.match(/\/content\/([^/]+)\/([^/]+)\//);
  if (!match) {
    return contentType || "Content";
  }
  return `${match[1]} / ${match[2].replace(/[-_]+/g, " ")}`;
}

export function contentSummaryItems(
  version: RepositoryVersion | undefined,
  section: ContentSummarySection,
): ContentSummaryItem[] {
  const entries = version?.content_summary?.[section] ?? {};
  return Object.entries(entries)
    .filter(([, entry]) => entry.count > 0)
    .map(([contentType, entry]) => ({
      contentType,
      href: entry.href,
      label: contentTypeSummaryLabel(contentType),
      count: entry.count,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function contentSummaryTotal(version: RepositoryVersion | undefined): number {
  return contentSummaryItems(version, "present").reduce((sum, item) => sum + item.count, 0);
}
