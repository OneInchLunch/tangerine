import type { FilesystemExporter, PulpExporter, Repository } from "@/api/types";
import { FormError } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { MultiCombobox } from "@/components/ui/combobox";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { useLoadMoreList } from "@/hooks/queries";
import { useListSearch } from "@/hooks/use-list-search";
import { formatApiError } from "@/lib/errors";
import { queryKeys } from "@/lib/query-keys";
import { isDirtyValue } from "@/lib/use-form-state";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useAuth } from "@/auth/auth-context";
import { useScopedSession } from "@/hooks/use-scoped-session";
import { Plus, Save } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  createFilesystemExporter,
  createPulpExporter,
  FILESYSTEM_EXPORTERS,
  PULP_EXPORTERS,
  updateFilesystemExporter,
  updatePulpExporter,
} from "./import-export-api";

export function PulpExporterDialog({
  exporter,
  onClose,
}: {
  exporter?: PulpExporter;
  onClose: () => void;
}) {
  const { session } = useAuth();
  const { csrfToken: scopeToken } = useScopedSession();
  const [name, setName] = useState(exporter?.name ?? "");
  const [path, setPath] = useState(exporter?.path ?? "");
  const [repositories, setRepositories] = useState<string[]>(exporter?.repositories ?? []);
  const listSearch = useListSearch();
  const repositoryQuery = useLoadMoreList<Repository>("repositories", {
    name__contains: listSearch.queryParam,
    ordering: "name",
    ...(scopeToken
      ? {
          prn__in:
            session?.repositoryPrns && session.repositoryPrns.length > 0
              ? session.repositoryPrns.join(",")
              : "prn:none",
        }
      : {}),
  });
  const [error, setError] = useState<string | null>(null);

  const dirty = isDirtyValue(
    { name, path, repositories },
    {
      name: exporter?.name ?? "",
      path: exporter?.path ?? "",
      repositories: exporter?.repositories ?? [],
    },
  );

  const save = useApiMutation<unknown, { name: string; path: string; repositories: string[] }>({
    mutationFn: (body) =>
      exporter?.pulp_href
        ? updatePulpExporter(exporter.pulp_href, body, scopeToken)
        : createPulpExporter(body, scopeToken),
    invalidation: [queryKeys.apiList.endpoint(PULP_EXPORTERS)],
    successMessage: "Exporter saved",
    errorMode: "inline",
    onSuccess: onClose,
    onError: (caught) => setError(formatApiError(caught, "The exporter could not be saved.")),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    save.mutate({ name: name.trim(), path: path.trim(), repositories });
  }

  const repositoryOptions = (repositoryQuery.data?.results ?? []).flatMap((repository) =>
    repository.pulp_href
      ? [{ value: repository.pulp_href, label: repository.name, description: repository.pulp_href }]
      : [],
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={exporter ? `Edit ${exporter.name}` : "Create Pulp exporter"}
      description="Pulp exporters write repository metadata and content to a server-side path."
      className="max-w-2xl"
      busy={save.isPending}
      dirty={dirty}
      footer={
        <>
          <ModalCancelButton disabled={save.isPending}>Cancel</ModalCancelButton>
          <SubmitButton
            form="pulp-exporter-form"
            isSubmitting={save.isPending}
            label={exporter ? "Save changes" : "Create exporter"}
            busyLabel="Saving…"
            icon={exporter ? Save : Plus}
            disabled={!name.trim() || !path.trim()}
          />
        </>
      }
    >
      <form id="pulp-exporter-form" className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-1.5">
          <Label htmlFor="pulp-exporter-name">Name</Label>
          <Input
            id="pulp-exporter-name"
            required
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pulp-exporter-path">Server path</Label>
          <Input
            id="pulp-exporter-path"
            required
            value={path}
            onChange={(event) => setPath(event.target.value)}
            className="font-mono text-xs"
            placeholder="/var/lib/pulp/exports"
          />
          <p className="text-meta text-zinc-400 dark:text-zinc-500">
            Directory on the Pulp server where export tar.gz files are written.
          </p>
        </div>
        <MultiCombobox
          id="pulp-exporter-repositories"
          label="Repositories"
          values={repositories}
          onChange={setRepositories}
          options={repositoryOptions}
          searchValue={listSearch.input}
          onSearchChange={listSearch.setInput}
          searchPlaceholder="Search repositories…"
          isLoading={repositoryQuery.isLoading}
          isError={repositoryQuery.isError}
          onRetry={() => void repositoryQuery.refetch()}
          hasMore={repositoryQuery.hasMore}
          loadedCount={repositoryOptions.length}
          totalCount={repositoryQuery.total}
          onLoadMore={repositoryQuery.loadMore}
          emptyMessage="No repositories match this search."
        />
        {error ? <FormError>{error}</FormError> : null}
      </form>
    </Modal>
  );
}

export function FilesystemExporterDialog({
  exporter,
  onClose,
}: {
  exporter?: FilesystemExporter;
  onClose: () => void;
}) {
  const { csrfToken: scopeToken } = useScopedSession();
  const [name, setName] = useState(exporter?.name ?? "");
  const [path, setPath] = useState(exporter?.path ?? "");
  const [method, setMethod] = useState<"write" | "hardlink" | "symlink">(
    exporter?.method ?? "write",
  );
  const [error, setError] = useState<string | null>(null);

  const dirty = isDirtyValue(
    { name, path, method },
    {
      name: exporter?.name ?? "",
      path: exporter?.path ?? "",
      method: exporter?.method ?? "write",
    },
  );

  const save = useApiMutation<
    unknown,
    { name: string; path: string; method: "write" | "hardlink" | "symlink" }
  >({
    mutationFn: (body) =>
      exporter?.pulp_href
        ? updateFilesystemExporter(exporter.pulp_href, body, scopeToken)
        : createFilesystemExporter(body, scopeToken),
    invalidation: [queryKeys.apiList.endpoint(FILESYSTEM_EXPORTERS)],
    successMessage: "Filesystem exporter saved",
    errorMode: "inline",
    onSuccess: onClose,
    onError: (caught) => setError(formatApiError(caught, "The exporter could not be saved.")),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    save.mutate({ name: name.trim(), path: path.trim(), method });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={exporter ? `Edit ${exporter.name}` : "Create filesystem exporter"}
      description="Filesystem exporters write a single publication or repository version to disk."
      className="max-w-2xl"
      busy={save.isPending}
      dirty={dirty}
      footer={
        <>
          <ModalCancelButton disabled={save.isPending}>Cancel</ModalCancelButton>
          <SubmitButton
            form="filesystem-exporter-form"
            isSubmitting={save.isPending}
            label={exporter ? "Save changes" : "Create exporter"}
            busyLabel="Saving…"
            icon={exporter ? Save : Plus}
            disabled={!name.trim() || !path.trim()}
          />
        </>
      }
    >
      <form id="filesystem-exporter-form" className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-1.5">
          <Label htmlFor="filesystem-exporter-name">Name</Label>
          <Input
            id="filesystem-exporter-name"
            required
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filesystem-exporter-path">Server path</Label>
          <Input
            id="filesystem-exporter-path"
            required
            value={path}
            onChange={(event) => setPath(event.target.value)}
            className="font-mono text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filesystem-exporter-method">Method</Label>
          <Select
            id="filesystem-exporter-method"
            value={method}
            onChange={(event) => setMethod(event.target.value as "write" | "hardlink" | "symlink")}
          >
            <option value="write">Write</option>
            <option value="hardlink">Hardlink</option>
            <option value="symlink">Symlink</option>
          </Select>
        </div>
        {error ? <FormError>{error}</FormError> : null}
      </form>
    </Modal>
  );
}
