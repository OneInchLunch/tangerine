import { getConfig } from "@/lib/config";
import { useLocation } from "@tanstack/react-router";
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface PageHeaderInfo {
  title: string;
  description?: string;
}

interface RegisteredPageHeader {
  href: string;
  info: PageHeaderInfo;
}

interface PageHeaderContextValue {
  header: PageHeaderInfo;
  registerPageHeader: (href: string, info: PageHeaderInfo) => void;
}

const PageHeaderContext = createContext<PageHeaderContextValue | null>(null);

const ROUTE_HEADERS: Record<string, PageHeaderInfo> = {
  "/": {
    title: "Dashboard",
    description: "A live view of your Pulp installation, its content, and recent activity.",
  },
  "/repositories": {
    title: "Repositories",
    description: "Browse content repositories across every installed Pulp plugin.",
  },
  "/repositories/detail": {
    title: "Repository details",
    description: "Repository versions, content, and recent activity.",
  },
  "/remotes": {
    title: "Remotes",
    description: "Upstream sources that repositories can synchronize content from.",
  },
  "/remotes/new": {
    title: "Create remote",
    description: "Configure an upstream source for repositories to synchronize from.",
  },
  "/remotes/detail": {
    title: "Remote details",
    description: "Upstream configuration, sync settings, and recent operations.",
  },
  "/distributions": {
    title: "Distributions",
    description: "Published content endpoints that clients can consume from the Pulp content app.",
  },
  "/content": {
    title: "Content",
    description: "Browse every content type exposed by the installed Pulp plugins.",
  },
  "/tasks": {
    title: "Tasks",
    description: "Track synchronous and asynchronous work executed by Pulp workers.",
  },
  "/workers": {
    title: "Workers",
    description: "Pulp workers that heartbeat with the application and execute tasks.",
  },
  "/operations": {
    title: "Operations",
    description: "Maintenance tasks that keep repositories and artifact storage healthy.",
  },
  "/users": {
    title: "Users",
    description: "Accounts that can authenticate to Pulp and receive role-based permissions.",
  },
  "/groups": {
    title: "Groups",
    description: "Collections of users that can share role assignments and permissions.",
  },
  "/roles": {
    title: "Roles",
    description: "Named sets of permissions that can be assigned to users, groups, and objects.",
  },
  "/signing": {
    title: "Signing",
    description:
      "Signing services registered on the Pulp host. The Pulp REST API exposes this inventory as read-only.",
  },
  "/plugins": {
    title: "Plugins",
    description: "Inspect the Pulp plugin components reported by the running API.",
  },
  "/api-admin": {
    title: "API admin",
    description: "A schema-driven console for every endpoint exposed by this Pulp installation.",
  },
  "/settings": {
    title: "Settings",
    description: "Runtime configuration, appearance, and the current session.",
  },
};

const TASK_DETAIL_HEADER: PageHeaderInfo = {
  title: "Task details",
  description: "Execution status, timing, and result for this Pulp task.",
};

const FALLBACK_HEADER: PageHeaderInfo = {
  title: "Tangerine",
  description: "Pulp console",
};

function routePath(pathname: string): string {
  const base = getConfig().uiBasePath.replace(/\/$/, "");
  if (base && base !== "/" && (pathname === base || pathname.startsWith(`${base}/`))) {
    return pathname.slice(base.length) || "/";
  }
  return pathname;
}

function routeHeaderFor(pathname: string): PageHeaderInfo {
  const path = routePath(pathname);
  if (path.startsWith("/tasks/")) {
    return TASK_DETAIL_HEADER;
  }
  return ROUTE_HEADERS[path] ?? FALLBACK_HEADER;
}

export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [registered, setRegistered] = useState<RegisteredPageHeader | null>(null);
  const fallback = useMemo(() => routeHeaderFor(location.pathname), [location.pathname]);

  const registerPageHeader = useCallback((href: string, info: PageHeaderInfo) => {
    setRegistered((current) => {
      if (
        current?.href === href &&
        current.info.title === info.title &&
        current.info.description === info.description
      ) {
        return current;
      }
      return { href, info };
    });
  }, []);

  const header = registered?.href === location.href ? registered.info : fallback;

  const value = useMemo(() => ({ header, registerPageHeader }), [header, registerPageHeader]);

  return <PageHeaderContext.Provider value={value}>{children}</PageHeaderContext.Provider>;
}

export function usePageHeader(): PageHeaderContextValue {
  const context = useContext(PageHeaderContext);
  if (!context) {
    throw new Error("usePageHeader must be used inside PageHeaderProvider");
  }
  return context;
}

export function useRegisterPageHeader(title: string, description?: string): void {
  const location = useLocation();
  // Some routes (notably the not-found view) can render outside the app shell.
  // Registering is best-effort so those views still render without crashing.
  const registerPageHeader = useContext(PageHeaderContext)?.registerPageHeader;

  useLayoutEffect(() => {
    registerPageHeader?.(location.href, { title, description });
  }, [description, location.href, registerPageHeader, title]);
}
