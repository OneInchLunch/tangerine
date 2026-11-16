import { expect, test } from "@playwright/test";
import {
  closeCombobox,
  csrfToken,
  deleteResource,
  login,
  toggleComboboxOption,
  uniqueName,
} from "./helpers";

test("Pulp exporters and importers can be created and deleted", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  const csrf = await csrfToken(page);
  const exporterName = uniqueName("e2e-exporter");
  const importerName = uniqueName("e2e-importer");
  const repoName = uniqueName("e2e-exporter-repo");

  const repoResponse = await page.request.post("/pulp/api/v3/repositories/file/file/", {
    headers: { "X-CSRFToken": csrf },
    data: { name: repoName },
  });
  expect(repoResponse.ok()).toBeTruthy();
  const repo = (await repoResponse.json()) as { pulp_href: string };

  async function findHref(endpoint: string, name: string): Promise<string | null> {
    const response = await page.request.get(
      `/pulp/api/v3/${endpoint}?name=${encodeURIComponent(name)}`,
    );
    if (!response.ok()) {
      return null;
    }
    const body = (await response.json()) as { results?: Array<{ pulp_href?: string }> };
    return body.results?.[0]?.pulp_href ?? null;
  }

  try {
    await page.getByRole("link", { name: "Import / export", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Pulp exporters", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Create exporter" }).click();
    const exporterDialog = page.getByRole("dialog", { name: "Create Pulp exporter" });
    await expect(exporterDialog).toBeVisible();
    await exporterDialog.getByLabel("Name").fill(exporterName);
    await exporterDialog.getByLabel("Server path").fill("/tmp/tangerine-e2e-exports");
    const repositoryPanel = await toggleComboboxOption(exporterDialog, "Repositories", repoName, {
      search: repoName,
    });
    await closeCombobox(repositoryPanel);
    await exporterDialog.getByRole("button", { name: "Create exporter" }).click();
    await expect(exporterDialog).toBeHidden({ timeout: 20_000 });
    await expect(page.getByText(exporterName, { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Pulp import", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Pulp importers", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Create importer" }).click();
    const importerDialog = page.getByRole("dialog", { name: "Create Pulp importer" });
    await expect(importerDialog).toBeVisible();
    await importerDialog.getByLabel("Name").fill(importerName);
    await importerDialog.getByRole("button", { name: "Create importer" }).click();
    await expect(importerDialog).toBeHidden({ timeout: 20_000 });
    await expect(page.getByText(importerName, { exact: true })).toBeVisible();
  } finally {
    const exporterHref = await findHref("exporters/core/pulp/", exporterName);
    if (exporterHref) {
      await deleteResource(page, csrf, exporterHref);
    }
    const importerHref = await findHref("importers/core/pulp/", importerName);
    if (importerHref) {
      await deleteResource(page, csrf, importerHref);
    }
    await deleteResource(page, csrf, repo.pulp_href);
  }
});
