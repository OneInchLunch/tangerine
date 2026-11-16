import { repositoryVersionNumber } from "@/api/resources";
import { useAuth } from "@/auth/auth-context";
import type { Publication } from "@/api/types";
import { useApiDataPane } from "@/components/api-data-pane";
import { BackLink } from "@/components/ui/back-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DetailRow } from "@/components/ui/detail-row";
import { ErrorPanel } from "@/components/ui/error-panel";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import { PageHeader } from "@/components/ui/page-header";
import { useApiList, useDistribution, usePublication, useRepository } from "@/hooks/queries";
import {
  distributionDisplayName,
  distributionSupportsPublications,
  distributionTypeFromHref,
  distributionTypeLabel,
  isSystemDistribution,
  publicationTypeLabel,
} from "@/lib/distributions";
import { repositorySupportsAutopublishFromHref } from "@/lib/repositories";
import { errorMessage } from "@/lib/errors";
import { formatDateTime, formatRelative, truncate } from "@/lib/format";
import { PublishPublicationDialog } from "@/features/publications/publish-publication-dialog";
import { useDistributionActions } from "./use-distribution-actions";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  Braces,
  ExternalLink,
  PackageCheck,
  Pencil,
  RefreshCw,
  Share2,
  Tag,
  Trash2,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { ObjectRolesCard } from "@/features/rbac/object-roles-card";
import {
  AutopublishPanel,
  ContentSourceCard,
  type AutopublishState,
  type ContentSourceState,
} from "./content-source-card";
import { EditDistributionModal, type DistributionEditMode } from "./edit-distribution-modal";

function DistributionDetailLoading() {
  return (
    <div className="space-y-4">
      <div className="h-5 w-40 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
      <div className="h-28 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
      <div className="h-64 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
    </div>
  );
}

export function DistributionDetailPage() {
  const search = useSearch({ strict: false }) as { href?: string };
  const href = search.href;
  const systemDistribution = isSystemDistribution(href);
  const { openApiData } = useApiDataPane();
  const distribution = useDistribution(href);
  const data = distribution.data;
  const publication = usePublication(data?.publication ?? undefined);
  const repository = useRepository(data?.repository ?? publication.data?.repository ?? undefined);
  const supportsPublications = distributionSupportsPublications(href);
  const repositoryPublications = useApiList<Publication>(
    "publications",
    {
      repository: data?.repository ?? "",
      limit: 1,
      ordering: "-pulp_created",
    },
    {
      enabled: Boolean(data?.repository && !data.publication && supportsPublications),
    },
  );
  const [editOpen, setEditOpen] = useState(false);
  const [editMode, setEditMode] = useState<DistributionEditMode>("metadata");
  const [publishOpen, setPublishOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [publicationError, setPublicationError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { session } = useAuth();
  const canWrite = session?.capabilities?.repositoryWrite !== false;
  const { remove, autopublish } = useDistributionActions({
    onDeleted: async () => {
      setDeleteOpen(false);
      await navigate({ to: "/distributions" });
    },
    onAutopublishError: setPublicationError,
  });
  const autopublishSupported = repositorySupportsAutopublishFromHref(data?.repository);

  if (!href) {
    return (
      <div className="space-y-4">
        <BackLink to="/distributions" label="Back to distributions" />
        <ErrorPanel
          title="Distribution not specified"
          message="Open a distribution from the distributions list to view its details."
        />
      </div>
    );
  }

  if (distribution.isError) {
    return (
      <div className="space-y-4">
        <BackLink to="/distributions" label="Back to distributions" />
        <ErrorPanel
          title="Could not load this distribution"
          message={errorMessage(distribution.error)}
          onRetry={() => void distribution.refetch()}
        />
      </div>
    );
  }

  if (distribution.isLoading || !data) {
    return <DistributionDetailLoading />;
  }

  function updateAutopublish(enabled: boolean) {
    const repositoryHref = repository.data?.pulp_href;
    if (!repositoryHref) {
      return;
    }
    setPublicationError(null);
    autopublish.mutate({ repositoryHref, enabled });
  }

  function openEdit(mode: DistributionEditMode) {
    setEditMode(mode);
    setEditOpen(true);
  }

  const typeId = distributionTypeFromHref(data.pulp_href);
  const typeLabel = distributionTypeLabel(data.pulp_href);
  const displayName = distributionDisplayName(data.name, data.pulp_href);
  const labels = Object.entries(data.pulp_labels ?? {});
  const repositoryDetail = repository.data;
  const latestRepositoryPublication = repositoryPublications.data?.results[0];
  const effectivePublicationHref = data.publication ?? latestRepositoryPublication?.pulp_href;
  const publicationIsImplicit = Boolean(!data.publication && latestRepositoryPublication);
  const publicationData = data.publication ? publication.data : latestRepositoryPublication;
  const repositoryVersion = publicationData?.repository_version;
  const versionNumber = repositoryVersion ? repositoryVersionNumber(repositoryVersion) : "—";
  const repositoryPublicationLoading = data.repository && repositoryPublications.isLoading;
  const publicationLoading = data.publication
    ? publication.isLoading
    : Boolean(repositoryPublicationLoading);

  let contentSourceState: ContentSourceState;
  if (data.publication) {
    contentSourceState = {
      kind: "pinned",
      href: data.publication,
      publication: publication.data,
      repository: repositoryDetail,
      publicationLoading: publication.isLoading,
    };
  } else if (latestRepositoryPublication?.pulp_href) {
    contentSourceState = {
      kind: "latest",
      href: latestRepositoryPublication.pulp_href,
      publication: latestRepositoryPublication,
      repository: repositoryDetail,
      publicationLoading: false,
    };
  } else if (!data.repository) {
    contentSourceState = { kind: "unattached" };
  } else if (!supportsPublications) {
    contentSourceState = { kind: "unsupported", repository: repositoryDetail };
  } else if (repositoryPublicationLoading) {
    contentSourceState = { kind: "loading" };
  } else {
    contentSourceState = { kind: "none", repository: repositoryDetail };
  }

  let autopublishState: AutopublishState;
  if (!data.repository || !supportsPublications) {
    autopublishState = "unavailable";
  } else if (!autopublishSupported) {
    autopublishState = "unsupported";
  } else if (!repositoryDetail) {
    autopublishState = "loading";
  } else {
    autopublishState = repositoryDetail.autopublish ? "enabled" : "disabled";
  }

  let publicationValue: ReactNode;
  if (systemDistribution) {
    publicationValue = "Not used";
  } else if (effectivePublicationHref) {
    publicationValue = (
      <span className="inline-flex items-center justify-end gap-1">
        <span className="font-mono text-meta">
          {publicationTypeLabel(effectivePublicationHref)}
        </span>
        {publicationIsImplicit ? <Badge tone="neutral">Latest</Badge> : null}
      </span>
    );
  } else if (repositoryPublicationLoading) {
    publicationValue = "Loading…";
  } else if (!supportsPublications) {
    publicationValue = "Not used";
  } else if (!data.repository) {
    publicationValue = "Not attached";
  } else {
    publicationValue = "None yet";
  }

  let repositoryVersionValue: string;
  if (systemDistribution) {
    repositoryVersionValue = "Not applicable";
  } else if (effectivePublicationHref) {
    if (publicationData?.repository_version) {
      repositoryVersionValue = `v${versionNumber}${publicationIsImplicit ? " (latest)" : ""}`;
    } else if (publicationLoading) {
      repositoryVersionValue = "Loading…";
    } else {
      repositoryVersionValue = "—";
    }
  } else if (repositoryPublicationLoading) {
    repositoryVersionValue = "Loading…";
  } else if (supportsPublications && data.repository) {
    repositoryVersionValue = "No publication";
  } else {
    repositoryVersionValue = "Latest";
  }

  return (
    <div className="space-y-5">
      <div>
        <BackLink to="/distributions" label="Back to distributions" className="mb-3" />
        <PageHeader
          title={displayName}
          description={
            systemDistribution
              ? `Pulp internal artifact serving endpoint at /${data.base_path}`
              : `${typeLabel} distribution at /${data.base_path}`
          }
          actions={
            <>
              {systemDistribution || !canWrite ? null : (
                <Button variant="outline" size="sm" onClick={() => openEdit("metadata")}>
                  <Pencil className="size-3.5" />
                  Edit
                </Button>
              )}
              {systemDistribution || !canWrite ? null : (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    remove.reset();
                    setDeleteOpen(true);
                  }}
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => openApiData({ href: data.pulp_href!, title: data.name })}
              >
                <Braces className="size-3.5" />
                API data
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void distribution.refetch();
                  void publication.refetch();
                  void repository.refetch();
                  void repositoryPublications.refetch();
                }}
              >
                <RefreshCw
                  className={distribution.isFetching ? "size-3.5 animate-spin" : "size-3.5"}
                />
                Refresh
              </Button>
            </>
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge
          tone={systemDistribution ? "neutral" : "brand"}
          title={systemDistribution ? typeId : undefined}
        >
          <Share2 className="size-3" />
          {systemDistribution ? "System" : typeLabel}
        </Badge>
        <Badge tone={data.hidden ? "warning" : "success"}>
          {data.hidden ? "Hidden" : "Visible"}
        </Badge>
        {data.publication ? (
          <Badge tone="info">Pinned publication</Badge>
        ) : latestRepositoryPublication ? (
          <Badge tone="info">Repository · latest publication</Badge>
        ) : data.repository ? (
          <Badge tone="success">Repository</Badge>
        ) : (
          <Badge tone="neutral">No content source</Badge>
        )}
        {data.repository && autopublishSupported && repository.data?.autopublish ? (
          <Badge tone="success">
            <PackageCheck className="size-3" />
            Auto-publish
          </Badge>
        ) : null}
        <span className="text-meta text-zinc-400 dark:text-zinc-500">
          Updated {formatRelative(data.pulp_last_updated)}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ExternalLink className="size-4 text-zinc-400" />
              Content endpoint
            </CardTitle>
            <CardDescription>
              {systemDistribution
                ? "Pulp serves stored artifacts by UUID through this endpoint using signed, expiring URLs."
                : "Clients consume this distribution through the Pulp content app."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div>
              <p className="mb-1 text-zinc-500 dark:text-zinc-400">Content URL</p>
              {data.base_url ? (
                systemDistribution ? (
                  <span
                    className="break-all font-mono text-meta text-zinc-500 dark:text-zinc-400"
                    title="Pulp serves artifacts from this base path with signed URLs; it cannot be opened directly."
                  >
                    {data.base_url}
                  </span>
                ) : (
                  <a
                    href={data.base_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 break-all font-mono text-meta text-orange-600 hover:underline dark:text-orange-400"
                  >
                    {data.base_url}
                    <ExternalLink className="size-3 shrink-0" />
                  </a>
                )
              ) : (
                <span className="text-zinc-400 dark:text-zinc-500">—</span>
              )}
            </div>
            <DetailRow label="Base path" value={data.base_path} mono />
            <DetailRow
              label="Repository"
              value={
                data.repository && repository.data ? (
                  <Link
                    to="/repositories/detail"
                    search={{ href: data.repository }}
                    className="text-orange-600 hover:underline dark:text-orange-400"
                  >
                    {repository.data.name}
                  </Link>
                ) : data.repository ? (
                  <span className="font-mono text-meta">{truncate(data.repository, 48)}</span>
                ) : (
                  "Not attached"
                )
              }
            />
            <DetailRow label="Publication" value={publicationValue} />
            <DetailRow label="Repository version" value={repositoryVersionValue} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribution details</CardTitle>
            <CardDescription>Configuration and lifecycle metadata.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Created" value={formatDateTime(data.pulp_created)} />
            <DetailRow label="Updated" value={formatDateTime(data.pulp_last_updated)} />
            <DetailRow
              label="Content guard"
              value={
                data.content_guard ? (
                  <span className="font-mono text-meta">{truncate(data.content_guard, 40)}</span>
                ) : (
                  "None"
                )
              }
            />
            <div className="border-b border-zinc-100 pb-2 dark:border-zinc-800">
              <p className="mb-1.5 text-xs text-zinc-500 dark:text-zinc-400">Labels</p>
              {labels.length ? (
                <div className="flex flex-wrap justify-end gap-1">
                  {labels.map(([key, value]) => (
                    <Badge key={key} tone="neutral" className="font-mono">
                      <Tag className="size-2.5" />
                      {key}
                      {value ? `=${value}` : ""}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-right text-xs text-zinc-400 dark:text-zinc-500">No labels</p>
              )}
            </div>
            <p className="break-all font-mono text-micro text-zinc-400 dark:text-zinc-500">
              {data.pulp_href}
            </p>
          </CardContent>
        </Card>
      </div>

      {systemDistribution ? (
        <Card>
          <CardHeader>
            <CardTitle>Pulp internal endpoint</CardTitle>
            <CardDescription>Created and managed by Pulp core. Read-only.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
            <p>
              Pulp creates this singleton distribution automatically when artifacts are stored on
              the local filesystem, or when artifact-serving redirects to object storage are
              disabled. It serves raw stored artifacts by UUID through signed, expiring URLs.
            </p>
            <p>
              It has no repository or publication and cannot be edited or deleted through
              Pulp&apos;s API. It is not part of any repository&apos;s content and does not need
              cleanup.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ContentSourceCard
          state={contentSourceState}
          onChangeSource={canWrite ? () => openEdit("source") : undefined}
          onOpenApiData={(href) => openApiData({ href, title: `${data.name} publication` })}
        />
      )}

      {!systemDistribution && canWrite && contentSourceState.kind === "none" ? (
        <AutopublishPanel
          state={autopublishState}
          repository={repositoryDetail}
          isUpdating={autopublish.isPending}
          isPublishing={false}
          error={publicationError}
          onEnable={() => updateAutopublish(true)}
          onDisable={() => updateAutopublish(false)}
          onPublishLatest={() => setPublishOpen(true)}
        />
      ) : null}

      {systemDistribution ? null : (
        <ObjectRolesCard objectHref={data.pulp_href} objectName={data.name} />
      )}

      {editOpen ? (
        <EditDistributionModal
          distribution={data}
          mode={editMode}
          onSwitchMode={setEditMode}
          onClose={() => setEditOpen(false)}
        />
      ) : null}
      {publishOpen && repositoryDetail ? (
        <PublishPublicationDialog
          repositoryHref={repositoryDetail.pulp_href}
          repositoryName={repositoryDetail.name}
          versionHref={repositoryDetail.latest_version_href}
          onClose={() => setPublishOpen(false)}
        />
      ) : null}
      <ConfirmDeleteModal
        open={deleteOpen}
        onClose={() => {
          setDeleteOpen(false);
          remove.reset();
        }}
        title={`Delete ${displayName}`}
        description="This removes the distribution endpoint. Repository content and publications are untouched."
        itemName={displayName}
        nameLabel="Distribution name"
        confirmLabel="Delete distribution"
        isDeleting={remove.isPending}
        error={remove.error ? errorMessage(remove.error) : null}
        onConfirm={() => {
          if (data.pulp_href) {
            remove.mutate({ href: data.pulp_href });
          }
        }}
      />
    </div>
  );
}
