import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorPanel } from "@/components/ui/error-panel";
import { LoadingBlock } from "@/components/ui/spinner";
import { useApiResource } from "@/hooks/queries";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import {
  SEVERITY_ORDER,
  severityLabel,
  summarizeVulnerabilities,
  type VulnerabilityEntry,
  type VulnerabilityReport,
} from "@/lib/vulnerabilities";
import { ArrowLeft, Bug, ExternalLink, ShieldCheck, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { SeverityChips, severityTone } from "./vulnerability-badge";

function AdvisoryCard({ entry }: { entry: VulnerabilityEntry }) {
  return (
    <li className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge tone={severityTone(entry.severity)}>{severityLabel(entry.severity)}</Badge>
          <a
            href={entry.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 break-all font-mono text-xs font-medium text-orange-700 underline-offset-2 hover:underline dark:text-orange-300"
          >
            {entry.id}
            <ExternalLink className="size-3" />
          </a>
        </div>
        {entry.published ? (
          <span className="text-meta text-zinc-400 dark:text-zinc-500">
            {formatDateTime(entry.published)}
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">{entry.summary}</p>

      {entry.cveIds.length ? (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {entry.cveIds.map((cve) => (
            <Badge key={cve} tone="neutral" className="font-mono text-micro font-normal">
              {cve}
            </Badge>
          ))}
        </div>
      ) : null}

      {entry.fixedVersions.length ? (
        <p className="mt-2 text-meta text-zinc-500 dark:text-zinc-400">
          Fixed in{" "}
          <span className="font-mono text-zinc-700 dark:text-zinc-300">
            {entry.fixedVersions.join(", ")}
          </span>
        </p>
      ) : null}
    </li>
  );
}

export function VulnerabilitiesPane({
  href,
  title,
  onBack,
  onClose,
}: {
  href: string;
  title: string;
  onBack: () => void;
  onClose: () => void;
}) {
  const query = useApiResource(href);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const payload = query.data?.data as VulnerabilityReport | undefined;
  const summary = useMemo(() => summarizeVulnerabilities(payload?.vulns), [payload]);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

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
            Back to versions
          </Button>
        </div>
        {!query.isPending && !query.isError ? <SeverityChips summary={summary} /> : null}
      </div>

      <div>
        <p className="text-micro font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Vulnerabilities
        </p>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="mt-1 break-all text-lg font-semibold tracking-tight text-zinc-900 outline-none dark:text-zinc-50"
        >
          {title}
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {query.isPending
            ? "Loading vulnerability report…"
            : `${summary.total} ${summary.total === 1 ? "advisory" : "advisories"} · ${
                summary.cveCount
              } ${summary.cveCount === 1 ? "CVE" : "CVEs"}`}
        </p>
      </div>

      <Card>
        {query.isPending ? (
          <LoadingBlock label="Loading vulnerability report…" />
        ) : query.isError ? (
          <div className="p-4">
            <ErrorPanel
              title="Could not load the vulnerability report"
              message={errorMessage(query.error)}
              onRetry={() => void query.refetch()}
            />
          </div>
        ) : summary.total === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No known vulnerabilities"
            description="The scan for this package version returned no OSV advisories."
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
              <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <Bug className="size-4 text-red-500" />
                Advisories reported by OSV and stored by Pulp
              </div>
              <span className="text-meta text-zinc-400 dark:text-zinc-500">
                {SEVERITY_ORDER.filter((severity) => summary.bySeverity[severity] > 0)
                  .map(
                    (severity) =>
                      `${summary.bySeverity[severity]} ${severityLabel(severity).toLowerCase()}`,
                  )
                  .join(" · ")}
              </span>
            </div>
            <ul className="space-y-2 p-3">
              {summary.entries.map((entry) => (
                <AdvisoryCard key={entry.id} entry={entry} />
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
