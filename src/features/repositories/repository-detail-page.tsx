import {
  repositoryTypeFromHref,
  repositoryVersionNumber,
  resourceIdFromHref,
} from "@/api/resources";
import type { Publication, SigningService } from "@/api/types";
import { useApiDataPane } from "@/components/api-data-pane";
import { Badge } from "@/components/ui/badge";
import { BackLink } from "@/components/ui/back-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import { DetailRow } from "@/components/ui/detail-row";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorPanel } from "@/components/ui/error-panel";
import { FormError, InlineAlert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { RefreshButton } from "@/components/ui/refresh-button";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ObjectRolesCard } from "@/features/rbac/object-roles-card";
import { ContainerTagsCard } from "./container-tags-card";
import { EditRepositoryModal } from "./edit-repository-modal";
import { RepositoryDistributionsCard } from "./repository-distributions-card";
import { RepositoryVersionPanel } from "./repository-version-panel";
import { hasOsvConfig } from "./osv-config-fields";
import { PublishPublicationDialog } from "@/features/publications/publish-publication-dialog";
import { contentSummaryItems, contentSummaryTotal } from "./repository-version-utils";
import {
  useApiList,
  useRemote,
  useRepository,
  useRepositoryVersions,
  useTask,
} from "@/hooks/queries";
import { errorMessage } from "@/lib/errors";
import { useRepositoryActions } from "./use-repository-actions";
import { useAuth } from "@/auth/auth-context";
import { formatDateTime, formatRelative, truncate } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { isTerminalTask } from "@/lib/task-state";
import {
  repositorySupportsAutopublishFromHref,
  repositorySupportsPublicationsFromHref,
  repositoryTypeLabelForType,
} from "@/lib/repositories";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  ArrowDownToLine,
  ArrowRight,
  Braces,
  Camera,
  CheckCircle2,
  Hash,
  Layers,
  PackageCheck,
  Pencil,
  Power,
  PowerOff,
  ScanSearch,
  Tag,
  Trash2,
} from "lucide-react";
import { entityIcons } from "@/lib/icons";
import { useEffect, useState } from "react";

export function RepositoryDetailPage() {
  const search = useSearch({ strict: false }) as { href?: string };
  const href = search.href;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { openApiData } = useApiDataPane();
  const repository = useRepository(href);
  const remote = useRemote(repository.data?.remote ?? undefined);
  const [versionsLimit, setVersionsLimit] = useState(25);
  const versions = useRepositoryVersions(href, { limit: versionsLimit });
  const repositoryHref = repository.data?.pulp_href;
  const supportsAutopublish = repositorySupportsAutopublishFromHref(repositoryHref);
  const supportsPublications = repositorySupportsPublicationsFromHref(repositoryHref);
  const repositoryType = repository.data
    ? repositoryTypeFromHref(repository.data.pulp_href)
    : undefined;
  const metadataSigningHref =
    typeof repository.data?.metadata_signing_service === "string"
      ? repository.data.metadata_signing_service
      : "";
  const signingServices = useApiList<SigningService>(
    "signing-services",
    { ordering: "name" },
    { enabled: repositoryType === "rpm" && Boolean(metadataSigningHref) },
  );
  const metadataSigningName = (signingServices.data?.results ?? []).find(
    (service) => service.pulp_href === metadataSigningHref,
  )?.name;
  const publications = useApiList<Publication>(
    "publications",
    {
      repository: repositoryHref ?? "",
      limit: 1,
      ordering: "-pulp_created",
    },
    {
      enabled: Boolean(supportsPublications && repositoryHref),
    },
  );
  const isContainer = repository.data
    ? repositoryTypeFromHref(repository.data.pulp_href) === "container"
    : false;
  const latestVersionHref = repository.data?.latest_version_href;

  const [editOpen, setEditOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [syncTask, setSyncTask] = useState<string | null>(null);
  const [scanTask, setScanTask] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedVersionHref, setSelectedVersionHref] = useState<string | null>(null);
  const syncTaskState = useTask(syncTask ? resourceIdFromHref(syncTask) : undefined).data?.state;

  useEffect(() => {
    setVersionsLimit(25);
    setSelectedVersionHref(null);
  }, [href]);

  useEffect(() => {
    if (!href || !syncTaskState || !isTerminalTask(syncTaskState)) {
      return;
    }
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.repository(href) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.repositories.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.repositoryVersions(href) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.repositoryContentAll }),
      queryClient.invalidateQueries({ queryKey: queryKeys.repositoryDistributions(href) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.apiList.endpoint("publications") }),
    ]);
  }, [href, queryClient, syncTaskState]);

  const { session, refresh } = useAuth();
  const canWrite = session?.capabilities?.repositoryWrite !== false;
  const { scan, sync, autopublish, remove } = useRepositoryActions({
    href,
    onScanTask: setScanTask,
    onSyncTask: (task) => {
      setSyncTask(task);
      setSyncOpen(false);
    },
    onDeleted: async () => {
      setDeleteOpen(false);
      await refresh();
      await navigate({ to: "/repositories" });
    },
    onError: setError,
  });

  if (!href) {
    return (
      <div className="space-y-4">
        <BackLink to="/repositories" label="Back to repositories" />
        <ErrorPanel
          title="Repository not specified"
          message="Open a repository from the repositories list to view its details."
        />
      </div>
    );
  }

  if (repository.isError) {
    return (
      <div className="space-y-4">
        <BackLink to="/repositories" label="Back to repositories" />
        <ErrorPanel
          title="Could not load this repository"
          message={errorMessage(repository.error)}
          onRetry={() => void repository.refetch()}
        />
      </div>
    );
  }

  if (repository.isLoading || !repository.data) {
    return (
      <div className="space-y-4">
        <div className="h-5 w-40 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
        <div className="h-32 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
        <div className="h-64 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
      </div>
    );
  }

  const data = repository.data;
  const repoType = repositoryTypeFromHref(data.pulp_href);
  const repoTypeLabel = repositoryTypeLabelForType(repoType);
  const scanSupported = repoType === "rpm" || repoType === "python";
  const scanConfigured = repoType !== "rpm" || hasOsvConfig(data.osv_config);
  const latestVersionNumber = Number(repositoryVersionNumber(data.latest_version_href));
  const canScanLatest = scanSupported && latestVersionNumber > 0;

  function runScan(versionHref: string) {
    setError(null);
    scan.mutate(versionHref);
  }
  const latestVersion = versions.data?.results[0];
  const latestPublication = publications.data?.results[0];
  const latestVersionPublished = Boolean(
    latestVersionHref && latestPublication?.repository_version === latestVersionHref,
  );
  const selectedVersion = versions.data?.results.find(
    (version) => version.pulp_href === selectedVersionHref,
  );
  const summaryEntries = contentSummaryItems(latestVersion, "present");
  const totalContent = contentSummaryTotal(latestVersion);
  const labels = Object.entries(data.pulp_labels ?? {});

  function runSync() {
    setError(null);
    sync.mutate();
  }

  function updateAutopublish(enabled: boolean) {
    if (!href) {
      return;
    }
    setError(null);
    autopublish.mutate({ enabled });
  }

  function runDelete() {
    if (!data.name || !href) {
      return;
    }
    setError(null);
    remove.mutate({ href });
  }

  return (
    <div className="space-y-5">
      <div>
        <BackLink to="/repositories" label="Back to repositories" className="mb-3" />
        <PageHeader
          title={data.name}
          description={data.description || `${repoType} repository`}
          actions={
            <>
              {data.pulp_href ? (
                <Link
                  to="/content"
                  search={{ repos: data.pulp_href }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <Layers className="size-3.5" />
                  View content
                </Link>
              ) : null}
              {canWrite ? (
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil className="size-3.5" />
                  Edit
                </Button>
              ) : null}
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
              <RefreshButton
                isFetching={repository.isFetching}
                onClick={() => {
                  void repository.refetch();
                  void queryClient.invalidateQueries({ queryKey: queryKeys.repositoryContentAll });
                  void queryClient.invalidateQueries({
                    queryKey: queryKeys.repositoryVersions(href),
                  });
                }}
              />
              {scanSupported && canWrite ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (latestVersionHref) {
                      void runScan(latestVersionHref);
                    }
                  }}
                  disabled={scan.isPending || !canScanLatest || !scanConfigured}
                  title={
                    !scanConfigured
                      ? "Configure OSV scanning in Edit before scanning this repository."
                      : !canScanLatest
                        ? "Sync content to create a version to scan."
                        : undefined
                  }
                >
                  {scan.isPending ? <Spinner /> : <ScanSearch className="size-3.5" />}
                  {scan.isPending ? "Starting…" : "Scan"}
                </Button>
              ) : null}
              {canWrite ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => setSyncOpen(true)}>
                    <ArrowDownToLine className="size-3.5" />
                    Sync
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
                    <Trash2 className="size-3.5" />
                    Delete
                  </Button>
                </>
              ) : null}
            </>
          }
        />
      </div>

      {syncTask ? (
        <div className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4" />
            Sync task started.
          </div>
          <Link
            to="/tasks/$taskId"
            params={{ taskId: resourceIdFromHref(syncTask) }}
            className="inline-flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline"
          >
            View task
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      ) : null}

      {scanTask ? (
        <div className="flex flex-col gap-2 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <ScanSearch className="size-4" />
            Vulnerability scan started. Reports appear on package versions when the task finishes.
          </div>
          <Link
            to="/tasks/$taskId"
            params={{ taskId: resourceIdFromHref(scanTask) }}
            className="inline-flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline"
          >
            View task
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="brand">
          <entityIcons.repositories className="size-3" />
          {repoTypeLabel}
        </Badge>
        <Badge tone="neutral">
          <Hash className="size-3" />v{repositoryVersionNumber(data.latest_version_href)}
        </Badge>
        <Badge tone="neutral">{versions.data?.count ?? 0} versions</Badge>
        {data.retain_repo_versions ? (
          <Badge tone="neutral">Retains {data.retain_repo_versions} versions</Badge>
        ) : null}
        {supportsAutopublish && data.autopublish ? (
          <Badge tone="success">
            <PackageCheck className="size-3" />
            Auto-publish
          </Badge>
        ) : null}
        <span className="text-meta text-zinc-400 dark:text-zinc-500">
          Updated {formatRelative(data.pulp_last_updated)}
        </span>
      </div>

      {!supportsPublications ? (
        <InlineAlert
          tone="info"
          title={`Publications are not used by ${repoTypeLabel} repositories`}
        >
          This repository type serves content directly to distributions. Auto-publish and Publish
          latest version are not available; syncing or uploading content creates versions that
          distributions serve directly.
        </InlineAlert>
      ) : !supportsAutopublish ? (
        <InlineAlert
          tone="info"
          title={`Auto-publish is not supported for ${repoTypeLabel} repositories`}
        >
          Pulp can create publications for this plugin, but only manually. After syncing or
          uploading a new version, use Publish latest version to make it available to
          repository-backed distributions.
        </InlineAlert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="size-4 text-zinc-400" />
              Latest version content
            </CardTitle>
            <CardDescription>
              {latestVersion
                ? `Version ${latestVersion.number} was created ${formatRelative(latestVersion.pulp_created)}.`
                : "This repository does not have any versions yet."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {summaryEntries.length ? (
              <div className="space-y-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                    {totalContent.toLocaleString()}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">content units</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {summaryEntries.map((item) => (
                    <Badge key={item.contentType} tone="neutral" className="gap-1.5 capitalize">
                      {item.label}
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {item.count}
                      </span>
                    </Badge>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Layers className="size-7 text-zinc-300 dark:text-zinc-600" />
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  No content has been synchronized into this repository yet.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Repository details</CardTitle>
            <CardDescription>Configuration and retention settings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <DetailRow label="Created" value={formatDateTime(data.pulp_created)} />
            <DetailRow label="Updated" value={formatDateTime(data.pulp_last_updated)} />
            <DetailRow
              label="Remote"
              value={
                data.remote ? (
                  <Link
                    to="/remotes/detail"
                    search={{ href: data.remote }}
                    title={data.remote}
                    className="text-orange-600 hover:underline dark:text-orange-400"
                  >
                    {remote.data?.name ?? truncate(data.remote, 32)}
                  </Link>
                ) : (
                  "Not configured"
                )
              }
              mono={!remote.data?.name && Boolean(data.remote)}
            />
            <DetailRow
              label="Retention"
              value={
                data.retain_repo_versions ? `${data.retain_repo_versions} versions` : "Keep all"
              }
            />
            {supportsAutopublish ? (
              <DetailRow
                label="Auto-publish"
                value={data.autopublish ? <Badge tone="success">Enabled</Badge> : "Disabled"}
              />
            ) : null}
            {metadataSigningHref ? (
              <DetailRow
                label="Metadata signing"
                value={metadataSigningName ?? metadataSigningHref}
                mono={!metadataSigningName}
              />
            ) : null}
            {supportsPublications ? (
              <div className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <p className="text-meta text-zinc-500 dark:text-zinc-400">
                  {supportsAutopublish
                    ? data.autopublish
                      ? "New versions publish automatically, and repository-backed distributions update in place."
                      : "Repository-backed distributions serve the latest publication. Publish a version to make content available."
                    : "Publishing is manual for this repository type. Create a publication after each new version."}
                </p>
                {supportsAutopublish && canWrite ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-center"
                    onClick={() => void updateAutopublish(!data.autopublish)}
                    disabled={autopublish.isPending}
                  >
                    {autopublish.isPending ? (
                      <Spinner />
                    ) : data.autopublish ? (
                      <PowerOff className="size-4" />
                    ) : (
                      <Power className="size-4" />
                    )}
                    {autopublish.isPending
                      ? data.autopublish
                        ? "Disabling…"
                        : "Enabling…"
                      : data.autopublish
                        ? "Disable auto-publish"
                        : "Enable auto-publish"}
                  </Button>
                ) : null}
                {canWrite ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-center"
                    onClick={() => setPublishOpen(true)}
                    disabled={
                      !latestVersionHref ||
                      autopublish.isPending ||
                      latestVersionPublished ||
                      publications.isLoading
                    }
                  >
                    <PackageCheck className="size-4" />
                    {latestVersionPublished ? "Latest version published" : "Publish latest version"}
                  </Button>
                ) : null}
                <Link
                  to="/publications"
                  className="inline-flex items-center gap-1 text-meta font-medium text-orange-600 hover:underline dark:text-orange-400"
                >
                  View all publications
                  <ArrowRight className="size-3" />
                </Link>
                <p className="text-meta text-zinc-500 dark:text-zinc-400">
                  {!latestVersionHref
                    ? "This repository has no versions to publish yet."
                    : publications.isLoading
                      ? "Checking publications…"
                      : latestVersionPublished
                        ? `Version ${repositoryVersionNumber(latestVersionHref)} is published.`
                        : `Version ${repositoryVersionNumber(latestVersionHref)} has no publication yet.`}
                </p>
                {autopublish.error ? (
                  <FormError>
                    {errorMessage(autopublish.error, "Auto-publish could not be updated.")}
                  </FormError>
                ) : null}
              </div>
            ) : null}
            <div className="border-b border-zinc-100 pb-2 dark:border-zinc-800">
              <p className="mb-1.5 text-zinc-500 dark:text-zinc-400">Labels</p>
              {labels.length ? (
                <div className="flex flex-wrap gap-1">
                  {labels.map(([key, value]) => (
                    <Badge key={key} tone="neutral" className="font-mono">
                      <Tag className="size-2.5" />
                      {key}
                      {value ? `=${value}` : ""}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-zinc-400 dark:text-zinc-500">No labels</p>
              )}
            </div>
            <p className="break-all font-mono text-micro text-zinc-400 dark:text-zinc-500">
              {data.pulp_href}
            </p>
          </CardContent>
        </Card>
      </div>

      {isContainer ? <ContainerTagsCard versionHref={latestVersionHref} /> : null}

      <RepositoryDistributionsCard repository={data} readOnly={!canWrite} />

      {canWrite ? <ObjectRolesCard objectHref={data.pulp_href} objectName={data.name} /> : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Hash className="size-4 text-zinc-400" />
            Repository versions
          </CardTitle>
          <CardDescription>Immutable snapshots of the content in this repository.</CardDescription>
        </CardHeader>
        {versions.isError ? (
          <div className="p-4">
            <ErrorPanel
              title="Could not load repository versions"
              message={errorMessage(versions.error)}
              onRetry={() => void versions.refetch()}
            />
          </div>
        ) : versions.isLoading ? (
          <TableSkeleton rows={4} rowClassName="h-10" />
        ) : versions.data?.results.length ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="hidden sm:table-cell">Content</TableHead>
                  <TableHead className="hidden md:table-cell">Base version</TableHead>
                  <TableHead className="hidden lg:table-cell">Updated</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {versions.data.results.map((version) => {
                  const count = contentSummaryTotal(version);
                  const isSelected = version.pulp_href === selectedVersionHref;
                  return (
                    <TableRow
                      key={version.pulp_href ?? version.number}
                      className={cn(isSelected && "bg-orange-50/60 dark:bg-orange-950/10")}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="flex size-7 items-center justify-center rounded-md bg-zinc-100 text-meta font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                            {version.number}
                          </span>
                          <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                            Version {version.number}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-zinc-500 dark:text-zinc-400">
                        {formatDateTime(version.pulp_created)}
                      </TableCell>
                      <TableCell className="hidden text-xs text-zinc-500 dark:text-zinc-400 sm:table-cell">
                        {count.toLocaleString()} units
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {version.base_version ? (
                          <Badge tone="neutral">
                            v{repositoryVersionNumber(version.base_version)}
                          </Badge>
                        ) : (
                          <span className="text-xs text-zinc-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden text-xs text-zinc-500 dark:text-zinc-400 lg:table-cell">
                        {formatRelative(version.pulp_last_updated)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => setSelectedVersionHref(version.pulp_href ?? null)}
                          disabled={!version.pulp_href}
                          title="View version snapshot"
                          aria-label={`View version ${version.number} snapshot`}
                        >
                          <Camera className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Showing {versions.data.results.length} of {versions.data.count} versions
              </p>
              {versions.data.results.length < versions.data.count ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVersionsLimit((limit) => limit + 25)}
                  disabled={versions.isFetching}
                >
                  {versions.isFetching ? <Spinner /> : null}
                  Show more versions
                </Button>
              ) : null}
            </div>
          </>
        ) : (
          <EmptyState
            icon={Layers}
            title="No versions yet"
            description="Sync this repository to create its first version."
            action={
              canWrite ? (
                <Button size="sm" variant="outline" onClick={() => setSyncOpen(true)}>
                  <ArrowDownToLine className="size-4" />
                  Sync repository
                </Button>
              ) : undefined
            }
          />
        )}
      </Card>

      {selectedVersion ? (
        <RepositoryVersionPanel
          version={selectedVersion}
          repositoryName={data.name}
          onClose={() => setSelectedVersionHref(null)}
          onScan={
            scanSupported && canWrite ? (versionHref) => void runScan(versionHref) : undefined
          }
          scanning={scan.isPending}
          canScan={scanConfigured}
          scanHint="Configure OSV scanning in Edit before scanning this repository."
        />
      ) : null}

      {error && !syncOpen && !deleteOpen ? <FormError>{error}</FormError> : null}

      <Modal
        open={syncOpen}
        onClose={() => {
          if (!sync.isPending) {
            setSyncOpen(false);
            setError(null);
          }
        }}
        title="Sync repository"
        description={`Start a synchronization task for ${data.name}.`}
        footer={
          <>
            <Button variant="outline" onClick={() => setSyncOpen(false)} disabled={sync.isPending}>
              Cancel
            </Button>
            <Button onClick={runSync} disabled={sync.isPending}>
              {sync.isPending ? <Spinner /> : <ArrowDownToLine className="size-4" />}
              {sync.isPending ? "Starting…" : "Start sync"}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
          <p>
            Pulp will start an asynchronous sync task using the repository&apos;s configured remote.
            If no remote is configured, the task will fail.
          </p>
          {error ? <FormError>{error}</FormError> : null}
        </div>
      </Modal>

      <ConfirmDeleteModal
        open={deleteOpen}
        onClose={() => {
          setDeleteOpen(false);
          setError(null);
        }}
        title="Delete repository"
        description="This permanently removes the repository and its versions."
        itemName={data.name}
        nameLabel="Repository name"
        confirmLabel="Delete repository"
        isDeleting={remove.isPending}
        error={error}
        onConfirm={() => void runDelete()}
      />

      {editOpen ? (
        <EditRepositoryModal repository={data} onClose={() => setEditOpen(false)} />
      ) : null}
      {publishOpen ? (
        <PublishPublicationDialog
          repositoryHref={data.pulp_href}
          repositoryName={data.name}
          versionHref={data.latest_version_href}
          onClose={() => setPublishOpen(false)}
        />
      ) : null}
    </div>
  );
}
