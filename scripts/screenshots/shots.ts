import { capture, chooseCombobox, closeOverlays, freezeMotion, go, settle } from "./capture";
import { DEMO_ROLE } from "./constants";
import type { Shot } from "./types";
import { prepareUnpublishedVersion, restorePublishedState } from "./seed";

export const shots: Shot[] = [
  {
    name: "login",
    run: async ({ page, baseURL, capture: captureContext }) => {
      await page.goto(`${baseURL}/ui/login`);
      await freezeMotion(page);
      await settle(page, 'form button[type="submit"]');
      await capture(captureContext, "login");
    },
  },
  {
    name: "dashboard",
    run: async ({ page, baseURL, capture: captureContext }) => {
      await go(page, baseURL, "/ui/", 'a[aria-label="Tangerine dashboard"]');
      await page.getByRole("heading", { name: "Recent tasks" }).waitFor();
      await capture(captureContext, "dashboard");
    },
  },
  {
    name: "navigation-collapsed",
    run: async ({ page, baseURL, capture: captureContext }) => {
      await go(page, baseURL, "/ui/repositories?q=demo", "table");
      await page.getByRole("button", { name: "Collapse navigation" }).click();
      await page.waitForTimeout(400);
      await capture(captureContext, "navigation-collapsed");
      await page.getByRole("button", { name: "Expand navigation" }).click();
      await page.waitForTimeout(300);
    },
  },
  {
    name: "repositories",
    run: async ({ page, baseURL, capture: captureContext }) => {
      await go(page, baseURL, "/ui/repositories?q=demo", "table");
      await capture(captureContext, "repositories");
    },
  },
  {
    name: "repositories-create",
    run: async ({ page, baseURL, capture: captureContext }) => {
      await go(page, baseURL, "/ui/repositories", "table");
      await page.getByRole("button", { name: "Create repository" }).click();
      const dialog = page.getByRole("dialog", { name: "Create repository" });
      await dialog.waitFor();
      await dialog.getByLabel("Name").fill("demo-new-repository");
      await dialog.getByLabel("Description").fill("Scratch repository for release candidates");
      await page.waitForTimeout(300);
      await capture(captureContext, "repositories-create");
      await closeOverlays(page);
    },
  },
  {
    name: "repository-detail",
    run: async ({ page, baseURL, state, capture: captureContext }) => {
      await go(
        page,
        baseURL,
        `/ui/repositories/detail?href=${encodeURIComponent(state.fileRepositoryHref)}`,
        "text=Repository versions",
      );
      await capture(captureContext, "repository-detail", { fullPage: true });
    },
  },
  {
    name: "repository-version-pane",
    run: async ({ page, baseURL, state, capture: captureContext }) => {
      await go(
        page,
        baseURL,
        `/ui/repositories/detail?href=${encodeURIComponent(state.fileRepositoryHref)}`,
        "table",
      );
      await page.getByRole("heading", { name: "Repository versions" }).scrollIntoViewIfNeeded();
      await page.getByRole("button", { name: `View version 1 snapshot` }).click();
      await page.getByRole("heading", { name: /Version 1 snapshot/ }).waitFor();
      const handle = page.getByRole("separator", { name: "Resize pane height" });
      await handle.focus();
      for (let step = 0; step < 5; step += 1) {
        await page.keyboard.press("ArrowUp");
      }
      await handle.blur();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(400);
      await capture(captureContext, "repository-version-pane");
      await page.keyboard.press("Escape");
    },
  },
  {
    name: "repository-publish-dialog",
    run: async ({ page, baseURL, api, state, capture: captureContext }) => {
      // Create an unpublished version so the dialog is reachable, then restore a
      // published repository so later screens show a consistent installation.
      await prepareUnpublishedVersion(api);
      await go(
        page,
        baseURL,
        `/ui/repositories/detail?href=${encodeURIComponent(state.fileRepositoryHref)}`,
        "text=Repository versions",
      );
      await page.getByRole("button", { name: "Publish latest version" }).click();
      const dialog = page.getByRole("dialog", { name: "Publish repository version" });
      await dialog.waitFor();
      await page.waitForTimeout(400);
      await capture(captureContext, "repository-publish-dialog");
      await closeOverlays(page);
      await restorePublishedState(api, state);
    },
  },
  {
    name: "remotes",
    run: async ({ page, baseURL, capture: captureContext }) => {
      await go(page, baseURL, "/ui/remotes?q=demo", "table");
      await capture(captureContext, "remotes");
    },
  },
  {
    name: "remotes-create",
    run: async ({ page, baseURL, capture: captureContext }) => {
      await go(page, baseURL, "/ui/remotes/new", "form");
      await page.getByRole("textbox", { name: "Name", exact: true }).fill("demo-archive-remote");
      await page
        .getByRole("textbox", { name: "Remote URL", exact: true })
        .fill("https://fixtures.example.com/archive/");
      await page.waitForTimeout(300);
      await capture(captureContext, "remotes-create");
    },
  },
  {
    name: "remote-detail",
    run: async ({ page, baseURL, state, capture: captureContext }) => {
      await go(
        page,
        baseURL,
        `/ui/remotes/detail?href=${encodeURIComponent(state.fileRemoteHref)}`,
        "text=Record metadata",
      ).catch(async () => {
        await settle(page, "text=Record metadata");
      });
      await capture(captureContext, "remote-detail");
    },
  },
  {
    name: "distributions",
    run: async ({ page, baseURL, capture: captureContext }) => {
      await go(page, baseURL, "/ui/distributions?q=demo", "table");
      await capture(captureContext, "distributions");
    },
  },
  {
    name: "distribution-detail",
    run: async ({ page, baseURL, state, capture: captureContext }) => {
      await go(
        page,
        baseURL,
        `/ui/distributions/detail?href=${encodeURIComponent(state.fileDistributionHref)}`,
        "text=Content endpoint",
      );
      await capture(captureContext, "distribution-detail");
    },
  },
  {
    name: "distribution-source-dialog",
    run: async ({ page, baseURL, state, capture: captureContext }) => {
      await go(
        page,
        baseURL,
        `/ui/distributions/detail?href=${encodeURIComponent(state.fileDistributionHref)}`,
        "text=Content endpoint",
      );
      await page.getByRole("button", { name: "Change content source" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      await page.waitForTimeout(400);
      await capture(captureContext, "distribution-source-dialog");
      await closeOverlays(page);
    },
  },
  {
    name: "publications",
    run: async ({ page, baseURL, state, capture: captureContext }) => {
      await go(page, baseURL, "/ui/publications", "table");
      await chooseCombobox(page, "Repository", state.fileRepository);
      await page.waitForTimeout(800);
      await capture(captureContext, "publications");
    },
  },
  {
    name: "publication-detail",
    run: async ({ page, baseURL, state, capture: captureContext }) => {
      await go(page, baseURL, "/ui/publications", "table");
      await chooseCombobox(page, "Repository", state.fileRepository);
      await page.waitForTimeout(800);
      await page.getByRole("button", { name: "Publication details" }).first().click();
      await page.getByRole("heading", { name: "Publication" }).first().waitFor();
      await page.waitForTimeout(400);
      await capture(captureContext, "publication-detail");
      await page.keyboard.press("Escape");
    },
  },
  {
    name: "content-types",
    run: async ({ page, baseURL, capture: captureContext }) => {
      await go(page, baseURL, "/ui/content", 'input[aria-label="Filter content types"]');
      await page.getByRole("button", { name: /^RPM\b/ }).click();
      await capture(captureContext, "content-types");
    },
  },
  {
    name: "content-units",
    run: async ({ page, baseURL, capture: captureContext }) => {
      await go(page, baseURL, "/ui/content", 'input[aria-label="Filter content types"]');
      await page.getByLabel("Filter content types").fill("file");
      await page.getByRole("button", { name: /^Files/ }).click();
      await page.getByLabel("Filter content types").fill("");
      await page.getByRole("button", { name: "Upload content" }).waitFor();
      await page.waitForTimeout(800);
      await capture(captureContext, "content-units");
    },
  },
  {
    name: "content-upload",
    run: async ({ page, baseURL, state, capture: captureContext }) => {
      await go(page, baseURL, "/ui/content", 'input[aria-label="Filter content types"]');
      await page.getByLabel("Filter content types").fill("file");
      await page.getByRole("button", { name: /^Files/ }).click();
      await page.getByRole("button", { name: "Upload content" }).click();
      const dialog = page.getByRole("dialog", { name: /Upload files/ });
      await dialog.waitFor();
      await chooseCombobox(dialog, "Repository", state.fileRepository, state.fileRepository);
      await dialog.getByLabel(/Relative Path/).fill("demo/uploaded-fixture.txt");
      await page.waitForTimeout(400);
      await capture(captureContext, "content-upload");
      await closeOverlays(page);
    },
  },
  {
    name: "tasks",
    run: async ({ page, baseURL, capture: captureContext }) => {
      await go(page, baseURL, "/ui/tasks", "table");
      await capture(captureContext, "tasks");
    },
  },
  {
    name: "task-detail",
    run: async ({ page, baseURL, state, capture: captureContext }) => {
      const taskId = state.seedTaskHref.split("/").filter(Boolean).at(-1);
      await go(page, baseURL, `/ui/tasks/${taskId}`, "text=Execution timeline");
      await capture(captureContext, "task-detail");
    },
  },
  {
    name: "task-cancel",
    run: async ({ page, baseURL, capture: captureContext }) => {
      await page.route("**/pulp/api/v3/tasks/demo-task/", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            pulp_href: "/pulp/api/v3/tasks/demo-task/",
            state: "running",
            name: "pulp_rpm.app.tasks.synchronizing.synchronize",
            logging_cid: "demo-task",
            pulp_created: new Date().toISOString(),
            started_at: new Date().toISOString(),
            progress_reports: [
              {
                message: "Downloading metadata",
                code: "sync.downloading",
                state: "running",
                total: 1200,
                done: 540,
              },
            ],
          }),
        });
      });
      await go(page, baseURL, "/ui/tasks/demo-task", "text=Execution timeline");
      await page.getByRole("button", { name: "Cancel task" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Cancel task" });
      await dialog.waitFor();
      await page.waitForTimeout(300);
      await capture(captureContext, "task-cancel");
      await closeOverlays(page);
      await page.unroute("**/pulp/api/v3/tasks/demo-task/");
    },
  },
  {
    name: "workers",
    run: async ({ page, baseURL, capture: captureContext }) => {
      await go(page, baseURL, "/ui/workers", "table");
      await capture(captureContext, "workers");
    },
  },
  {
    name: "operations",
    run: async ({ page, baseURL, capture: captureContext }) => {
      await go(page, baseURL, "/ui/operations", "text=Clean up orphaned content");
      await capture(captureContext, "operations", { fullPage: true });
    },
  },
  {
    name: "operations-confirm",
    run: async ({ page, baseURL, capture: captureContext }) => {
      await go(page, baseURL, "/ui/operations", "text=Clean up orphaned content");
      await page.getByRole("button", { name: "Run orphan cleanup" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Clean up orphaned content" });
      await dialog.waitFor();
      await page.waitForTimeout(300);
      await capture(captureContext, "operations-confirm");
      await closeOverlays(page);
    },
  },
  {
    name: "pulp-export",
    run: async ({ page, baseURL, capture: captureContext }) => {
      await go(page, baseURL, "/ui/import-export/pulp-export", "table");
      await capture(captureContext, "pulp-export");
    },
  },
  {
    name: "filesystem-export",
    run: async ({ page, baseURL, capture: captureContext }) => {
      await go(page, baseURL, "/ui/import-export/filesystem-export", "text=Filesystem exporters");
      await capture(captureContext, "filesystem-export");
    },
  },
  {
    name: "pulp-import",
    run: async ({ page, baseURL, capture: captureContext }) => {
      await go(page, baseURL, "/ui/import-export/pulp-import", "table");
      await capture(captureContext, "pulp-import");
    },
  },
  {
    name: "users",
    run: async ({ page, baseURL, capture: captureContext }) => {
      await go(page, baseURL, "/ui/users?q=demo", "table");
      await capture(captureContext, "users");
    },
  },
  {
    name: "user-roles",
    run: async ({ page, baseURL, state, capture: captureContext }) => {
      await go(page, baseURL, `/ui/users?q=${encodeURIComponent(state.username)}`, "table");
      await page.getByRole("button", { name: `Manage roles for ${state.username}` }).click();
      const dialog = page.getByRole("dialog", { name: `Role assignments for ${state.username}` });
      await dialog.waitFor();
      await dialog.getByLabel("Filter by role").click();
      const rolePanel = page.getByRole("dialog", { name: "Filter by role" });
      await rolePanel.getByRole("option", { name: DEMO_ROLE, exact: true }).click();
      await page.waitForTimeout(700);
      await capture(captureContext, "user-roles");
      await closeOverlays(page);
    },
  },
  {
    name: "groups",
    run: async ({ page, baseURL, capture: captureContext }) => {
      await go(page, baseURL, "/ui/groups?q=demo", "table");
      await capture(captureContext, "groups");
    },
  },
  {
    name: "group-members",
    run: async ({ page, baseURL, state, capture: captureContext }) => {
      await go(page, baseURL, `/ui/groups?q=${encodeURIComponent(state.groupName)}`, "table");
      await page.getByRole("button", { name: `Manage members of ${state.groupName}` }).click();
      const dialog = page.getByRole("dialog", { name: `Members of ${state.groupName}` });
      await dialog.waitFor();
      await page.waitForTimeout(500);
      await capture(captureContext, "group-members");
      await closeOverlays(page);
    },
  },
  {
    name: "roles",
    run: async ({ page, baseURL, capture: captureContext }) => {
      await go(page, baseURL, "/ui/roles", "table");
      await page.getByLabel("Search roles…").fill("file.");
      await page.getByLabel("Search roles…").press("Enter");
      await page.waitForTimeout(900);
      await capture(captureContext, "roles");
    },
  },
  {
    name: "signing",
    run: async ({ page, baseURL, capture: captureContext }) => {
      await go(page, baseURL, "/ui/signing", "text=Signing services registered");
      await capture(captureContext, "signing");
    },
  },
  {
    name: "plugins",
    run: async ({ page, baseURL, capture: captureContext }) => {
      await go(page, baseURL, "/ui/plugins", "text=Plugin inventory");
      await capture(captureContext, "plugins");
    },
  },
  {
    name: "api-admin",
    run: async ({ page, baseURL, capture: captureContext }) => {
      await go(page, baseURL, "/ui/api-admin", 'input[aria-label="Filter API endpoints"]');
      await page.waitForTimeout(600);
      await capture(captureContext, "api-admin");
    },
  },
  {
    name: "api-admin-request",
    run: async ({ page, baseURL, capture: captureContext }) => {
      await go(page, baseURL, "/ui/api-admin", 'input[aria-label="Filter API endpoints"]');
      await page.getByLabel("Filter API endpoints").fill("status");
      await page.waitForTimeout(600);
      await page.locator("button", { hasText: "/status/" }).first().click();
      await page.waitForTimeout(800);
      await capture(captureContext, "api-admin-request");
    },
  },
  {
    name: "settings",
    run: async ({ page, baseURL, capture: captureContext }) => {
      await go(page, baseURL, "/ui/settings", "text=Runtime configuration");
      await capture(captureContext, "settings", { fullPage: true });
    },
  },
];
