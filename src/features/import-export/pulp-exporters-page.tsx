import type { PulpExporter } from "@/api/types";
import { useApiDataPane } from "@/components/api-data-pane";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import { IconButton } from "@/components/ui/icon-button";
import { ResourceList } from "@/components/resource-list";
import { formatApiError } from "@/lib/errors";
import { formatRelative } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useScopedSession } from "@/hooks/use-scoped-session";
import { Archive, Braces, History, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { PulpExporterDialog } from "./exporter-dialogs";
import { deleteExporter, PULP_EXPORTERS } from "./import-export-api";
import { ImportExportTabs } from "./import-export-tabs";
import { PulpExportRunDialog } from "./run-dialogs";
import { RunsPane } from "./runs-pane";

export function PulpExportersPage() {
  const { openApiData } = useApiDataPane();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<PulpExporter | null>(null);
  const [running, setRunning] = useState<PulpExporter | null>(null);
  const [deleting, setDeleting] = useState<PulpExporter | null>(null);
  const [runsExporter, setRunsExporter] = useState<PulpExporter | null>(null);

  const { csrfToken: scopeToken } = useScopedSession();
  const remove = useApiMutation<void, { href: string }>({
    mutationFn: ({ href }) => deleteExporter(href, scopeToken),
    invalidation: [queryKeys.apiList.endpoint(PULP_EXPORTERS)],
    successMessage: "Exporter deleted",
    errorMode: "inline",
    onSuccess: () => setDeleting(null),
  });

  function handleDelete() {
    if (!deleting?.pulp_href) {
      return;
    }
    remove.mutate({ href: deleting.pulp_href });
  }

  return (
    <>
      <ResourceList<PulpExporter>
        title="Pulp exporters"
        description="Export repository metadata and content into portable Pulp tar files."
        endpoint={PULP_EXPORTERS}
        icon={Archive}
        searchParam="name__contains"
        searchPlaceholder="Search exporters…"
        params={{ ordering: "name" }}
        headerActions={
          <>
            <ImportExportTabs active="/import-export/pulp-export" />
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Create exporter
            </Button>
          </>
        }
        getRowKey={(row) => row.pulp_href ?? row.name}
        countLabel={(count) => `${count} ${count === 1 ? "exporter" : "exporters"}`}
        emptyTitle="No Pulp exporters"
        emptyDescription="Create an exporter to archive repositories for backup or transfer."
        columns={[
          {
            header: "Exporter",
            sortKey: "name",
            cell: (row) => (
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-100">{row.name}</p>
                <p className="break-all font-mono text-micro text-zinc-400 dark:text-zinc-500">
                  {row.path}
                </p>
              </div>
            ),
          },
          {
            header: "Repositories",
            cell: (row) => <Badge tone="neutral">{row.repositories.length}</Badge>,
          },
          {
            header: "Last export",
            className: "hidden md:table-cell text-xs text-zinc-500 dark:text-zinc-400",
            cell: (row) => (row.last_export ? formatRelative(row.last_export) : "Never"),
          },
          {
            header: "",
            className: "w-36",
            cell: (row) =>
              row.pulp_href ? (
                <div className="flex items-center justify-end gap-0.5">
                  <IconButton
                    label={`Run ${row.name}`}
                    title="Run export"
                    icon={Play}
                    onClick={() => setRunning(row)}
                  />
                  <IconButton
                    label={`View runs for ${row.name}`}
                    title="View runs"
                    icon={History}
                    onClick={() => setRunsExporter(row)}
                  />
                  <IconButton
                    label={`Edit ${row.name}`}
                    icon={Pencil}
                    onClick={() => setEditing(row)}
                  />
                  <IconButton
                    label={`Delete ${row.name}`}
                    title="Delete exporter"
                    icon={Trash2}
                    tone="danger"
                    onClick={() => {
                      remove.reset();
                      setDeleting(row);
                    }}
                  />
                  <IconButton
                    label={`View API data for ${row.name}`}
                    title="View API data"
                    icon={Braces}
                    onClick={() => openApiData({ href: row.pulp_href!, title: row.name })}
                  />
                </div>
              ) : null,
          },
        ]}
      />

      {createOpen ? <PulpExporterDialog onClose={() => setCreateOpen(false)} /> : null}
      {editing ? <PulpExporterDialog exporter={editing} onClose={() => setEditing(null)} /> : null}
      {running ? <PulpExportRunDialog exporter={running} onClose={() => setRunning(null)} /> : null}
      {runsExporter?.pulp_href ? (
        <RunsPane
          href={runsExporter.pulp_href}
          title={`${runsExporter.name} export runs`}
          kind="exports"
          onClose={() => setRunsExporter(null)}
        />
      ) : null}
      {deleting ? (
        <ConfirmDeleteModal
          open
          onClose={() => {
            setDeleting(null);
            remove.reset();
          }}
          title={`Delete ${deleting.name}`}
          description="The exporter configuration is removed. Existing export files and task history are untouched."
          itemName={deleting.name}
          confirmLabel="Delete exporter"
          isDeleting={remove.isPending}
          error={
            remove.error ? formatApiError(remove.error, "The exporter could not be deleted.") : null
          }
          requireName={false}
          onConfirm={handleDelete}
        />
      ) : null}
    </>
  );
}
