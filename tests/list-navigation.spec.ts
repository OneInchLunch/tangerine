import { expect, test } from "@playwright/test";
import { csrfToken, deleteResource, login, uniqueName } from "./helpers";

test("back from a detail page preserves the list search", async ({ page }) => {
  await login(page);
  const csrf = await csrfToken(page);
  const name = uniqueName("e2e-list-return");
  const created = await page.request.post("/pulp/api/v3/repositories/file/file/", {
    headers: { "X-CSRFToken": csrf },
    data: { name },
  });
  expect(created.ok()).toBeTruthy();
  const href = ((await created.json()) as { pulp_href: string }).pulp_href;

  try {
    await page.getByRole("link", { name: "Repositories", exact: true }).click();
    const search = page.getByLabel("Search repositories");
    await search.fill(name);
    await search.press("Enter");
    await expect(page).toHaveURL(new RegExp(`[?&]q=${name}(?:&|$)`));

    await page.getByRole("link", { name, exact: true }).click();
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Back to repositories" }).click();

    await expect(page).toHaveURL(new RegExp(`[?&]q=${name}(?:&|$)`));
    await expect(page.getByLabel("Search repositories")).toHaveValue(name);
  } finally {
    await deleteResource(page, csrf, href);
  }
});
