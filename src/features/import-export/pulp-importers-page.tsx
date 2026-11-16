import type { PulpImporter } from "@/api/types";
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
import { Braces, History, Pencil, Play, Plus, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { deleteImporter, PULP_IMPORTERS } from "./import-export-api";
import { ImportExportTabs } from "./import-export-tabs";
import { PulpImporterDialog } from "./importer-dialog";
import { PulpImportRunDialog } from "./run-dialogs";
import { RunsPane } from "./runs-pane";

export function PulpImportersPage() {
  const { openApiData } = useApiDataPane();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<PulpImporter | null>(null);
  const [running, setRunning] = useState<PulpImporter | null>(null);
  const [deleting, setDeleting] = useState<PulpImporter | null>(null);
  const [runsImporter, setRunsImporter] = useState<PulpImporter | null>(null);

  const { csrfToken: scopeToken } = useScopedSession();
  const remove = useApiMutation<void, { href: string }>({
    mutationFn: ({ href }) => deleteImporter(href, scopeToken),
    invalidation: [queryKeys.apiList.endpoint(PULP_IMPORTERS)],
    successMessage: "Importer deleted",
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
      <ResourceList<PulpImporter>
        title="Pulp importers"
        description="Import repositories and content from Pulp export files."
        endpoint={PULP_IMPORTERS}
        icon={Upload}
        searchParam="name__contains"
        searchPlaceholder="Search importers…"
        params={{ ordering: "name" }}
        headerActions={
          <>
            <ImportExportTabs active="/import-export/pulp-import" />
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Create importer
            </Button>
          </>
        }
        getRowKey={(row) => row.pulp_href ?? row.name}
        countLabel={(count) => `${count} ${count === 1 ? "importer" : "importers"}`}
        emptyTitle="No Pulp importers"
        emptyDescription="Create an importer to restore repositories from an export file."
        columns={[
          {
            header: "Importer",
            sortKey: "name",
            cell: (row) => (
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-100">{row.name}</p>
                <p className="break-all font-mono text-micro text-zinc-400 dark:text-zinc-500">
                  {row.pulp_href}
                </p>
              </div>
            ),
          },
          {
            header: "Repository mapping",
            cell: (row) => (
              <Badge tone="neutral">{Object.keys(row.repo_mapping ?? {}).length} mappings</Badge>
            ),
          },
          {
            header: "",
            className: "w-36",
            cell: (row) =>
              row.pulp_href ? (
                <div className="flex items-center justify-end gap-0.5">
                  <IconButton
                    label={`Run ${row.name}`}
                    title="Run import"
                    icon={Play}
                    onClick={() => setRunning(row)}
                  />
                  <IconButton
                    label={`View runs for ${row.name}`}
                    title="View runs"
                    icon={History}
                    onClick={() => setRunsImporter(row)}
                  />
                  <IconButton
                    label={`Edit ${row.name}`}
                    icon={Pencil}
                    onClick={() => setEditing(row)}
                  />
                  <IconButton
                    label={`Delete ${row.name}`}
                    title="Delete importer"
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

      {createOpen ? <PulpImporterDialog onClose={() => setCreateOpen(false)} /> : null}
      {editing ? <PulpImporterDialog importer={editing} onClose={() => setEditing(null)} /> : null}
      {running ? <PulpImportRunDialog importer={running} onClose={() => setRunning(null)} /> : null}
      {runsImporter?.pulp_href ? (
        <RunsPane
          href={runsImporter.pulp_href}
          title={`${runsImporter.name} import runs`}
          kind="imports"
          onClose={() => setRunsImporter(null)}
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
          description="The importer configuration is removed. Existing imported content is untouched."
          itemName={deleting.name}
          confirmLabel="Delete importer"
          isDeleting={remove.isPending}
          error={
            remove.error ? formatApiError(remove.error, "The importer could not be deleted.") : null
          }
          requireName={false}
          onConfirm={handleDelete}
        />
      ) : null}
    </>
  );
}
