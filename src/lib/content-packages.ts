import type { QueryParams } from "@/api/types";

type ContentRow = Record<string, unknown>;

export type PackageCompareMode = "rpm" | "natural";

export interface PackageTypeConfig {
  /** Pulp content endpoint key, for example `rpm/packages`. */
  key: string;
  /** Fields that identify one package across its variants. */
  identity: string[];
  /** Fields used for the display name. */
  label: string[];
  /** Fields that make up the version label. */
  version: string[];
  /** Extra per-variant fields shown in the list and version pane. */
  detail: string[];
  /** Server ordering that keeps variants of one package close together. */
  ordering?: string;
  /** Version ordering rule; RPM uses epoch, version, and release. */
  compare: PackageCompareMode;
  /** Projection sent as the API `fields` parameter. */
  projection: string[];
}

function defineConfig(
  config: Omit<PackageTypeConfig, "projection"> & { projection?: string[] },
): PackageTypeConfig {
  const fields = new Set([
    ...config.identity,
    ...config.label,
    ...config.version,
    ...config.detail,
    "pulp_href",
    "pulp_last_updated",
    "vuln_report",
    ...(config.projection ?? []),
  ]);
  return { ...config, projection: [...fields] };
}

/**
 * Content types where several units represent variants of one named package.
 * Types that are already unique per unit (files, container tags, advisories,
 * repository metadata) deliberately stay flat.
 */
const PACKAGE_CONFIGS: Record<string, PackageTypeConfig> = {
  "rpm/packages": defineConfig({
    key: "rpm/packages",
    identity: ["name"],
    label: ["name"],
    version: ["epoch", "version", "release"],
    detail: ["arch"],
    ordering: "name",
    compare: "rpm",
  }),
  "rpm/modulemds": defineConfig({
    key: "rpm/modulemds",
    identity: ["name"],
    label: ["name"],
    version: ["version"],
    detail: ["stream", "context", "arch"],
    ordering: "name",
    compare: "natural",
  }),
  "python/packages": defineConfig({
    key: "python/packages",
    identity: ["name"],
    label: ["name"],
    version: ["version"],
    detail: ["packagetype", "python_version", "filename"],
    ordering: "name",
    compare: "natural",
  }),
  "deb/packages": defineConfig({
    key: "deb/packages",
    identity: ["package"],
    label: ["package"],
    version: ["version"],
    detail: ["architecture"],
    ordering: "package",
    compare: "natural",
  }),
  "deb/installer_packages": defineConfig({
    key: "deb/installer_packages",
    identity: ["package"],
    label: ["package"],
    version: ["version"],
    detail: ["architecture"],
    ordering: "package",
    compare: "natural",
  }),
  "gem/gem": defineConfig({
    key: "gem/gem",
    identity: ["name"],
    label: ["name"],
    version: ["version"],
    detail: ["platform"],
    ordering: "name",
    compare: "natural",
  }),
  "npm/packages": defineConfig({
    key: "npm/packages",
    identity: ["name"],
    label: ["name"],
    version: ["version"],
    detail: [],
    ordering: "name",
    compare: "natural",
  }),
  "maven/artifact": defineConfig({
    key: "maven/artifact",
    identity: ["group_id", "artifact_id"],
    label: ["artifact_id"],
    version: ["version"],
    detail: ["group_id"],
    ordering: "artifact_id",
    compare: "natural",
  }),
  "maven/metadata": defineConfig({
    key: "maven/metadata",
    identity: ["group_id", "artifact_id"],
    label: ["artifact_id"],
    version: ["version"],
    detail: ["group_id"],
    ordering: "artifact_id",
    compare: "natural",
  }),
  "maven/package": defineConfig({
    key: "maven/package",
    identity: ["group_id", "artifact_id"],
    label: ["name", "artifact_id"],
    version: ["version"],
    detail: ["group_id"],
    ordering: "artifact_id",
    compare: "natural",
  }),
  "ansible/collection_versions": defineConfig({
    key: "ansible/collection_versions",
    identity: ["namespace", "name"],
    label: ["name"],
    version: ["version"],
    detail: ["namespace"],
    ordering: "name",
    compare: "natural",
  }),
  "ansible/roles": defineConfig({
    key: "ansible/roles",
    identity: ["namespace", "name"],
    label: ["name"],
    version: ["version"],
    detail: ["namespace"],
    ordering: "name",
    compare: "natural",
  }),
};

export function packageConfigFor(plugin: string, type: string): PackageTypeConfig | null {
  return PACKAGE_CONFIGS[`${plugin}/${type}`] ?? null;
}

function readField(row: ContentRow, field: string): string | null {
  const value = row[field];
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

/** Stable identity for a package, also used in the `package` URL parameter. */
export function packageKey(config: PackageTypeConfig, row: ContentRow): string {
  return config.identity.map((field) => readField(row, field) ?? "").join("|");
}

export function packageKeyValues(key: string): string[] {
  return key ? key.split("|") : [];
}

export function packageLabel(config: PackageTypeConfig, row: ContentRow): string {
  for (const field of config.label) {
    const value = readField(row, field);
    if (value) {
      return value;
    }
  }
  return packageKey(config, row) || "Untitled package";
}

function packageVersionParts(config: PackageTypeConfig, row: ContentRow): string[] {
  return config.version.map((field) => readField(row, field) ?? "");
}

export function formatPackageVersion(config: PackageTypeConfig, row: ContentRow): string {
  if (config.compare === "rpm") {
    const [epoch, version, release] = packageVersionParts(config, row);
    const prefix = `${epoch || "0"}:`;
    if (version && release) {
      return `${prefix}${version}-${release}`;
    }
    return `${prefix}${version || release || "—"}`;
  }
  return packageVersionParts(config, row).filter(Boolean).join(" ") || "—";
}

export function packageDetails(config: PackageTypeConfig, row: ContentRow): string[] {
  const values: string[] = [];
  for (const field of config.detail) {
    const value = readField(row, field);
    if (value && !values.includes(value)) {
      values.push(value);
    }
  }
  return values;
}

/** Exact filters that fetch every variant of one package. */
export function packageQueryParams(config: PackageTypeConfig, values: string[]): QueryParams {
  const params: QueryParams = {};
  config.identity.forEach((field, index) => {
    params[field] = values[index] ?? "";
  });
  return params;
}

export interface PackageGroup {
  key: string;
  values: string[];
  label: string;
  units: ContentRow[];
  variants: number;
  versionCount: number;
  details: string[];
  highest: string;
  updated: string | null;
  /** True when more units could still belong to this package. */
  partial: boolean;
}

export function buildPackageGroups(rows: ContentRow[], config: PackageTypeConfig): PackageGroup[] {
  const byKey = new Map<string, ContentRow[]>();
  for (const row of rows) {
    const key = packageKey(config, row);
    const units = byKey.get(key);
    if (units) {
      units.push(row);
    } else {
      byKey.set(key, [row]);
    }
  }

  const groups: PackageGroup[] = [];
  for (const [key, units] of byKey) {
    const sorted = sortPackageUnits(units, config);
    const versions = new Set(sorted.map((row) => formatPackageVersion(config, row)));
    const details: string[] = [];
    for (const row of sorted) {
      for (const detail of packageDetails(config, row)) {
        if (!details.includes(detail)) {
          details.push(detail);
        }
      }
    }
    let updated: string | null = null;
    for (const row of sorted) {
      const value = row.pulp_last_updated;
      if (typeof value === "string" && (updated === null || value > updated)) {
        updated = value;
      }
    }
    groups.push({
      key,
      values: packageKeyValues(key),
      label: packageLabel(config, sorted[0]),
      units: sorted,
      variants: sorted.length,
      versionCount: versions.size,
      details,
      highest: formatPackageVersion(config, sorted[0]),
      updated,
      partial: false,
    });
  }

  groups.sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }),
  );
  return groups;
}

/** Mark the last loaded package as partial while more units are available. */
export function markTrailingGroup(
  groups: PackageGroup[],
  rows: ContentRow[],
  config: PackageTypeConfig,
  hasMore: boolean,
): PackageGroup[] {
  if (!hasMore || rows.length === 0) {
    return groups;
  }
  const tailKey = packageKey(config, rows[rows.length - 1]);
  return groups.map((group) => (group.key === tailKey ? { ...group, partial: true } : group));
}

function isDigit(character: string): boolean {
  return character >= "0" && character <= "9";
}

function isAlpha(character: string): boolean {
  return /[A-Za-z]/.test(character);
}

/**
 * RPM's version comparison: separators are ignored, tildes sort before
 * everything, numeric segments beat alphabetic ones, and numbers compare by
 * value rather than by string length.
 */
export function rpmvercmp(a: string, b: string): number {
  let i = 0;
  let j = 0;

  for (;;) {
    while (i < a.length && !isDigit(a[i]) && !isAlpha(a[i]) && a[i] !== "~") {
      i += 1;
    }
    while (j < b.length && !isDigit(b[j]) && !isAlpha(b[j]) && b[j] !== "~") {
      j += 1;
    }

    const tildeA = i < a.length && a[i] === "~";
    const tildeB = j < b.length && b[j] === "~";
    if (tildeA || tildeB) {
      if (!tildeA) {
        return 1;
      }
      if (!tildeB) {
        return -1;
      }
      i += 1;
      j += 1;
      continue;
    }

    if (i >= a.length || j >= b.length) {
      break;
    }

    const numeric = isDigit(a[i]);
    const startA = i;
    const startB = j;
    if (numeric) {
      while (i < a.length && isDigit(a[i])) i += 1;
      while (j < b.length && isDigit(b[j])) j += 1;
    } else {
      while (i < a.length && isAlpha(a[i])) i += 1;
      while (j < b.length && isAlpha(b[j])) j += 1;
    }

    const segmentA = a.slice(startA, i);
    const segmentB = b.slice(startB, j);
    if (!segmentA) {
      return -1;
    }
    if (!segmentB) {
      return 1;
    }

    if (numeric) {
      const numberA = segmentA.replace(/^0+/, "");
      const numberB = segmentB.replace(/^0+/, "");
      if (numberA.length !== numberB.length) {
        return numberA.length < numberB.length ? -1 : 1;
      }
      if (numberA !== numberB) {
        return numberA < numberB ? -1 : 1;
      }
    } else if (segmentA !== segmentB) {
      return segmentA < segmentB ? -1 : 1;
    }
  }

  const restA = a.slice(i).replace(/^[^A-Za-z0-9~]+/, "");
  const restB = b.slice(j).replace(/^[^A-Za-z0-9~]+/, "");
  if (!restA && !restB) {
    return 0;
  }
  if (!restA) {
    return restB.startsWith("~") ? 1 : -1;
  }
  if (!restB) {
    return restA.startsWith("~") ? -1 : 1;
  }
  if (restA.startsWith("~") !== restB.startsWith("~")) {
    return restA.startsWith("~") ? -1 : 1;
  }
  return restA < restB ? -1 : 1;
}

function tokenizeVersion(value: string): string[] {
  return value.match(/\d+|[^\d]+/g) ?? [];
}

/** Numeric-aware comparison for ecosystems without a dedicated comparator. */
export function naturalVersionCompare(a: string, b: string): number {
  const left = tokenizeVersion(a.toLowerCase());
  const right = tokenizeVersion(b.toLowerCase());
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const segmentA = left[index];
    const segmentB = right[index];
    if (segmentA === undefined) {
      return -1;
    }
    if (segmentB === undefined) {
      return 1;
    }
    const numericA = /^\d+$/.test(segmentA);
    const numericB = /^\d+$/.test(segmentB);
    if (numericA && numericB) {
      const numberA = Number.parseInt(segmentA, 10);
      const numberB = Number.parseInt(segmentB, 10);
      if (numberA !== numberB) {
        return numberA < numberB ? -1 : 1;
      }
      continue;
    }
    if (segmentA !== segmentB) {
      return segmentA < segmentB ? -1 : 1;
    }
  }
  return 0;
}

export function comparePackageVersions(
  a: ContentRow,
  b: ContentRow,
  config: PackageTypeConfig,
): number {
  if (config.compare === "rpm") {
    const [epochA, versionA, releaseA] = packageVersionParts(config, a);
    const [epochB, versionB, releaseB] = packageVersionParts(config, b);
    const epochDelta = (Number.parseInt(epochA, 10) || 0) - (Number.parseInt(epochB, 10) || 0);
    if (epochDelta !== 0) {
      return epochDelta;
    }
    const versionDelta = rpmvercmp(versionA, versionB);
    if (versionDelta !== 0) {
      return versionDelta;
    }
    return rpmvercmp(releaseA, releaseB);
  }
  return naturalVersionCompare(formatPackageVersion(config, a), formatPackageVersion(config, b));
}

/** Newest variants first. */
export function sortPackageUnits(rows: ContentRow[], config: PackageTypeConfig): ContentRow[] {
  return [...rows].sort((a, b) => comparePackageVersions(b, a, config));
}
