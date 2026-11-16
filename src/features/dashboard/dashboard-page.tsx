import { TaskStateBadge } from "@/components/task-state-badge";
import { resourceIdFromHref } from "@/api/resources";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorPanel } from "@/components/ui/error-panel";
import { PageHeader } from "@/components/ui/page-header";
import { RefreshButton } from "@/components/ui/refresh-button";
import { TableSkeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCount, useRecentTasks, useStatus } from "@/hooks/queries";
import { useAuth } from "@/auth/auth-context";
import { entityIcons } from "@/lib/icons";
import { errorMessage } from "@/lib/errors";
import { formatBytes, formatDuration, formatRelative } from "@/lib/format";
import { coreVersion } from "@/lib/status";
import { friendlyTaskName } from "@/lib/task-name";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  Blocks,
  CheckCircle2,
  Database,
  HardDrive,
  ListChecks,
  XCircle,
} from "lucide-react";

function HealthRow({
  label,
  ok,
  detail,
  loading,
}: {
  label: string;
  ok: boolean | null;
  detail: string;
  loading?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-full",
            loading
              ? "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
              : ok
                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
                : "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400",
          )}
        >
          {loading ? (
            <Activity className="size-3.5 animate-pulse" />
          ) : ok ? (
            <CheckCircle2 className="size-3.5" />
          ) : (
            <XCircle className="size-3.5" />
          )}
        </span>
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      </div>
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{detail}</span>
    </div>
  );
}

export function DashboardPage() {
  const { session } = useAuth();
  const tasksRead = session?.capabilities?.tasksRead !== false;
  const status = useStatus();
  const repositories = useCount("repositories");
  const remotes = useCount("remotes");
  const distributions = useCount("distributions");
  const tasks = useRecentTasks(8, { enabled: tasksRead });

  const storage = status.data?.storage;
  const storagePercent =
    storage?.total && storage.used ? Math.min(100, (storage.used / storage.total) * 100) : null;

  const isRefreshing =
    status.isFetching ||
    repositories.isFetching ||
    remotes.isFetching ||
    distributions.isFetching ||
    tasks.isFetching;

  function refreshAll() {
    void status.refetch();
    void repositories.refetch();
    void remotes.refetch();
    void distributions.refetch();
    void tasks.refetch();
  }

  const version = coreVersion(status.data);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="A live view of your Pulp installation, its content, and recent activity."
        actions={<RefreshButton isFetching={isRefreshing} onClick={refreshAll} />}
      />

      {status.isError ? (
        <ErrorPanel
          title="Unable to reach the Pulp API"
          message={errorMessage(status.error)}
          onRetry={() => void status.refetch()}
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Link to="/repositories" aria-label="Repositories overview" className="block rounded-xl">
          <StatCard
            label="Repositories"
            value={repositories.data ?? "—"}
            icon={entityIcons.repositories}
            hint="Across all installed plugins"
            className="h-full transition-colors hover:border-orange-300 dark:hover:border-orange-900/70"
          />
        </Link>
        <Link to="/remotes" aria-label="Remotes overview" className="block rounded-xl">
          <StatCard
            label="Remotes"
            value={remotes.data ?? "—"}
            icon={entityIcons.remotes}
            hint="Content sources"
            tone="info"
            className="h-full transition-colors hover:border-orange-300 dark:hover:border-orange-900/70"
          />
        </Link>
        <Link to="/distributions" aria-label="Distributions overview" className="block rounded-xl">
          <StatCard
            label="Distributions"
            value={distributions.data ?? "—"}
            icon={entityIcons.distributions}
            hint="Published content endpoints"
            tone="success"
            className="h-full transition-colors hover:border-orange-300 dark:hover:border-orange-900/70"
          />
        </Link>
        <Link to="/workers" aria-label="Online workers overview" className="block rounded-xl">
          <StatCard
            label="Online workers"
            value={status.data?.online_workers?.length ?? "—"}
            icon={entityIcons.workers}
            hint={
              status.data?.online_content_apps?.length
                ? `${status.data.online_content_apps.length} content apps online`
                : "Task execution"
            }
            tone="neutral"
            className="h-full transition-colors hover:border-orange-300 dark:hover:border-orange-900/70"
          />
        </Link>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent tasks</CardTitle>
              <CardDescription>Latest work across the installation</CardDescription>
            </div>
            <Link
              to="/tasks"
              className="inline-flex h-8 items-center gap-1 rounded-md px-3 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              View all
              <ArrowRight className="size-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {!tasksRead ? (
              <p className="p-5 text-sm text-zinc-500 dark:text-zinc-400">
                Task history is not available for repository-scoped access.
              </p>
            ) : tasks.isLoading ? (
              <TableSkeleton rows={4} rowClassName="h-10" />
            ) : tasks.isError ? (
              <div className="p-5">
                <ErrorPanel
                  title="Could not load tasks"
                  message={errorMessage(tasks.error)}
                  onRetry={() => void tasks.refetch()}
                />
              </div>
            ) : tasks.data?.results.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Task</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead className="hidden md:table-cell">Started</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.data.results.map((task) => (
                    <TableRow key={task.pulp_href ?? `${task.name}-${task.pulp_created}`}>
                      <TableCell className="max-w-[18rem] 3xl:max-w-[28rem]">
                        {task.pulp_href ? (
                          <Link
                            to="/tasks/$taskId"
                            params={{ taskId: resourceIdFromHref(task.pulp_href) }}
                            title={task.name}
                            className="block truncate font-medium text-zinc-800 underline decoration-zinc-300 underline-offset-2 hover:text-orange-600 hover:decoration-orange-500 dark:text-zinc-200 dark:decoration-zinc-600 dark:hover:text-orange-400"
                          >
                            {friendlyTaskName(task.name)}
                          </Link>
                        ) : (
                          <p
                            className="truncate font-medium text-zinc-800 dark:text-zinc-200"
                            title={task.name}
                          >
                            {friendlyTaskName(task.name)}
                          </p>
                        )}
                        <p
                          className="truncate font-mono text-micro text-zinc-400 dark:text-zinc-500"
                          title={`${task.name} · ${task.logging_cid}`}
                        >
                          {task.name}
                          <span className="text-zinc-300 dark:text-zinc-600"> · </span>
                          {task.logging_cid}
                        </p>
                      </TableCell>
                      <TableCell>
                        <TaskStateBadge state={task.state} />
                      </TableCell>
                      <TableCell className="hidden text-xs text-zinc-500 dark:text-zinc-400 md:table-cell">
                        {formatRelative(task.started_at ?? task.pulp_created)}
                      </TableCell>
                      <TableCell className="text-right text-xs text-zinc-500 dark:text-zinc-400">
                        {formatDuration(task.started_at, task.finished_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                icon={ListChecks}
                title="No tasks yet"
                description="Syncs, publishes, uploads, and other operations will appear here."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System health</CardTitle>
            <CardDescription>
              {version ? `pulpcore ${version}` : "Live service checks"}
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-zinc-100 pt-0 dark:divide-zinc-800">
            <HealthRow
              label="REST API"
              ok={status.isSuccess ? true : status.isError ? false : null}
              detail={status.isSuccess ? "Reachable" : status.isError ? "Unavailable" : "Checking…"}
              loading={status.isLoading}
            />
            <HealthRow
              label="Database"
              ok={status.data?.database_connection.connected ?? null}
              detail={
                status.data?.database_connection.connected === undefined
                  ? "Unknown"
                  : status.data.database_connection.connected
                    ? "Connected"
                    : "Disconnected"
              }
              loading={status.isLoading}
            />
            <HealthRow
              label="Redis"
              ok={status.data?.redis_connection?.connected ?? null}
              detail={
                status.data?.redis_connection?.connected === undefined
                  ? "Not configured"
                  : status.data.redis_connection.connected
                    ? "Connected"
                    : "Disconnected"
              }
              loading={status.isLoading}
            />
            <HealthRow
              label="Workers"
              ok={status.data ? (status.data.online_workers?.length ?? 0) > 0 : null}
              detail={`${status.data?.online_workers?.length ?? 0} online`}
              loading={status.isLoading}
            />
            <HealthRow
              label="Content apps"
              ok={status.data ? (status.data.online_content_apps?.length ?? 0) > 0 : null}
              detail={`${status.data?.online_content_apps?.length ?? 0} online`}
              loading={status.isLoading}
            />
            <div className="pt-3">
              <Link
                to="/workers"
                className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Inspect workers
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Storage</CardTitle>
              <CardDescription>Filesystem usage reported by Pulp</CardDescription>
            </div>
            <HardDrive className="size-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            {storage?.total ? (
              <div>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                      {formatBytes(storage.used)}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      of {formatBytes(storage.total)} used
                    </p>
                  </div>
                  <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                    {storagePercent?.toFixed(1)}%
                  </span>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      (storagePercent ?? 0) > 85 ? "bg-red-500" : "bg-orange-500",
                    )}
                    style={{ width: `${storagePercent ?? 0}%` }}
                  />
                </div>
                <p className="mt-2 text-meta text-zinc-400 dark:text-zinc-500">
                  {formatBytes(storage.free)} free
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-zinc-200 p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <Database className="size-5 shrink-0 text-zinc-400" />
                Storage metrics are not available for this backend.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Components</CardTitle>
              <CardDescription>Installed Pulp services and plugins</CardDescription>
            </div>
            <Blocks className="size-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            {status.data?.versions?.length ? (
              <div className="flex flex-wrap gap-2">
                {status.data.versions.map((item) => (
                  <Badge key={item.component} tone="neutral" className="font-mono">
                    {item.component} {item.version}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No version information reported.
              </p>
            )}
            {status.data?.content_settings?.content_origin ? (
              <p className="mt-4 break-all text-meta text-zinc-400 dark:text-zinc-500">
                Content origin:{" "}
                <span className="font-mono">{status.data.content_settings.content_origin}</span>
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
