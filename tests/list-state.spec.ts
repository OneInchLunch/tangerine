import { expect, test } from "@playwright/test";
import { csrfToken, deleteResource, login, uniqueName } from "./helpers";

test("list state survives refresh and back without leaking across routes", async ({ page }) => {
  test.slow();
  await login(page);
  const csrf = await csrfToken(page);
  const prefix = uniqueName("e2e-list-state");
  const repositoryCount = 26;
  const createdHrefs: string[] = [];

  try {
    for (let index = 0; index < repositoryCount; index += 6) {
      const batch = await Promise.all(
        Array.from({ length: Math.min(6, repositoryCount - index) }, (_, offset) =>
          page.request.post("/pulp/api/v3/repositories/file/file/", {
            headers: { "X-CSRFToken": csrf },
            data: {
              name: `${prefix}-${String(index + offset).padStart(2, "0")}`,
            },
          }),
        ),
      );
      for (const response of batch) {
        expect(response.ok()).toBeTruthy();
        const repository = (await response.json()) as { pulp_href?: string };
        if (repository.pulp_href) {
          createdHrefs.push(repository.pulp_href);
        }
      }
    }
    expect(createdHrefs).toHaveLength(repositoryCount);

    await page.getByRole("link", { name: "Repositories", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Repositories", exact: true })).toBeVisible();

    const nextButton = page.getByRole("button", { name: "Next" });
    await expect(nextButton).toBeEnabled({ timeout: 20_000 });
    await nextButton.click();
    await expect(page).toHaveURL(/[?&]page=1(?:&|$)/);

    await page.reload();
    await expect(page).toHaveURL(/[?&]page=1(?:&|$)/);
    await expect(page.getByRole("heading", { name: "Repositories", exact: true })).toBeVisible();

    const search = page.getByLabel("Search repositories");
    await search.fill(prefix);
    await search.press("Enter");
    await expect(page).toHaveURL(new RegExp(`[?&]q=${prefix}(?:&|$)`));
    await expect(page).not.toHaveURL(/[?&]page=/);

    await page.reload();
    await expect(search).toHaveValue(prefix);
    await expect(page.getByRole("row").filter({ hasText: prefix }).first()).toBeVisible();
    await expect(page.getByText(`${repositoryCount} repositories`, { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Remotes", exact: true }).click();
    await expect(page).toHaveURL(/\/ui\/remotes$/);

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`[?&]q=${prefix}(?:&|$)`));
    await expect(search).toHaveValue(prefix);
  } finally {
    // Deleting 26 repositories at once starves the local Pulp workers under
    // four-way parallelism; delete in small batches so cleanup stays reliable.
    for (let index = 0; index < createdHrefs.length; index += 4) {
      await Promise.all(
        createdHrefs.slice(index, index + 4).map((href) => deleteResource(page, csrf, href)),
      );
    }
  }
});
