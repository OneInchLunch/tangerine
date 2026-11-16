import { expect, test } from "@playwright/test";
import { csrfToken, deleteResource, login, uniqueName } from "./helpers";

test("creating a repository raises a dismissible success toast", async ({ page }) => {
  await login(page);
  const csrf = await csrfToken(page);
  const repositoryName = uniqueName("e2e-toast");

  await page.getByRole("link", { name: "Repositories", exact: true }).click();
  await page.getByRole("button", { name: "Create repository" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Create repository" });
  await dialog.getByLabel("Repository type").selectOption("file");
  await dialog.getByLabel("Name").fill(repositoryName);
  await dialog.getByRole("button", { name: "Create repository" }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });

  const toast = page.locator("[data-toast='success']").filter({ hasText: "Repository created" });
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "Dismiss notification" }).click();
  await expect(toast).toBeHidden();

  const list = await page.request.get(
    `/pulp/api/v3/repositories/file/file/?name=${encodeURIComponent(repositoryName)}`,
  );
  const body = (await list.json()) as { results?: Array<{ pulp_href?: string }> };
  const href = body.results?.[0]?.pulp_href;
  if (href) {
    await deleteResource(page, csrf, href);
  }
});

test("a failed write surfaces an error toast", async ({ page }) => {
  await login(page);
  const csrf = await csrfToken(page);
  const repositoryName = uniqueName("e2e-toast-error");

  const created = await page.request.post("/pulp/api/v3/repositories/file/file/", {
    headers: { "X-CSRFToken": csrf },
    data: { name: repositoryName, autopublish: false },
  });
  expect(created.ok()).toBeTruthy();
  const repository = (await created.json()) as { pulp_href: string };

  await page.route(`**${repository.pulp_href}`, async (route) => {
    if (route.request().method() === "PATCH") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Injected auto-publish failure." }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto(`/ui/repositories/detail?href=${encodeURIComponent(repository.pulp_href)}`);
  await expect(page.getByRole("heading", { name: repositoryName })).toBeVisible();

  await page.getByRole("button", { name: "Enable auto-publish" }).click();
  const toast = page.locator("[data-toast='error']");
  await expect(toast).toContainText("Injected auto-publish failure.");

  await page.unroute(`**${repository.pulp_href}`);
  await deleteResource(page, csrf, repository.pulp_href);
});

test("a task-backed write links to its task from the toast", async ({ page }) => {
  await login(page);
  const csrf = await csrfToken(page);
  const suffix = uniqueName("e2e-toast-task");

  const taskResponse = await page.request.get(
    "/pulp/api/v3/tasks/?limit=1&state=completed&ordering=-pulp_created",
  );
  expect(taskResponse.ok()).toBeTruthy();
  const tasks = (await taskResponse.json()) as {
    results?: Array<{ pulp_href?: string }>;
  };
  const taskHref = tasks.results?.[0]?.pulp_href;
  expect(taskHref).toBeTruthy();

  const remote = await page.request.post("/pulp/api/v3/remotes/file/file/", {
    headers: { "X-CSRFToken": csrf },
    data: { name: suffix, url: "https://fixtures.pulpproject.org/file/PULP_MANIFEST" },
  });
  expect(remote.ok()).toBeTruthy();
  const remoteHref = ((await remote.json()) as { pulp_href: string }).pulp_href;

  const created = await page.request.post("/pulp/api/v3/repositories/file/file/", {
    headers: { "X-CSRFToken": csrf },
    data: { name: suffix, remote: remoteHref },
  });
  expect(created.ok()).toBeTruthy();
  const repository = (await created.json()) as { pulp_href: string };

  await page.route("**/sync/", async (route) => {
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ task: taskHref }),
    });
  });

  await page.goto(`/ui/repositories/detail?href=${encodeURIComponent(repository.pulp_href)}`);
  await expect(page.getByRole("heading", { name: suffix })).toBeVisible();
  await page.getByRole("button", { name: "Sync", exact: true }).click();
  await page
    .getByRole("dialog", { name: /Sync/ })
    .getByRole("button", { name: "Start sync" })
    .click();

  const toast = page.locator("[data-toast='success']").filter({ hasText: "Sync started" });
  await expect(toast).toBeVisible();
  const viewTask = toast.getByRole("link", { name: "View task" });
  await expect(viewTask).toBeVisible();
  await viewTask.click();
  await expect(page).toHaveURL(/\/ui\/tasks\/[^/]+/);

  await page.unroute("**/sync/");
  await deleteResource(page, csrf, repository.pulp_href);
  await deleteResource(page, csrf, remoteHref);
});

test("the top bar shows running tasks and links to the filtered list", async ({ page }) => {
  await login(page);

  await page.route("**/pulp/api/v3/tasks/?*", async (route) => {
    const url = route.request().url();
    if (url.includes("state__in=") && url.includes("limit=1")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ count: 2, next: null, previous: null, results: [] }),
      });
      return;
    }
    await route.continue();
  });

  await page.reload();
  const indicator = page.getByRole("link", { name: /2 tasks running/ });
  await expect(indicator).toBeVisible();
  await indicator.click();
  await expect(page).toHaveURL(/\/ui\/tasks\?filter=running/);

  await page.unroute("**/pulp/api/v3/tasks/?*");
});
