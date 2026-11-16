import { Buffer } from "node:buffer";
import { expect, test, type Page } from "@playwright/test";
import {
  adminPassword,
  adminUsername,
  csrfToken,
  deleteResource,
  login,
  uniqueName,
} from "./helpers";

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

const SSO_PROVIDERS = [{ id: "microsoft", label: "Microsoft Entra ID", kind: "azuread" }];

/** Serve a gateway-enabled runtime config and provider list. */
async function useSsoConfig(page: Page, providers = SSO_PROVIDERS) {
  await page.route("**/config.json", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(SSO_CONFIG),
    }),
  );
  await page.route("**/sso/providers", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(providers),
    }),
  );
}

test("signed-out load does not query Pulp", async ({ page }) => {
  const pulpRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/pulp/api/v3/")) {
      pulpRequests.push(request.url());
    }
  });

  await page.goto("/ui/");
  await expect(page).toHaveURL(/\/ui\/login$/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await page.waitForTimeout(500);

  // A fresh browser has no session hint, so the login page must not trigger the
  // Pulp 401 that opens the browser's native Basic auth dialog.
  expect(pulpRequests).toEqual([]);
});

test("a signed-out gateway browser does not probe the session endpoints", async ({ page }) => {
  await useSsoConfig(page);
  const probes: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/sso/session") || request.url().includes("/pulp/api/v3/login/")) {
      probes.push(request.url());
    }
  });

  await page.goto("/ui/");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await page.waitForTimeout(500);

  // No local hint and no gateway CSRF cookie means there is nothing to probe.
  expect(probes).toEqual([]);
});

test("login page rejects invalid credentials", async ({ page }) => {
  await page.goto("/ui/login");
  await page.getByLabel("Username").fill(adminUsername);
  await page.getByLabel("Password", { exact: true }).fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText(/invalid|incorrect|credentials/i);
});

test("sign out clears stale duplicate session cookies", async ({ page, playwright }) => {
  await login(page);

  const api = await playwright.request.newContext({
    baseURL: new URL(page.url()).origin,
  });
  const loginResponse = await api.post("/pulp/api/v3/login/", {
    headers: {
      Authorization: `Basic ${Buffer.from(`${adminUsername}:${adminPassword}`).toString("base64")}`,
    },
    data: {},
  });
  expect(loginResponse.status()).toBe(201);
  const apiState = await api.storageState();
  const staleSession = apiState.cookies.find((cookie) => cookie.name === "sessionid");
  expect(staleSession).toBeTruthy();
  await api.dispose();

  await page.context().addCookies([
    {
      name: "sessionid",
      value: staleSession!.value,
      domain: new URL(page.url()).hostname,
      path: "/pulp",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/ui\/login$/);

  await page.reload();
  await expect(page).toHaveURL(/\/ui\/login$/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("cached basic auth cannot keep the UI signed in", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173",
    httpCredentials: { username: adminUsername, password: adminPassword },
  });
  const page = await context.newPage();

  await page.goto("/ui/");
  await expect(page).toHaveURL(/\/ui\/login$/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

  await page.getByLabel("Username").fill(adminUsername);
  await page.getByLabel("Password", { exact: true }).fill(adminPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/ui\/$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/ui\/login$/);

  await page.reload();
  await expect(page).toHaveURL(/\/ui\/login$/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

  await context.close();
});

test("SSO providers render alongside the local login form", async ({ page }) => {
  await useSsoConfig(page);
  await page.goto("/ui/login");

  const providers = page.getByTestId("sso-providers");
  await expect(providers).toBeVisible();
  await expect(
    providers.getByRole("button", { name: "Continue with Microsoft Entra ID" }),
  ).toBeVisible();
  // Local password login stays available in the additive gateway configuration.
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(
    page.getByText(/Sign in with your identity provider, or with a Pulp username and password/i),
  ).toBeVisible();
});

test("gateway mode without providers hides the SSO badge", async ({ page }) => {
  await useSsoConfig(page, []);
  await page.goto("/ui/login");

  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText("Single sign-on", { exact: true })).toHaveCount(0);
});

test("SSO provider button starts the gateway login flow", async ({ page }) => {
  await useSsoConfig(page);
  let requestedUrl = "";
  await page.route(
    (url) => url.pathname === "/sso/start",
    async (route) => {
      requestedUrl = route.request().url();
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<p>identity provider</p>",
      });
    },
  );

  await page.goto("/ui/login");
  await page.getByRole("button", { name: "Continue with Microsoft Entra ID" }).click();

  await expect(page).toHaveURL(/\/sso\/start\?provider=microsoft&next=%2Fui%2F/);
  expect(new URL(requestedUrl).searchParams.get("next")).toBe("/ui/");
});

test("gateway mode does not auto-redirect the unauthenticated login screen", async ({ page }) => {
  await useSsoConfig(page);
  await page.goto("/ui/");
  await expect(page).toHaveURL(/\/ui\/login$/);
  await expect(page.getByTestId("sso-providers")).toBeVisible();

  // A provider outage must not trap the browser in a redirect loop.
  await page.waitForTimeout(750);
  await expect(page).toHaveURL(/\/ui\/login$/);
});

test("SSO denial errors surface on the login screen", async ({ page }) => {
  await useSsoConfig(page);
  await page.goto("/ui/login?sso_error=access_denied");
  await expect(page.getByRole("alert")).toContainText(/cancelled/i);
});

test("an unreachable gateway still allows password sign-in", async ({ page }) => {
  await page.route("**/config.json", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(SSO_CONFIG),
    }),
  );
  await page.route("**/sso/providers", (route) =>
    route.fulfill({ status: 502, contentType: "application/json", body: "{}" }),
  );

  await page.goto("/ui/login");
  await expect(page.getByText(/SSO gateway could not be reached/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("the session bar shows the administrator identity", async ({ page }) => {
  await login(page);

  const sidebar = page.locator("#app-sidebar");
  await expect(sidebar.getByText("Administrator", { exact: true })).toBeVisible();

  await sidebar.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Settings sections" })).toBeVisible();
  const administratorRow = page.getByText("Administrator", { exact: true }).last().locator("..");
  await expect(administratorRow).toContainText("Yes");
});

test("non-admins lose administration navigation and screens", async ({ page, browser }) => {
  await login(page);
  const csrf = await csrfToken(page);
  const username = uniqueName("e2e-nonadmin");
  const password = "nonadmin-pass-123";

  const created = await page.request.post("/pulp/api/v3/users/", {
    headers: { "X-CSRFToken": csrf },
    data: { username, password, is_staff: false },
  });
  expect(created.ok()).toBeTruthy();
  const user = (await created.json()) as { pulp_href: string };

  const context = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173",
  });
  const nonAdmin = await context.newPage();
  try {
    await nonAdmin.goto("/ui/");
    await nonAdmin.getByLabel("Username").fill(username);
    await nonAdmin.getByLabel("Password", { exact: true }).fill(password);
    await nonAdmin.getByRole("button", { name: "Sign in" }).click();
    await expect(nonAdmin).toHaveURL(/\/ui\/$/);

    const sidebar = nonAdmin.locator("#app-sidebar");
    await expect(sidebar.getByRole("link", { name: "Repositories", exact: true })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Users", exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Groups", exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Roles", exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "API admin", exact: true })).toHaveCount(0);

    await nonAdmin.goto("/ui/users");
    await expect(
      nonAdmin.getByRole("heading", { name: "Administrator access required" }),
    ).toBeVisible();
  } finally {
    await context.close();
    await deleteResource(page, csrf, user.pulp_href);
  }
});
