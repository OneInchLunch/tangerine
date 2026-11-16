import type { QueryParams } from "@/api/types";
import type { ApiDataSelection } from "@/components/api-data-pane";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorPanel } from "@/components/ui/error-panel";
import { IconButton } from "@/components/ui/icon-button";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApiPages, useVulnerabilityReports } from "@/hooks/queries";
import { contentPluginLabel, contentTypeLabel } from "@/lib/content-labels";
import {
  formatPackageVersion,
  packageDetails,
  packageQueryParams,
  sortPackageUnits,
  type PackageTypeConfig,
} from "@/lib/content-packages";
import { errorMessage } from "@/lib/errors";
import { formatRelative, truncate } from "@/lib/format";
import {
  reportHrefKey,
  summarizeVulnerabilities,
  type VulnerabilitySummary,
} from "@/lib/vulnerabilities";
import { ArrowLeft, Braces, Layers, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import type { ContentTypeEntry } from "./content-entry";
import { VulnerabilityBadge } from "./vulnerability-badge";

type ContentRow = Record<string, unknown>;

export function PackageVersionsPane({
  entry,
  config,
  values,
  onBack,
  onClose,
  onOpenApiData,
  onOpenVulnerabilities,
}: {
  entry: ContentTypeEntry;
  config: PackageTypeConfig;
  values: string[];
  onBack: () => void;
  onClose: () => void;
  onOpenApiData: (selection: ApiDataSelection) => void;
  onOpenVulnerabilities: (selection: { href: string; title: string }) => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const params: QueryParams = {
    ...packageQueryParams(config, values),
    ordering: config.ordering,
    fields: config.projection.join(","),
  };
  const pages = useApiPages<ContentRow>(entry.key, params, { pageSize: 200 });
  const units = useMemo(() => sortPackageUnits(pages.items, config), [pages.items, config]);
  const versionCount = useMemo(
    () => new Set(units.map((row) => formatPackageVersion(config, row))).size,
    [units, config],
  );

  const reportHrefs = useMemo(
    () =>
      units.flatMap((row) =>
        typeof row.vuln_report === "string" && row.vuln_report ? [row.vuln_report] : [],
      ),
    [units],
  );
  const reports = useVulnerabilityReports(reportHrefs);
  const summaries = useMemo(() => {
    const map = new Map<string, VulnerabilitySummary>();
    for (const report of reports.data ?? []) {
      if (report.pulp_href) {
        map.set(reportHrefKey(report.pulp_href), summarizeVulnerabilities(report.vulns));
      }
    }
    return map;
  }, [reports.data]);
  const advisoryCount = useMemo(() => {
    const ids = new Set<string>();
    for (const summary of summaries.values()) {
      for (const entryItem of summary.entries) {
        ids.add(entryItem.id);
      }
    }
    return ids.size;
  }, [summaries]);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const label = values[values.length - 1] || "Package";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close content pane"
            title="Close"
          >
            <X className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="size-3.5" />
            Back to packages
          </Button>
        </div>
      </div>

      <div>
        <p className="text-micro font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          {contentPluginLabel(entry.plugin)} · {contentTypeLabel(entry.type)}
        </p>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="mt-1 break-all text-lg font-semibold tracking-tight text-zinc-900 outline-none dark:text-zinc-50"
        >
          {label}
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {pages.isLoading
            ? "Loading variants…"
            : `${pages.total} ${pages.total === 1 ? "variant" : "variants"} · ${versionCount} ${
                versionCount === 1 ? "version" : "versions"
              }${advisoryCount ? ` · ${advisoryCount} ${advisoryCount === 1 ? "advisory" : "advisories"}` : ""}`}
        </p>
      </div>

      <Card>
        {pages.isError ? (
          <div className="p-4">
            <ErrorPanel
              title="Could not load package versions"
              message={errorMessage(pages.error)}
              onRetry={() => void pages.refetch()}
            />
          </div>
        ) : pages.isLoading ? (
          <TableSkeleton rows={4} />
        ) : units.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Version</TableHead>
                <TableHead className="hidden sm:table-cell">Details</TableHead>
                <TableHead className="hidden lg:table-cell">Updated</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {units.map((row) => {
                const version = formatPackageVersion(config, row);
                const details = packageDetails(config, row);
                const reportHref =
                  typeof row.vuln_report === "string" && row.vuln_report ? row.vuln_report : null;
                return (
                  <TableRow key={String(row.pulp_href ?? `${label}-${version}`)}>
                    <TableCell className="whitespace-nowrap font-mono text-meta text-zinc-700 dark:text-zinc-300">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{version}</span>
                        <VulnerabilityBadge
                          reportHref={reportHref}
                          summary={
                            reportHref ? summaries.get(reportHrefKey(reportHref)) : undefined
                          }
                          isLoading={reports.isPending}
                          onOpen={() => {
                            if (reportHref) {
                              onOpenVulnerabilities({
                                href: reportHref,
                                title: `${label} ${version}`,
                              });
                            }
                          }}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="flex flex-wrap items-center gap-1">
                        {details.length ? (
                          details.map((detail) => (
                            <Badge key={detail} tone="neutral" className="font-normal">
                              {truncate(detail, 32)}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-zinc-400">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-xs text-zinc-500 dark:text-zinc-400 lg:table-cell">
                      {formatRelative(
                        typeof row.pulp_last_updated === "string" ? row.pulp_last_updated : null,
                      )}
                    </TableCell>
                    <TableCell>
                      {row.pulp_href ? (
                        <IconButton
                          label={`View API data for ${label} ${version}`}
                          title="View API data"
                          icon={Braces}
                          onClick={() =>
                            onOpenApiData({
                              href: String(row.pulp_href),
                              title: `${label} ${version}`,
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
        ) : (
          <EmptyState
            icon={Layers}
            title="No versions found"
            description="This package has no content units left. It may have been removed since the link was saved."
            action={
              <Button variant="outline" size="sm" onClick={onBack}>
                Back to packages
              </Button>
            }
          />
        )}

        {pages.hasMore ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800">
            <p className="text-meta text-zinc-500 dark:text-zinc-400">
              Loaded {units.length} of {pages.total} variants.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={pages.loadMore}
              disabled={pages.isFetchingMore}
            >
              {pages.isFetchingMore ? "Loading…" : "Load more versions"}
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
