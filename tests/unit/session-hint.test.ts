import assert from "node:assert/strict";
import test from "node:test";
import { createSessionHint, isSessionHintValid } from "../../src/lib/session-hint";

test("a fresh hint is valid until its TTL elapses", () => {
  const now = 1_000_000;
  const hint = createSessionHint(now, 5_000);
  assert.equal(isSessionHintValid(hint, now), true);
  assert.equal(isSessionHintValid(hint, now + 4_999), true);
  assert.equal(isSessionHintValid(hint, now + 5_000), false);
  assert.equal(isSessionHintValid(hint, now + 5_001), false);
});

test("missing, malformed, or incomplete hints are invalid", () => {
  assert.equal(isSessionHintValid(null), false);
  assert.equal(isSessionHintValid(""), false);
  assert.equal(isSessionHintValid("not json"), false);
  assert.equal(isSessionHintValid("{}"), false);
  assert.equal(isSessionHintValid('{"expiresAt":"later"}'), false);
});

test("the serialized hint only contains an absolute expiry", () => {
  const hint = JSON.parse(createSessionHint(10, 20)) as Record<string, unknown>;
  assert.deepEqual(Object.keys(hint), ["expiresAt"]);
  assert.equal(hint.expiresAt, 30);
});
