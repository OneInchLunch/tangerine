import { useAuth } from "@/auth/auth-context";
import { BrandMark } from "@/components/brand-mark";
import { ApiDataPaneProvider } from "@/components/api-data-pane";
import { TaskIndicator } from "@/components/task-indicator";
import { Toasts } from "@/components/ui/toasts";
import { usePageHeader } from "@/components/page-header-context";
import { Button } from "@/components/ui/button";
import { useStatus } from "@/hooks/queries";
import { coreVersion } from "@/lib/status";
import { isAdminUser, visibleNavigation } from "@/lib/navigation";
import { readStorage, writeStorage } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { useTheme } from "@/theme/theme-provider";
import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import {
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Sun,
  X,
} from "lucide-react";
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useState } from "react";

const QuickSwitcher = lazy(() =>
  import("@/features/quick-switcher/quick-switcher").then((module) => ({
    default: module.QuickSwitcher,
  })),
);

const SIDEBAR_COLLAPSED_KEY = "tangerine.nav.collapsed";

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link
      to="/"
      className={cn("flex items-center gap-3", collapsed && "lg:w-full lg:justify-center")}
      aria-label="Tangerine dashboard"
      title={collapsed ? "Tangerine dashboard" : undefined}
    >
      <BrandMark className="size-9 shrink-0 drop-shadow-sm" />
      <span className={cn("leading-tight", collapsed && "lg:hidden")}>
        <span className="block text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Tangerine
        </span>
        <span className="block text-meta text-zinc-500 dark:text-zinc-400">Pulp console</span>
      </span>
    </Link>
  );
}

function ConnectionStatus() {
  const { data, isLoading, isError } = useStatus();
  const onlineWorkers = data?.online_workers?.length ?? 0;
  const version = coreVersion(data);

  return (
    <div
      className="hidden items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-meta font-medium text-zinc-600 sm:flex dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
      title={version ? `pulpcore ${version}` : undefined}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          isLoading ? "animate-pulse bg-zinc-400" : isError ? "bg-red-500" : "bg-emerald-500",
        )}
      />
      {isLoading ? "Connecting…" : isError ? "Offline" : `Connected · ${onlineWorkers} workers`}
    </div>
  );
}

function RouteHeader() {
  const { header } = usePageHeader();

  return (
    <div className="min-w-0 flex-1">
      <h1
        className="truncate text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
        title={header.title}
      >
        {header.title}
      </h1>
      {header.description ? (
        <p
          className="truncate text-meta text-zinc-500 dark:text-zinc-400"
          title={header.description}
        >
          {header.description}
        </p>
      ) : null}
    </div>
  );
}

export function AppShell() {
  const { user, session, logout } = useAuth();
  const sections = useMemo(
    () =>
      visibleNavigation(
        isAdminUser(user) && !session?.capabilities?.repositoryAdmin,
        session?.capabilities,
      ),
    [user, session],
  );
  const { resolvedTheme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => readStorage(SIDEBAR_COLLAPSED_KEY) === "true",
  );

  useLayoutEffect(() => {
    document.documentElement.style.setProperty(
      "--app-sidebar-width",
      sidebarCollapsed ? "5rem" : "16rem",
    );
  }, [sidebarCollapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    writeStorage(SIDEBAR_COLLAPSED_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSwitcherOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function handleLogout() {
    setSigningOut(true);
    try {
      await logout();
      await navigate({ to: "/login", replace: true });
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="min-h-full">
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-zinc-950/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        id="app-sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-zinc-200 bg-white transition-[width,transform] duration-200 dark:border-zinc-800 dark:bg-zinc-900 lg:w-[var(--app-sidebar-width)] lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
        data-collapsed={sidebarCollapsed ? "true" : "false"}
      >
        <div className="flex h-16 items-center justify-between border-b border-zinc-200 px-4 dark:border-zinc-800">
          <Brand collapsed={sidebarCollapsed} />
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X className="size-4" />
          </Button>
        </div>

        <Button
          variant="outline"
          size="icon"
          className="absolute -right-4 top-4 z-50 hidden size-8 rounded-full p-0 lg:inline-flex"
          onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
          aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
          aria-controls="app-sidebar"
          aria-expanded={!sidebarCollapsed}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </Button>

        <nav
          className="scrollbar-thin flex-1 overflow-y-auto px-3 py-4"
          aria-label="Main navigation"
        >
          {sections.map((section, index) => (
            <div key={section.label} className="mb-5">
              {sidebarCollapsed && index > 0 ? (
                <div className="mx-2 mb-3 hidden border-t border-zinc-200 lg:block dark:border-zinc-800" />
              ) : null}
              <p
                className={cn(
                  "mb-1.5 px-2 text-micro font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500",
                  sidebarCollapsed && "lg:hidden",
                )}
              >
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    activeOptions={{ exact: item.exact }}
                    title={sidebarCollapsed ? item.label : undefined}
                    aria-label={item.label}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-label font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
                      sidebarCollapsed && "lg:justify-center lg:px-0",
                    )}
                    activeProps={{
                      className:
                        "bg-orange-50 text-orange-700 hover:bg-orange-50 hover:text-orange-700 dark:bg-orange-950/40 dark:text-orange-300 dark:hover:bg-orange-950/40 dark:hover:text-orange-300",
                    }}
                  >
                    <item.icon className="size-4 shrink-0" />
                    <span className={cn("truncate", sidebarCollapsed && "lg:hidden")}>
                      {item.label}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
          <Link
            to="/settings"
            title={sidebarCollapsed ? "Settings" : undefined}
            aria-label="Settings"
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-label font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
              sidebarCollapsed && "lg:justify-center lg:px-0",
            )}
            activeProps={{
              className:
                "bg-orange-50 text-orange-700 hover:bg-orange-50 hover:text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
            }}
          >
            <Settings className="size-4 shrink-0" />
            <span className={cn("truncate", sidebarCollapsed && "lg:hidden")}>Settings</span>
          </Link>
          <div
            className={cn(
              "mt-2 flex items-center justify-between rounded-md bg-zinc-50 px-2.5 py-2 dark:bg-zinc-800/50",
              sidebarCollapsed && "lg:justify-center lg:px-0",
            )}
            title={
              sidebarCollapsed
                ? `${user?.username ?? "Signed in"}${user?.email ? ` · ${user.email}` : ""}`
                : undefined
            }
          >
            <div className={cn("min-w-0", sidebarCollapsed && "lg:hidden")}>
              <p className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-200">
                {user?.username ?? "Signed in"}
              </p>
              <p className="truncate text-micro text-zinc-500 dark:text-zinc-400">
                {user?.email || (user?.is_staff ? "Administrator" : "Pulp user")}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              disabled={signingOut}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </aside>

      <div className="transition-[padding] duration-200 lg:pl-[var(--app-sidebar-width)]">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-zinc-200 bg-white/90 px-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            aria-controls="app-sidebar"
            aria-expanded={mobileOpen}
          >
            <Menu className="size-5" />
          </Button>

          <RouteHeader />

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSwitcherOpen(true)}
            title="Quick switcher (Ctrl K)"
            aria-label="Search pages and resources"
            aria-keyshortcuts="Control+K Meta+K"
          >
            <Search className="size-4" />
          </Button>

          <TaskIndicator />

          <ConnectionStatus />

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`}
            aria-label="Toggle theme"
          >
            {resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
        </header>

        <main className="w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <ApiDataPaneProvider>
            <Outlet />
          </ApiDataPaneProvider>
        </main>
      </div>

      {switcherOpen ? (
        <Suspense fallback={null}>
          <QuickSwitcher onClose={() => setSwitcherOpen(false)} />
        </Suspense>
      ) : null}

      <Toasts />
    </div>
  );
}
