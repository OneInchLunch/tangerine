import { expect, test, type Page } from "@playwright/test";

const SSO_CONFIG = {
  apiBasePath: "/pulp/api/v3/",
  uiBasePath: "/ui/",
  authMode: "gateway",
  externalLoginUri: null,
  gatewayBasePath: "/sso/",
  passwordLoginEnabled: true,
  ssoManagedGroup: "sso-managed",
  pollIntervalMs: 3000,
  extraVersion: "",
};

const ASSIGNED_PRN = "prn:file.filerepository:assigned";
const CREATED_PRN = "prn:file.filerepository:created";
const ASSIGNED_HREF = "/pulp/api/v3/repositories/file/file/assigned/";
const CREATED_HREF = "/pulp/api/v3/repositories/file/file/created/";
const UNASSIGNED_HREF = "/pulp/api/v3/repositories/file/file/unassigned/";
const REMOTE_HREF = "/pulp/api/v3/remotes/file/file/1/";
const PUBLICATION_HREF = "/pulp/api/v3/publications/file/file/1/";
const DISTRIBUTION_HREF = "/pulp/api/v3/distributions/file/file/1/";

interface RepositoryRecord {
  name: string;
  prn: string;
  pulp_href: string;
}

interface RepositoryDelete {
  method: string;
  href: string;
}

interface ScopedState {
  repositories: RepositoryRecord[];
  scopePrns: string[];
  repositoryQueries: string[];
  createPayloads: unknown[];
  repositoryDeletes: RepositoryDelete[];
  objectActions: RepositoryDelete[];
  taskRequests: number;
}

function repository(name: string, prn: string, href: string): RepositoryRecord {
  return { name, prn, pulp_href: href };
}

function createState(): ScopedState {
  return {
    repositories: [repository("assigned-repo", ASSIGNED_PRN, ASSIGNED_HREF)],
    scopePrns: [ASSIGNED_PRN],
    repositoryQueries: [],
    createPayloads: [],
    repositoryDeletes: [],
    objectActions: [],
    taskRequests: 0,
  };
}

function repositoryBody(record: RepositoryRecord) {
  return {
    ...record,
    description: "",
    remote: null,
    latest_version_href: `${record.pulp_href}versions/0/`,
    pulp_created: "2026-01-01T00:00:00Z",
    pulp_last_updated: "2026-01-01T00:00:00Z",
  };
}

function sessionBody(state: ScopedState) {
  return {
    username: "scope-admin",
    providerId: "microsoft",
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    csrfToken: "scope-csrf",
    isStaff: true,
    isSuperuser: false,
    repositoryPrns: state.scopePrns,
    capabilities: {
      isSuperuser: false,
      isStaff: true,
      manageSso: false,
      repositoryAdmin: true,
      tasksRead: false,
      operationsRead: false,
      importExportRead: true,
      signingRead: false,
      contentRead: true,
    },
  };
}

async function mockScopedAdmin(page: Page, state: ScopedState) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "tangerine.session",
      JSON.stringify({ expiresAt: Date.now() + 8 * 60 * 60 * 1000 }),
    );
  });

  await page.route("**/config.json", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(SSO_CONFIG),
    }),
  );

  await page.route("**/sso/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(sessionBody(state)),
    }),
  );

  await page.route("**/sso/scope/repositories", async (route) => {
    const payload = route.request().postDataJSON() as {
      path: string;
      body: { name: string };
    };
    state.createPayloads.push(payload);
    const created = repository("created-repo", CREATED_PRN, CREATED_HREF);
    state.repositories = [...state.repositories, created];
    state.scopePrns = [...state.scopePrns, CREATED_PRN];
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        repository: { pulp_href: CREATED_HREF, prn: CREATED_PRN },
        repositoryPrn: CREATED_PRN,
      }),
    });
  });

  await page.route("**/sso/scope/object", async (route) => {
    const payload = route.request().postDataJSON() as {
      method: string;
      href: string;
    };
    state.objectActions.push({ method: payload.method, href: payload.href });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        result: { task: "/pulp/api/v3/tasks/1/", state: "completed" },
      }),
    });
  });

  await page.route("**/sso/scope/repository", async (route) => {
    const payload = route.request().postDataJSON() as {
      method: string;
      href: string;
    };
    state.repositoryDeletes.push({ method: payload.method, href: payload.href });
    if (payload.method === "DELETE") {
      const deleted = state.repositories.find((item) => item.pulp_href === payload.href);
      state.repositories = state.repositories.filter((item) => item.pulp_href !== payload.href);
      if (deleted) {
        state.scopePrns = state.scopePrns.filter((prn) => prn !== deleted.prn);
      }
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        result: { task: "/pulp/api/v3/tasks/1/", state: "completed" },
      }),
    });
  });

  await page.route("**/pulp/api/v3/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.startsWith("/pulp/api/v3/tasks/")) {
      state.taskRequests += 1;
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ detail: "scoped admins cannot read tasks" }),
      });
      return;
    }

    if (path === "/pulp/api/v3/login/") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          username: "scope-admin",
          pulp_href: "/pulp/api/v3/users/9/",
          prn: "prn:auth.user:9",
        }),
      });
      return;
    }

    if (path === "/pulp/api/v3/users/9/") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          username: "scope-admin",
          pulp_href: "/pulp/api/v3/users/9/",
          is_staff: true,
          is_superuser: false,
          is_active: true,
          groups: [],
        }),
      });
      return;
    }

    if (path === "/pulp/api/v3/status/") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ versions: [] }),
      });
      return;
    }

    if (path === "/pulp/api/v3/tasks/") {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ detail: "You do not have permission to perform this action." }),
      });
      return;
    }

    if (path === "/pulp/api/v3/publications/") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          count: 1,
          next: null,
          previous: null,
          results: [
            {
              pulp_href: PUBLICATION_HREF,
              repository: ASSIGNED_HREF,
              repository_version: `${ASSIGNED_HREF}versions/1/`,
              pulp_created: "2026-01-01T00:00:00Z",
            },
          ],
        }),
      });
      return;
    }

    if (
      path.endsWith("/versions/") ||
      path.startsWith("/pulp/api/v3/publications/") ||
      path.startsWith("/pulp/api/v3/content/") ||
      path.startsWith("/pulp/api/v3/exporters/") ||
      path.startsWith("/pulp/api/v3/importers/")
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ count: 0, next: null, previous: null, results: [] }),
      });
      return;
    }

    if (path === "/pulp/api/v3/distributions/") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ count: 0, next: null, previous: null, results: [] }),
      });
      return;
    }

    if (path === "/pulp/api/v3/repositories/") {
      state.repositoryQueries.push(url.searchParams.get("prn__in") ?? "");
      const requested = url.searchParams.get("prn__in");
      const results = requested
        ? state.repositories.filter((item) => requested.split(",").includes(item.prn))
        : state.repositories;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          count: results.length,
          next: null,
          previous: null,
          results: results.map(repositoryBody),
        }),
      });
      return;
    }

    if (path === DISTRIBUTION_HREF) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          name: "assigned-distribution",
          pulp_href: DISTRIBUTION_HREF,
          base_path: "assigned",
          repository: ASSIGNED_HREF,
          publication: null,
          hidden: false,
        }),
      });
      return;
    }

    if (path === REMOTE_HREF) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          name: "assigned-remote",
          pulp_href: REMOTE_HREF,
          url: "https://example.com",
          policy: "immediate",
          hidden_fields: [],
        }),
      });
      return;
    }

    const detail = state.repositories.find((item) => item.pulp_href === path);
    if (detail) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(repositoryBody(detail)),
      });
      return;
    }

    // Unassigned or unknown Pulp resources are denied exactly as the scoped
    // repository permissions deny them.
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Not found." }),
    });
  });
}

async function openAsViewer(page: Page) {
  const state = createState();
  await mockScopedAdmin(page, state);
  await page.route("**/sso/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        username: "viewer",
        providerId: "microsoft",
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        csrfToken: "viewer-csrf",
        isStaff: false,
        isSuperuser: false,
        repositoryPrns: [],
        capabilities: {
          isSuperuser: false,
          isStaff: false,
          manageSso: false,
          repositoryAdmin: false,
          repositoryWrite: false,
          tasksRead: true,
          operationsRead: false,
          importExportRead: false,
          signingRead: false,
          contentRead: false,
        },
      }),
    }),
  );
  await page.route("**/pulp/api/v3/users/9/", (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ detail: "forbidden" }),
    }),
  );
  await page.goto("/ui/repositories");
  await expect(page.getByRole("heading", { name: "Repositories" })).toBeVisible();
  return state;
}

async function openAsScopedAdmin(page: Page) {
  const state = createState();
  await mockScopedAdmin(page, state);
  await page.goto("/ui/repositories");
  await expect(page.getByRole("heading", { name: "Repositories" })).toBeVisible();
  return state;
}

test("a scoped admin sees only assigned repositories and no admin navigation", async ({ page }) => {
  const state = await openAsScopedAdmin(page);

  await expect(page.getByRole("link", { name: "assigned-repo" })).toBeVisible();
  expect(state.repositoryQueries.some((query) => query.includes(ASSIGNED_PRN))).toBe(true);

  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  for (const visible of ["Repositories", "Remotes", "Distributions", "Publications", "Content"]) {
    await expect(navigation.getByRole("link", { name: visible, exact: true })).toBeVisible();
  }
  for (const hidden of [
    "Tasks",
    "Workers",
    "Operations",
    "Users",
    "Groups",
    "Roles",
    "Signing",
    "API admin",
  ]) {
    await expect(navigation.getByRole("link", { name: hidden, exact: true })).toHaveCount(0);
  }
});

test("an unassigned repository URL is denied", async ({ page }) => {
  await openAsScopedAdmin(page);

  await page.goto(`/ui/repositories/detail?href=${encodeURIComponent(UNASSIGNED_HREF)}`);
  await expect(page.getByText("Could not load this repository")).toBeVisible();
  await expect(page.getByText(/not found/i).first()).toBeVisible();
});

test("a repository created through the gateway appears in the assigned list", async ({ page }) => {
  const state = await openAsScopedAdmin(page);
  expect(state.repositories).toHaveLength(1);

  await page.getByRole("button", { name: "Create repository" }).click();
  const dialog = page.getByRole("dialog", { name: "Create repository" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Name").fill("created-repo");
  await dialog.getByRole("button", { name: "Create repository" }).click();

  await expect(page.getByText("Repository created")).toBeVisible();
  await expect(page.getByRole("link", { name: "created-repo" })).toBeVisible();
  expect(state.createPayloads).toHaveLength(1);
  expect(state.createPayloads[0]).toMatchObject({
    path: "/pulp/api/v3/repositories/file/file/",
    body: { name: "created-repo" },
  });
  expect(
    state.repositoryQueries.some(
      (query) => query.includes(ASSIGNED_PRN) && query.includes(CREATED_PRN),
    ),
  ).toBe(true);
});

test("direct URLs to hidden screens show an access denial", async ({ page }) => {
  await openAsScopedAdmin(page);

  for (const [path, heading] of [
    ["/ui/tasks", "Task access required"],
    ["/ui/workers", "Task access required"],
    ["/ui/operations", "Operations access required"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
});

test("deleting an assigned repository uses the scoped gateway endpoint", async ({ page }) => {
  const state = await openAsScopedAdmin(page);

  await page.goto(`/ui/repositories/detail?href=${encodeURIComponent(ASSIGNED_HREF)}`);
  await expect(page.getByRole("heading", { name: "assigned-repo" })).toBeVisible();

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete repository" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Repository name").fill("assigned-repo");
  await dialog.getByRole("button", { name: "Delete repository" }).click();

  await expect(page.getByText("Repository deleted")).toBeVisible();
  expect(state.repositoryDeletes).toEqual([{ method: "DELETE", href: ASSIGNED_HREF }]);
  expect(state.taskRequests).toBe(0);
  expect(state.repositories).toHaveLength(0);
});

test("editing an assigned repository uses the scoped gateway action", async ({ page }) => {
  const state = await openAsScopedAdmin(page);

  await page.goto(`/ui/repositories/detail?href=${encodeURIComponent(ASSIGNED_HREF)}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit assigned-repo" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Description").fill("updated description");
  await dialog.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByText("Repository updated")).toBeVisible();
  expect(state.repositoryDeletes).toContainEqual({
    method: "PATCH",
    href: ASSIGNED_HREF,
  });
});

test("editing and deleting a remote uses scoped gateway actions", async ({ page }) => {
  const state = await openAsScopedAdmin(page);

  await page.goto(`/ui/remotes/detail?href=${encodeURIComponent(REMOTE_HREF)}`);
  await expect(page.getByRole("heading", { name: "assigned-remote" })).toBeVisible();

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const editHeading = page.getByRole("heading", { name: "Edit assigned-remote" });
  await expect(editHeading).toBeVisible();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("renamed-remote");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Remote updated")).toBeVisible();
  expect(state.objectActions).toContainEqual({
    method: "PATCH",
    href: REMOTE_HREF,
  });

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete assigned-remote" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Remote name").fill("assigned-remote");
  await dialog.getByRole("button", { name: "Delete remote" }).click();
  await expect(page.getByText("Remote deleted")).toBeVisible();
  expect(state.objectActions).toContainEqual({
    method: "DELETE",
    href: REMOTE_HREF,
  });
  expect(state.taskRequests).toBe(0);
});

test("deleting a publication uses the scoped gateway action", async ({ page }) => {
  const state = await openAsScopedAdmin(page);

  await page.goto("/ui/publications");
  await expect(page.getByRole("heading", { name: "Publications", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Delete File publication" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete publication" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Delete publication" }).click();

  await expect(page.getByText("Publication deleted")).toBeVisible();
  expect(state.objectActions).toContainEqual({
    method: "DELETE",
    href: PUBLICATION_HREF,
  });
  expect(state.taskRequests).toBe(0);
});

test("deleting a distribution uses the scoped gateway action", async ({ page }) => {
  const state = await openAsScopedAdmin(page);

  await page.goto(`/ui/distributions/detail?href=${encodeURIComponent(DISTRIBUTION_HREF)}`);
  await expect(page.getByRole("heading", { name: "assigned-distribution" })).toBeVisible();

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete assigned-distribution" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Distribution name").fill("assigned-distribution");
  await dialog.getByRole("button", { name: "Delete distribution" }).click();

  await expect(page.getByText("Distribution deleted")).toBeVisible();
  expect(state.objectActions).toContainEqual({
    method: "DELETE",
    href: DISTRIBUTION_HREF,
  });
  expect(state.taskRequests).toBe(0);
});

test("a viewer gets read-only repository detail and denied content routes", async ({ page }) => {
  await openAsViewer(page);

  await page.goto(`/ui/repositories/detail?href=${encodeURIComponent(ASSIGNED_HREF)}`);
  await expect(page.getByRole("heading", { name: "assigned-repo" })).toBeVisible();
  for (const label of [
    "Edit",
    "Sync",
    "Delete",
    "Sync repository",
    "Add distribution",
    "Create distribution",
  ]) {
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(0);
  }

  await page.goto("/ui/content");
  await expect(page.getByRole("heading", { name: "Content access required" })).toBeVisible();

  await page.goto("/ui/import-export/pulp-export");
  await expect(page.getByRole("heading", { name: "Import/export access required" })).toBeVisible();
});
