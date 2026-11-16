import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorPanel } from "@/components/ui/error-panel";
import { PageHeader } from "@/components/ui/page-header";
import { RefreshButton } from "@/components/ui/refresh-button";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useWorkers } from "@/hooks/queries";
import { errorMessage } from "@/lib/errors";
import { formatRelative } from "@/lib/format";
import { Server } from "lucide-react";

export function WorkersPage() {
  const workers = useWorkers();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Workers"
        description="Pulp workers that heartbeat with the application and execute tasks."
        actions={
          <RefreshButton isFetching={workers.isFetching} onClick={() => void workers.refetch()} />
        }
      />

      <Card>
        {workers.isError ? (
          <div className="p-4">
            <ErrorPanel
              title="Could not load workers"
              message={errorMessage(workers.error)}
              onRetry={() => void workers.refetch()}
            />
          </div>
        ) : workers.isLoading ? (
          <TableSkeleton rows={3} rowClassName="h-12" />
        ) : workers.data?.results.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Worker</TableHead>
                <TableHead>Last heartbeat</TableHead>
                <TableHead className="hidden lg:table-cell">Current task</TableHead>
                <TableHead className="hidden md:table-cell">Versions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workers.data.results.map((worker) => (
                <TableRow key={worker.pulp_href ?? worker.name}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                        <Server className="size-4" />
                      </span>
                      <div>
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">
                          {worker.name ?? "Unnamed worker"}
                        </p>
                        <p className="font-mono text-micro text-zinc-400 dark:text-zinc-500">
                          {worker.pulp_href}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-zinc-500 dark:text-zinc-400">
                    {formatRelative(worker.last_heartbeat)}
                  </TableCell>
                  <TableCell className="hidden max-w-xs truncate font-mono text-meta text-zinc-500 dark:text-zinc-400 lg:table-cell">
                    {worker.current_task || "Idle"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {worker.versions
                        ? Object.entries(worker.versions)
                            .filter(([, version]) => version)
                            .slice(0, 3)
                            .map(([component, version]) => (
                              <Badge key={component} tone="neutral" className="font-mono">
                                {component} {version}
                              </Badge>
                            ))
                        : "—"}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            icon={Server}
            title="No workers online"
            description="Start a Pulp worker service to process tasks."
          />
        )}
      </Card>
    </div>
  );
}
