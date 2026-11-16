import type { Publication, RepositoryDetail } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DetailRow } from "@/components/ui/detail-row";
import { FormError } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { repositoryVersionNumber } from "@/api/resources";
import { publicationTypeLabel } from "@/lib/distributions";
import { formatDateTime } from "@/lib/format";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Braces, PackageCheck, Pencil, Power, PowerOff } from "lucide-react";

export type ContentSourceState =
  | {
      kind: "pinned" | "latest";
      href: string;
      publication?: Publication;
      repository?: RepositoryDetail;
      publicationLoading: boolean;
    }
  | { kind: "loading" }
  | { kind: "none" | "unsupported"; repository?: RepositoryDetail }
  | { kind: "unattached" };

export function ContentSourceCard({
  state,
  onChangeSource,
  onOpenApiData,
}: {
  state: ContentSourceState;
  onChangeSource?: () => void;
  onOpenApiData: (href: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Content source</CardTitle>
            <CardDescription>{contentSourceDescription(state)}</CardDescription>
          </div>
          {onChangeSource ? (
            <Button variant="outline" size="sm" onClick={onChangeSource}>
              <Pencil className="size-3.5" />
              Change content source
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ContentSourceBody state={state} onOpenApiData={onOpenApiData} />
      </CardContent>
    </Card>
  );
}

function contentSourceDescription(state: ContentSourceState): string {
  switch (state.kind) {
    case "pinned":
      return "This distribution is pinned to a frozen publication.";
    case "latest":
      return "This distribution follows the repository's newest publication.";
    case "none":
      return "The repository does not have a publication for this distribution to serve yet.";
    case "unsupported":
      return "This distribution serves repository content directly; publications are not used.";
    case "loading":
      return "Checking the repository's latest publication.";
    case "unattached":
      return "No repository or publication is attached to this distribution.";
  }
}

function ContentSourceBody({
  state,
  onOpenApiData,
}: {
  state: ContentSourceState;
  onOpenApiData: (href: string) => void;
}) {
  switch (state.kind) {
    case "pinned":
    case "latest":
      return <PublicationSourceDetails state={state} onOpenApiData={onOpenApiData} />;
    case "loading":
      return (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Loading the repository&apos;s latest publication…
        </p>
      );
    case "unsupported":
      return (
        <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            This distribution serves the repository directly and does not use Pulp publications.
            Auto-publish and publication pinning are unavailable for this content type.
          </p>
        </div>
      );
    case "none":
      return (
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          {state.repository
            ? "No publication exists for this repository yet. This distribution follows the repository and will serve content once a publication is created."
            : "No publication is attached. Select a repository or publication in the edit form."}
        </p>
      );
    case "unattached":
      return (
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          No publication is attached. Select a repository or publication in the edit form.
        </p>
      );
  }
}

function PublicationSourceDetails({
  state,
  onOpenApiData,
}: {
  state: Extract<ContentSourceState, { kind: "pinned" | "latest" }>;
  onOpenApiData: (href: string) => void;
}) {
  const { publication } = state;
  const pinned = state.kind === "pinned";
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="info">{publicationTypeLabel(state.href)}</Badge>
        {publication?.repository_version ? (
          <Badge tone="neutral">
            Repository v{repositoryVersionNumber(publication.repository_version)}
          </Badge>
        ) : null}
        <Badge tone={pinned ? "warning" : "success"}>
          {pinned ? "Pinned" : "Latest via repository"}
        </Badge>
      </div>
      <DetailRow label="Publication" value={state.href} mono />
      {publication ? (
        <>
          <DetailRow label="Created" value={formatDateTime(publication.pulp_created)} />
          <DetailRow
            label="Repository"
            value={
              state.repository ? (
                <Link
                  to="/repositories/detail"
                  search={{ href: publication.repository! }}
                  className="text-orange-600 hover:underline dark:text-orange-400"
                >
                  {state.repository.name}
                </Link>
              ) : (
                (publication.repository ?? "—")
              )
            }
          />
        </>
      ) : state.publicationLoading ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Loading publication details…</p>
      ) : null}
      <p className="text-meta text-zinc-500 dark:text-zinc-400">
        {pinned
          ? "This distribution is pinned to this publication and will not update when the repository changes. Use Follow repository to serve new published versions again."
          : "This publication is served through the repository. It advances automatically when the repository publishes a new version; attach a publication to freeze it."}
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={() => onOpenApiData(state.href)}>
          <Braces className="size-3.5" />
          Publication API data
        </Button>
      </div>
    </>
  );
}

export type AutopublishState = "enabled" | "disabled" | "unsupported" | "unavailable" | "loading";

export function AutopublishPanel({
  state,
  repository,
  isUpdating,
  isPublishing,
  error,
  onEnable,
  onDisable,
  onPublishLatest,
}: {
  state: AutopublishState;
  repository?: RepositoryDetail;
  isUpdating: boolean;
  isPublishing: boolean;
  error: string | null;
  onEnable: () => void;
  onDisable: () => void;
  onPublishLatest: () => void;
}) {
  if (state === "unavailable" || state === "loading" || !repository) {
    return null;
  }

  const publishDisabled = !repository.latest_version_href || isPublishing || isUpdating;
  const busy = isUpdating || isPublishing;

  if (state === "enabled") {
    return (
      <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
        <p>
          Auto-publish is enabled on <span className="font-medium">{repository.name}</span>. New
          repository versions are published automatically, so this distribution always serves the
          latest publication.
        </p>
        <Button variant="outline" size="sm" onClick={onDisable} disabled={busy}>
          {isUpdating ? <Spinner /> : <PowerOff className="size-3.5" />}
          {isUpdating ? "Disabling…" : "Disable auto-publish"}
        </Button>
        <p>
          Disabling stops future publications. Existing publications and this distribution keep
          serving their current content.
        </p>
        {error ? <FormError>{error}</FormError> : null}
      </div>
    );
  }

  if (state === "unsupported") {
    return (
      <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300">
        <p>
          Auto-publish is not supported for this repository type. Publishing stays manual, so run
          Publish latest version after each sync or upload.
        </p>
        <Button variant="outline" size="sm" onClick={onPublishLatest} disabled={publishDisabled}>
          {isPublishing ? <Spinner /> : <PackageCheck className="size-3.5" />}
          {isPublishing ? "Publishing…" : "Publish latest version"}
        </Button>
        {error ? <FormError>{error}</FormError> : null}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
      <p>
        Auto-publish is off for <span className="font-medium">{repository.name}</span>. New versions
        are not published automatically, so clients keep receiving the last publication.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onEnable} disabled={busy}>
          {isUpdating ? <Spinner /> : <Power className="size-3.5" />}
          {isUpdating ? "Enabling…" : "Enable auto-publish"}
        </Button>
        <Button variant="outline" size="sm" onClick={onPublishLatest} disabled={publishDisabled}>
          {isPublishing ? <Spinner /> : <PackageCheck className="size-3.5" />}
          {isPublishing ? "Publishing…" : "Publish latest version"}
        </Button>
      </div>
      <p>
        Auto-publish applies to future versions. Publishing the latest version creates the
        publication clients need right now.
      </p>
      {error ? <FormError>{error}</FormError> : null}
    </div>
  );
}
