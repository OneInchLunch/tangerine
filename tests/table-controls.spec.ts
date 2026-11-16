import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("repository table page size and sorting live in the URL", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Repositories", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Repositories", exact: true })).toBeVisible();

  const pageSize = page.getByLabel("Rows per page");
  await pageSize.selectOption("50");
  await expect(page).toHaveURL(/[?&]per=50/);

  await page.reload();
  await expect(page.getByLabel("Rows per page")).toHaveValue("50");

  const nameHeader = page.getByRole("button", { name: "Name", exact: true }).first();
  await nameHeader.click();
  await expect(page).toHaveURL(/[?&]sort=name/);
  await expect(page.locator("th[aria-sort='ascending']")).toHaveCount(1);

  await nameHeader.click();
  await expect(page).toHaveURL(/[?&]sort=-name/);
  await expect(page.locator("th[aria-sort='descending']")).toHaveCount(1);

  await nameHeader.click();
  await expect(page).not.toHaveURL(/[?&]sort=/);
});

test("tasks table page size survives a refresh", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Tasks", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tasks", exact: true })).toBeVisible();

  await page.getByLabel("Rows per page").selectOption("100");
  await expect(page).toHaveURL(/[?&]per=100/);
  await page.reload();
  await expect(page.getByLabel("Rows per page")).toHaveValue("100");
});

test("generic API lists use the URL-backed page size", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Remotes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Remotes", exact: true })).toBeVisible();

  const request = page.waitForRequest(
    (candidate) =>
      candidate.url().includes("/pulp/api/v3/remotes/?") &&
      new URL(candidate.url()).searchParams.get("limit") === "50",
  );
  await page.getByLabel("Rows per page").selectOption("50");
  await request;
  await expect(page).toHaveURL(/[?&]per=50/);

  await page.reload();
  await expect(page.getByLabel("Rows per page")).toHaveValue("50");
});

test("repositories omit ordering until a column is sorted", async ({ page }) => {
  await login(page);
  const request = page.waitForRequest((candidate) =>
    candidate.url().includes("/pulp/api/v3/repositories/?"),
  );
  await page.getByRole("link", { name: "Repositories", exact: true }).click();
  const initial = new URL((await request).url());

  expect(initial.searchParams.has("ordering")).toBe(false);
});
