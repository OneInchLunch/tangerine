import assert from "node:assert/strict";
import test from "node:test";
import {
  contentMatchesQuery,
  contentPluginLabel,
  contentPrimaryLabel,
  contentSecondaryLabel,
  contentTypeLabel,
} from "../../src/lib/content-labels";

const rpm = (type: string) => ({ plugin: "rpm", type });

test("RPM advisories use the advisory title and severity", () => {
  const row = {
    title: "Important: nginx security update",
    id: "RLSA-2026:59362",
    version: "2",
    severity: "Important",
  };

  assert.equal(contentPrimaryLabel(row, rpm("advisories")), "Important: nginx security update");
  assert.equal(contentSecondaryLabel(row, rpm("advisories")), "Important");
});

test("RPM modules, defaults, and distribution trees resolve readable labels", () => {
  assert.equal(
    contentPrimaryLabel({ module: "postgresql", stream: "15" }, rpm("modulemd_defaults")),
    "postgresql",
  );
  assert.equal(
    contentSecondaryLabel({ module: "postgresql", stream: "15" }, rpm("modulemd_defaults")),
    "15",
  );

  assert.equal(
    contentPrimaryLabel({ module_name: "nodejs", module_stream: "18" }, rpm("modulemd_obsoletes")),
    "nodejs",
  );
  assert.equal(
    contentSecondaryLabel(
      { module_name: "nodejs", module_stream: "18" },
      rpm("modulemd_obsoletes"),
    ),
    "18",
  );

  const tree = { release_name: "Rocky Linux", release_version: "9.8", arch: "x86_64" };
  assert.equal(contentPrimaryLabel(tree, rpm("distribution_trees")), "Rocky Linux 9.8");
  assert.equal(contentSecondaryLabel(tree, rpm("distribution_trees")), "x86_64");
});

test("generic and Maven labels fall back without becoming untitled", () => {
  assert.equal(
    contentPrimaryLabel({ relative_path: "demo/a.txt" }, { plugin: "file", type: "files" }),
    "demo/a.txt",
  );

  const maven = { artifact_id: "guava", group_id: "com.google", version: "33.0" };
  assert.equal(contentPrimaryLabel(maven, { plugin: "maven", type: "artifact" }), "guava");
  assert.equal(contentSecondaryLabel(maven, { plugin: "maven", type: "artifact" }), "33.0");

  assert.equal(contentPrimaryLabel({}), "Untitled content");
  assert.equal(contentSecondaryLabel({}), "—");
});

test("plugin and content type labels are readable", () => {
  assert.equal(contentPluginLabel("rpm"), "RPM");
  assert.equal(contentPluginLabel("deb"), "Debian");
  assert.equal(contentPluginLabel("hugging_face"), "Hugging Face");
  assert.equal(contentPluginLabel("custom_plugin"), "Custom Plugin");

  assert.equal(contentTypeLabel("modulemd_defaults"), "Module defaults");
  assert.equal(contentTypeLabel("distribution_trees"), "Distribution trees");
  assert.equal(contentTypeLabel("openpgp_publickey"), "OpenPGP public keys");
  assert.equal(contentTypeLabel("custom_type"), "Custom Type");
});

test("content filtering matches labels and identifying fields", () => {
  const advisory = {
    title: "Important: nginx security update",
    id: "RLSA-2026:59362",
    severity: "Important",
  };

  assert.equal(contentMatchesQuery(advisory, "nginx"), true);
  assert.equal(contentMatchesQuery(advisory, "RLSA-2026"), true);
  assert.equal(contentMatchesQuery(advisory, "important"), true);
  assert.equal(contentMatchesQuery(advisory, "postgres"), false);
  assert.equal(contentMatchesQuery({ relative_path: "demo/a.txt" }, "DEMO"), true);
});
