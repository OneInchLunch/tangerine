import type { PulpExport, PulpImport } from "@/api/types";
import { BottomPane } from "@/components/ui/bottom-pane";
import { Button } from "@/components/ui/button";
import { ErrorPanel } from "@/components/ui/error-panel";
import { Spinner } from "@/components/ui/spinner";
import { useLoadMoreList } from "@/hooks/queries";
import { formatRelative } from "@/lib/format";
import { errorMessage } from "@/lib/errors";
import { Link } from "@tanstack/react-router";

export function RunsPane({
  href,
  title,
  kind,
  onClose,
}: {
  href: string;
  title: string;
  kind: "exports" | "imports";
  onClose: () => void;
}) {
  const runs = useLoadMoreList<PulpExport | PulpImport>(`${href}${kind}`);
  const rows = runs.data?.results ?? [];

  return (
    <BottomPane
      open
      onClose={onClose}
      title={title}
      description={`Past ${kind} for this ${kind === "exports" ? "exporter" : "importer"}.`}
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      {runs.isError ? (
        <ErrorPanel
          title={`Could not load ${kind}`}
          message={errorMessage(runs.error)}
          onRetry={() => void runs.refetch()}
        />
      ) : runs.isLoading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-zinc-500 dark:text-zinc-400">
          <Spinner />
          Loading {kind}…
        </div>
      ) : rows.length ? (
        <div className="space-y-2">
          {rows.map((run) => {
            const task = run.task;
            return (
              <div
                key={run.pulp_href ?? task ?? "run"}
                className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 text-xs dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium text-zinc-800 dark:text-zinc-200">
                    {kind === "exports" ? "Export" : "Import"} {formatRelative(run.pulp_created)}
                  </p>
                  <p className="truncate font-mono text-micro text-zinc-400 dark:text-zinc-500">
                    {run.pulp_href}
                  </p>
                </div>
                {task ? (
                  <Link
                    to="/tasks/$taskId"
                    params={{ taskId: task.split("/").filter(Boolean).at(-1) ?? "" }}
                    className="text-orange-600 hover:underline dark:text-orange-400"
                  >
                    View task
                  </Link>
                ) : null}
              </div>
            );
          })}
          {runs.hasMore ? (
            <Button variant="outline" size="sm" onClick={runs.loadMore} disabled={runs.isFetching}>
              {runs.isFetching ? "Loading…" : "Load more"}
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-zinc-200 p-4 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          No {kind} yet.
        </p>
      )}
    </BottomPane>
  );
}
