import type { FilesystemExporter, PulpExporter, PulpImporter } from "@/api/types";
import { FormError } from "@/components/ui/alert";
import { CheckboxField } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { formatApiError } from "@/lib/errors";
import { isDirtyValue } from "@/lib/use-form-state";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useScopedSession } from "@/hooks/use-scoped-session";
import { Link } from "@tanstack/react-router";
import { FileCheck2, Play } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  checkPulpImport,
  runFilesystemExport,
  runPulpExport,
  runPulpImport,
} from "./import-export-api";

function TaskLink({ href }: { href: string }) {
  return (
    <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
      Task started.{" "}
      <Link
        to="/tasks/$taskId"
        params={{ taskId: href.split("/").filter(Boolean).at(-1) ?? "" }}
        className="font-medium underline underline-offset-2"
      >
        Open task
      </Link>
    </p>
  );
}

export function PulpExportRunDialog({
  exporter,
  onClose,
}: {
  exporter: PulpExporter;
  onClose: () => void;
}) {
  const { csrfToken: scopeToken } = useScopedSession();
  const [full, setFull] = useState(true);
  const [dryRun, setDryRun] = useState(false);
  const [chunkSize, setChunkSize] = useState("");
  const [versions, setVersions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [taskHref, setTaskHref] = useState<string | null>(null);
  const dirty = isDirtyValue(
    { full, dryRun, chunkSize, versions },
    { full: true, dryRun: false, chunkSize: "", versions: "" },
  );

  const run = useApiMutation<
    string,
    { full: boolean; dryRun: boolean; chunkSize: string; versions: string }
  >({
    mutationFn: ({ full, dryRun, chunkSize, versions }) =>
      runPulpExport(
        exporter.pulp_href!,
        {
          full,
          dry_run: dryRun,
          chunk_size: chunkSize.trim() || undefined,
          versions: versions.trim()
            ? versions
                .split(/[\n,]/)
                .map((item) => item.trim())
                .filter(Boolean)
            : undefined,
        },
        scopeToken,
      ),
    successMessage: "Export started",
    errorMode: "inline",
    onSuccess: setTaskHref,
    onError: (caught) => setError(formatApiError(caught, "The export could not be started.")),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    run.mutate({ full, dryRun, chunkSize, versions });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Run ${exporter.name}`}
      description="Start a Pulp export. The task continues in the background."
      className="max-w-xl"
      busy={run.isPending}
      dirty={dirty}
      footer={
        <>
          <ModalCancelButton disabled={run.isPending}>Close</ModalCancelButton>
          <SubmitButton
            form="pulp-export-run-form"
            isSubmitting={run.isPending}
            label="Start export"
            busyLabel="Starting…"
            icon={Play}
            disabled={Boolean(taskHref)}
          />
        </>
      }
    >
      <form id="pulp-export-run-form" className="space-y-4" onSubmit={handleSubmit}>
        <CheckboxField checked={full} onChange={setFull} label="Full export" />
        <CheckboxField
          checked={dryRun}
          onChange={setDryRun}
          label="Dry run"
          description="Report what would be exported without writing files."
        />
        <div className="space-y-1.5">
          <Label htmlFor="pulp-export-chunk-size">Chunk size</Label>
          <Input
            id="pulp-export-chunk-size"
            value={chunkSize}
            onChange={(event) => setChunkSize(event.target.value)}
            placeholder="e.g. 1GB"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pulp-export-versions">Explicit versions</Label>
          <Textarea
            id="pulp-export-versions"
            rows={3}
            value={versions}
            onChange={(event) => setVersions(event.target.value)}
            className="font-mono text-xs"
            placeholder="One repository-version href per line"
          />
        </div>
        {taskHref ? <TaskLink href={taskHref} /> : null}
        {error ? <FormError>{error}</FormError> : null}
      </form>
    </Modal>
  );
}

export function FilesystemExportRunDialog({
  exporter,
  onClose,
}: {
  exporter: FilesystemExporter;
  onClose: () => void;
}) {
  const { csrfToken: scopeToken } = useScopedSession();
  const [publication, setPublication] = useState("");
  const [repositoryVersion, setRepositoryVersion] = useState("");
  const [startVersion, setStartVersion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [taskHref, setTaskHref] = useState<string | null>(null);
  const dirty = isDirtyValue(
    { publication, repositoryVersion, startVersion },
    { publication: "", repositoryVersion: "", startVersion: "" },
  );

  const run = useApiMutation<
    string,
    { publication: string; repositoryVersion: string; startVersion: string }
  >({
    mutationFn: ({ publication, repositoryVersion, startVersion }) =>
      runFilesystemExport(
        exporter.pulp_href!,
        {
          publication: publication.trim() || undefined,
          repository_version: repositoryVersion.trim() || undefined,
          start_repository_version: startVersion.trim() || undefined,
        },
        scopeToken,
      ),
    successMessage: "Export started",
    errorMode: "inline",
    onSuccess: setTaskHref,
    onError: (caught) => setError(formatApiError(caught, "The export could not be started.")),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!publication.trim() && !repositoryVersion.trim()) {
      setError("Provide a publication or repository version.");
      return;
    }
    setError(null);
    run.mutate({ publication, repositoryVersion, startVersion });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Run ${exporter.name}`}
      description="Export one publication or repository version to the configured filesystem path."
      className="max-w-xl"
      busy={run.isPending}
      dirty={dirty}
      footer={
        <>
          <ModalCancelButton disabled={run.isPending}>Close</ModalCancelButton>
          <SubmitButton
            form="filesystem-export-run-form"
            isSubmitting={run.isPending}
            label="Start export"
            busyLabel="Starting…"
            icon={Play}
            disabled={Boolean(taskHref) || (!publication.trim() && !repositoryVersion.trim())}
          />
        </>
      }
    >
      <form id="filesystem-export-run-form" className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-1.5">
          <Label htmlFor="filesystem-export-publication">Publication href</Label>
          <Input
            id="filesystem-export-publication"
            value={publication}
            onChange={(event) => setPublication(event.target.value)}
            className="font-mono text-xs"
            placeholder="/pulp/api/v3/publications/file/file/…/"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filesystem-export-version">Repository version href</Label>
          <Input
            id="filesystem-export-version"
            value={repositoryVersion}
            onChange={(event) => setRepositoryVersion(event.target.value)}
            className="font-mono text-xs"
            placeholder="/pulp/api/v3/repositories/file/file/…/versions/1/"
          />
          <p className="text-meta text-zinc-400 dark:text-zinc-500">
            Provide one of publication or repository version.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filesystem-export-start">Start repository version href</Label>
          <Input
            id="filesystem-export-start"
            value={startVersion}
            onChange={(event) => setStartVersion(event.target.value)}
            className="font-mono text-xs"
            placeholder="Optional incremental start version"
          />
        </div>
        {taskHref ? <TaskLink href={taskHref} /> : null}
        {error ? <FormError>{error}</FormError> : null}
      </form>
    </Modal>
  );
}

export function PulpImportRunDialog({
  importer,
  onClose,
}: {
  importer: PulpImporter;
  onClose: () => void;
}) {
  const { csrfToken: scopeToken } = useScopedSession();
  const [path, setPath] = useState("");
  const [toc, setToc] = useState("");
  const [createRepositories, setCreateRepositories] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [taskHref, setTaskHref] = useState<string | null>(null);
  const dirty = isDirtyValue(
    { path, toc, createRepositories },
    { path: "", toc: "", createRepositories: false },
  );

  const check = useApiMutation<void, { path: string; toc: string }>({
    mutationFn: ({ path, toc }) =>
      checkPulpImport(
        {
          path: path.trim() || undefined,
          toc: toc.trim() || undefined,
        },
        scopeToken,
      ),
    onSuccess: () => setMessage("Import parameters passed validation."),
    successMessage: "Import validated",
    errorMode: "inline",
    onError: (caught) => setError(formatApiError(caught, "Import validation failed.")),
  });

  const run = useApiMutation<string, { path: string; toc: string; createRepositories: boolean }>({
    mutationFn: ({ path, toc, createRepositories }) =>
      runPulpImport(
        importer.pulp_href!,
        {
          path: path.trim(),
          toc: toc.trim() || undefined,
          create_repositories: createRepositories,
        },
        scopeToken,
      ),
    successMessage: "Import started",
    errorMode: "inline",
    onSuccess: setTaskHref,
    onError: (caught) => setError(formatApiError(caught, "The import could not be started.")),
  });

  function handleCheck() {
    setError(null);
    setMessage(null);
    check.mutate({ path, toc });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    run.mutate({ path, toc, createRepositories });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Run ${importer.name}`}
      description="Import a Pulp export file from a server-side path."
      className="max-w-xl"
      busy={run.isPending || check.isPending}
      dirty={dirty}
      footer={
        <>
          <ModalCancelButton disabled={run.isPending || check.isPending}>Close</ModalCancelButton>
          <Button
            type="button"
            variant="outline"
            onClick={handleCheck}
            disabled={run.isPending || check.isPending || (!path.trim() && !toc.trim())}
          >
            <FileCheck2 className="size-4" />
            {check.isPending ? "Checking…" : "Validate"}
          </Button>
          <SubmitButton
            form="pulp-import-run-form"
            isSubmitting={run.isPending}
            label="Start import"
            busyLabel="Starting…"
            icon={Play}
            disabled={Boolean(taskHref) || !path.trim()}
          />
        </>
      }
    >
      <form id="pulp-import-run-form" className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-1.5">
          <Label htmlFor="pulp-import-path">Export path</Label>
          <Input
            id="pulp-import-path"
            required
            value={path}
            onChange={(event) => setPath(event.target.value)}
            className="font-mono text-xs"
            placeholder="/var/lib/pulp/exports/export.tar.gz"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pulp-import-toc">Table of contents path</Label>
          <Input
            id="pulp-import-toc"
            value={toc}
            onChange={(event) => setToc(event.target.value)}
            className="font-mono text-xs"
            placeholder="Optional TOC path"
          />
        </div>
        <CheckboxField
          checked={createRepositories}
          onChange={setCreateRepositories}
          label="Create missing repositories"
        />
        {message ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
            {message}
          </p>
        ) : null}
        {taskHref ? <TaskLink href={taskHref} /> : null}
        {error ? <FormError>{error}</FormError> : null}
      </form>
    </Modal>
  );
}
