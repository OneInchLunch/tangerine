import { expect, test } from "@playwright/test";
import { csrfToken, deleteResource, login, selectComboboxOption, uniqueName } from "./helpers";

test("publications can be created with custom settings and inspected", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const csrf = await csrfToken(page);
  const repoName = uniqueName("e2e-publish-settings");
  const manifest = `${uniqueName("manifest")}.json`;

  const repoResponse = await page.request.post("/pulp/api/v3/repositories/file/file/", {
    headers: { "X-CSRFToken": csrf },
    data: { name: repoName },
  });
  expect(repoResponse.ok()).toBeTruthy();
  const repo = (await repoResponse.json()) as { pulp_href: string; latest_version_href?: string };

  let publicationHref: string | null = null;

  try {
    await page.getByRole("link", { name: "Publications", exact: true }).click();
    await page.getByRole("button", { name: "Publish repository version" }).click();
    const dialog = page.getByRole("dialog", { name: "Publish repository version" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Repository", { exact: true }).click();
    const repositoryPanel = dialog.getByRole("dialog", { name: "Repository" });
    await repositoryPanel.getByRole("combobox").press("Escape");
    await expect(repositoryPanel).toBeHidden();
    await expect(dialog).toBeVisible();
    await selectComboboxOption(dialog, "Repository", repoName, { search: repoName });
    await expect(dialog.getByLabel("Version", { exact: true })).toContainText(/Version \d+/, {
      timeout: 20_000,
    });
    await dialog.getByLabel("Manifest filename").fill(manifest);
    await dialog.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 120_000 });

    const publications = await page.request.get(
      `/pulp/api/v3/publications/file/file/?repository=${encodeURIComponent(repo.pulp_href)}`,
    );
    expect(publications.ok()).toBeTruthy();
    const body = (await publications.json()) as {
      results?: Array<{ pulp_href?: string; manifest?: string }>;
    };
    publicationHref = body.results?.[0]?.pulp_href ?? null;
    expect(publicationHref).toBeTruthy();
    expect(body.results?.[0]?.manifest).toBe(manifest);

    await selectComboboxOption(page, "Repository", repoName, { search: repoName });

    // Wait for this repository's row before opening details. Under parallel
    // workers the previous filter result is still on screen, so an unscoped
    // `.first()` can open a different test's publication.
    const publicationRow = page.getByRole("row").filter({
      has: page.getByRole("link", { name: repoName, exact: true }),
    });
    await expect(publicationRow).toBeVisible({ timeout: 20_000 });
    await publicationRow.getByRole("button", { name: "Open File publication details" }).click();

    const detailPane = page.getByRole("complementary", { name: "File publication" });
    await expect(detailPane).toContainText(manifest, { timeout: 20_000 });
    await expect(detailPane).toContainText(publicationHref!);
    await expect(
      detailPane.getByText("Publications are immutable snapshots.", { exact: false }),
    ).toBeVisible();
  } finally {
    if (publicationHref) {
      await deleteResource(page, csrf, publicationHref);
    }
    await deleteResource(page, csrf, repo.pulp_href);
  }
});
