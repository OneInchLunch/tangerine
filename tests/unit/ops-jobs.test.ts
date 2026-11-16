import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../deploy/helm/tangerine/templates/ops-jobs.yaml", import.meta.url),
  "utf8",
);

function jobBlocks(): string[] {
  return source.split(/\n---\n/).filter((block) => block.includes("kind: Job"));
}

function jobFor(name: string): string {
  const block = jobBlocks().find((item) => item.includes(`name: {{ $full }}-${name}`));
  assert.ok(block, `job ${name} not found`);
  return block!;
}

function weightOf(name: string): number {
  const block = jobFor(name);
  const match = /helm\.sh\/hook-weight: "(-?\d+)"/.exec(block);
  assert.ok(match, `weight missing for ${name}`);
  return Number(match![1]);
}

test("ops jobs run migrate, access policies, managed roles, then secret check", () => {
  const migrate = weightOf("migrate");
  const accessPolicies = weightOf("access-policies");
  const managedRoles = weightOf("managed-roles");
  const secretCheck = weightOf("secret-check");

  assert.ok(migrate < accessPolicies, "migrate must run before access policies");
  assert.ok(accessPolicies < managedRoles, "access policies must run before managed roles");
  assert.ok(managedRoles < secretCheck, "managed roles must run before secret check");
});

test("every ops job waits for its dependency", () => {
  assert.match(jobFor("migrate"), /initContainers:[\s\S]*name: wait-for-postgres/);
  assert.match(jobFor("access-policies"), /initContainers:[\s\S]*name: wait-for-postgres/);
  assert.match(jobFor("managed-roles"), /initContainers:[\s\S]*name: wait-for-pulp/);
  assert.match(jobFor("secret-check"), /initContainers:[\s\S]*name: wait-for-postgres/);
});

const cronSource = readFileSync(
  new URL("../../deploy/helm/tangerine/templates/ops-cronjobs.yaml", import.meta.url),
  "utf8",
);

test("the optional prune CronJob mounts an operator directory snapshot", () => {
  assert.match(cronSource, /name: \{\{ \$full \}\}-prune-identities/);
  assert.match(cronSource, /prune-identities/);
  assert.match(cronSource, /--directory-file/);
  assert.match(cronSource, /directoryConfigMap is required/);
  assert.match(cronSource, /name: directory[\s\S]*configMap:/);
});
