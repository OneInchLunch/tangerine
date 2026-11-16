export type Severity = "critical" | "high" | "medium" | "low" | "unknown";

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "unknown"];

const SEVERITY_LABELS: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  unknown: "Unknown",
};

const SEVERITY_CHIPS: Record<Severity, string> = {
  critical: "C",
  high: "H",
  medium: "M",
  low: "L",
  unknown: "U",
};

export function severityLabel(severity: Severity): string {
  return SEVERITY_LABELS[severity];
}

export function severityChip(severity: Severity): string {
  return SEVERITY_CHIPS[severity];
}

export interface OsvSeverity {
  type?: string;
  score?: string;
}

export interface OsvRangeEvent {
  introduced?: string;
  fixed?: string;
  last_affected?: string;
  limit?: string;
}

export interface OsvAffected {
  package?: { name?: string; ecosystem?: string; purl?: string };
  ranges?: Array<{ type?: string; events?: OsvRangeEvent[] }>;
  versions?: string[];
  database_specific?: Record<string, unknown>;
}

export interface OsvVulnerability {
  id?: string;
  aliases?: unknown;
  upstream?: unknown;
  summary?: unknown;
  details?: unknown;
  modified?: unknown;
  published?: unknown;
  severity?: unknown;
  affected?: unknown;
  database_specific?: unknown;
}

export interface VulnerabilityEntry {
  id: string;
  cveIds: string[];
  summary: string;
  severity: Severity;
  fixedVersions: string[];
  published: string | null;
  url: string;
}

export interface VulnerabilitySummary {
  total: number;
  cveCount: number;
  cveIds: string[];
  bySeverity: Record<Severity, number>;
  highest: Severity | null;
  entries: VulnerabilityEntry[];
}

/** A vulnerability report row from `GET /pulp/api/v3/vuln_report/`. */
export interface VulnerabilityReport {
  pulp_href?: string;
  content?: string;
  vulns?: unknown;
}

const CVE_PATTERN = /^CVE-\d{4}-\d+$/i;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim()] : []));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function normalizeSeverity(value: unknown): Severity | null {
  if (typeof value !== "string") {
    return null;
  }
  switch (value.trim().toLowerCase()) {
    case "critical":
    case "crit":
      return "critical";
    case "important":
    case "high":
    case "major":
      return "high";
    case "moderate":
    case "medium":
    case "minor":
      return "medium";
    case "low":
    case "negligible":
      return "low";
    default:
      return null;
  }
}

function severityFromSummary(summary: string | null): Severity | null {
  if (!summary) {
    return null;
  }
  const match = summary
    .trim()
    .match(/^(critical|important|high|moderate|medium|low|negligible)\b/i);
  return match ? normalizeSeverity(match[1]) : null;
}

function severityFromScore(score: number): Severity {
  if (score >= 9) {
    return "critical";
  }
  if (score >= 7) {
    return "high";
  }
  if (score >= 4) {
    return "medium";
  }
  return score > 0 ? "low" : "unknown";
}

/**
 * CVSS v3.0/v3.1 base score from a vector string. Returns null for malformed
 * vectors or other CVSS versions.
 */
export function cvssV3BaseScore(vector: string): number | null {
  if (!/^CVSS:3\.[01]\//.test(vector.trim())) {
    return null;
  }
  const metrics: Record<string, string> = {};
  for (const part of vector.trim().split("/").slice(1)) {
    const [key, value] = part.split(":");
    if (key && value) {
      metrics[key.toUpperCase()] = value.toUpperCase();
    }
  }

  const avWeights: Record<string, number> = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 };
  const acWeights: Record<string, number> = { L: 0.77, H: 0.44 };
  const uiWeights: Record<string, number> = { N: 0.85, R: 0.62 };
  const ciaWeights: Record<string, number> = { H: 0.56, L: 0.22, N: 0 };
  const scope = metrics.S;
  const prWeights: Record<string, number> =
    scope === "C" ? { N: 0.85, L: 0.68, H: 0.5 } : { N: 0.85, L: 0.62, H: 0.27 };

  const av = avWeights[metrics.AV];
  const ac = acWeights[metrics.AC];
  const pr = prWeights[metrics.PR];
  const ui = uiWeights[metrics.UI];
  const confidentiality = ciaWeights[metrics.C];
  const integrity = ciaWeights[metrics.I];
  const availability = ciaWeights[metrics.A];

  if (
    scope === undefined ||
    [av, ac, pr, ui, confidentiality, integrity, availability].some((value) => value === undefined)
  ) {
    return null;
  }

  const iss = 1 - (1 - confidentiality) * (1 - integrity) * (1 - availability);
  const impact = scope === "C" ? 7.52 * (iss - 0.029) - 3.25 * (iss - 0.02) ** 15 : 6.42 * iss;
  if (impact <= 0) {
    return 0;
  }
  const exploitability = 8.22 * av * ac * pr * ui;
  const base =
    scope === "C"
      ? Math.min(1.08 * (impact + exploitability), 10)
      : Math.min(impact + exploitability, 10);
  return Math.ceil(Number((base * 10).toFixed(6))) / 10;
}

function severityFromCvss(value: unknown): Severity | null {
  for (const item of asArray(value)) {
    const record = asRecord(item);
    if (!record) {
      continue;
    }
    const score = asString(record.score);
    if (!score) {
      continue;
    }
    if (score.startsWith("CVSS:3")) {
      const base = cvssV3BaseScore(score);
      if (base !== null) {
        return severityFromScore(base);
      }
      continue;
    }
    const numeric = Number.parseFloat(score);
    if (Number.isFinite(numeric)) {
      return severityFromScore(numeric);
    }
  }
  return null;
}

function databaseSeverity(record: Record<string, unknown> | null): Severity | null {
  if (!record) {
    return null;
  }
  return normalizeSeverity(record.severity) ?? normalizeSeverity(record.cvss_severity);
}

/** Severity for one OSV advisory, preferring vendor labels over CVSS scores. */
export function severityFromVulnerability(vulnerability: OsvVulnerability): Severity {
  const direct = databaseSeverity(asRecord(vulnerability.database_specific));
  if (direct) {
    return direct;
  }
  const summarySeverity = severityFromSummary(asString(vulnerability.summary));
  if (summarySeverity) {
    return summarySeverity;
  }
  for (const affected of asArray(vulnerability.affected)) {
    const severity = databaseSeverity(asRecord(asRecord(affected)?.database_specific));
    if (severity) {
      return severity;
    }
  }
  return severityFromCvss(vulnerability.severity) ?? "unknown";
}

function fixedVersionsFor(vulnerability: OsvVulnerability): string[] {
  const fixed = new Set<string>();
  for (const affected of asArray(vulnerability.affected)) {
    const record = asRecord(affected);
    for (const range of asArray(record?.ranges)) {
      const rangeRecord = asRecord(range);
      for (const event of asArray(rangeRecord?.events)) {
        const value = asString(asRecord(event)?.fixed);
        if (value) {
          fixed.add(value);
        }
      }
    }
  }
  return [...fixed];
}

function cveIdsFor(vulnerability: OsvVulnerability): string[] {
  const ids = new Set<string>();
  const id = asString(vulnerability.id);
  if (id && CVE_PATTERN.test(id)) {
    ids.add(id.toUpperCase());
  }
  for (const candidate of [
    ...asStringList(vulnerability.upstream),
    ...asStringList(vulnerability.aliases),
  ]) {
    if (CVE_PATTERN.test(candidate)) {
      ids.add(candidate.toUpperCase());
    }
  }
  return [...ids];
}

/**
 * Turn a report's OSV payload into severity counts and a detail list. Pulp
 * stores advisories, so the badge counts advisories and lists their CVEs.
 */
export function summarizeVulnerabilities(raw: unknown): VulnerabilitySummary {
  const seen = new Set<string>();
  const entries: VulnerabilityEntry[] = [];
  const cveIds = new Set<string>();

  for (const item of asArray(raw)) {
    const vulnerability = item as OsvVulnerability;
    const id = asString(vulnerability.id);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    const advisoriesCves = cveIdsFor(vulnerability);
    for (const cve of advisoriesCves) {
      cveIds.add(cve);
    }
    const summary =
      asString(vulnerability.summary) ?? asString(vulnerability.details)?.split("\n")[0] ?? id;
    entries.push({
      id,
      cveIds: advisoriesCves,
      summary,
      severity: severityFromVulnerability(vulnerability),
      fixedVersions: fixedVersionsFor(vulnerability),
      published: asString(vulnerability.published),
      url: `https://osv.dev/vulnerability/${encodeURIComponent(id)}`,
    });
  }

  const bySeverity: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    unknown: 0,
  };
  for (const entry of entries) {
    bySeverity[entry.severity] += 1;
  }

  const highest = SEVERITY_ORDER.find((severity) => bySeverity[severity] > 0) ?? null;

  return {
    total: entries.length,
    cveCount: cveIds.size,
    cveIds: [...cveIds],
    bySeverity,
    highest,
    entries,
  };
}

/** Key a report by href path so relative and absolute links match. */
export function reportHrefKey(href: string): string {
  return href.replace(/^https?:\/\/[^/]+/, "").replace(/\/+$/, "");
}
