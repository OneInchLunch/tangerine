import type { RepositoryDetail } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorPanel } from "@/components/ui/error-panel";
import { useRepositoryDistributions } from "@/hooks/queries";
import { distributionTypeForRepository } from "@/lib/distributions";
import { errorMessage } from "@/lib/errors";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ExternalLink, Plus, Share2 } from "lucide-react";
import { useState } from "react";
import { CreateDistributionModal } from "./create-distribution-modal";

export function RepositoryDistributionsCard({
  repository,
  readOnly = false,
}: {
  repository: RepositoryDetail;
  readOnly?: boolean;
}) {
  const href = repository.pulp_href;
  const distributions = useRepositoryDistributions(href);
  const info = distributionTypeForRepository(href);
  const [createOpen, setCreateOpen] = useState(false);
  const rows = distributions.data?.results ?? [];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Share2 className="size-4 text-zinc-400" />
              Distributions
            </CardTitle>
            <CardDescription>Content app endpoints that serve this repository.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {rows.length ? (
              <Badge tone="success">
                {rows.length} {rows.length === 1 ? "distribution" : "distributions"}
              </Badge>
            ) : null}
            {rows.length && info && !readOnly ? (
              <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" />
                Add distribution
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>

      {distributions.isError ? (
        <div className="p-4">
          <ErrorPanel
            title="Could not load distributions"
            message={errorMessage(distributions.error)}
            onRetry={() => void distributions.refetch()}
          />
        </div>
      ) : distributions.isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 2 }).map((_, index) => (
            <div
              key={index}
              className="h-14 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800"
            />
          ))}
        </div>
      ) : rows.length ? (
        <CardContent className="space-y-2">
          {rows.map((distribution) => (
            <div
              key={distribution.pulp_href ?? distribution.name}
              className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                {distribution.pulp_href ? (
                  <Link
                    to="/distributions/detail"
                    search={{ href: distribution.pulp_href }}
                    className="block truncate text-sm font-medium text-zinc-900 hover:text-orange-600 dark:text-zinc-100 dark:hover:text-orange-400"
                  >
                    {distribution.name}
                  </Link>
                ) : (
                  <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {distribution.name}
                  </p>
                )}
                <p className="truncate font-mono text-micro text-zinc-400 dark:text-zinc-500">
                  {distribution.base_path}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={distribution.hidden ? "warning" : "success"}>
                  {distribution.hidden ? "Hidden" : "Visible"}
                </Badge>
                {distribution.base_url ? (
                  <a
                    href={distribution.base_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex size-8 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                    title={distribution.base_url}
                    aria-label={`Open content URL for ${distribution.name}`}
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                ) : null}
                {distribution.pulp_href ? (
                  <Link
                    to="/distributions/detail"
                    search={{ href: distribution.pulp_href }}
                    className="inline-flex size-8 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                    title={`View ${distribution.name} details`}
                    aria-label={`View ${distribution.name} details`}
                  >
                    <ArrowRight className="size-3.5" />
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </CardContent>
      ) : (
        <EmptyState
          icon={Share2}
          title="No distribution configured"
          description={
            info
              ? "Create a distribution to expose this repository through the Pulp content app."
              : "Tangerine does not have a distribution form for this repository type. Use the API admin console to create one."
          }
          action={
            info && !readOnly ? (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" />
                Create distribution
              </Button>
            ) : undefined
          }
        />
      )}

      {createOpen && info && !readOnly ? (
        <CreateDistributionModal
          repository={repository}
          existingDistributions={rows}
          onClose={() => setCreateOpen(false)}
        />
      ) : null}
    </Card>
  );
}
