import { apiRequest } from "@/api/client";
import type { AsyncOperationResponse, TaskSchedule } from "@/api/types";
import { useApiDataPane } from "@/components/api-data-pane";
import { FormError, InlineAlert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconButton } from "@/components/ui/icon-button";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { ResourceList } from "@/components/resource-list";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/errors";
import { formatRelative } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Braces,
  Clock,
  Ellipsis,
  Hammer,
  Database,
  HardDrive,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

interface Operation {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  endpoint: string;
  body: Record<string, unknown>;
  confirmLabel: string;
  tone: "brand" | "danger";
  note?: string;
}

const operations: Operation[] = [
  {
    id: "orphans",
    title: "Clean up orphaned content",
    description:
      "Delete content and artifacts that are not referenced by any repository version or publication.",
    icon: Trash2,
    endpoint: "orphans/cleanup/",
    body: {},
    confirmLabel: "Run orphan cleanup",
    tone: "danger",
    note: "Uses the server's configured ORPHAN_PROTECTION_TIME. This action cannot be undone.",
  },
  {
    id: "repair",
    title: "Repair artifact storage",
    description:
      "Check stored artifacts for missing or corrupted files and attempt to redownload them.",
    icon: Hammer,
    endpoint: "repair/",
    body: { verify_checksums: true },
    confirmLabel: "Start repair",
    tone: "brand",
    note: "Checksums are verified for every artifact. Large installations may take a while.",
  },
  {
    id: "reclaim",
    title: "Reclaim repository space",
    description:
      "Remove unreferenced repository versions and content from storage for all repositories.",
    icon: HardDrive,
    endpoint: "repositories/reclaim_space/",
    body: { repo_hrefs: ["*"] },
    confirmLabel: "Reclaim space",
    tone: "brand",
    note: "Runs against every repository. Repository versions protected by a retain policy are preserved.",
  },
];

function OperationModal({
  operation,
  onClose,
  onStarted,
}: {
  operation: Operation | null;
  onClose: () => void;
  onStarted: (task: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const start = useApiMutation<AsyncOperationResponse, Operation>({
    mutationFn: (operation) =>
      apiRequest<AsyncOperationResponse>(operation.endpoint, {
        method: "POST",
        body: operation.body,
      }),
    invalidation: [queryKeys.tasks.all, queryKeys.status],
    successMessage: (_response, operation) => `${operation.title} started`,
    errorMode: "inline",
    onSuccess: (response) => {
      onStarted(response.task);
      onClose();
    },
    onError: (caught) => setError(errorMessage(caught, "The operation could not be started.")),
  });

  function run() {
    if (!operation) {
      return;
    }
    setError(null);
    start.mutate(operation);
  }

  return (
    <Modal
      open={operation !== null}
      onClose={onClose}
      title={operation?.title ?? "Run operation"}
      description={operation?.description}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={start.isPending}>
            Cancel
          </Button>
          <Button
            variant={operation?.tone === "danger" ? "danger" : "primary"}
            onClick={run}
            disabled={start.isPending}
          >
            {start.isPending ? (
              <Spinner />
            ) : operation?.icon ? (
              <operation.icon className="size-4" />
            ) : null}
            {start.isPending ? "Starting…" : operation?.confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
        <p>Pulp will start an asynchronous task and return a task href immediately.</p>
        {operation?.note ? (
          <InlineAlert tone="warning" compact>
            {operation.note}
          </InlineAlert>
        ) : null}
        {error ? <FormError>{error}</FormError> : null}
      </div>
    </Modal>
  );
}

export function OperationsPage() {
  const { openApiData } = useApiDataPane();
  const [active, setActive] = useState<Operation | null>(null);
  const [lastTask, setLastTask] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations"
        description="Maintenance tasks that keep repositories and artifact storage healthy."
      />

      {lastTask ? (
        <InlineAlert
          tone="success"
          title="Operation started successfully."
          className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="hidden truncate font-mono text-meta opacity-70 sm:inline">
            {lastTask}
          </span>
          <Link
            to="/tasks"
            className="inline-flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline"
          >
            View tasks
            <ArrowRight className="size-3.5" />
          </Link>
        </InlineAlert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {operations.map((operation) => (
          <Card key={operation.id} className="flex flex-col">
            <CardHeader>
              <div
                className={cn(
                  "mb-2 flex size-10 items-center justify-center rounded-lg",
                  operation.tone === "danger"
                    ? "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400"
                    : "bg-orange-50 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400",
                )}
              >
                <operation.icon className="size-5" />
              </div>
              <CardTitle>{operation.title}</CardTitle>
              <CardDescription>{operation.description}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              <Button
                variant={operation.tone === "danger" ? "danger" : "outline"}
                size="sm"
                className="w-full"
                onClick={() => setActive(operation)}
              >
                {operation.confirmLabel}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div>
        <ResourceList<TaskSchedule>
          title="Task schedules"
          description="Recurring maintenance work registered by Pulp and its plugins."
          headerMode="section"
          endpoint="task-schedules"
          icon={Clock}
          params={{ ordering: "name" }}
          getRowKey={(row) => row.pulp_href ?? row.name}
          countLabel={(count) => `${count} ${count === 1 ? "schedule" : "schedules"}`}
          emptyTitle="No task schedules"
          emptyDescription="Recurring tasks created by plugins will appear here."
          columns={[
            {
              header: "Schedule",
              cell: (row) => (
                <div className="flex items-center gap-2.5">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400">
                    <Clock className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                      {row.name}
                    </p>
                    <p className="truncate font-mono text-micro text-zinc-400 dark:text-zinc-500">
                      {row.task_name}
                    </p>
                  </div>
                </div>
              ),
            },
            {
              header: "Interval",
              className: "hidden sm:table-cell",
              cell: (row) => <Badge tone="neutral">{row.dispatch_interval ?? "—"}</Badge>,
            },
            {
              header: "Next run",
              className: "hidden md:table-cell text-xs text-zinc-500 dark:text-zinc-400",
              cell: (row) => formatRelative(row.next_dispatch),
            },
            {
              header: "Last task",
              className: "hidden lg:table-cell",
              cell: (row) =>
                row.last_task ? (
                  <button
                    type="button"
                    onClick={() =>
                      openApiData({
                        href: row.last_task!,
                        title: `${row.name} task`,
                      })
                    }
                    className="inline-flex items-center gap-1 font-mono text-meta text-orange-600 hover:underline dark:text-orange-400"
                    aria-label={`View API data for ${row.name} task`}
                  >
                    View
                    <Braces className="size-3" />
                  </button>
                ) : (
                  <span className="text-xs text-zinc-400">Never</span>
                ),
            },
            {
              header: "",
              className: "w-10",
              cell: (row) =>
                row.pulp_href ? (
                  <IconButton
                    label={`View API data for ${row.name}`}
                    title="View API data"
                    icon={Braces}
                    onClick={() => openApiData({ href: row.pulp_href!, title: row.name })}
                  />
                ) : null,
            },
          ]}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="size-4 text-zinc-400" />
              API root
            </CardTitle>
            <CardDescription>
              Every plugin registers its endpoints under the Pulp API root.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <button
              type="button"
              onClick={() => openApiData({ href: "/", title: "Pulp API root" })}
              className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 hover:underline dark:text-orange-400"
            >
              View API root
              <Braces className="size-3" />
            </button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ellipsis className="size-4 text-zinc-400" />
              More operations
            </CardTitle>
            <CardDescription>
              Use the API admin console for exports, imports, and custom plugin operations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              to="/api-admin"
              className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 hover:underline dark:text-orange-400"
            >
              Open API admin
              <ArrowRight className="size-3" />
            </Link>
          </CardContent>
        </Card>
      </div>

      <OperationModal
        operation={active}
        onClose={() => setActive(null)}
        onStarted={(task) => setLastTask(task)}
      />
    </div>
  );
}
