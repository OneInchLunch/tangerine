import { expect, test } from "@playwright/test";
import { csrfToken, deleteResource, login, selectComboboxOption, uniqueName } from "./helpers";

test("file content can be uploaded through the content browser", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  const csrf = await csrfToken(page);
  const repoName = uniqueName("e2e-upload-repo");
  const relativePath = `${uniqueName("e2e-upload")}.txt`;

  const repoResponse = await page.request.post("/pulp/api/v3/repositories/file/file/", {
    headers: { "X-CSRFToken": csrf },
    data: { name: repoName },
  });
  expect(repoResponse.ok()).toBeTruthy();
  const repo = (await repoResponse.json()) as { pulp_href: string };

  try {
    await page.getByRole("link", { name: "Content", exact: true }).click();
    await page.getByLabel("Filter content types").fill("file");
    await page
      .getByRole("button", { name: /^Files/ })
      .first()
      .click();
    await page.getByRole("button", { name: "Upload content" }).click();
    const dialog = page.getByRole("dialog", { name: /Upload files/ });
    await expect(dialog).toBeVisible();

    await selectComboboxOption(dialog, "Repository", repoName, { search: repoName });
    await dialog.getByLabel(/Relative Path/).fill(relativePath);
    await dialog.locator('input[type="file"]').setInputFiles({
      name: relativePath,
      mimeType: "text/plain",
      buffer: Buffer.from("uploaded through Tangerine"),
    });
    await dialog.getByRole("button", { name: "Upload content" }).click();
    await expect(dialog).toBeHidden({ timeout: 60_000 });

    const drawer = page.getByRole("dialog", { name: "File Files content" });
    await drawer.getByPlaceholder("Search files…").fill(relativePath);
    await expect(drawer.getByText(relativePath)).toBeVisible({ timeout: 30_000 });
    // File serializers expose neither a version nor an artifact size.
    await expect(drawer.getByRole("columnheader", { name: "Version", exact: true })).toHaveCount(0);
    await expect(drawer.getByRole("columnheader", { name: "Size", exact: true })).toHaveCount(0);

    const content = await page.request.get(
      `/pulp/api/v3/content/file/files/?relative_path=${encodeURIComponent(relativePath)}`,
    );
    expect(content.ok()).toBeTruthy();
    const body = (await content.json()) as { count: number };
    expect(body.count).toBeGreaterThan(0);
  } finally {
    await deleteResource(page, csrf, repo.pulp_href);
  }
});
