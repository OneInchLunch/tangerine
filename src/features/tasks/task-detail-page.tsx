import { useApiDataPane } from "@/components/api-data-pane";
import { TaskStateBadge } from "@/components/task-state-badge";
import { BackLink } from "@/components/ui/back-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DetailRow } from "@/components/ui/detail-row";
import { ErrorPanel } from "@/components/ui/error-panel";
import { PageHeader } from "@/components/ui/page-header";
import { useTask } from "@/hooks/queries";
import { getConfig } from "@/lib/config";
import { errorMessage } from "@/lib/errors";
import { formatDateTime, formatDuration, formatRelative } from "@/lib/format";
import { friendlyTaskName } from "@/lib/task-name";
import { isTerminalTask } from "@/lib/task-state";
import { useParams } from "@tanstack/react-router";
import {
  AlertTriangle,
  Ban,
  Braces,
  CheckCircle2,
  Clock,
  ListChecks,
  RefreshCw,
  Terminal,
} from "lucide-react";
import { useState } from "react";
import { CancelTaskModal } from "./cancel-task-modal";

export function TaskDetailPage() {
  const params = useParams({ strict: false }) as { taskId?: string };
  const taskId = params.taskId;
  const task = useTask(taskId);
  const { openApiData } = useApiDataPane();
  const [cancelOpen, setCancelOpen] = useState(false);

  if (!taskId) {
    return <ErrorPanel title="Task not found" message="No task id was provided in the URL." />;
  }

  if (task.isError) {
    return (
      <div className="space-y-4">
        <BackLink to="/tasks" label="Back to tasks" />
        <ErrorPanel
          title="Could not load this task"
          message={errorMessage(task.error)}
          onRetry={() => void task.refetch()}
        />
      </div>
    );
  }

  if (task.isLoading || !task.data) {
    return (
      <div className="space-y-4">
        <div className="h-5 w-32 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
        <div className="h-24 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-56 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-56 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
        </div>
      </div>
    );
  }

  const data = task.data;
  const running = !isTerminalTask(data.state);
  const reports = data.progress_reports ?? [];
  const errorObject =
    data.error && Object.keys(data.error as Record<string, unknown>).length ? data.error : null;

  return (
    <div className="space-y-5">
      <div>
        <BackLink to="/tasks" label="Back to tasks" className="mb-3" />
        <PageHeader
          title={friendlyTaskName(data.name)}
          description={data.logging_cid}
          actions={
            <>
              {data.pulp_href ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openApiData({ href: data.pulp_href!, title: data.name })}
                >
                  <Braces className="size-3.5" />
                  API data
                </Button>
              ) : null}
              {running ? (
                <Button variant="outline" size="sm" onClick={() => setCancelOpen(true)}>
                  <Ban className="size-3.5" />
                  Cancel task
                </Button>
              ) : null}
              <Button variant="outline" size="sm" onClick={() => void task.refetch()}>
                <RefreshCw className={task.isFetching ? "size-3.5 animate-spin" : "size-3.5"} />
                Refresh
              </Button>
            </>
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <TaskStateBadge state={data.state} />
        {running ? (
          <Badge tone="info">
            <RefreshCw className="size-3 animate-spin" />
            Polling every {Math.max(1, Math.round(getConfig().pollIntervalMs / 1000))}s
          </Badge>
        ) : (
          <Badge tone="neutral">Finished</Badge>
        )}
        <Badge tone="neutral">Duration {formatDuration(data.started_at, data.finished_at)}</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Execution timeline</CardTitle>
            <CardDescription>When the task entered each state.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <TimelineItem label="Created" value={formatDateTime(data.pulp_created)} />
              <TimelineItem label="Ready" value={formatDateTime(data.unblocked_at)} />
              <TimelineItem label="Started" value={formatDateTime(data.started_at)} />
              <TimelineItem label="Finished" value={formatDateTime(data.finished_at)} />
            </div>
            <div className="mt-5 grid gap-3 border-t border-zinc-100 pt-4 text-xs dark:border-zinc-800 sm:grid-cols-2">
              <DetailRow label="Created by" value={data.created_by ?? "System"} mono />
              <DetailRow label="Task type" value={data.name} mono />
              <DetailRow label="Task group" value={data.task_group ?? "—"} mono />
              <DetailRow label="Parent task" value={data.parent_task ?? "—"} mono />
              <DetailRow label="Worker" value={data.worker ?? "Not reported"} mono />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Progress</CardTitle>
            <CardDescription>{reports.length} progress report(s)</CardDescription>
          </CardHeader>
          <CardContent>
            {reports.length ? (
              <div className="space-y-4">
                {reports.map((report, index) => {
                  const total = report.total ?? 0;
                  const done = report.done ?? 0;
                  const percent = total > 0 ? Math.min(100, (done / total) * 100) : null;
                  return (
                    <div key={`${report.code ?? report.message ?? "report"}-${index}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-200">
                            {report.message ?? report.code ?? "Progress"}
                          </p>
                          <p className="text-meta text-zinc-500 dark:text-zinc-400">
                            {done}
                            {total ? ` / ${total}` : ""} {report.suffix ?? ""}
                          </p>
                        </div>
                        <Badge tone="neutral">{report.state ?? "unknown"}</Badge>
                      </div>
                      {percent !== null ? (
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                          <div
                            className="h-full rounded-full bg-orange-500 transition-all"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <Clock className="size-6 text-zinc-300 dark:text-zinc-600" />
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  No progress reports were emitted.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {errorObject ? (
        <Card className="border-red-200 dark:border-red-900/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-300">
              <AlertTriangle className="size-4" />
              Task error
            </CardTitle>
            <CardDescription>The task failed with the following details.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="scrollbar-thin max-h-80 overflow-auto rounded-lg bg-zinc-950 p-3 font-mono text-meta leading-5 text-red-200">
              {JSON.stringify(errorObject, null, 2)}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-500" />
              Result
            </CardTitle>
            <CardDescription>The value returned by the task.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.result === null || data.result === undefined ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">This task has no result.</p>
            ) : (
              <pre className="scrollbar-thin max-h-64 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 font-mono text-meta leading-5 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                {JSON.stringify(data.result, null, 2)}
              </pre>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="size-4 text-zinc-400" />
              Created resources
            </CardTitle>
            <CardDescription>Resources produced by this task.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.created_resources?.length ? (
              <ul className="space-y-1.5">
                {data.created_resources.map((href) => (
                  <li key={href}>
                    <button
                      type="button"
                      onClick={() => openApiData({ href, title: "Created resource" })}
                      className="flex items-center gap-1.5 break-all font-mono text-meta text-orange-600 hover:underline dark:text-orange-400"
                      aria-label={`View API data for ${href}`}
                    >
                      {href}
                      <Braces className="size-3 shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <Terminal className="size-6 text-zinc-300 dark:text-zinc-600" />
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  No resources were created.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {data.reserved_resources_record?.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Reserved resources</CardTitle>
            <CardDescription>Resources locked while this task runs.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {data.reserved_resources_record.map((resource) => (
                <Badge key={resource} tone="neutral" className="font-mono">
                  {resource}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <p className="text-center text-meta text-zinc-400 dark:text-zinc-500">
        Created {formatRelative(data.pulp_created)}. Task records are retained according to the
        server&apos;s task retention policy.
      </p>

      {cancelOpen ? <CancelTaskModal task={data} onClose={() => setCancelOpen(false)} /> : null}
    </div>
  );
}

function TimelineItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-micro font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
        {label}
      </p>
      <p className="mt-1 text-xs text-zinc-700 dark:text-zinc-300">{value}</p>
    </div>
  );
}
