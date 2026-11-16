import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

export const OSV_ECOSYSTEMS = [
  "AlmaLinux",
  "Azure Linux",
  "Mageia",
  "openEuler",
  "openSUSE",
  "Photon OS",
  "Red Hat",
  "Rocky Linux",
  "SUSE",
] as const;

/** Editable row; releases stay as text so typing a comma does not fight the input. */
export interface OsvConfigRow {
  name: string;
  releases: string;
}

export function parseOsvConfig(value: unknown): OsvConfigRow[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const record = item as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name : "";
    const releases = Array.isArray(record.releases)
      ? record.releases.filter((release): release is string => typeof release === "string")
      : [];
    return name ? [{ name, releases: releases.join(", ") }] : [];
  });
}

export function serializeOsvConfig(rows: OsvConfigRow[]): Array<{
  name: string;
  releases: string[];
}> | null {
  const cleaned = rows
    .map((row) => ({
      name: row.name,
      releases: row.releases
        .split(",")
        .map((release) => release.trim())
        .filter(Boolean),
    }))
    .filter((row) => row.name && row.releases.length);
  return cleaned.length ? cleaned : null;
}

export function osvConfigError(rows: OsvConfigRow[]): string | null {
  const invalid = rows.find((row) => row.releases.trim() && !serializeOsvConfig([row]));
  return invalid ? `Add at least one release for ${invalid.name}.` : null;
}

export function hasOsvConfig(value: unknown): boolean {
  return serializeOsvConfig(parseOsvConfig(value)) !== null;
}

export function OsvConfigFields({
  idPrefix,
  rows,
  onChange,
  disabled,
}: {
  idPrefix: string;
  rows: OsvConfigRow[];
  onChange: (rows: OsvConfigRow[]) => void;
  disabled?: boolean;
}) {
  function update(index: number, next: Partial<OsvConfigRow>) {
    onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...next } : row)));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>OSV vulnerability scanning</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...rows, { name: "Rocky Linux", releases: "" }])}
          disabled={disabled}
        >
          <Plus className="size-3.5" />
          Add ecosystem
        </Button>
      </div>
      <p className="text-meta text-zinc-400 dark:text-zinc-500">
        Required before scanning this RPM repository. Each release entry triggers an OSV query per
        package when a version is scanned. Use the CPE for Red Hat, the release number for Rocky
        Linux, AlmaLinux, Mageia, Photon OS, and openEuler, and the <code>PRETTY_NAME</code> for
        SUSE and openSUSE.
      </p>

      {rows.length ? (
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={index} className="flex items-end gap-2">
              <div className="w-40 shrink-0 space-y-1">
                <Label htmlFor={`${idPrefix}-osv-ecosystem-${index}`} className="sr-only">
                  OSV ecosystem {index + 1}
                </Label>
                <Select
                  id={`${idPrefix}-osv-ecosystem-${index}`}
                  value={row.name}
                  onChange={(event) => update(index, { name: event.target.value })}
                  disabled={disabled}
                  aria-label={`OSV ecosystem ${index + 1}`}
                >
                  {OSV_ECOSYSTEMS.map((ecosystem) => (
                    <option key={ecosystem} value={ecosystem}>
                      {ecosystem}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <Label htmlFor={`${idPrefix}-osv-releases-${index}`} className="sr-only">
                  Releases for ecosystem {index + 1}
                </Label>
                <Input
                  id={`${idPrefix}-osv-releases-${index}`}
                  value={row.releases}
                  onChange={(event) => update(index, { releases: event.target.value })}
                  placeholder="Comma-separated releases, e.g. 9"
                  disabled={disabled}
                  aria-label={`Releases for OSV ecosystem ${index + 1}`}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}
                disabled={disabled}
                aria-label={`Remove OSV ecosystem ${index + 1}`}
                title="Remove"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-zinc-300 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          Scanning is off. Add at least one ecosystem and release to enable it.
        </p>
      )}
    </div>
  );
}
