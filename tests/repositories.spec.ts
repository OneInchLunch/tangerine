import { expect, test } from "@playwright/test";
import {
  csrfToken,
  login,
  modifyRepository,
  selectComboboxOption,
  uploadFileContent,
  waitForPublication,
  waitForTask,
  uniqueName,
  uniqueSuffix,
} from "./helpers";

test("admin can sign in, create a repository, and inspect its detail", async ({ page }) => {
  await login(page);

  await expect(page.getByText("System health")).toBeVisible();
  await expect(page.getByText("Connected", { exact: false }).first()).toBeVisible();

  await page.getByRole("link", { name: "Repositories", exact: true }).click();
  await expect(page).toHaveURL(/\/ui\/repositories$/);
  await expect(page.getByRole("heading", { name: "Repositories", exact: true })).toBeVisible();

  const csrf = await csrfToken(page);
  const remoteName = uniqueName("e2e-repository-remote");
  const remoteResponse = await page.request.post("/pulp/api/v3/remotes/file/file/", {
    headers: { "X-CSRFToken": csrf },
    data: {
      name: remoteName,
      url: "https://example.com/e2e-repository-remote/",
    },
  });
  expect(remoteResponse.ok()).toBeTruthy();
  const remote = (await remoteResponse.json()) as { pulp_href?: string };
  expect(remote.pulp_href).toBeTruthy();
  const remoteHref = remote.pulp_href!;

  const repositoryName = uniqueName("e2e-file");
  const distributionName = `${repositoryName}-distribution`;
  const distributionBasePath = `${repositoryName}-content`;
  await page.getByRole("button", { name: "Create repository" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Create repository" });
  await expect(dialog).toBeVisible();
  await expect(page.locator("#root")).toHaveAttribute("inert", "");
  await dialog.getByLabel("Name").fill(repositoryName);
  await dialog.getByLabel("Description").fill("Created by the Tangerine Playwright smoke test.");
  await selectComboboxOption(dialog, "Remote", remoteName, { search: remoteName });
  await dialog.getByRole("button", { name: "Create repository" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#root")).not.toHaveAttribute("inert", "");

  const repositoryLink = page.getByRole("link", { name: repositoryName });
  await expect(repositoryLink).toBeVisible();
  const repositoryRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("link", { name: repositoryName }) });
  const endpointText = repositoryRow.locator("p").first();
  const fullEndpoint = await endpointText.getAttribute("title");
  expect(fullEndpoint).toContain("/pulp/api/v3/repositories/file/file/");
  expect(fullEndpoint!.length).toBeGreaterThan(40);
  await expect(endpointText).toHaveText(`${fullEndpoint!.slice(0, 39)}…`);
  await repositoryLink.click();
  await expect(page.getByRole("link", { name: "Back to repositories" })).toBeVisible();
  await expect(page.getByText("Repository versions")).toBeVisible();
  await expect(page.getByText("Latest version content")).toBeVisible();
  await expect(page.getByRole("link", { name: remoteName, exact: true })).toBeVisible({
    timeout: 20_000,
  });

  await expect(page.getByText("No distribution configured")).toBeVisible();
  await page.getByRole("button", { name: "Create distribution" }).click();
  const createDistributionDialog = page.getByRole("dialog", {
    name: "Create distribution",
  });
  await expect(createDistributionDialog).toBeVisible();
  await createDistributionDialog.getByLabel("Name").fill(distributionName);
  await createDistributionDialog.getByLabel("Base path").fill(distributionBasePath);
  await createDistributionDialog.getByRole("button", { name: "Create distribution" }).click();
  await expect(createDistributionDialog).toBeHidden({ timeout: 20_000 });
  await expect(page.getByRole("link", { name: distributionName, exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("button", { name: "Create distribution" })).toBeHidden();

  const distributionListResponse = await page.request.get(
    `/pulp/api/v3/distributions/?name=${encodeURIComponent(distributionName)}`,
  );
  expect(distributionListResponse.ok()).toBeTruthy();
  const distributionList = (await distributionListResponse.json()) as {
    results?: Array<{ pulp_href?: string }>;
  };
  const distributionHref = distributionList.results?.[0]?.pulp_href;
  expect(distributionHref).toBeTruthy();

  const snapshotButton = page.getByRole("button", { name: /View version .* snapshot/ }).first();
  await expect(snapshotButton).toBeVisible();
  await snapshotButton.click();
  await expect(page.getByRole("heading", { name: /Version .* snapshot/ })).toBeVisible();
  await expect(page.getByText("API endpoint", { exact: true })).toBeVisible();
  await expect(page.getByText("Initial snapshot", { exact: true })).toBeVisible();

  const pane = page.getByRole("complementary", { name: /Version .* snapshot/ });
  const resizeHandle = page.getByRole("separator", { name: "Resize pane height" });
  await expect(resizeHandle).toBeVisible();
  const beforeResize = await pane.boundingBox();
  const handleBox = await resizeHandle.boundingBox();
  expect(beforeResize).not.toBeNull();
  expect(handleBox).not.toBeNull();
  if (beforeResize && handleBox) {
    const handleX = handleBox.x + handleBox.width / 2;
    await page.mouse.move(handleX, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleX, handleBox.y - 80, { steps: 5 });
    await page.mouse.up();
    await expect
      .poll(async () => (await pane.boundingBox())?.height ?? 0)
      .toBeGreaterThan(beforeResize.height);
  }

  await page.getByRole("button", { name: "Close pane" }).click();
  await expect(page.getByRole("heading", { name: /Version .* snapshot/ })).toBeHidden();

  await page.getByRole("button", { name: "API data" }).click();
  const apiPane = page.getByRole("complementary", { name: repositoryName });
  await expect(apiPane.getByText("Response body", { exact: true })).toBeVisible();
  await expect(apiPane.locator("pre")).toContainText(repositoryName);
  await expect(apiPane.getByRole("button", { name: "Copy JSON" })).toBeVisible();
  await apiPane.getByRole("button", { name: "Close pane" }).click();
  await expect(apiPane).toBeHidden();

  await page.getByRole("button", { name: "Edit" }).click();
  const editRepositoryDialog = page.getByRole("dialog", { name: `Edit ${repositoryName}` });
  await expect(editRepositoryDialog).toBeVisible();
  await expect(editRepositoryDialog.getByLabel("Remote", { exact: true })).toContainText(
    remoteName,
  );
  const editedDescription = "Edited by the Tangerine Playwright smoke test.";
  await editRepositoryDialog.getByLabel("Description").fill(editedDescription);
  await editRepositoryDialog.getByLabel("Retain repository versions").fill("5");
  await selectComboboxOption(editRepositoryDialog, "Remote", "No remote");
  await editRepositoryDialog.getByRole("button", { name: "Save changes" }).click();
  await expect(editRepositoryDialog).toBeHidden({ timeout: 20_000 });
  await expect(page.getByText(editedDescription)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Not configured", { exact: true })).toBeVisible({
    timeout: 20_000,
  });

  await page.getByRole("button", { name: "Edit" }).click();
  const reassignRemoteDialog = page.getByRole("dialog", { name: `Edit ${repositoryName}` });
  await expect(reassignRemoteDialog).toBeVisible();
  await expect(reassignRemoteDialog.getByLabel("Remote", { exact: true })).toContainText(
    "No remote",
  );
  await selectComboboxOption(reassignRemoteDialog, "Remote", remoteName, { search: remoteName });
  await reassignRemoteDialog.getByRole("button", { name: "Save changes" }).click();
  await expect(reassignRemoteDialog).toBeHidden({ timeout: 20_000 });
  await expect(page.getByRole("link", { name: remoteName, exact: true })).toBeVisible({
    timeout: 20_000,
  });

  const detailUrl = new URL(page.url());
  const repositoryHref = detailUrl.searchParams.get("href");
  expect(repositoryHref).toBeTruthy();

  await page.getByRole("link", { name: "Back to repositories" }).click();
  await expect(page.getByRole("heading", { name: "Repositories" })).toBeVisible();

  const distributionDeleteResponse = await page.request.delete(distributionHref!, {
    headers: { "X-CSRFToken": csrf },
  });
  expect([200, 202, 204]).toContain(distributionDeleteResponse.status());
  if (distributionDeleteResponse.status() === 202) {
    const deleteBody = (await distributionDeleteResponse.json()) as { task?: string };
    if (deleteBody.task) {
      await waitForTask(page, deleteBody.task);
    }
  }

  const deleteResponse = await page.request.delete(repositoryHref!, {
    headers: { "X-CSRFToken": csrf },
  });
  expect(deleteResponse.ok()).toBeTruthy();
  if (deleteResponse.status() === 202) {
    const deleteBody = (await deleteResponse.json()) as { task?: string };
    if (deleteBody.task) {
      await waitForTask(page, deleteBody.task);
    }
  }

  const remoteDeleteResponse = await page.request.delete(remoteHref, {
    headers: { "X-CSRFToken": csrf },
  });
  expect(remoteDeleteResponse.ok()).toBeTruthy();
  if (remoteDeleteResponse.status() === 202) {
    const remoteDeleteBody = (await remoteDeleteResponse.json()) as { task?: string };
    if (remoteDeleteBody.task) {
      await waitForTask(page, remoteDeleteBody.task);
    }
  }

  await page.getByRole("link", { name: "Tasks", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();

  const taskResponse = await page.request.get("/pulp/api/v3/tasks/?limit=1");
  if (taskResponse.ok()) {
    const taskBody = (await taskResponse.json()) as {
      results?: Array<{ pulp_href?: string }>;
    };
    const taskHref = taskBody.results?.[0]?.pulp_href;
    if (taskHref) {
      const taskId = taskHref.replace(/\/$/, "").split("/").at(-1);
      await page.goto(`/ui/tasks/${taskId}`);
      await expect(page.getByRole("link", { name: "Back to tasks" })).toBeVisible();
      await expect(page.getByText("Execution timeline")).toBeVisible();
      await page.getByRole("link", { name: "Back to tasks" }).click();
      await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
    }
  }

  await page.getByRole("link", { name: "Workers" }).click();
  await expect(page.getByRole("heading", { name: "Workers" })).toBeVisible();
});

test("a repository can have multiple distributions", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  const csrf = await csrfToken(page);
  const repoName = uniqueName("e2e-multi");

  const createRepo = await page.request.post("/pulp/api/v3/repositories/file/file/", {
    headers: { "X-CSRFToken": csrf },
    data: { name: repoName },
  });
  expect(createRepo.status()).toBe(201);
  const repoHref = ((await createRepo.json()) as { pulp_href?: string }).pulp_href;
  expect(repoHref).toBeTruthy();

  await page.goto(`/ui/repositories/detail?href=${encodeURIComponent(repoHref!)}`);
  await expect(page.getByRole("heading", { name: repoName })).toBeVisible();
  await expect(page.getByText("No distribution configured")).toBeVisible();

  await page.getByRole("button", { name: "Create distribution" }).click();
  const firstDialog = page.getByRole("dialog", { name: "Create distribution" });
  await expect(firstDialog.getByLabel("Name")).toHaveValue(repoName);
  await expect(firstDialog.getByLabel("Base path")).toHaveValue(repoName);
  await firstDialog.getByRole("button", { name: "Create distribution" }).click();
  await expect(firstDialog).toBeHidden({ timeout: 20_000 });
  await expect(page.getByRole("link", { name: repoName, exact: true })).toBeVisible({
    timeout: 20_000,
  });

  await page.getByRole("button", { name: "Add distribution" }).click();
  const secondDialog = page.getByRole("dialog", { name: "Create distribution" });
  await expect(secondDialog.getByLabel("Name")).toHaveValue(`${repoName}-2`);
  await expect(secondDialog.getByLabel("Base path")).toHaveValue(`${repoName}-2`);
  await secondDialog.getByRole("button", { name: "Create distribution" }).click();
  await expect(secondDialog).toBeHidden({ timeout: 20_000 });
  await expect(page.getByRole("link", { name: `${repoName}-2`, exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("2 distributions", { exact: true })).toBeVisible();

  const distributionList = await page.request.get(
    `/pulp/api/v3/distributions/?repository=${encodeURIComponent(repoHref!)}&limit=100`,
  );
  expect(distributionList.ok()).toBeTruthy();
  const distributions = (await distributionList.json()) as {
    results?: Array<{ pulp_href?: string }>;
  };
  expect(distributions.results).toHaveLength(2);

  for (const distribution of distributions.results ?? []) {
    if (!distribution.pulp_href) {
      continue;
    }
    const response = await page.request.delete(distribution.pulp_href, {
      headers: { "X-CSRFToken": csrf },
    });
    expect([200, 202, 204]).toContain(response.status());
    if (response.status() === 202) {
      const body = (await response.json()) as { task?: string };
      if (body.task) {
        await waitForTask(page, body.task);
      }
    }
  }

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

test("create repository offers installed plugin types and explains unsupported features", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await login(page);
  const csrf = await csrfToken(page);
  const suffix = uniqueSuffix();
  const gemName = `e2e-gem-${suffix}`;
  const hfName = `e2e-hf-${suffix}`;

  await page.getByRole("link", { name: "Repositories", exact: true }).click();
  await page.getByRole("button", { name: "Create repository" }).first().click();
  const createDialog = page.getByRole("dialog", {
    name: "Create repository",
  });
  const typeSelect = createDialog.getByLabel("Repository type");
  for (const [value, label] of [
    ["gem", "Gem"],
    ["maven", "Maven"],
    ["npm", "NPM"],
    ["hugging_face", "Hugging Face"],
  ] as const) {
    await expect(typeSelect.locator(`option[value="${value}"]`)).toHaveText(label);
  }
  await typeSelect.selectOption("gem");
  await createDialog.getByLabel("Name").fill(gemName);
  await createDialog.getByRole("button", { name: "Create repository" }).click();
  await expect(createDialog).toBeHidden({ timeout: 20_000 });

  await page.getByPlaceholder("Search repositories…").fill(gemName);
  await page.getByPlaceholder("Search repositories…").press("Enter");
  await page.getByRole("link", { name: gemName, exact: true }).click();
  await expect(page.getByRole("heading", { name: gemName })).toBeVisible();
  await expect(page.getByText("Auto-publish is not supported for Gem repositories")).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish latest version" })).toBeEnabled({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Publish latest version" }).click();
  const publishDialog = page.getByRole("dialog", { name: "Publish repository version" });
  await expect(publishDialog).toBeVisible();
  await publishDialog.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Version 0 is published.")).toBeVisible({
    timeout: 60_000,
  });

  const hfResponse = await page.request.post(
    "/pulp/api/v3/repositories/hugging_face/hugging-face/",
    {
      headers: { "X-CSRFToken": csrf },
      data: { name: hfName },
    },
  );
  expect(hfResponse.status()).toBe(201);
  const hfHref = ((await hfResponse.json()) as { pulp_href?: string }).pulp_href;
  expect(hfHref).toBeTruthy();
  await page.goto(`/ui/repositories/detail?href=${encodeURIComponent(hfHref!)}`);
  await expect(
    page.getByText("Publications are not used by Hugging Face repositories"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish latest version" })).toHaveCount(0);

  const hfDistributionName = `e2e-hf-dist-${suffix}`;
  const hfDistributionResponse = await page.request.post(
    "/pulp/api/v3/distributions/hugging_face/hugging-face/",
    {
      headers: { "X-CSRFToken": csrf },
      data: {
        name: hfDistributionName,
        base_path: hfDistributionName,
        repository: hfHref,
      },
    },
  );
  expect(hfDistributionResponse.status()).toBe(202);
  const hfDistributionTask = await waitForTask(
    page,
    ((await hfDistributionResponse.json()) as { task: string }).task,
  );
  const hfDistributionHref = hfDistributionTask.created_resources?.[0];
  expect(hfDistributionHref).toBeTruthy();

  await page.goto(`/ui/distributions/detail?href=${encodeURIComponent(hfDistributionHref!)}`);
  await expect(
    page.getByText(
      "This distribution serves the repository directly and does not use Pulp publications.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Change content source" }).click();
  const hfSourceDialog = page.getByRole("dialog", {
    name: `Content source for ${hfDistributionName}`,
  });
  await expect(
    hfSourceDialog.getByText("Serves the repository's content directly from its latest version."),
  ).toBeVisible();
  await expect(hfSourceDialog.getByRole("radio", { name: /Pin a publication/ })).toHaveCount(0);
  await hfSourceDialog.getByRole("button", { name: "Cancel" }).click();

  const gemListResponse = await page.request.get(
    `/pulp/api/v3/repositories/gem/gem/?name=${encodeURIComponent(gemName)}`,
  );
  expect(gemListResponse.ok()).toBeTruthy();
  const gemHref = (
    (await gemListResponse.json()) as {
      results?: Array<{ pulp_href?: string }>;
    }
  ).results?.[0]?.pulp_href;
  expect(gemHref).toBeTruthy();

  const publicationList = await page.request.get(
    `/pulp/api/v3/publications/?repository=${encodeURIComponent(gemHref!)}`,
  );
  expect(publicationList.ok()).toBeTruthy();
  const publications = (await publicationList.json()) as {
    results?: Array<{ pulp_href?: string }>;
  };
  for (const publication of publications.results ?? []) {
    if (!publication.pulp_href) {
      continue;
    }
    const response = await page.request.delete(publication.pulp_href, {
      headers: { "X-CSRFToken": csrf },
    });
    expect([200, 202, 204]).toContain(response.status());
    if (response.status() === 202) {
      const body = (await response.json()) as { task?: string };
      if (body.task) {
        await waitForTask(page, body.task);
      }
    }
  }

  if (hfDistributionHref) {
    const response = await page.request.delete(hfDistributionHref, {
      headers: { "X-CSRFToken": csrf },
    });
    expect([200, 202, 204]).toContain(response.status());
    if (response.status() === 202) {
      const body = (await response.json()) as { task?: string };
      if (body.task) {
        await waitForTask(page, body.task);
      }
    }
  }

  for (const href of [gemHref, hfHref]) {
    if (!href) {
      continue;
    }
    const response = await page.request.delete(href, {
      headers: { "X-CSRFToken": csrf },
    });
    expect([200, 202, 204]).toContain(response.status());
    if (response.status() === 202) {
      const body = (await response.json()) as { task?: string };
      if (body.task) {
        await waitForTask(page, body.task);
      }
    }
  }
});

test("repository auto-publish and publish-latest workflows", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const csrf = await csrfToken(page);
  const suffix = uniqueSuffix();
  const repoName = `e2e-autopublish-${suffix}`;
  const firstContentPath = `e2e-autopublish-${suffix}-one.txt`;
  const secondContentPath = `e2e-autopublish-${suffix}-two.txt`;

  await page.getByRole("link", { name: "Repositories", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Repositories", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create repository" }).first().click();
  const createDialog = page.getByRole("dialog", { name: "Create repository" });
  await createDialog.getByLabel("Repository type").selectOption("file");
  await createDialog.getByLabel("Name").fill(repoName);
  await createDialog.getByRole("checkbox", { name: /Publish new versions automatically/ }).check();
  await createDialog.getByRole("button", { name: "Create repository" }).click();
  await expect(createDialog).toBeHidden({ timeout: 20_000 });

  const repoList = await page.request.get(`/pulp/api/v3/repositories/file/file/?name=${repoName}`);
  expect(repoList.ok()).toBeTruthy();
  const repoBody = (await repoList.json()) as {
    results?: Array<{ pulp_href?: string; autopublish?: boolean }>;
  };
  const repoHref = repoBody.results?.[0]?.pulp_href;
  expect(repoHref).toBeTruthy();
  expect(repoBody.results?.[0]?.autopublish).toBe(true);

  await page.getByPlaceholder("Search repositories…").fill(repoName);
  await page.getByPlaceholder("Search repositories…").press("Enter");
  await page.getByRole("link", { name: repoName, exact: true }).click();
  await expect(page.getByRole("heading", { name: repoName })).toBeVisible();
  await expect(page.getByText("Auto-publish", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Version 0 has no publication yet.")).toBeVisible();

  const firstContentHref = await uploadFileContent(page, csrf, firstContentPath, "first version");
  await modifyRepository(page, csrf, repoHref!, [firstContentHref]);

  const autoPublication = await waitForPublication(page, repoHref!);
  expect(autoPublication.repository_version).toContain("/versions/1/");

  await page.reload();
  await expect(page.getByText("Version 1 is published.")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("button", { name: "Latest version published" })).toBeDisabled();

  await page.getByRole("button", { name: "Disable auto-publish" }).click();
  await expect(page.getByRole("button", { name: "Enable auto-publish" })).toBeVisible({
    timeout: 20_000,
  });

  const afterDisable = await page.request.get(repoHref!);
  expect(afterDisable.ok()).toBeTruthy();
  expect(((await afterDisable.json()) as { autopublish?: boolean }).autopublish).toBe(false);

  await page.getByRole("button", { name: "Edit" }).click();
  const editDialog = page.getByRole("dialog", { name: `Edit ${repoName}` });
  await expect(
    editDialog.getByRole("checkbox", {
      name: /Publish new versions automatically/,
    }),
  ).not.toBeChecked();
  await editDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(editDialog).toBeHidden();

  const secondContentHref = await uploadFileContent(
    page,
    csrf,
    secondContentPath,
    "second version",
  );
  await modifyRepository(page, csrf, repoHref!, [secondContentHref]);

  const publicationsAfterSecond = await page.request.get(
    `/pulp/api/v3/publications/file/file/?repository=${encodeURIComponent(repoHref!)}&ordering=-pulp_created`,
  );
  expect(publicationsAfterSecond.ok()).toBeTruthy();
  const secondVersionPublications = (await publicationsAfterSecond.json()) as {
    results?: Array<{ repository_version?: string }>;
  };
  expect(
    secondVersionPublications.results?.some((publication) =>
      publication.repository_version?.includes("/versions/2/"),
    ),
  ).toBe(false);

  await page.reload();
  await expect(page.getByText("Version 2 has no publication yet.")).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Publish latest version" }).click();
  const publishDialog = page.getByRole("dialog", { name: "Publish repository version" });
  await expect(publishDialog).toBeVisible();
  await publishDialog.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Version 2 is published.")).toBeVisible({
    timeout: 60_000,
  });

  const finalPublications = await page.request.get(
    `/pulp/api/v3/publications/file/file/?repository=${encodeURIComponent(repoHref!)}`,
  );
  expect(finalPublications.ok()).toBeTruthy();
  const finalBody = (await finalPublications.json()) as {
    results?: Array<{ pulp_href?: string }>;
  };
  for (const publication of finalBody.results ?? []) {
    if (!publication.pulp_href) {
      continue;
    }
    const publicationDelete = await page.request.delete(publication.pulp_href, {
      headers: { "X-CSRFToken": csrf },
    });
    expect([200, 202, 204]).toContain(publicationDelete.status());
    if (publicationDelete.status() === 202) {
      const body = (await publicationDelete.json()) as { task?: string };
      if (body.task) {
        await waitForTask(page, body.task);
      }
    }
  }

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

test("repository names use a browser-valid pattern", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Repositories", exact: true }).click();
  await page.getByRole("button", { name: "Create repository" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Create repository" });
  const name = dialog.getByLabel("Name");

  await name.fill("bad name!");
  expect(
    await name.evaluate((element) => (element as HTMLInputElement).validity.patternMismatch),
  ).toBe(true);

  await name.fill("valid.repository-name_1");
  expect(await name.evaluate((element) => (element as HTMLInputElement).validity.valid)).toBe(true);

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog.getByText("Discard unsaved changes?")).toBeVisible();
  await dialog.getByRole("button", { name: "Discard" }).click();
  await expect(dialog).toBeHidden();
});
