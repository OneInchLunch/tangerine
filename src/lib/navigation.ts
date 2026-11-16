import type { GatewayCapabilities } from "@/api/gateway";
import { entityIcons } from "@/lib/icons";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  exact?: boolean;
  /**
   * Capability required to show this item for gateway sessions. Without
   * capabilities, the historical staff-only behavior applies.
   */
  requires?: "tasks" | "workers" | "operations" | "importExport" | "signing" | "content";
  /**
   * Pulp administration screens that require a staff account. Object-level
   * permissions are deliberately not modelled here: a non-staff user can still
   * have repository rights, but cannot administer users, roles, or the raw API
   * console.
   */
  adminOnly?: boolean;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const navigation: NavSection[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", to: "/", icon: entityIcons.dashboard, exact: true }],
  },
  {
    label: "Content",
    items: [
      { label: "Repositories", to: "/repositories", icon: entityIcons.repositories },
      {
        label: "Remotes",
        to: "/remotes",
        icon: entityIcons.remotes,
        requires: "content",
      },
      {
        label: "Distributions",
        to: "/distributions",
        icon: entityIcons.distributions,
        requires: "content",
      },
      {
        label: "Publications",
        to: "/publications",
        icon: entityIcons.publications,
        requires: "content",
      },
      { label: "Content", to: "/content", icon: entityIcons.content, requires: "content" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Tasks", to: "/tasks", icon: entityIcons.tasks, requires: "tasks" },
      { label: "Workers", to: "/workers", icon: entityIcons.workers, requires: "workers" },
      {
        label: "Operations",
        to: "/operations",
        icon: entityIcons.operations,
        requires: "operations",
      },
      {
        label: "Import / export",
        to: "/import-export/pulp-export",
        icon: entityIcons.importExport,
        requires: "importExport",
      },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Users", to: "/users", icon: entityIcons.users, adminOnly: true },
      { label: "Groups", to: "/groups", icon: entityIcons.groups, adminOnly: true },
      { label: "Roles", to: "/roles", icon: entityIcons.roles, adminOnly: true },
      { label: "Signing", to: "/signing", icon: entityIcons.signing, requires: "signing" },
      { label: "Plugins", to: "/plugins", icon: entityIcons.plugins },
      { label: "API admin", to: "/api-admin", icon: entityIcons.apiAdmin, adminOnly: true },
    ],
  },
];

/** Whether a signed-in user may open the administration console. */
export function isAdminUser(
  user: { is_staff?: boolean; is_superuser?: boolean | null } | null | undefined,
): boolean {
  return Boolean(user?.is_staff || user?.is_superuser);
}

/**
 * Navigation for the current user. Admin-only entries disappear for non-staff
 * accounts, capability-gated entries follow the gateway session, and a section
 * with no remaining entries is dropped entirely.
 */
export function visibleNavigation(
  isAdmin: boolean,
  capabilities?: GatewayCapabilities,
): NavSection[] {
  function allowed(item: NavItem): boolean {
    if (item.adminOnly && !isAdmin) {
      return false;
    }
    if (!capabilities || !item.requires) {
      return true;
    }
    switch (item.requires) {
      case "tasks":
        return capabilities.tasksRead !== false;
      case "workers":
        return capabilities.tasksRead !== false;
      case "operations":
        return capabilities.operationsRead !== false;
      case "importExport":
        return capabilities.importExportRead !== false;
      case "signing":
        return capabilities.signingRead !== false;
      case "content":
        return capabilities.contentRead !== false;
    }
  }

  return navigation
    .map((section) => ({
      ...section,
      items: section.items.filter(allowed),
    }))
    .filter((section) => section.items.length > 0);
}
