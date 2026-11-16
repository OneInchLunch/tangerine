import { repositoryVersionNumber } from "@/api/resources";
import type { RepositoryVersion } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { BottomPane } from "@/components/ui/bottom-pane";
import { Button } from "@/components/ui/button";
import { SeverityChips } from "@/features/content/vulnerability-badge";
import { useVulnerabilityReports } from "@/hooks/queries";
import { formatDateTime, formatRelative } from "@/lib/format";
import { summarizeVulnerabilities } from "@/lib/vulnerabilities";
import { cn } from "@/lib/utils";
import {
  contentSummaryItems,
  contentSummaryTotal,
  type ContentSummarySection,
} from "./repository-version-utils";
import { Camera, ScanSearch } from "lucide-react";
import { useMemo } from "react";

const SUMMARY_SECTIONS: Array<{
  key: ContentSummarySection;
  title: string;
  description: string;
}> = [
  { key: "present", title: "Present", description: "Content in this version" },
  { key: "added", title: "Added", description: "Added since the base version" },
  { key: "removed", title: "Removed", description: "Removed since the base version" },
];

interface RepositoryVersionPanelProps {
  version: RepositoryVersion;
  repositoryName: string;
  onClose: () => void;
  onScan?: (versionHref: string) => void;
  scanning?: boolean;
  canScan?: boolean;
  scanHint?: string;
}

export function RepositoryVersionPanel({
  version,
  repositoryName,
  onClose,
  onScan,
  scanning,
  canScan = true,
  scanHint,
}: RepositoryVersionPanelProps) {
  const totalContent = contentSummaryTotal(version);
  const reportHrefs = version.vuln_report ? [version.vuln_report] : [];
  const reportQuery = useVulnerabilityReports(reportHrefs);
  const summary = useMemo(
    () => summarizeVulnerabilities(reportQuery.data?.[0]?.vulns),
    [reportQuery.data],
  );

  return (
    <BottomPane
      onClose={onClose}
      title={`Version ${version.number ?? "—"} snapshot`}
      description={
        <>
          Created {formatDateTime(version.pulp_created)} · {formatRelative(version.pulp_created)}
        </>
      }
      icon={<Camera className="size-4" />}
      footer={
        onScan && version.pulp_href ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onScan(version.pulp_href!)}
            disabled={scanning || !canScan}
            title={!canScan ? scanHint : undefined}
          >
            <ScanSearch className="size-3.5" />
            {scanning ? "Starting…" : "Scan for vulnerabilities"}
          </Button>
        ) : undefined
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SnapshotStat label="Version" value={`v${version.number ?? "—"}`} />
        <SnapshotStat label="Content units" value={totalContent.toLocaleString()} />
        <SnapshotStat
          label="Base version"
          value={
            version.base_version
              ? `v${repositoryVersionNumber(version.base_version)}`
              : "Initial snapshot"
          }
        />
        <SnapshotStat label="Updated" value={formatRelative(version.pulp_last_updated)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {SUMMARY_SECTIONS.map((section) => {
          const items = contentSummaryItems(version, section.key);
          const sectionTotal = items.reduce((sum, item) => sum + item.count, 0);
          return (
            <div
              key={section.key}
              className="rounded-lg border border-zinc-200 dark:border-zinc-800"
            >
              <div className="flex items-start justify-between gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
                <div>
                  <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                    {section.title}
                  </p>
                  <p className="text-meta text-zinc-400 dark:text-zinc-500">
                    {section.description}
                  </p>
                </div>
                <Badge tone="neutral">{sectionTotal.toLocaleString()}</Badge>
              </div>
              {items.length ? (
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {items.map((item) => (
                    <li
                      key={item.contentType}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                    >
                      <span className="capitalize text-zinc-600 dark:text-zinc-300">
                        {item.label}
                      </span>
                      <span className="font-mono text-zinc-900 dark:text-zinc-100">
                        {item.count.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-3 py-3 text-xs text-zinc-400 dark:text-zinc-500">None</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid gap-3 border-t border-zinc-200 pt-4 sm:grid-cols-2 xl:grid-cols-4 dark:border-zinc-800">
        <SnapshotMeta label="Repository" value={repositoryName} />
        <SnapshotMeta label="Created" value={formatDateTime(version.pulp_created)} />
        <SnapshotMeta label="Last updated" value={formatDateTime(version.pulp_last_updated)} />
        <SnapshotMeta label="PRN" value={version.prn ?? "—"} mono />
      </div>

      <div>
        <p className="text-micro font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          API endpoint
        </p>
        <p className="mt-1 break-all font-mono text-micro text-zinc-500 dark:text-zinc-400">
          {version.pulp_href ?? "—"}
        </p>
      </div>

      <div>
        <p className="text-micro font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Vulnerability report
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          {!version.vuln_report ? (
            <Badge tone="neutral" className="font-normal">
              Not scanned
            </Badge>
          ) : reportQuery.isPending ? (
            <Badge tone="neutral" className="font-normal">
              Loading…
            </Badge>
          ) : summary.total === 0 ? (
            <Badge tone="success" className="font-normal">
              Clean
            </Badge>
          ) : (
            <>
              <SeverityChips summary={summary} />
              <span>
                {summary.total} {summary.total === 1 ? "advisory" : "advisories"} ·{" "}
                {summary.cveCount} {summary.cveCount === 1 ? "CVE" : "CVEs"}
              </span>
            </>
          )}
        </div>
      </div>
    </BottomPane>
  );
}

function SnapshotStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
      <p className="text-micro font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  );
}

function SnapshotMeta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-micro font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 break-all text-xs text-zinc-700 dark:text-zinc-300",
          mono && "font-mono text-micro",
        )}
      >
        {value}
      </p>
    </div>
  );
}
