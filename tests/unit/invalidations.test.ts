import assert from "node:assert/strict";
import test from "node:test";
import { resolveInvalidations } from "../../src/lib/invalidations";

test("a fixed invalidation list is returned unchanged", () => {
  const keys = [["repositories"], ["count", "repositories"]];
  assert.deepEqual(resolveInvalidations(keys, undefined, undefined), keys);
});

test("a function invalidation receives the data and variables", () => {
  const invalidation = (data: { href: string }, vars: { id: number }) => [
    ["repository", data.href],
    ["task", vars.id],
  ];

  assert.deepEqual(
    resolveInvalidations(invalidation, { href: "/pulp/api/v3/repositories/1/" }, { id: 7 }),
    [
      ["repository", "/pulp/api/v3/repositories/1/"],
      ["task", 7],
    ],
  );
});

test("a missing invalidation resolves to no keys", () => {
  assert.deepEqual(resolveInvalidations(undefined, undefined, undefined), []);
});

test("a function invalidation may return no keys", () => {
  assert.deepEqual(
    resolveInvalidations(() => [], undefined, undefined),
    [],
  );
});
