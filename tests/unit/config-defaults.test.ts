import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DEFAULT_CONFIG } from "../../src/lib/config";

test("public/config.json matches the runtime defaults", () => {
  const shipped = JSON.parse(
    readFileSync(new URL("../../public/config.json", import.meta.url), "utf8"),
  ) as Record<string, unknown>;

  assert.deepEqual(shipped, DEFAULT_CONFIG);
});

test("Helm config defaults match the runtime defaults", () => {
  const values = readFileSync(
    new URL("../../deploy/helm/tangerine/values.yaml", import.meta.url),
    "utf8",
  );
  const block = values.split(/^config:\s*$/m)[1]?.split(/^\S/m)[0] ?? "";
  const parsed: Record<string, unknown> = {};
  for (const rawLine of block.split("\n")) {
    const line = rawLine.replace(/\s+#.*$/, "").trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const match = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
    if (!match) {
      continue;
    }
    const [, key, raw] = match;
    let value: unknown = raw;
    if (raw === "null" || raw === "") {
      value = raw === "null" ? null : "";
    } else if (raw === "true" || raw === "false") {
      value = raw === "true";
    } else if (/^\d+$/.test(raw)) {
      value = Number(raw);
    } else {
      value = raw.replace(/^"(.*)"$/, "$1");
    }
    parsed[key] = value;
  }

  assert.deepEqual(parsed, DEFAULT_CONFIG);
});
