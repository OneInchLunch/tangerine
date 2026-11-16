import { expect, test } from "@playwright/test";
import { login, uniqueName } from "./helpers";

test("Escape on a dirty dialog asks before discarding", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Repositories", exact: true }).click();
  await page.getByRole("button", { name: "Create repository" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Create repository" });
  const name = dialog.getByLabel("Name");
  const repositoryName = uniqueName("e2e-discard");

  await name.fill(repositoryName);
  await page.keyboard.press("Escape");

  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Discard unsaved changes?")).toBeVisible();
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(dialog.getByText("Discard unsaved changes?")).toBeHidden();
  await expect(name).toHaveValue(repositoryName);

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog.getByText("Discard unsaved changes?")).toBeVisible();
  await dialog.getByRole("button", { name: "Discard" }).click();
  await expect(dialog).toBeHidden();

  const list = await page.request.get(
    `/pulp/api/v3/repositories/file/file/?name=${encodeURIComponent(repositoryName)}`,
  );
  const body = (await list.json()) as { count: number };
  expect(body.count).toBe(0);
});

test("an untouched dialog closes without a prompt", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Repositories", exact: true }).click();
  await page.getByRole("button", { name: "Create repository" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Create repository" });
  await expect(dialog).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Discard unsaved changes?")).toHaveCount(0);
});
