import assert from "node:assert/strict";
import test from "node:test";
import { REPOSITORY_NAME_PATTERN, SSO_PROVIDER_ID_PATTERN } from "../../src/lib/validation";

/**
 * Browsers compile HTML `pattern` attributes with the `v` regex flag. An
 * invalid expression is ignored silently, which turns client-side validation
 * off, so every shared pattern must compile under `v`.
 */
function compile(pattern: string): RegExp {
  return new RegExp(`^(?:${pattern})$`, "v");
}

test("form patterns are valid under the v regex flag", () => {
  assert.doesNotThrow(() => compile(REPOSITORY_NAME_PATTERN));
  assert.doesNotThrow(() => compile(SSO_PROVIDER_ID_PATTERN));
});

test("repository names allow letters, digits, dots, underscores, and hyphens", () => {
  const pattern = compile(REPOSITORY_NAME_PATTERN);
  for (const value of ["production-rpms", "a.b_c-1", "A1"]) {
    assert.equal(pattern.test(value), true, value);
  }
  for (const value of ["", "bad name", "bad/name", "bad:name", "naïve"]) {
    assert.equal(pattern.test(value), false, value);
  }
});

test("provider identifiers start alphanumeric and stay lowercase", () => {
  const pattern = compile(SSO_PROVIDER_ID_PATTERN);
  for (const value of ["microsoft", "google-workspace", "keycloak_2", "a.b", "trailing-"]) {
    assert.equal(pattern.test(value), true, value);
  }
  for (const value of ["", "-leading", "_leading", "Upper", "with space"]) {
    assert.equal(pattern.test(value), false, value);
  }
});
