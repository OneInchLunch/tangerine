import { expect, test } from "@playwright/test";
import { csrfToken, login, uniqueName } from "./helpers";

test("admin can create, edit, and delete a remote", async ({ page }) => {
  await login(page);
  const remoteName = uniqueName("e2e-remote");

  await page.getByRole("link", { name: "Remotes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Remotes", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Create remote" }).first().click();
  await expect(page).toHaveURL(/\/ui\/remotes\/new$/);
  await expect(page.getByRole("heading", { name: "Create remote" })).toBeVisible();

  await page.getByLabel("Plugin and content type").selectOption("file.file");
  await page.getByLabel("Name", { exact: true }).fill(remoteName);
  await page.getByLabel("Remote URL").fill("https://example.com/e2e-remote/");
  await page.getByRole("button", { name: "Create remote" }).click();

  await expect(page).toHaveURL(/\/ui\/remotes\/detail\?href=/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: remoteName })).toBeVisible();
  await expect(page.getByText("file.file", { exact: true })).toBeVisible();

  const remoteHref = new URL(page.url()).searchParams.get("href");
  expect(remoteHref).toBeTruthy();

  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: `Edit ${remoteName}` })).toBeVisible();
  await page.getByLabel("Download policy").selectOption("on_demand");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("on_demand", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Delete" }).click();
  const deleteDialog = page.getByRole("dialog", { name: `Delete ${remoteName}` });
  await expect(deleteDialog).toBeVisible();
  await deleteDialog.getByLabel("Remote name").fill(remoteName);
  await deleteDialog.getByRole("button", { name: "Delete remote" }).click();

  await expect(page).toHaveURL(/\/ui\/remotes$/, { timeout: 15_000 });
  await expect(page.getByText(remoteName, { exact: true })).toHaveCount(0);

  const csrf = await csrfToken(page);
  const remaining = await page.request.get(
    `/pulp/api/v3/remotes/?name=${encodeURIComponent(remoteName)}`,
  );
  expect(remaining.ok()).toBeTruthy();
  const remainingBody = (await remaining.json()) as {
    results?: Array<{ pulp_href?: string }>;
  };
  expect(remainingBody.results ?? []).toHaveLength(0);

  if (remoteHref) {
    const cleanup = await page.request.delete(remoteHref, {
      headers: { "X-CSRFToken": csrf },
    });
    expect([204, 404]).toContain(cleanup.status());
  }
});
