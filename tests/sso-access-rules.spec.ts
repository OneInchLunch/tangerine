import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

const SSO_CONFIG = {
  apiBasePath: "/pulp/api/v3/",
  uiBasePath: "/ui/",
  authMode: "gateway",
  externalLoginUri: null,
  gatewayBasePath: "/sso/",
  passwordLoginEnabled: true,
  ssoManagedGroup: null,
  pollIntervalMs: 3000,
  extraVersion: "",
};

const DIAGNOSTICS = {
  pulpReachable: true,
  headerAuthActive: true,
  additiveMode: true,
  allowHttpIssuers: false,
  providerCount: 0,
  sessionCount: 0,
  callbackUrl: "https://example.com/sso/callback",
  stripProbe: {
    headerName: "X-Tangerine-Identity",
    headerValue: "admin",
    username: "admin",
    endpoint: "/pulp/api/v3/login/",
  },
};

const ACCESS_POLICIES = [
  { name: "users", present: true, customized: true, matchesExpected: true },
  { name: "roles", present: true, customized: true, matchesExpected: true },
  {
    name: "signing-services",
    present: true,
    customized: true,
    matchesExpected: true,
  },
];

async function mockGateway(page: Page, onCreate: (payload: unknown) => void) {
  await page.route("**/config.json", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(SSO_CONFIG),
    }),
  );
  await page.route("**/sso/providers", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.route("**/sso/session", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ detail: "not signed in" }),
    }),
  );
  await page.route("**/sso/admin/csrf", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ csrfToken: "csrf" }),
    }),
  );
  await page.route("**/sso/admin/audit", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.route("**/sso/admin/secrets/status", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.route("**/sso/admin/secrets/check**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ present: true, readable: true }),
    }),
  );
  await page.route("**/sso/admin/secrets", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(["google-secret"]),
    }),
  );
  await page.route("**/sso/admin/diagnostics", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(DIAGNOSTICS),
    }),
  );
  await page.route("**/sso/admin/bootstrap", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        settingsBlock: "AUTHENTICATION_JSON_HEADER = ...",
        applyCommand: "kubectl patch pulp pulp",
        callbackUrl: "https://example.com/sso/callback",
        headerName: "X-Tangerine-Identity",
      }),
    }),
  );
  await page.route("**/sso/admin/access-policies", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(ACCESS_POLICIES),
    }),
  );
  await page.route("**/sso/admin/groups**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ groups: [] }),
    }),
  );
  await page.route("**/sso/admin/providers**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
      return;
    }
    const payload = route.request().postDataJSON();
    onCreate(payload);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...payload, id: "google" }),
    });
  });
}

test("a provider access rule round-trips through the dialog", async ({ page }) => {
  let created: unknown = null;
  await mockGateway(page, (payload) => {
    created = payload;
  });
  await login(page);
  await page.goto("/ui/settings");

  await page.getByRole("button", { name: "Add provider" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Provider preset").selectOption("google");
  await dialog.getByLabel("Identifier").fill("google");
  await dialog.getByLabel("Display name").fill("Google Workspace");
  await dialog.getByLabel("Issuer URL").fill("https://accounts.google.com");
  await dialog.getByLabel("Client ID").fill("client");
  await dialog.getByLabel("Client secret file").selectOption("google-secret");

  await dialog.getByRole("button", { name: "Add rule" }).click();
  await dialog.getByLabel("IdP value").fill("tangerine-admins@example.com");
  await dialog.getByRole("combobox", { name: "Pulp group" }).click();
  await dialog.getByRole("combobox", { name: "Search pulp group…" }).fill("tangerine-admins");
  await dialog.getByRole("option", { name: /tangerine-admins/ }).click();
  const ruleRoles = dialog.getByRole("textbox", {
    name: /Roles for tangerine-admins/,
  });
  await ruleRoles.fill("tangerine-viewer//");
  await ruleRoles.press("Enter");

  await dialog.getByRole("combobox", { name: "Baseline group" }).click();
  await dialog.getByRole("combobox", { name: "Search baseline group…" }).fill("sso-users");
  await dialog.getByRole("option", { name: /sso-users/ }).click();
  await dialog.getByLabel("Strict group membership").check();
  await dialog.getByLabel("Allowed email/UPN domains").fill("example.com");
  await dialog.getByLabel("Require a matching Google hosted domain (hd)").check();

  await dialog.getByRole("button", { name: "Add provider" }).click();

  await expect.poll(() => created).not.toBeNull();
  const payload = created as {
    accessRules: Array<{ claim: string; match: string; group: string; roles: string[] }>;
    baselineGroup: string;
    baselineRoles: string[];
    strictGroups: boolean;
    allowedEmailDomains: string[];
    requireHostedDomain: boolean;
  };
  expect(payload.accessRules).toEqual([
    {
      claim: "groups",
      match: "tangerine-admins@example.com",
      group: "tangerine-admins",
      roles: ["tangerine-viewer//"],
    },
  ]);
  expect(payload.baselineGroup).toBe("sso-users");
  expect(payload.baselineRoles).toEqual(["tangerine-viewer//"]);
  expect(payload.strictGroups).toBe(true);
  expect(payload.allowedEmailDomains).toEqual(["example.com"]);
  expect(payload.requireHostedDomain).toBe(true);
});

test("the access-policy card reports matched statements", async ({ page }) => {
  await mockGateway(page, () => undefined);
  await login(page);
  await page.goto("/ui/settings");

  await expect(page.getByRole("heading", { name: "Access policies" })).toBeVisible();
  await expect(page.getByText("users", { exact: true })).toBeVisible();
  await expect(page.getByText("Matched", { exact: true })).toHaveCount(3);
  await expect(page.getByText(/bootstrap_access_policies.py --apply/)).toBeVisible();
});
