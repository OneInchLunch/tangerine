import { TaskStateBadge } from "@/components/task-state-badge";
import { resourceIdFromHref } from "@/api/resources";
import type { Task } from "@/api/types";
import { useApiDataPane } from "@/components/api-data-pane";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorPanel } from "@/components/ui/error-panel";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { RefreshButton } from "@/components/ui/refresh-button";
import { Select } from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  SortableTableHead,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTasks } from "@/hooks/queries";
import { useListUrlState } from "@/hooks/use-list-url-state";
import { formatDateTime, formatDuration, formatRelative } from "@/lib/format";
import { encodeListReturn } from "@/lib/list-url-state";
import { friendlyTaskName } from "@/lib/task-name";
import { isTerminalTask, TASK_STATE_FILTERS } from "@/lib/task-state";
import { Link, useSearch } from "@tanstack/react-router";
import { Ban, Braces, ListChecks, Search } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { CancelTaskModal } from "./cancel-task-modal";

export function TasksPage() {
  const { openApiData } = useApiDataPane();
  const routeSearch = useSearch({ strict: false }) as Record<string, unknown>;
  const returnSearch = encodeListReturn(routeSearch);
  const {
    page,
    pageSize,
    query: search,
    filter: state,
    ordering,
    setPage,
    setPageSize,
    setQuery,
    setFilter,
    setSort,
  } = useListUrlState();
  const [cancellingTask, setCancellingTask] = useState<Task | null>(null);
  const [searchInput, setSearchInput] = useState(search);

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  const tasks = useTasks({
    limit: pageSize,
    offset: page * pageSize,
    ordering: ordering || undefined,
    state: state || undefined,
    name__contains: search || undefined,
  });

  const total = tasks.data?.count ?? 0;

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(searchInput.trim());
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tasks"
        description="Track synchronous and asynchronous work executed by Pulp workers."
        actions={
          <RefreshButton isFetching={tasks.isFetching} onClick={() => void tasks.refetch()} />
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-zinc-200 p-4 dark:border-zinc-800 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <form className="relative w-full sm:w-72" onSubmit={submitSearch}>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search task names…"
                className="pl-9"
                aria-label="Search tasks"
              />
            </form>
            <Select
              value={state}
              onChange={(event) => setFilter(event.target.value)}
              className="w-auto"
              aria-label="Filter by task state"
            >
              {TASK_STATE_FILTERS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {tasks.isLoading ? "Loading…" : `${total} ${total === 1 ? "task" : "tasks"}`}
            {tasks.isFetching && !tasks.isLoading ? " · updating" : ""}
          </p>
        </div>

        {tasks.isError ? (
          <div className="p-4">
            <ErrorPanel
              title="Could not load tasks"
              message={tasks.error instanceof Error ? tasks.error.message : String(tasks.error)}
              onRetry={() => void tasks.refetch()}
            />
          </div>
        ) : tasks.isLoading ? (
          <TableSkeleton rows={6} />
        ) : tasks.data?.results.length ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    label="Task"
                    sortKey="name"
                    ordering={ordering}
                    onSort={setSort}
                  />
                  <TableHead>State</TableHead>
                  <SortableTableHead
                    label="Started"
                    sortKey="started_at"
                    ordering={ordering}
                    onSort={setSort}
                    className="hidden lg:table-cell"
                  />
                  <TableHead className="hidden md:table-cell">Finished</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.data.results.map((task) => (
                  <TableRow key={task.pulp_href ?? task.logging_cid}>
                    <TableCell className="max-w-[22rem] 3xl:max-w-[34rem]">
                      {task.pulp_href ? (
                        <Link
                          to="/tasks/$taskId"
                          params={{ taskId: resourceIdFromHref(task.pulp_href) }}
                          search={returnSearch ? ({ from: returnSearch } as never) : undefined}
                          title={task.name}
                          className="block truncate font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:text-orange-600 hover:decoration-orange-500 dark:text-zinc-100 dark:decoration-zinc-600 dark:hover:text-orange-400"
                        >
                          {friendlyTaskName(task.name)}
                        </Link>
                      ) : (
                        <p
                          className="truncate font-medium text-zinc-900 dark:text-zinc-100"
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
                    <TableCell className="hidden text-xs text-zinc-500 dark:text-zinc-400 lg:table-cell">
                      {task.started_at ? formatDateTime(task.started_at) : "—"}
                    </TableCell>
                    <TableCell className="hidden text-xs text-zinc-500 dark:text-zinc-400 md:table-cell">
                      {task.finished_at ? formatRelative(task.finished_at) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs text-zinc-500 dark:text-zinc-400">
                      {formatDuration(task.started_at, task.finished_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-0.5">
                        {task.pulp_href && !isTerminalTask(task.state) ? (
                          <IconButton
                            label={`Cancel ${friendlyTaskName(task.name)}`}
                            title="Cancel task"
                            icon={Ban}
                            tone="danger"
                            onClick={() => setCancellingTask(task)}
                          />
                        ) : null}
                        {task.pulp_href ? (
                          <IconButton
                            label={`View API data for ${friendlyTaskName(task.name)}`}
                            title="View API data"
                            icon={Braces}
                            onClick={() =>
                              openApiData({
                                href: task.pulp_href!,
                                title: task.name,
                              })
                            }
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              hasNext={Boolean(tasks.data.next)}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </>
        ) : (
          <EmptyState
            icon={ListChecks}
            title="No tasks found"
            description="Tasks appear here after you sync, publish, upload, or run an operation."
          />
        )}
      </Card>

      {cancellingTask ? (
        <CancelTaskModal task={cancellingTask} onClose={() => setCancellingTask(null)} />
      ) : null}
    </div>
  );
}
