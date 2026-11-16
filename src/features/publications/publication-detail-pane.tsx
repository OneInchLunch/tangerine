import { repositoryVersionNumber } from "@/api/resources";
import type { PublicationDetail } from "@/api/types";
import { BottomPane } from "@/components/ui/bottom-pane";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailRow } from "@/components/ui/detail-row";
import { ErrorPanel } from "@/components/ui/error-panel";
import { Spinner } from "@/components/ui/spinner";
import { usePublication, useRepository } from "@/hooks/queries";
import { publicationTypeFromHref } from "@/lib/distributions";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { pluginForPublicationType } from "@/lib/plugins";
import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";

function settingValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

export function PublicationDetailPane({ href, onClose }: { href: string; onClose: () => void }) {
  const publication = usePublication(href);
  const data = publication.data as PublicationDetail | undefined;
  const repository = useRepository(data?.repository);
  const type = publicationTypeFromHref(href);
  const plugin = pluginForPublicationType(type);
  const fields = plugin?.publication?.fields ?? [];
  const settings = fields.flatMap((field) => {
    const value = data?.[field.key];
    return value === undefined ? [] : [{ label: field.label, value }];
  });

  return (
    <BottomPane
      open
      onClose={onClose}
      title={`${plugin?.label ?? type} publication`}
      description={href}
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      {publication.isError ? (
        <ErrorPanel
          title="Could not load this publication"
          message={errorMessage(publication.error)}
          onRetry={() => void publication.refetch()}
        />
      ) : publication.isLoading || !data ? (
        <div className="flex items-center gap-2 py-4 text-sm text-zinc-500 dark:text-zinc-400">
          <Spinner />
          Loading publication…
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="brand">{plugin?.label ?? type}</Badge>
            <Badge tone="neutral">v{repositoryVersionNumber(data.repository_version)}</Badge>
            <Badge tone="warning">
              <Lock className="size-3" />
              Immutable
            </Badge>
          </div>

          <div className="grid gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800 sm:grid-cols-2">
            <DetailRow
              label="Repository"
              value={
                repository.data ? (
                  <Link
                    to="/repositories/detail"
                    search={{ href: repository.data.pulp_href! }}
                    className="text-orange-600 hover:underline dark:text-orange-400"
                  >
                    {repository.data.name}
                  </Link>
                ) : (
                  (data.repository ?? "—")
                )
              }
            />
            <DetailRow label="Repository version" value={data.repository_version ?? "—"} mono />
            <DetailRow label="Created" value={formatDateTime(data.pulp_created)} />
            <DetailRow label="PRN" value={data.prn ?? "—"} mono />
          </div>

          {settings.length ? (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                Publication settings
              </h3>
              <div className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                {settings.map((setting) => (
                  <DetailRow
                    key={setting.label}
                    label={setting.label}
                    value={settingValue(setting.value)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300">
            Publications are immutable snapshots. To change settings or content, publish a new
            repository version and attach it to the distribution.
          </div>

          <p className="break-all font-mono text-micro text-zinc-400 dark:text-zinc-500">{href}</p>
        </div>
      )}
    </BottomPane>
  );
}
