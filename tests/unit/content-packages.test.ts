import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPackageGroups,
  comparePackageVersions,
  formatPackageVersion,
  markTrailingGroup,
  naturalVersionCompare,
  packageConfigFor,
  packageKey,
  rpmvercmp,
  sortPackageUnits,
} from "../../src/lib/content-packages";

const rpm = packageConfigFor("rpm", "packages");
const maven = packageConfigFor("maven", "artifact");

function requireConfig<T>(value: T | null): T {
  assert.ok(value, "package config is registered");
  return value;
}

const rpmConfig = requireConfig(rpm);
const mavenConfig = requireConfig(maven);

test("packageConfigFor only groups versioned package content", () => {
  assert.ok(packageConfigFor("rpm", "packages"));
  assert.ok(packageConfigFor("python", "packages"));
  assert.ok(packageConfigFor("deb", "packages"));
  assert.ok(packageConfigFor("ansible", "collection_versions"));
  assert.equal(packageConfigFor("file", "files"), null);
  assert.equal(packageConfigFor("container", "tags"), null);
  assert.equal(packageConfigFor("rpm", "advisories"), null);
});

test("rpmvercmp orders numbers numerically and handles tildes", () => {
  assert.equal(rpmvercmp("1.9", "1.10"), -1);
  assert.equal(rpmvercmp("1.10", "1.9"), 1);
  assert.equal(rpmvercmp("1.0", "1.0"), 0);
  assert.equal(rpmvercmp("1.0~rc1", "1.0"), -1);
  assert.equal(rpmvercmp("1.0", "1.0a"), -1);
  assert.equal(rpmvercmp("2.0", "2.0.0"), -1);
});

test("naturalVersionCompare is numeric-aware", () => {
  assert.equal(naturalVersionCompare("1.9", "1.10"), -1);
  assert.equal(naturalVersionCompare("1.0", "1.0.1"), -1);
  assert.equal(naturalVersionCompare("1.0.0", "1.0.0"), 0);
});

test("comparePackageVersions uses epochs before versions for RPM", () => {
  const highEpoch = {
    epoch: "2",
    version: "1.20.1",
    release: "28.el9",
  };
  const highVersion = {
    epoch: "1",
    version: "1.26.3",
    release: "9.el9",
  };
  assert.equal(comparePackageVersions(highEpoch, highVersion, rpmConfig), 1);
  assert.equal(comparePackageVersions(highVersion, highEpoch, rpmConfig), -1);
});

test("formatPackageVersion renders epoch, version, and release for RPM", () => {
  assert.equal(
    formatPackageVersion(rpmConfig, { epoch: "2", version: "1.26.3", release: "9.el9" }),
    "2:1.26.3-9.el9",
  );
  assert.equal(formatPackageVersion(rpmConfig, { version: "1.0" }), "0:1.0");
});

test("buildPackageGroups merges variants of one package", () => {
  const rows = [
    {
      name: "nginx",
      epoch: "2",
      version: "1.20.1",
      release: "28.el9",
      arch: "x86_64",
      pulp_href: "/a/",
      pulp_last_updated: "2026-11-01T10:00:00Z",
    },
    {
      name: "nginx",
      epoch: "2",
      version: "1.20.1",
      release: "28.el9",
      arch: "noarch",
      pulp_href: "/b/",
      pulp_last_updated: "2026-11-02T10:00:00Z",
    },
    {
      name: "nginx",
      epoch: "1",
      version: "1.26.3",
      release: "9.el9",
      arch: "x86_64",
      pulp_href: "/c/",
      pulp_last_updated: "2026-10-01T10:00:00Z",
    },
    {
      name: "nginx-core",
      epoch: "1",
      version: "1.26.3",
      release: "9.el9",
      arch: "x86_64",
      pulp_href: "/d/",
      pulp_last_updated: "2026-10-01T10:00:00Z",
    },
  ];

  const groups = buildPackageGroups(rows, rpmConfig);
  assert.equal(groups.length, 2);

  const nginx = groups.find((group) => group.label === "nginx");
  assert.ok(nginx);
  assert.equal(nginx.key, "nginx");
  assert.equal(nginx.variants, 3);
  assert.equal(nginx.versionCount, 2);
  assert.deepEqual(nginx.details, ["x86_64", "noarch"]);
  assert.equal(nginx.highest, "2:1.20.1-28.el9");
  assert.equal(nginx.updated, "2026-11-02T10:00:00Z");
  assert.equal(nginx.partial, false);

  const core = groups.find((group) => group.label === "nginx-core");
  assert.ok(core);
  assert.equal(core.highest, "1:1.26.3-9.el9");
});

test("maven packages are identified by group and artifact", () => {
  const rows = [
    { group_id: "org.example", artifact_id: "core", version: "1.0" },
    { group_id: "org.other", artifact_id: "core", version: "2.0" },
    { group_id: "org.example", artifact_id: "core", version: "1.1" },
  ];

  const groups = buildPackageGroups(rows, mavenConfig);
  assert.equal(groups.length, 2);
  const example = groups.find((group) => group.values[0] === "org.example");
  assert.ok(example);
  assert.equal(example.values[1], "core");
  assert.equal(example.variants, 2);
  assert.equal(packageKey(mavenConfig, rows[0]), "org.example|core");
});

test("sortPackageUnits returns newest variants first", () => {
  const rows = [
    { name: "nginx", epoch: "1", version: "1.20.1", release: "1.el9" },
    { name: "nginx", epoch: "2", version: "1.22.1", release: "2.el9" },
    { name: "nginx", epoch: "1", version: "1.26.3", release: "9.el9" },
  ];
  const sorted = sortPackageUnits(rows, rpmConfig);
  assert.deepEqual(
    sorted.map((row) => formatPackageVersion(rpmConfig, row)),
    ["2:1.22.1-2.el9", "1:1.26.3-9.el9", "1:1.20.1-1.el9"],
  );
});

test("markTrailingGroup flags the package at the page boundary", () => {
  const rows = [
    { name: "nginx", epoch: "1", version: "1.0", release: "1.el9" },
    { name: "nginx-core", epoch: "1", version: "1.0", release: "1.el9" },
  ];
  const groups = buildPackageGroups(rows, rpmConfig);
  const marked = markTrailingGroup(groups, rows, rpmConfig, true);
  assert.equal(marked.find((group) => group.label === "nginx-core")?.partial, true);
  assert.equal(marked.find((group) => group.label === "nginx")?.partial, false);
  assert.deepEqual(markTrailingGroup(groups, rows, rpmConfig, false), groups);
});
