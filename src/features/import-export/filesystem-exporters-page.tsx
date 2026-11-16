import type { FilesystemExporter } from "@/api/types";
import { useApiDataPane } from "@/components/api-data-pane";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import { IconButton } from "@/components/ui/icon-button";
import { ResourceList } from "@/components/resource-list";
import { formatApiError } from "@/lib/errors";
import { queryKeys } from "@/lib/query-keys";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useScopedSession } from "@/hooks/use-scoped-session";
import { Braces, FolderOutput, History, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { FilesystemExporterDialog } from "./exporter-dialogs";
import { deleteExporter, FILESYSTEM_EXPORTERS } from "./import-export-api";
import { ImportExportTabs } from "./import-export-tabs";
import { FilesystemExportRunDialog } from "./run-dialogs";
import { RunsPane } from "./runs-pane";

export function FilesystemExportersPage() {
  const { openApiData } = useApiDataPane();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<FilesystemExporter | null>(null);
  const [running, setRunning] = useState<FilesystemExporter | null>(null);
  const [deleting, setDeleting] = useState<FilesystemExporter | null>(null);
  const [runsExporter, setRunsExporter] = useState<FilesystemExporter | null>(null);

  const { csrfToken: scopeToken } = useScopedSession();
  const remove = useApiMutation<void, { href: string }>({
    mutationFn: ({ href }) => deleteExporter(href, scopeToken),
    invalidation: [queryKeys.apiList.endpoint(FILESYSTEM_EXPORTERS)],
    successMessage: "Filesystem exporter deleted",
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
      <ResourceList<FilesystemExporter>
        title="Filesystem exporters"
        description="Write a publication or repository version to a directory on the Pulp server."
        endpoint={FILESYSTEM_EXPORTERS}
        icon={FolderOutput}
        searchParam="name__contains"
        searchPlaceholder="Search exporters…"
        params={{ ordering: "name" }}
        headerActions={
          <>
            <ImportExportTabs active="/import-export/filesystem-export" />
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Create exporter
            </Button>
          </>
        }
        getRowKey={(row) => row.pulp_href ?? row.name}
        countLabel={(count) => `${count} ${count === 1 ? "exporter" : "exporters"}`}
        emptyTitle="No filesystem exporters"
        emptyDescription="Create an exporter to publish content into a filesystem path."
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
            header: "Method",
            cell: (row) => <Badge tone="neutral">{row.method}</Badge>,
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

      {createOpen ? <FilesystemExporterDialog onClose={() => setCreateOpen(false)} /> : null}
      {editing ? (
        <FilesystemExporterDialog exporter={editing} onClose={() => setEditing(null)} />
      ) : null}
      {running ? (
        <FilesystemExportRunDialog exporter={running} onClose={() => setRunning(null)} />
      ) : null}
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
          description="The exporter configuration is removed. Existing export files are untouched."
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
