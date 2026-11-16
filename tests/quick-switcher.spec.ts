import { expect, test } from "@playwright/test";
import { csrfToken, deleteResource, login, uniqueName } from "./helpers";

test("quick switcher finds a repository and opens it", async ({ page }) => {
  await login(page);
  const csrf = await csrfToken(page);
  const repositoryName = uniqueName("e2e-switcher");

  const created = await page.request.post("/pulp/api/v3/repositories/file/file/", {
    headers: { "X-CSRFToken": csrf },
    data: { name: repositoryName },
  });
  expect(created.ok()).toBeTruthy();
  const repository = (await created.json()) as { pulp_href: string };

  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Quick switcher" });
  await expect(dialog).toBeVisible();

  const search = dialog.getByLabel("Quick switcher search");
  await search.fill(repositoryName);
  const option = dialog.getByRole("option", { name: new RegExp(repositoryName) }).first();
  await expect(option).toBeVisible();
  await option.click();

  await expect(page).toHaveURL(/\/ui\/repositories\/detail\?href=/);
  await expect(page.getByRole("heading", { name: repositoryName })).toBeVisible();

  await deleteResource(page, csrf, repository.pulp_href);
});

test("quick switcher closes with Escape and restores focus", async ({ page }) => {
  await login(page);
  const trigger = page.getByRole("button", { name: "Search pages and resources" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Quick switcher" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Quick switcher search")).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("quick switcher page commands work with an empty query", async ({ page }) => {
  await login(page);
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Quick switcher" });
  await dialog
    .getByRole("option", { name: /Repositories/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/ui\/repositories$/);
});
