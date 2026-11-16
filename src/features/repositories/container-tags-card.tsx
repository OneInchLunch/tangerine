import type { ContainerManifest, ContainerTag } from "@/api/types";
import { useApiDataPane } from "@/components/api-data-pane";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorPanel } from "@/components/ui/error-panel";
import { IconButton } from "@/components/ui/icon-button";
import { Pagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRepositoryContent } from "@/hooks/queries";
import { errorMessage } from "@/lib/errors";
import { formatBytes, formatDateTime, truncate } from "@/lib/format";
import { Braces, Tag } from "lucide-react";
import { useEffect, useState } from "react";

const PAGE_SIZE = 25;

export function ContainerTagsCard({ versionHref }: { versionHref: string | undefined }) {
  const { openApiData } = useApiDataPane();
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [versionHref]);

  const tags = useRepositoryContent<ContainerTag>("content/container/tags", versionHref, {
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    ordering: "name",
  });
  const tagResults = tags.data?.results ?? [];
  const tagCount = tags.data?.count ?? 0;
  const manifestHrefs = tagResults.flatMap((tag) =>
    tag.tagged_manifest ? [tag.tagged_manifest] : [],
  );

  const manifests = useRepositoryContent<ContainerManifest>(
    "content/container/manifests",
    versionHref,
    {
      limit: PAGE_SIZE,
      pulp_href__in: manifestHrefs.join(",") || undefined,
    },
    { enabled: manifestHrefs.length > 0 },
  );
  const manifestsByHref = new Map(
    (manifests.data?.results ?? []).map((manifest) => [manifest.pulp_href, manifest]),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tag className="size-4 text-zinc-400" />
          Image tags
        </CardTitle>
        <CardDescription>
          Tags in the latest repository version.
          {tagCount ? ` ${tagCount} total.` : ""}
        </CardDescription>
      </CardHeader>
      {tags.isError ? (
        <div className="p-4">
          <ErrorPanel
            title="Could not load image tags"
            message={errorMessage(tags.error)}
            onRetry={() => void tags.refetch()}
          />
        </div>
      ) : tags.isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-10 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
          ))}
        </div>
      ) : tagResults.length ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tag</TableHead>
                <TableHead>Digest</TableHead>
                <TableHead className="hidden sm:table-cell">Size</TableHead>
                <TableHead className="hidden md:table-cell">Created</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tagResults.map((tag) => {
                const manifest = manifestsByHref.get(tag.tagged_manifest);
                return (
                  <TableRow key={tag.pulp_href ?? tag.name}>
                    <TableCell>
                      <Badge tone="brand" className="font-mono">
                        <Tag className="size-3" />
                        {tag.name}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-micro text-zinc-500 dark:text-zinc-400">
                      {manifest?.digest ? (
                        <span title={manifest.digest}>{truncate(manifest.digest, 28)}</span>
                      ) : manifests.isLoading ? (
                        <span className="text-zinc-400">Loading…</span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="hidden text-xs text-zinc-500 dark:text-zinc-400 sm:table-cell">
                      {formatBytes(manifest?.compressed_image_size)}
                    </TableCell>
                    <TableCell className="hidden text-xs text-zinc-500 dark:text-zinc-400 md:table-cell">
                      {formatDateTime(tag.pulp_created)}
                    </TableCell>
                    <TableCell>
                      {tag.tagged_manifest ? (
                        <IconButton
                          label={`View ${tag.name} manifest API data`}
                          title="View manifest API data"
                          icon={Braces}
                          onClick={() =>
                            openApiData({
                              href: tag.tagged_manifest!,
                              title: `${tag.name} manifest`,
                            })
                          }
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {manifests.isError ? (
            <p
              role="alert"
              className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300"
            >
              Manifest details could not be loaded. Tag names are still shown.
            </p>
          ) : null}
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={tagCount}
            hasNext={Boolean(tags.data?.next)}
            onPageChange={setPage}
          />
        </>
      ) : (
        <CardContent>
          <EmptyState
            icon={Tag}
            title="No image tags"
            description={
              versionHref
                ? "Push or sync a tagged image into this repository."
                : "This repository does not have any versions yet."
            }
          />
        </CardContent>
      )}
    </Card>
  );
}
