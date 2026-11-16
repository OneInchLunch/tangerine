import assert from "node:assert/strict";
import test from "node:test";
import type { SsoProviderConfig } from "../../src/api/gateway";
import {
  applyKind,
  applyPreset,
  buildPayload,
  callbackNeedsHttps,
  emptyForm,
  formFromProvider,
  microsoftIssuer,
  tenantIdFromIssuer,
} from "../../src/features/settings/sso/presets";

function provider(overrides: Partial<SsoProviderConfig> = {}): SsoProviderConfig {
  return {
    id: "entra",
    label: "Entra ID",
    kind: "azuread",
    issuer: "https://login.microsoftonline.com/00000000-0000-0000-0000-000000000000/v2.0",
    clientId: "client",
    secretFile: "entra-secret",
    scopes: "openid profile email",
    groupClaim: "groups",
    roleClaim: "roles",
    usernameClaim: "upn",
    usernamePrefix: "",
    requireEmailVerified: false,
    allowedTenants: [],
    fetchGraphGroups: false,
    fetchGoogleGroups: false,
    googleServiceAccountFile: "",
    googleAdminEmail: "",
    groupMap: { "pulp-admins": "pulp-admin" },
    roleMap: {},
    accessRules: [],
    baselineGroup: "",
    baselineRoles: [],
    strictGroups: false,
    allowedEmailDomains: [],
    requireHostedDomain: false,
    enabled: true,
    sortOrder: 3,
    ...overrides,
  };
}

test("microsoft issuer and tenant conversion are inverse", () => {
  const issuer = microsoftIssuer("tenant-a");
  assert.equal(issuer, "https://login.microsoftonline.com/tenant-a/v2.0");
  assert.equal(tenantIdFromIssuer(issuer), "tenant-a");
  assert.equal(tenantIdFromIssuer("https://accounts.google.com"), "");
  assert.equal(microsoftIssuer("  "), "");
});

test("formFromProvider hydrates mappings, tenants, and presets", () => {
  const form = formFromProvider(
    provider({ allowedTenants: ["tenant-a", "tenant-b"], sortOrder: 7 }),
  );
  assert.equal(form.preset, "azuread");
  assert.equal(form.tenantId, "00000000-0000-0000-0000-000000000000");
  assert.equal(form.allowedTenants, "tenant-a, tenant-b");
  assert.deepEqual(form.groupMappings, [{ source: "pulp-admins", target: "pulp-admin" }]);
  assert.equal(form.sortOrder, "7");
  assert.equal(form.enabled, true);
});

test("applyPreset applies provider defaults without dropping typed values", () => {
  const base = { ...emptyForm(), label: "My IdP", clientId: "abc" };
  const google = applyPreset("google", base);
  assert.equal(google.kind, "google");
  assert.equal(google.issuer, "https://accounts.google.com");
  assert.equal(google.usernameClaim, "email");
  assert.equal(google.requireEmailVerified, true);
  assert.equal(google.label, "My IdP");

  const azure = applyPreset("azuread", {
    ...base,
    tenantId: "tenant-a",
    requireEmailVerified: true,
    fetchGoogleGroups: true,
  });
  assert.equal(azure.issuer, "https://login.microsoftonline.com/tenant-a/v2.0");
  assert.equal(azure.scopes, "openid profile email User.Read GroupMember.Read.All");
  assert.equal(azure.usernameClaim, "preferred_username");
  assert.equal(azure.requireEmailVerified, false);
  assert.equal(azure.fetchGraphGroups, true);
  assert.equal(azure.fetchGoogleGroups, false);

  const multiTenant = applyPreset("azuread", { ...base, multiTenant: true, tenantId: "tenant-a" });
  assert.equal(multiTenant.issuer, "https://login.microsoftonline.com/common/v2.0");
});

test("buildPayload trims values, parses tenants, and keeps the provider id", () => {
  const form = {
    ...formFromProvider(provider()),
    id: "  entra  ",
    label: "  Entra  ",
    allowedTenants: " tenant-a, tenant-b ",
  };
  const payload = buildPayload(form);
  assert.equal(payload.id, "entra");
  assert.equal(payload.label, "Entra");
  assert.deepEqual(payload.allowedTenants, ["tenant-a", "tenant-b"]);
  assert.deepEqual(payload.groupMap, { "pulp-admins": "pulp-admin" });
});

test("buildPayload rejects duplicate and incomplete mappings", () => {
  const duplicate = {
    ...emptyForm(),
    groupMappings: [
      { source: "same", target: "one" },
      { source: "same", target: "two" },
    ],
  };
  assert.throws(() => buildPayload(duplicate), /duplicate key same/);

  const missingTarget = {
    ...emptyForm(),
    roleMappings: [{ source: "role", target: "  " }],
  };
  assert.throws(() => buildPayload(missingTarget), /target is required/);
});

test("callbackNeedsHttps only flags public HTTP callbacks", () => {
  assert.equal(callbackNeedsHttps("http://localhost:5173/sso/callback", "google"), false);
  assert.equal(callbackNeedsHttps("http://127.0.0.1:5173/sso/callback", "azuread"), false);
  assert.equal(callbackNeedsHttps("http://example.com/callback", "google"), true);
  assert.equal(callbackNeedsHttps("https://example.com/callback", "google"), false);
  assert.equal(callbackNeedsHttps("http://example.com/callback", "oidc"), false);
});

test("formFromProvider hydrates access rules, baseline, and domain policy", () => {
  const form = formFromProvider(
    provider({
      accessRules: [
        {
          claim: "groups",
          match: "idp-admins@example.com",
          group: "pulp-admins",
          roles: ["tangerine-viewer//"],
        },
      ],
      baselineGroup: "sso-users",
      baselineRoles: ["tangerine-viewer//"],
      strictGroups: true,
      allowedEmailDomains: ["example.com", "example.org"],
      requireHostedDomain: true,
    }),
  );

  assert.deepEqual(form.accessRules, [
    {
      claim: "groups",
      match: "idp-admins@example.com",
      group: "pulp-admins",
      roles: ["tangerine-viewer//"],
    },
  ]);
  assert.equal(form.baselineGroup, "sso-users");
  assert.deepEqual(form.baselineRoles, ["tangerine-viewer//"]);
  assert.equal(form.strictGroups, true);
  assert.equal(form.allowedEmailDomains, "example.com, example.org");
  assert.equal(form.requireHostedDomain, true);
});

test("buildPayload serializes access rules and normalizes domains", () => {
  const form = {
    ...emptyForm(),
    kind: "google",
    label: "Google",
    issuer: "https://accounts.google.com",
    clientId: "client",
    secretFile: "secret",
    accessRules: [
      {
        claim: "groups" as const,
        match: "  idp-admins@example.com  ",
        group: "  pulp-admins  ",
        roles: ["tangerine-admin//"],
      },
    ],
    baselineGroup: "  sso-users  ",
    baselineRoles: ["tangerine-viewer//"],
    strictGroups: true,
    allowedEmailDomains: " Example.COM, @example.org ",
    requireHostedDomain: true,
  };
  const payload = buildPayload(form);

  assert.deepEqual(payload.accessRules, [
    {
      claim: "groups",
      match: "idp-admins@example.com",
      group: "pulp-admins",
      roles: ["tangerine-admin//"],
    },
  ]);
  assert.equal(payload.baselineGroup, "sso-users");
  assert.deepEqual(payload.allowedEmailDomains, ["example.com", "example.org"]);
  assert.equal(payload.requireHostedDomain, true);

  const azure = buildPayload({ ...form, kind: "azuread" });
  assert.equal(azure.requireHostedDomain, false);
});

test("buildPayload ignores blank rules and rejects duplicates", () => {
  const blank = buildPayload({
    ...emptyForm(),
    label: "IdP",
    issuer: "https://idp.example.com",
    clientId: "client",
    secretFile: "secret",
    accessRules: [{ claim: "groups" as const, match: " ", group: " ", roles: [] }],
  });
  assert.deepEqual(blank.accessRules, []);

  const duplicate = {
    ...emptyForm(),
    label: "IdP",
    issuer: "https://idp.example.com",
    clientId: "client",
    secretFile: "secret",
    accessRules: [
      { claim: "groups" as const, match: "same", group: "one", roles: [] },
      { claim: "groups" as const, match: "same", group: "two", roles: [] },
    ],
  };
  assert.throws(() => buildPayload(duplicate), /duplicate match same/);

  const missingGroup = {
    ...emptyForm(),
    label: "IdP",
    issuer: "https://idp.example.com",
    clientId: "client",
    secretFile: "secret",
    accessRules: [{ claim: "groups" as const, match: "same", group: " ", roles: [] }],
  };
  assert.throws(() => buildPayload(missingGroup), /group is required/);
});

test("applyKind resets provider-specific fields when the kind changes", () => {
  const google = {
    ...emptyForm(),
    kind: "google",
    usernamePrefix: "g-",
    fetchGoogleGroups: true,
    googleServiceAccountFile: "google-sa.json",
    googleAdminEmail: "admin@example.com",
    requireHostedDomain: true,
    tenantId: "stale-tenant",
  };

  const keycloak = applyKind("keycloak", google);
  assert.equal(keycloak.kind, "keycloak");
  assert.equal(keycloak.usernamePrefix, "");
  assert.equal(keycloak.fetchGoogleGroups, false);
  assert.equal(keycloak.googleServiceAccountFile, "");
  assert.equal(keycloak.googleAdminEmail, "");
  assert.equal(keycloak.requireHostedDomain, false);
  assert.equal(keycloak.tenantId, "");

  const azure = applyKind("azuread", google);
  assert.equal(azure.kind, "azuread");
  assert.equal(azure.usernamePrefix, "ms-");
  assert.equal(azure.fetchGraphGroups, true);
});
