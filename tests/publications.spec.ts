import { expect, test } from "@playwright/test";
import { csrfToken, login, selectComboboxOption, uniqueName, waitForTask } from "./helpers";

test("publications page lists, filters, and deletes publications", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  const csrf = await csrfToken(page);
  const repoName = uniqueName("e2e-publications");

  const createRepo = await page.request.post("/pulp/api/v3/repositories/file/file/", {
    headers: { "X-CSRFToken": csrf },
    data: { name: repoName },
  });
  expect(createRepo.status()).toBe(201);
  const repoHref = ((await createRepo.json()) as { pulp_href?: string }).pulp_href;
  expect(repoHref).toBeTruthy();

  const createPublication = await page.request.post("/pulp/api/v3/publications/file/file/", {
    headers: { "X-CSRFToken": csrf },
    data: { repository_version: `${repoHref}versions/0/` },
  });
  expect(createPublication.status()).toBe(202);
  const publicationTask = await waitForTask(
    page,
    ((await createPublication.json()) as { task: string }).task,
  );
  const publicationHref = publicationTask.created_resources?.[0];
  expect(publicationHref).toBeTruthy();

  await page.getByRole("link", { name: "Publications", exact: true }).click();
  await expect(page).toHaveURL(/\/ui\/publications$/);
  await expect(page.getByRole("heading", { name: "Publications", exact: true })).toBeVisible();

  await selectComboboxOption(page, "Repository", repoName, { search: repoName });
  await expect(page).toHaveURL(/[?&]filter=/);

  const row = page.getByRole("row").filter({
    has: page.getByRole("link", { name: repoName, exact: true }),
  });
  await expect(row).toBeVisible({ timeout: 20_000 });

  await page.reload();
  await expect(page.getByLabel("Repository", { exact: true })).toContainText(repoName, {
    timeout: 20_000,
  });
  await expect(
    page.getByRole("row").filter({
      has: page.getByRole("link", { name: repoName, exact: true }),
    }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(row.getByText("File", { exact: true })).toBeVisible();
  await expect(row.getByText("v0", { exact: true })).toBeVisible();

  await row.getByRole("button", { name: /Delete .* publication/ }).click();
  const deleteDialog = page.getByRole("dialog", {
    name: "Delete publication",
  });
  await expect(deleteDialog).toBeVisible();
  await deleteDialog.getByRole("button", { name: "Delete publication" }).click();
  await expect(deleteDialog).toBeHidden({ timeout: 20_000 });

  const deletedPublication = await page.request.get(publicationHref!);
  expect(deletedPublication.status()).toBe(404);

  const repoDelete = await page.request.delete(repoHref!, {
    headers: { "X-CSRFToken": csrf },
  });
  expect([200, 202, 204]).toContain(repoDelete.status());
  if (repoDelete.status() === 202) {
    const body = (await repoDelete.json()) as { task?: string };
    if (body.task) {
      await waitForTask(page, body.task);
    }
  }
});
