import { expect, test, type Page, type Route } from "@playwright/test";
import { login } from "./helpers";

const REPO_A = "/pulp/api/v3/repositories/file/file/aaa/";
const REPO_B = "/pulp/api/v3/repositories/file/file/bbb/";
const CONTENT_A = "/pulp/api/v3/content/file/files/aaa/";
const CONTENT_B = "/pulp/api/v3/content/file/files/bbb/";

async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function repositoryRows(): Array<Record<string, unknown>> {
  return [
    {
      pulp_href: REPO_A,
      name: "alpha-repo",
      latest_version_href: `${REPO_A}versions/1/`,
      pulp_type: "file.file",
    },
    {
      pulp_href: REPO_B,
      name: "beta-repo",
      latest_version_href: `${REPO_B}versions/1/`,
      pulp_type: "file.file",
    },
  ];
}

function fileContentRow(href: string, relativePath: string): Record<string, unknown> {
  return {
    pulp_href: href,
    relative_path: relativePath,
    pulp_last_updated: "2026-01-01T00:00:00Z",
  };
}

async function installRepositoryRoutes(page: Page, contentRequests: string[]) {
  await page.route(/\/pulp\/api\/v3\/repositories\/(\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    const hrefs = (url.searchParams.get("pulp_href__in") ?? "").split(",").filter(Boolean);
    const rows = repositoryRows().filter(
      (row) => !hrefs.length || hrefs.includes(String(row.pulp_href)),
    );
    await fulfillJson(route, { count: rows.length, next: null, previous: null, results: rows });
  });

  await page.route(/\/pulp\/api\/v3\/content\/file\/files\/(\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    contentRequests.push(url.search);
    const single = url.searchParams.get("repository_version");
    const expression = url.searchParams.get("q") ?? "";

    let rows: Array<Record<string, unknown>> = [];
    if (single === REPO_A || expression.includes(REPO_A)) {
      rows.push(fileContentRow(CONTENT_A, "alpha.txt"));
    }
    if (single === REPO_B || expression.includes(REPO_B)) {
      rows.push(fileContentRow(CONTENT_B, "beta.txt"));
    }
    if (!single && !expression) {
      rows = [fileContentRow(CONTENT_A, "alpha.txt"), fileContentRow(CONTENT_B, "beta.txt")];
    }

    await fulfillJson(route, {
      count: rows.length,
      next: null,
      previous: null,
      results: rows,
    });
  });
}

test("content can be filtered by one or more repositories", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const contentRequests: string[] = [];
  await installRepositoryRoutes(page, contentRequests);

  await page.getByRole("link", { name: "Content", exact: true }).click();
  await page.getByLabel("Filter content types").fill("file");
  await page.getByRole("button", { name: /^Files/ }).click();

  const drawer = page.getByRole("dialog", { name: "File Files content" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("alpha.txt")).toBeVisible();
  await expect(drawer.getByText("beta.txt")).toBeVisible();

  const trigger = drawer.getByLabel("Repositories", { exact: true });
  await trigger.click();
  const panel = drawer.getByRole("dialog", { name: "Repositories" });
  await panel.getByRole("option", { name: "alpha-repo" }).click();
  await panel.getByRole("button", { name: "Done" }).click();
  await expect(panel).toBeHidden();

  await expect(page).toHaveURL(/[?&]repos=/);
  await expect(drawer.getByText("alpha.txt")).toBeVisible();
  await expect(drawer.getByText("beta.txt")).toHaveCount(0);
  expect(contentRequests.some((query) => query.includes("repository_version="))).toBeTruthy();

  await page.reload();
  await expect(drawer).toBeVisible();
  await expect(drawer.getByLabel("Repositories", { exact: true })).toContainText("alpha-repo");
  await expect(drawer.getByRole("status")).toContainText("Showing content from 1 repository");
  await expect(drawer.getByText("alpha.txt")).toBeVisible();
  await expect(drawer.getByText("beta.txt")).toHaveCount(0);

  const reopened = drawer.getByLabel("Repositories", { exact: true });
  await reopened.click();
  const multiPanel = drawer.getByRole("dialog", { name: "Repositories" });
  await multiPanel.getByRole("option", { name: "beta-repo" }).click();
  await multiPanel.getByRole("button", { name: "Done" }).click();
  await expect(drawer.getByText("alpha.txt")).toBeVisible();
  await expect(drawer.getByText("beta.txt")).toBeVisible();
  expect(contentRequests.some((query) => query.includes("q=repository_version"))).toBeTruthy();

  await drawer.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page).not.toHaveURL(/[?&]repos=/);
  await expect(drawer.getByText("alpha.txt")).toBeVisible();
  await expect(drawer.getByText("beta.txt")).toBeVisible();
});

test("the repository filter also scopes grouped packages", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const contentRequests: string[] = [];

  await page.route(/\/pulp\/api\/v3\/repositories\/(\?.*)?$/, async (route) => {
    await fulfillJson(route, {
      count: 2,
      next: null,
      previous: null,
      results: repositoryRows(),
    });
  });

  await page.route(/\/pulp\/api\/v3\/content\/rpm\/packages\/(\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    contentRequests.push(url.search);
    const single = url.searchParams.get("repository_version");
    const expression = url.searchParams.get("q") ?? "";
    const row = (name: string, href: string) => ({
      pulp_href: href,
      name,
      epoch: "0",
      version: "1.0",
      release: "1",
      arch: "x86_64",
      pulp_last_updated: "2026-01-01T00:00:00Z",
    });

    const rows =
      single === REPO_A || expression.includes(REPO_A)
        ? [row("alpha-package", "/pulp/api/v3/content/rpm/packages/aaa/")]
        : single === REPO_B || expression.includes(REPO_B)
          ? [row("beta-package", "/pulp/api/v3/content/rpm/packages/bbb/")]
          : [
              row("alpha-package", "/pulp/api/v3/content/rpm/packages/aaa/"),
              row("beta-package", "/pulp/api/v3/content/rpm/packages/bbb/"),
            ];

    await fulfillJson(route, {
      count: rows.length,
      next: null,
      previous: null,
      results: rows,
    });
  });

  await page.getByRole("link", { name: "Content", exact: true }).click();
  await page.getByLabel("Filter content types").fill("rpm");
  await page.getByRole("button", { name: /^Packages/ }).click();

  const drawer = page.getByRole("dialog", { name: "RPM Packages content" });
  await expect(drawer.getByText("alpha-package")).toBeVisible();
  await expect(drawer.getByText("beta-package")).toBeVisible();

  const trigger = drawer.getByLabel("Repositories", { exact: true });
  await trigger.click();
  const panel = drawer.getByRole("dialog", { name: "Repositories" });
  await panel.getByRole("option", { name: "alpha-repo" }).click();
  await panel.getByRole("button", { name: "Done" }).click();

  await expect(drawer.getByText("alpha-package")).toBeVisible();
  await expect(drawer.getByText("beta-package")).toHaveCount(0);
  expect(
    contentRequests.some((query) => query.includes("repository_version=") || query.includes("q=")),
  ).toBeTruthy();
});
