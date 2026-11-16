import assert from "node:assert/strict";
import test from "node:test";
import { isDirtyValue } from "../../src/lib/use-form-state";

test("isDirtyValue treats identical primitives and objects as clean", () => {
  assert.equal(isDirtyValue("a", "a"), false);
  assert.equal(isDirtyValue({ name: "a" }, { name: "a" }), false);
  assert.equal(isDirtyValue({ name: "a", rows: [] }, { name: "a", rows: [] }), false);
});

test("isDirtyValue detects changed and nested values", () => {
  assert.equal(isDirtyValue({ name: "b" }, { name: "a" }), true);
  assert.equal(isDirtyValue({ rows: [{ source: "x" }] }, { rows: [] }), true);
  assert.equal(isDirtyValue({ autopublish: false }, { autopublish: true }), true);
});
