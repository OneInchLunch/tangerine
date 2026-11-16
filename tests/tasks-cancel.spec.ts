import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("running tasks can be cancelled from the task detail view", async ({ page }) => {
  await login(page);
  let cancelled = false;

  await page.route("**/pulp/api/v3/tasks/fake-task/", async (route) => {
    if (route.request().method() === "PATCH") {
      cancelled = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          pulp_href: "/pulp/api/v3/tasks/fake-task/",
          state: "canceling",
          name: "pulp_file.app.tasks.publishing.publish",
          logging_cid: "fake-task",
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        pulp_href: "/pulp/api/v3/tasks/fake-task/",
        state: "running",
        name: "pulp_file.app.tasks.publishing.publish",
        logging_cid: "fake-task",
        pulp_created: new Date().toISOString(),
        started_at: new Date().toISOString(),
        progress_reports: [],
      }),
    });
  });

  await page.goto("/ui/tasks/fake-task");
  await expect(page.getByRole("button", { name: "Cancel task" })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Cancel task" }).click();
  const dialog = page.getByRole("dialog", { name: "Cancel task" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel task" }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
  expect(cancelled).toBe(true);
});
