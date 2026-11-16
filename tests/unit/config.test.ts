import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CONFIG, normalizeConfig } from "../../src/lib/config";

test("normalizeConfig keeps session mode and local login by default", () => {
  const config = normalizeConfig({});
  assert.equal(config.authMode, "session");
  assert.equal(config.passwordLoginEnabled, true);
  assert.equal(config.ssoManagedGroup, null);
  assert.equal(config.gatewayBasePath, "/sso/");
  assert.equal(config.uiBasePath, "/ui/");
  assert.equal(config.apiBasePath, "/pulp/api/v3/");
  assert.equal(config.pollIntervalMs, DEFAULT_CONFIG.pollIntervalMs);
});

test("normalizeConfig normalizes base paths with a trailing slash", () => {
  const config = normalizeConfig({
    uiBasePath: "ui",
    apiBasePath: "/pulp/api/v3",
    gatewayBasePath: "sso",
  });
  assert.equal(config.uiBasePath, "/ui/");
  assert.equal(config.apiBasePath, "/pulp/api/v3/");
  assert.equal(config.gatewayBasePath, "/sso/");
});

test("normalizeConfig accepts the three supported auth modes", () => {
  assert.equal(normalizeConfig({ authMode: "session" }).authMode, "session");
  assert.equal(normalizeConfig({ authMode: "external" }).authMode, "external");
  assert.equal(normalizeConfig({ authMode: "gateway" }).authMode, "gateway");
});

test("normalizeConfig treats unknown auth modes as session", () => {
  const config = normalizeConfig({ authMode: "oidc" as never });
  assert.equal(config.authMode, "session");
});

test("normalizeConfig preserves the external login URI", () => {
  const config = normalizeConfig({ authMode: "external", externalLoginUri: "/oauth2/start" });
  assert.equal(config.externalLoginUri, "/oauth2/start");
  assert.equal(normalizeConfig({ externalLoginUri: "  " }).externalLoginUri, null);
});

test("normalizeConfig honours passwordLoginEnabled: false", () => {
  assert.equal(normalizeConfig({ passwordLoginEnabled: false }).passwordLoginEnabled, false);
});

test("normalizeConfig trims the managed group name", () => {
  assert.equal(
    normalizeConfig({ ssoManagedGroup: "  sso-managed  " }).ssoManagedGroup,
    "sso-managed",
  );
  assert.equal(normalizeConfig({ ssoManagedGroup: "" }).ssoManagedGroup, null);
});

test("normalizeConfig clamps the poll interval", () => {
  assert.equal(
    normalizeConfig({ pollIntervalMs: 120 }).pollIntervalMs,
    DEFAULT_CONFIG.pollIntervalMs,
  );
  assert.equal(normalizeConfig({ pollIntervalMs: 5000 }).pollIntervalMs, 5000);
});
