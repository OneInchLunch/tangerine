import { expect, test } from "@playwright/test";
import { friendlyTaskName } from "../src/lib/task-name";
import { csrfToken, login, uniqueName, uniqueSuffix } from "./helpers";

test("route titles and descriptions render in the top bar", async ({ page }) => {
  await login(page);
  const topBar = page.getByRole("banner");
  const main = page.getByRole("main");

  await expect(topBar.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await expect(
    topBar.getByText("A live view of your Pulp installation, its content, and recent activity.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(main.getByRole("heading", { name: "Dashboard", exact: true })).toHaveCount(0);

  await page.getByRole("link", { name: "Repositories", exact: true }).click();
  await expect(topBar.getByRole("heading", { name: "Repositories", exact: true })).toBeVisible();
  await expect(
    topBar.getByText("Browse content repositories across every installed Pulp plugin.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(main.getByRole("heading", { name: "Repositories", exact: true })).toHaveCount(0);

  await page.getByRole("link", { name: "Operations", exact: true }).click();
  await expect(topBar.getByRole("heading", { name: "Operations", exact: true })).toBeVisible();
  await expect(main.getByRole("heading", { name: "Task schedules", exact: true })).toBeVisible();
});

test("all administration sections render", async ({ page }) => {
  await login(page);

  const sections = [
    { link: "Remotes", heading: "Remotes" },
    { link: "Distributions", heading: "Distributions" },
    { link: "Content", heading: "Content" },
    { link: "Operations", heading: "Operations" },
    { link: "Users", heading: "Users" },
    { link: "Groups", heading: "Groups" },
    { link: "Roles", heading: "Roles" },
    { link: "Signing", heading: "Signing" },
    { link: "Plugins", heading: "Plugins" },
    { link: "Settings", heading: "Settings" },
  ];

  for (const section of sections) {
    await page.getByRole("link", { name: section.link, exact: true }).click();
    await expect(page.getByRole("heading", { name: section.heading, exact: true })).toBeVisible();
  }

  await expect(page.getByRole("navigation", { name: "Settings sections" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Runtime", exact: true })).toHaveAttribute(
    "href",
    "#settings-runtime",
  );
  await expect(page.getByRole("link", { name: "Session", exact: true })).toHaveAttribute(
    "href",
    "#settings-session",
  );
});

test("navigation can be collapsed and expanded", async ({ page }) => {
  await login(page);
  const sidebar = page.locator("#app-sidebar");
  await expect(sidebar).toHaveAttribute("data-collapsed", "false");
  await expect(sidebar.getByRole("button", { name: "Collapse navigation" })).toBeVisible();

  await sidebar.getByRole("button", { name: "Collapse navigation" }).click();
  await expect(sidebar).toHaveAttribute("data-collapsed", "true");
  await expect(sidebar.getByRole("button", { name: "Expand navigation" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(sidebar).toHaveAttribute("data-collapsed", "true");
  await expect(sidebar.getByRole("button", { name: "Expand navigation" })).toBeVisible();

  await sidebar.getByRole("button", { name: "Expand navigation" }).click();
  await expect(sidebar).toHaveAttribute("data-collapsed", "false");
});

test("task names are shown with friendly labels", async ({ page }) => {
  await login(page);
  const csrf = await csrfToken(page);
  const repoName = uniqueName("e2e-task-label");

  const createResponse = await page.request.post("/pulp/api/v3/repositories/file/file/", {
    headers: { "X-CSRFToken": csrf },
    data: { name: repoName },
  });
  expect(createResponse.ok()).toBeTruthy();
  const repo = (await createResponse.json()) as { pulp_href: string };

  const deleteResponse = await page.request.delete(repo.pulp_href, {
    headers: { "X-CSRFToken": csrf },
  });
  expect(deleteResponse.status()).toBe(202);
  const deleteTask = (await deleteResponse.json()) as { task: string };

  const taskResponse = await page.request.get(deleteTask.task);
  expect(taskResponse.ok()).toBeTruthy();
  const task = (await taskResponse.json()) as { name?: string };
  expect(task.name).toBeTruthy();
  const friendly = friendlyTaskName(task.name);

  await page.getByRole("link", { name: "Tasks", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tasks", exact: true })).toBeVisible();
  await page.getByLabel("Search tasks").fill(task.name!);
  await page.getByLabel("Search tasks").press("Enter");
  const taskLink = page.getByRole("link", { name: friendly, exact: true }).first();
  await expect(taskLink).toBeVisible();
  await taskLink.click();

  await expect(page.getByRole("heading", { name: friendly, exact: true })).toBeVisible();
  await expect(page.getByText(task.name!, { exact: true })).toBeVisible();
});

test("plugins page shows enabled and disabled components", async ({ page }) => {
  await login(page);

  const statusResponse = await page.request.get("/pulp/api/v3/status/");
  expect(statusResponse.ok()).toBeTruthy();
  const status = (await statusResponse.json()) as {
    versions?: Array<{ component?: string }>;
  };
  const components = new Set((status.versions ?? []).map((item) => item.component));
  expect(components.has("file")).toBeTruthy();

  await page.getByRole("link", { name: "Plugins", exact: true }).click();
  await expect(page).toHaveURL(/\/ui\/plugins$/);
  await expect(page.getByRole("heading", { name: "Plugins", exact: true })).toBeVisible();
  await expect(page.getByText("Enabled", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("File", { exact: true })).toBeVisible();
  await expect(page.getByText(/no REST API to install or uninstall plugins/i)).toBeVisible();

  if (!components.has("2to3_migration") || !components.has("ostree")) {
    await expect(page.getByText("Disabled", { exact: true }).first()).toBeVisible();
  }
});

test("users and groups can be created and edited", async ({ page }) => {
  await login(page);
  const suffix = uniqueSuffix();
  const username = `e2e-user-${suffix}`;
  const groupName = `e2e-group-${suffix}`;
  const csrf = await csrfToken(page);

  await page.getByRole("link", { name: "Users", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Users", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create user" }).first().click();
  const userDialog = page.getByRole("dialog", { name: "Create user" });
  await userDialog.getByLabel("Username").fill(username);
  await userDialog.getByLabel("Password", { exact: true }).fill("test-password-123");
  await userDialog.getByLabel("Email").fill(`${username}@example.com`);
  await userDialog.getByRole("button", { name: "Create user" }).click();
  await expect(userDialog).toBeHidden({ timeout: 20_000 });
  await expect(page.getByText(username, { exact: true })).toBeVisible();

  const editedEmail = `${username}+edited@example.com`;
  await page.getByRole("button", { name: `Edit ${username}` }).click();
  const editUserDialog = page.getByRole("dialog", { name: `Edit ${username}` });
  await expect(editUserDialog).toBeVisible();
  await editUserDialog.getByLabel("Email").fill(editedEmail);
  await editUserDialog.getByRole("button", { name: "Save changes" }).click();
  await expect(editUserDialog).toBeHidden();
  await expect(page.getByText(editedEmail, { exact: true })).toBeVisible();

  const userResponse = await page.request.get(
    `/pulp/api/v3/users/?username=${encodeURIComponent(username)}`,
  );
  expect(userResponse.ok()).toBeTruthy();
  const userBody = (await userResponse.json()) as {
    results?: Array<{ pulp_href?: string; email?: string }>;
  };
  expect(userBody.results?.[0]?.email).toBe(editedEmail);
  const userHref = userBody.results?.[0]?.pulp_href;
  if (userHref) {
    const deleteUser = await page.request.delete(userHref, {
      headers: { "X-CSRFToken": csrf },
    });
    expect(deleteUser.ok()).toBeTruthy();
  }

  await page.getByRole("link", { name: "Groups", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Groups", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create group" }).first().click();
  const groupDialog = page.getByRole("dialog", { name: "Create group" });
  await groupDialog.getByLabel("Group name").fill(groupName);
  await groupDialog.getByRole("button", { name: "Create group" }).click();
  await expect(groupDialog).toBeHidden({ timeout: 20_000 });
  await expect(page.getByText(groupName, { exact: true })).toBeVisible();

  const editedGroupName = `${groupName}-edited`;
  await page.getByRole("button", { name: `Edit ${groupName}` }).click();
  const editGroupDialog = page.getByRole("dialog", { name: `Edit ${groupName}` });
  await expect(editGroupDialog).toBeVisible();
  await editGroupDialog.getByLabel("Group name").fill(editedGroupName);
  await editGroupDialog.getByRole("button", { name: "Save changes" }).click();
  await expect(editGroupDialog).toBeHidden();
  await expect(page.getByText(editedGroupName, { exact: true })).toBeVisible();

  const groupResponse = await page.request.get(
    `/pulp/api/v3/groups/?name__contains=${encodeURIComponent(editedGroupName)}`,
  );
  expect(groupResponse.ok()).toBeTruthy();
  const groupBody = (await groupResponse.json()) as { results?: Array<{ pulp_href?: string }> };
  const groupHref = groupBody.results?.[0]?.pulp_href;
  if (groupHref) {
    const deleteGroup = await page.request.delete(groupHref, {
      headers: { "X-CSRFToken": csrf },
    });
    expect(deleteGroup.ok()).toBeTruthy();
  }
});

test("the dashboard does not overflow a phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await expect(page.getByText("Recent tasks")).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("wide screens use the available width and scale meta text", async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 });
  await login(page);
  await expect(page.getByText("Recent tasks")).toBeVisible();

  const { mainWidth, overflow, metaSize } = await page.evaluate(() => {
    const main = document.querySelector("main");
    const meta = document.querySelector("main .text-meta");
    return {
      mainWidth: main ? main.getBoundingClientRect().width : 0,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      metaSize: meta ? getComputedStyle(meta).fontSize : "",
    };
  });

  expect(mainWidth).toBeGreaterThan(2200);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(metaSize).toBe("13px");
});
