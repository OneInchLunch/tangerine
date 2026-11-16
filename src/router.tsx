import { useAuth } from "@/auth/auth-context";
import { withAdminGate, withCapabilityGate } from "@/components/admin-gate";
import { AppShell } from "@/components/app-shell";
import { PageHeaderProvider } from "@/components/page-header-context";
import { SplashScreen } from "@/components/splash";
import { ErrorPanel } from "@/components/ui/error-panel";
import { PageHeader } from "@/components/ui/page-header";
import { errorMessage } from "@/lib/errors";
import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { LoginPage } from "@/features/auth/login-page";
import { NotFoundPage } from "@/features/not-found-page";
import { routerBasePath, type AppConfig } from "@/lib/config";
import {
  Navigate,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  useLocation,
} from "@tanstack/react-router";

function RootComponent() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <SplashScreen />;
  }

  const onLogin = location.pathname.endsWith("/login");
  if (!user) {
    // Render the login page directly instead of <Outlet />. During the redirect
    // the router's location can already be /login while its match tree still
    // points at the previous route, which mounts that page for one commit and
    // fires its authenticated data queries.
    return onLogin ? <LoginPage /> : <Navigate to="/login" replace />;
  }
  if (onLogin) {
    return <Navigate to="/" replace />;
  }

  return (
    <PageHeaderProvider>
      <AppShell />
    </PageHeaderProvider>
  );
}

function RouteErrorComponent({ error, reset }: { error: unknown; reset?: () => void }) {
  return (
    <div className="space-y-4 p-6">
      <PageHeader title="Something went wrong" description="The view could not be rendered." />
      <ErrorPanel
        title="Unexpected error"
        message={errorMessage(error, "An unexpected error occurred.")}
        onRetry={reset}
      />
    </div>
  );
}

const rootRoute = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFoundPage,
  errorComponent: RouteErrorComponent,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardPage,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});

const repositoriesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/repositories",
  component: lazyRouteComponent(
    () => import("@/features/repositories/repositories-page"),
    "RepositoriesPage",
  ),
});

const repositoryDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/repositories/detail",
  component: lazyRouteComponent(
    () => import("@/features/repositories/repository-detail-page"),
    "RepositoryDetailPage",
  ),
});

const remotesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/remotes",
  component: withCapabilityGate(
    "contentRead",
    lazyRouteComponent(() => import("@/features/remotes/remotes-page"), "RemotesPage"),
  ),
});

const createRemoteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/remotes/new",
  component: withCapabilityGate(
    "contentRead",
    lazyRouteComponent(() => import("@/features/remotes/create-remote-page"), "CreateRemotePage"),
  ),
});

const remoteDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/remotes/detail",
  component: withCapabilityGate(
    "contentRead",
    lazyRouteComponent(() => import("@/features/remotes/remote-detail-page"), "RemoteDetailPage"),
  ),
});

const distributionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/distributions",
  component: withCapabilityGate(
    "contentRead",
    lazyRouteComponent(
      () => import("@/features/distributions/distributions-page"),
      "DistributionsPage",
    ),
  ),
});

const publicationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/publications",
  component: withCapabilityGate(
    "contentRead",
    lazyRouteComponent(
      () => import("@/features/publications/publications-page"),
      "PublicationsPage",
    ),
  ),
});

const distributionDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/distributions/detail",
  component: withCapabilityGate(
    "contentRead",
    lazyRouteComponent(
      () => import("@/features/distributions/distribution-detail-page"),
      "DistributionDetailPage",
    ),
  ),
});

const contentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/content",
  component: withCapabilityGate(
    "contentRead",
    lazyRouteComponent(() => import("@/features/content/content-page"), "ContentPage"),
  ),
});

const tasksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tasks",
  component: withCapabilityGate(
    "tasksRead",
    lazyRouteComponent(() => import("@/features/tasks/tasks-page"), "TasksPage"),
  ),
});

const taskDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tasks/$taskId",
  component: withCapabilityGate(
    "tasksRead",
    lazyRouteComponent(() => import("@/features/tasks/task-detail-page"), "TaskDetailPage"),
  ),
});

const workersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workers",
  component: withCapabilityGate(
    "tasksRead",
    lazyRouteComponent(() => import("@/features/workers/workers-page"), "WorkersPage"),
  ),
});

const operationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/operations",
  component: withCapabilityGate(
    "operationsRead",
    lazyRouteComponent(() => import("@/features/operations/operations-page"), "OperationsPage"),
  ),
});

const pulpExportersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/import-export/pulp-export",
  component: withCapabilityGate(
    "importExportRead",
    lazyRouteComponent(
      () => import("@/features/import-export/pulp-exporters-page"),
      "PulpExportersPage",
    ),
  ),
});

const filesystemExportersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/import-export/filesystem-export",
  component: withCapabilityGate(
    "importExportRead",
    lazyRouteComponent(
      () => import("@/features/import-export/filesystem-exporters-page"),
      "FilesystemExportersPage",
    ),
  ),
});

const pulpImportersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/import-export/pulp-import",
  component: withCapabilityGate(
    "importExportRead",
    lazyRouteComponent(
      () => import("@/features/import-export/pulp-importers-page"),
      "PulpImportersPage",
    ),
  ),
});

const usersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/users",
  component: withAdminGate(
    lazyRouteComponent(() => import("@/features/users/users-page"), "UsersPage"),
  ),
});

const groupsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/groups",
  component: withAdminGate(
    lazyRouteComponent(() => import("@/features/groups/groups-page"), "GroupsPage"),
  ),
});

const rolesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/roles",
  component: withAdminGate(
    lazyRouteComponent(() => import("@/features/roles/roles-page"), "RolesPage"),
  ),
});

const signingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/signing",
  component: withCapabilityGate(
    "signingRead",
    lazyRouteComponent(() => import("@/features/signing/signing-page"), "SigningPage"),
  ),
});

const pluginsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/plugins",
  component: lazyRouteComponent(() => import("@/features/plugins/plugins-page"), "PluginsPage"),
});

const apiAdminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/api-admin",
  component: withAdminGate(
    lazyRouteComponent(() => import("@/features/api-admin/api-admin-page"), "ApiAdminPage"),
  ),
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: lazyRouteComponent(() => import("@/features/settings/settings-page"), "SettingsPage"),
});

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  loginRoute,
  repositoriesRoute,
  repositoryDetailRoute,
  remotesRoute,
  createRemoteRoute,
  remoteDetailRoute,
  distributionsRoute,
  distributionDetailRoute,
  publicationsRoute,
  contentRoute,
  tasksRoute,
  taskDetailRoute,
  workersRoute,
  operationsRoute,
  pulpExportersRoute,
  filesystemExportersRoute,
  pulpImportersRoute,
  usersRoute,
  groupsRoute,
  rolesRoute,
  signingRoute,
  pluginsRoute,
  apiAdminRoute,
  settingsRoute,
]);

export function createAppRouter(config: AppConfig) {
  return createRouter({
    routeTree,
    basepath: routerBasePath(config),
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
  });
}
