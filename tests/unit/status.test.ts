import assert from "node:assert/strict";
import test from "node:test";
import { coreComponent, coreVersion } from "../../src/lib/status";

const status = {
  versions: [
    { component: "file", version: "3.123.0", package: "pulpcore" },
    { component: "core", version: "3.123.0", package: "pulpcore" },
  ],
} as never;

test("coreComponent reads the real Pulp component name", () => {
  assert.equal(coreComponent(status)?.component, "core");
  assert.equal(coreVersion(status), "3.123.0");
});

test("coreComponent accepts the legacy pulpcore spelling", () => {
  const legacy = {
    versions: [{ component: "pulpcore", version: "3.100.0", package: "pulpcore" }],
  } as never;
  assert.equal(coreVersion(legacy), "3.100.0");
});
