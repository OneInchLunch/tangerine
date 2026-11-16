import { expect, test } from "@playwright/test";
import { csrfToken, login, uniqueSuffix, waitForTask } from "./helpers";

test("distribution common fields can be edited", async ({ page }) => {
  await login(page);
  const suffix = uniqueSuffix();
  const repoName = `e2e-dist-repo-${suffix}`;
  const distName = `e2e-dist-${suffix}`;
  const basePath = `e2e-dist-path-${suffix}`;
  const editedName = `${distName}-edited`;
  const csrf = await csrfToken(page);

  const repoResponse = await page.request.post("/pulp/api/v3/repositories/file/file/", {
    headers: { "X-CSRFToken": csrf },
    data: { name: repoName },
  });
  expect(repoResponse.ok()).toBeTruthy();
  const repoBody = (await repoResponse.json()) as { pulp_href: string };

  const distResponse = await page.request.post("/pulp/api/v3/distributions/file/file/", {
    headers: { "X-CSRFToken": csrf },
    data: { name: distName, base_path: basePath, repository: repoBody.pulp_href },
  });
  expect(distResponse.status()).toBe(202);
  const distTask = (await distResponse.json()) as { task: string };
  await waitForTask(page, distTask.task);

  const distListResponse = await page.request.get(
    `/pulp/api/v3/distributions/?name=${encodeURIComponent(distName)}`,
  );
  expect(distListResponse.ok()).toBeTruthy();
  const distList = (await distListResponse.json()) as {
    results?: Array<{ pulp_href?: string }>;
  };
  const distHref = distList.results?.[0]?.pulp_href;
  expect(distHref).toBeTruthy();

  const publicationResponse = await page.request.post("/pulp/api/v3/publications/file/file/", {
    headers: { "X-CSRFToken": csrf },
    data: { repository: repoBody.pulp_href },
  });
  expect(publicationResponse.status()).toBe(202);
  const publicationTask = await waitForTask(
    page,
    ((await publicationResponse.json()) as { task: string }).task,
  );
  const publicationHref = publicationTask.created_resources?.[0];
  expect(publicationHref).toBeTruthy();

  await page.getByRole("link", { name: "Repositories", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Repositories", exact: true })).toBeVisible();
  await page.getByLabel("Search repositories").fill(repoName);
  await page.getByLabel("Search repositories").press("Enter");
  const distributionRepositoryRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("link", { name: repoName }) });
  const copyDistributionButton = distributionRepositoryRow.getByRole("button", {
    name: `Copy distribution for ${repoName}`,
  });
  await expect(copyDistributionButton).toBeEnabled({ timeout: 20_000 });
  await copyDistributionButton.click();
  await expect(
    distributionRepositoryRow.getByRole("button", {
      name: `Copied distribution for ${repoName}`,
    }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Distributions", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Distributions", exact: true })).toBeVisible();
  await page.getByPlaceholder("Search distributions…").fill(distName);
  await page.getByPlaceholder("Search distributions…").press("Enter");
  const distributionRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("link", { name: distName }) });
  await expect(distributionRow.getByText("File", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Edit ${distName}` }).click();
  const listEditDialog = page.getByRole("dialog", { name: `Edit ${distName}` });
  await expect(
    listEditDialog.getByText("Follows the repository and serves its newest publication"),
  ).toBeVisible();
  await expect(listEditDialog.getByLabel("Content source")).toHaveCount(0);
  await expect(listEditDialog.getByRole("button", { name: "Change", exact: true })).toBeVisible();
  await listEditDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(listEditDialog).toBeHidden();
  await page.getByRole("link", { name: distName, exact: true }).click();
  await expect(page).toHaveURL(/\/ui\/distributions\/detail\?href=/);
  await expect(page.getByRole("heading", { name: distName })).toBeVisible();
  await expect(page.getByText("Repository · latest publication")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("Latest via repository")).toBeVisible();
  await expect(page.getByText(publicationHref!, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Edit" }).click();
  const distDialog = page.getByRole("dialog", { name: `Edit ${distName}` });
  await expect(distDialog).toBeVisible();
  await expect(
    distDialog.getByText("Follows the repository and serves its newest publication"),
  ).toBeVisible();
  await expect(distDialog.getByLabel("Content source")).toHaveCount(0);
  await distDialog.getByLabel("Name").fill(editedName);
  await distDialog.getByLabel("Base path").fill(`${basePath}-edited`);
  await distDialog.getByRole("button", { name: "Save changes" }).click();
  await expect(distDialog).toBeHidden({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: editedName })).toBeVisible({
    timeout: 20_000,
  });

  const metadataResponse = await page.request.get(distHref!);
  expect(metadataResponse.ok()).toBeTruthy();
  const metadataDetail = (await metadataResponse.json()) as {
    repository?: string | null;
    publication?: string | null;
  };
  expect(metadataDetail.repository).toBe(repoBody.pulp_href);
  expect(metadataDetail.publication).toBeNull();

  await page.getByRole("button", { name: "Change content source" }).click();
  const publicationDialog = page.getByRole("dialog", {
    name: `Content source for ${editedName}`,
  });
  await publicationDialog.getByRole("radio", { name: /Pin a publication/ }).check();
  const publicationSelect = publicationDialog.getByLabel("Publication", {
    exact: true,
  });
  await expect(publicationSelect).toContainText(repoName, {
    timeout: 20_000,
  });
  await publicationDialog.getByRole("button", { name: "Save content source" }).click();
  await expect(publicationDialog).toBeHidden({ timeout: 20_000 });
  await expect(page.getByText("Pinned", { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(publicationHref!, { exact: true })).toBeVisible({
    timeout: 20_000,
  });

  const attachedResponse = await page.request.get(distHref!);
  expect(attachedResponse.ok()).toBeTruthy();
  const attachedDetail = (await attachedResponse.json()) as {
    repository?: string | null;
    publication?: string | null;
  };
  expect(attachedDetail.repository).toBeNull();
  expect(attachedDetail.publication).toBe(publicationHref);

  await page.getByRole("button", { name: "Change content source" }).click();
  const restoreDialog = page.getByRole("dialog", {
    name: `Content source for ${editedName}`,
  });
  await restoreDialog.getByRole("radio", { name: /Follow repository/ }).check();
  await expect(restoreDialog.getByLabel("Repository", { exact: true })).toContainText(repoName, {
    timeout: 20_000,
  });
  await restoreDialog.getByRole("button", { name: "Save content source" }).click();
  await expect(restoreDialog).toBeHidden({ timeout: 20_000 });
  await expect(page.getByText("Repository · latest publication")).toBeVisible({
    timeout: 20_000,
  });

  const restoredResponse = await page.request.get(distHref!);
  expect(restoredResponse.ok()).toBeTruthy();
  const restoredDetail = (await restoredResponse.json()) as {
    repository?: string | null;
    publication?: string | null;
  };
  expect(restoredDetail.repository).toBe(repoBody.pulp_href);
  expect(restoredDetail.publication).toBeNull();

  const distDelete = await page.request.delete(distHref!, {
    headers: { "X-CSRFToken": csrf },
  });
  expect([200, 202, 204]).toContain(distDelete.status());
  if (distDelete.status() === 202) {
    const body = (await distDelete.json()) as { task?: string };
    if (body.task) {
      await waitForTask(page, body.task);
    }
  }

  const publicationDelete = await page.request.delete(publicationHref!, {
    headers: { "X-CSRFToken": csrf },
  });
  expect([200, 202, 204]).toContain(publicationDelete.status());
  if (publicationDelete.status() === 202) {
    const body = (await publicationDelete.json()) as { task?: string };
    if (body.task) {
      await waitForTask(page, body.task);
    }
  }

  const repoDelete = await page.request.delete(repoBody.pulp_href, {
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

test("the Pulp artifact distribution is read-only", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Distributions", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Distributions", exact: true })).toBeVisible();

  const systemLink = page.getByRole("link", { name: "Pulp artifact serving", exact: true });
  await expect(systemLink).toBeVisible({ timeout: 20_000 });
  const systemRow = page.getByRole("row").filter({ has: systemLink });
  await expect(systemRow.getByText("System", { exact: true })).toBeVisible();
  await expect(systemRow.getByRole("button", { name: /^Edit / })).toHaveCount(0);

  await systemLink.click();
  await expect(page).toHaveURL(/\/ui\/distributions\/detail\?href=/);
  await expect(page.getByRole("heading", { name: "Pulp artifact serving" })).toBeVisible();
  await expect(page.getByText("Pulp internal endpoint")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Change content source" })).toHaveCount(0);
});
