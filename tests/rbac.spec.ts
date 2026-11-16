import { expect, test } from "@playwright/test";
import { csrfToken, deleteResource, login, selectComboboxOption, uniqueName } from "./helpers";

test("users and groups can receive role assignments and group membership", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  const csrf = await csrfToken(page);
  const username = uniqueName("e2e-rbac-user");
  const groupName = uniqueName("e2e-rbac-group");
  const roleName = "file.filerepository_viewer";

  const userResponse = await page.request.post("/pulp/api/v3/users/", {
    headers: { "X-CSRFToken": csrf },
    data: { username, password: "test-password-123" },
  });
  expect(userResponse.ok()).toBeTruthy();
  const user = (await userResponse.json()) as { pulp_href: string; id: number };

  const groupResponse = await page.request.post("/pulp/api/v3/groups/", {
    headers: { "X-CSRFToken": csrf },
    data: { name: groupName },
  });
  expect(groupResponse.ok()).toBeTruthy();
  const group = (await groupResponse.json()) as { pulp_href: string };

  try {
    await page.getByRole("link", { name: "Users", exact: true }).click();
    await page.getByLabel("Search users").fill(username);
    await page.getByLabel("Search users").press("Enter");
    await page.getByRole("button", { name: `Manage roles for ${username}` }).click();
    const rolesDialog = page.getByRole("dialog", { name: `Role assignments for ${username}` });
    await expect(rolesDialog).toBeVisible();
    await selectComboboxOption(rolesDialog, "Role", roleName, { search: roleName });
    await rolesDialog.getByRole("button", { name: "Add role" }).click();
    await expect
      .poll(
        async () => {
          const assigned = await page.request.get(
            `/pulp/api/v3/users/${user.id}/roles/?role=${encodeURIComponent(roleName)}`,
          );
          if (!assigned.ok()) {
            return 0;
          }
          return ((await assigned.json()) as { count: number }).count;
        },
        { timeout: 20_000 },
      )
      .toBeGreaterThan(0);
    await selectComboboxOption(rolesDialog, "Filter by role", roleName, { search: roleName });
    await expect(rolesDialog.locator("li").filter({ hasText: roleName }).first()).toBeVisible({
      timeout: 20_000,
    });

    await rolesDialog
      .getByRole("button", { name: `Remove ${roleName} assignment` })
      .first()
      .click();
    const removeDialog = page.getByRole("dialog", { name: "Remove role assignment" });
    await removeDialog.getByRole("button", { name: "Remove assignment" }).click();
    await expect(removeDialog).toBeHidden({ timeout: 20_000 });

    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("link", { name: "Groups", exact: true }).click();
    await page.getByLabel("Search groups").fill(groupName);
    await page.getByLabel("Search groups").press("Enter");
    await page.getByRole("button", { name: `Manage members of ${groupName}` }).click();
    const membersDialog = page.getByRole("dialog", { name: `Members of ${groupName}` });
    await expect(membersDialog).toBeVisible();
    await selectComboboxOption(membersDialog, "User", username, { search: username });
    await membersDialog.getByRole("button", { name: "Add member" }).click();
    await expect(
      membersDialog.getByRole("listitem").filter({ hasText: username }).first(),
    ).toBeVisible({ timeout: 20_000 });

    const members = await page.request.get(`${group.pulp_href}users/`);
    expect(members.ok()).toBeTruthy();
    const membersBody = (await members.json()) as { count: number };
    expect(membersBody.count).toBe(1);

    await membersDialog
      .getByRole("button", { name: `Remove ${username} from ${groupName}` })
      .click();
    const removeMemberDialog = page.getByRole("dialog", { name: "Remove group member" });
    await removeMemberDialog.getByRole("button", { name: "Remove member" }).click();
    await expect(removeMemberDialog).toBeHidden({ timeout: 20_000 });
  } finally {
    await deleteResource(page, csrf, user.pulp_href);
    await deleteResource(page, csrf, group.pulp_href);
  }
});
