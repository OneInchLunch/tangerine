import type { NavSection } from "@/lib/navigation";

export type QuickSwitcherGroup =
  | "Pages"
  | "Repositories"
  | "Remotes"
  | "Distributions"
  | "Tasks"
  | "Users";

export const QUICK_SWITCHER_GROUPS: QuickSwitcherGroup[] = [
  "Pages",
  "Repositories",
  "Remotes",
  "Distributions",
  "Tasks",
  "Users",
];

export interface QuickSwitcherItem {
  id: string;
  group: QuickSwitcherGroup;
  title: string;
  subtitle?: string;
  /** Router path, including a dynamic segment such as `/tasks/$taskId`. */
  to: string;
  /** Path params for dynamic routes. */
  params?: Record<string, string>;
  /** Search params for list or detail routes. */
  search?: Record<string, string>;
}

export interface QuickSwitcherSection {
  group: QuickSwitcherGroup;
  items: QuickSwitcherItem[];
}

/** Minimum query length before the palette asks Pulp for resources. */
export const QUICK_SWITCHER_MIN_QUERY = 2;

/**
 * Flatten sections in a fixed group order and cap the list so the palette never
 * grows past a screenful. Groups with no matches are dropped.
 */
export function flattenSections(sections: QuickSwitcherSection[], limit = 12): QuickSwitcherItem[] {
  const ordered = QUICK_SWITCHER_GROUPS.flatMap((group) => {
    const section = sections.find((candidate) => candidate.group === group);
    return section ? section.items : [];
  });
  return ordered.slice(0, limit);
}

/** Navigation commands, filtered client-side so pages work with an empty query. */
export function pageCommands(sections: NavSection[], query: string): QuickSwitcherItem[] {
  const needle = query.trim().toLowerCase();
  return sections.flatMap((section) =>
    section.items
      .filter((item) => !needle || item.label.toLowerCase().includes(needle))
      .map((item) => ({
        id: `page:${item.to}`,
        group: "Pages" as const,
        title: item.label,
        subtitle: section.label,
        to: item.to,
      })),
  );
}

/** Human-readable state for a task result subtitle. */
export function taskSubtitle(name: string, state: string | undefined): string {
  return state ? `${name} · ${state}` : name;
}
