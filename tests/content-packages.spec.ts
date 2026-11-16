import { expect, test } from "@playwright/test";
import { login } from "./helpers";

const PACKAGES_PATH = "/pulp/api/v3/content/rpm/packages/";

interface Unit {
  name: string;
  epoch: string;
  version: string;
  release: string;
  arch: string;
  pulp_href: string;
  pulp_last_updated: string;
}

function unit(name: string, version: string, release: string, arch: string, updated: string): Unit {
  return {
    name,
    epoch: "1",
    version,
    release,
    arch,
    pulp_href: `${PACKAGES_PATH}${name}-${version}-${release}-${arch}/`,
    pulp_last_updated: updated,
  };
}

const PAGE_ONE = [
  unit("nginx", "1.22.0", "1.el9", "x86_64", "2026-10-01T10:00:00Z"),
  unit("nginx", "1.24.0", "1.el9", "x86_64", "2026-10-02T10:00:00Z"),
  unit("nginx-core", "1.22.0", "1.el9", "x86_64", "2026-10-01T10:00:00Z"),
];

const PAGE_TWO = [
  unit("nginx-core", "1.24.0", "1.el9", "x86_64", "2026-10-03T10:00:00Z"),
  unit("zlib", "1.2.11", "1.el9", "x86_64", "2026-10-01T10:00:00Z"),
];

const ALL_UNITS = [...PAGE_ONE, ...PAGE_TWO];

async function installRpmRoutes(page: import("@playwright/test").Page) {
  await page.route(`**${PACKAGES_PATH}**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path !== PACKAGES_PATH) {
      // Per-unit API data view.
      const href = path;
      const match = ALL_UNITS.find((candidate) => candidate.pulp_href === href);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(match ?? { pulp_href: href }),
      });
      return;
    }

    const name = url.searchParams.get("name");
    if (name) {
      const results = ALL_UNITS.filter((candidate) => candidate.name === name);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          count: results.length,
          next: null,
          previous: null,
          results,
        }),
      });
      return;
    }

    const offset = Number.parseInt(url.searchParams.get("offset") ?? "0", 10);
    const isSecondPage = offset >= PAGE_ONE.length;
    const results = isSecondPage ? PAGE_TWO : PAGE_ONE;
    const next = isSecondPage ? null : `${PACKAGES_PATH}?limit=250&offset=${PAGE_ONE.length}`;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        count: ALL_UNITS.length,
        next,
        previous: null,
        results,
      }),
    });
  });
}

async function openRpmPackages(page: import("@playwright/test").Page) {
  await page.getByRole("link", { name: "Content", exact: true }).click();
  await page.getByLabel("Filter content types").fill("rpm");
  await page.getByRole("button", { name: /^Packages/ }).click();
  const drawer = page.getByRole("dialog", { name: "RPM Packages content" });
  await expect(drawer).toBeVisible();
  return drawer;
}

test("RPM packages collapse to one row and load versions on demand", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installRpmRoutes(page);
  await login(page);
  const drawer = await openRpmPackages(page);

  const nginx = drawer.getByRole("button", { name: "nginx", exact: true });
  const nginxCore = drawer.getByRole("button", { name: "nginx-core", exact: true });
  await expect(nginx).toBeVisible();
  await expect(nginxCore).toBeVisible();
  await expect(drawer.getByText("2 packages · 3 of 5 units")).toBeVisible();
  await expect(drawer.getByText("1:1.24.0-1.el9")).toBeVisible();

  // The package at the page boundary cannot claim a highest version yet.
  await expect(
    drawer.getByTitle("Load more packages to confirm the highest version"),
  ).toBeVisible();
  await drawer.getByRole("button", { name: "Load more packages" }).click();
  await expect(drawer.getByText("3 packages · 5 units")).toBeVisible();
  await expect(drawer.getByTitle("Load more packages to confirm the highest version")).toHaveCount(
    0,
  );

  await nginx.click();
  await expect(drawer.getByRole("heading", { name: "nginx", exact: true })).toBeVisible();
  await expect(drawer.getByText("2 variants · 2 versions")).toBeVisible();
  await expect(drawer.getByText("1:1.22.0-1.el9")).toBeVisible();
  await expect(drawer.getByText("1:1.24.0-1.el9")).toBeVisible();

  // Per-version API data nests inside the drawer and unwinds on Escape.
  await drawer.getByRole("button", { name: "View API data for nginx 1:1.24.0-1.el9" }).click();
  const apiPanel = drawer.getByRole("region", { name: "nginx 1:1.24.0-1.el9 API data" });
  await expect(apiPanel).toBeVisible();
  await expect(apiPanel.getByText("Response body")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(apiPanel).toHaveCount(0);
  await expect(drawer.getByRole("heading", { name: "nginx", exact: true })).toBeVisible();

  // Back returns to the grouped list and restores focus to the package row.
  await drawer.getByRole("button", { name: "Back to packages" }).click();
  await expect(nginx).toBeVisible();
  await expect(nginx).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
});

test("package deep links restore the versions view", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installRpmRoutes(page);
  await login(page);

  await page.goto("/ui/content?plugin=rpm&type=packages&package=nginx");
  const drawer = page.getByRole("dialog", { name: "RPM Packages content" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("heading", { name: "nginx", exact: true })).toBeVisible();
  await expect(drawer.getByText("1:1.24.0-1.el9")).toBeVisible();

  await page.reload();
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("heading", { name: "nginx", exact: true })).toBeVisible();

  await drawer.getByRole("button", { name: "Back to packages" }).click();
  await expect(page).toHaveURL(/type=packages/);
  expect(new URL(page.url()).searchParams.get("package")).toBeNull();
});

test("the units toggle shows the flat content list", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installRpmRoutes(page);
  await login(page);
  const drawer = await openRpmPackages(page);

  await drawer.getByRole("button", { name: "Units" }).click();
  await expect(page).toHaveURL(/view=units/);
  await expect(drawer.getByRole("columnheader", { name: "Version" })).toBeVisible();
  await expect(drawer.getByRole("columnheader", { name: "Size" })).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: /^nginx$/ })).toHaveCount(0);

  await drawer.getByRole("button", { name: "Packages" }).click();
  await expect(page).not.toHaveURL(/view=units/);
  await expect(drawer.getByRole("button", { name: "nginx", exact: true })).toBeVisible();
  await expect(drawer.getByRole("columnheader", { name: "Highest version" })).toBeVisible();
});
