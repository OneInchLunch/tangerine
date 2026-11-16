import { expect, type Locator, type Page } from "@playwright/test";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

/** Build a collision-safe suffix shared by related resource names. */
export function uniqueSuffix(): string {
  return `${Date.now()}-${randomUUID().slice(0, 8)}`;
}

/** Build a collision-safe name for resources created in parallel tests. */
export function uniqueName(prefix: string): string {
  return `${prefix}-${uniqueSuffix()}`;
}

export async function csrfToken(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  return cookies.find((cookie) => cookie.name === "csrftoken")?.value ?? "";
}

type ComboboxScope = Page | Locator;

/** Open a combobox and return its popup panel. */
export async function openCombobox(scope: ComboboxScope, label: string): Promise<Locator> {
  const trigger = scope.getByLabel(label, { exact: true });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const panel = scope.getByRole("dialog", { name: label });
  await expect(panel).toBeVisible();
  return panel;
}

/** Pick a single option, optionally searching first. */
export async function selectComboboxOption(
  scope: ComboboxScope,
  label: string,
  option: string,
  options: { search?: string } = {},
) {
  const panel = await openCombobox(scope, label);
  if (options.search) {
    await panel.getByRole("combobox").fill(options.search);
  }
  await panel.getByRole("option", { name: option, exact: false }).first().click();
  await expect(panel).toBeHidden();
}

/** Toggle a multi-select option and leave the panel open for more selections. */
export async function toggleComboboxOption(
  scope: ComboboxScope,
  label: string,
  option: string,
  options: { search?: string } = {},
) {
  const panel = await openCombobox(scope, label);
  if (options.search) {
    await panel.getByRole("combobox").fill(options.search);
  }
  await panel.getByRole("option", { name: option, exact: false }).first().click();
  return panel;
}

/** Close an open multi-select panel. */
export async function closeCombobox(panel: Locator) {
  await panel.getByRole("button", { name: "Done" }).click();
  await expect(panel).toBeHidden();
}

export const adminUsername = process.env.PULP_ADMIN_USER ?? "admin";
export const adminPassword = process.env.PULP_ADMIN_PASSWORD ?? "admin";

export async function login(page: Page) {
  await page.goto("/ui/");
  await expect(page).toHaveURL(/\/ui\/login$/);
  await page.getByLabel("Username").fill(adminUsername);
  await page.getByLabel("Password", { exact: true }).fill(adminPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/ui\/$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

interface TaskResult {
  state?: string;
  created_resources?: string[];
}

export async function waitForTask(page: Page, taskHref: string): Promise<TaskResult> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const response = await page.request.get(taskHref);
    expect(response.ok()).toBeTruthy();
    const task = (await response.json()) as TaskResult;
    if (task.state === "completed") {
      return task;
    }
    if (task.state === "failed" || task.state === "canceled") {
      throw new Error(`Task ${taskHref} ended in state ${task.state}`);
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`Task ${taskHref} did not finish in time`);
}

export async function uploadFileContent(
  page: Page,
  csrf: string,
  relativePath: string,
  contents: string,
): Promise<string> {
  const response = await page.request.post("/pulp/api/v3/content/file/files/", {
    headers: { "X-CSRFToken": csrf },
    multipart: {
      relative_path: relativePath,
      file: {
        name: relativePath,
        mimeType: "text/plain",
        buffer: Buffer.from(contents),
      },
    },
  });
  expect(response.status()).toBe(202);
  const task = await waitForTask(page, ((await response.json()) as { task: string }).task);
  const contentHref = task.created_resources?.[0];
  expect(contentHref).toBeTruthy();
  return contentHref!;
}

export async function modifyRepository(
  page: Page,
  csrf: string,
  repoHref: string,
  addContentUnits: string[],
) {
  const response = await page.request.post(`${repoHref}modify/`, {
    headers: { "X-CSRFToken": csrf },
    data: { add_content_units: addContentUnits },
  });
  expect(response.status()).toBe(202);
  await waitForTask(page, ((await response.json()) as { task: string }).task);
}

export async function deleteResource(page: Page, csrf: string, href: string) {
  const response = await page.request.delete(href, {
    headers: { "X-CSRFToken": csrf },
  });
  expect([200, 202, 204, 404]).toContain(response.status());
  if (response.status() === 202) {
    const body = (await response.json()) as { task?: string };
    if (body.task) {
      await waitForTask(page, body.task);
    }
  }
}

export async function waitForPublication(
  page: Page,
  repoHref: string,
): Promise<{ pulp_href?: string; repository_version?: string }> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await page.request.get(
      `/pulp/api/v3/publications/file/file/?repository=${encodeURIComponent(repoHref)}&ordering=-pulp_created`,
    );
    if (response.ok()) {
      const body = (await response.json()) as {
        results?: Array<{ pulp_href?: string; repository_version?: string }>;
      };
      const publication = body.results?.[0];
      if (publication?.pulp_href) {
        return publication;
      }
    }
    await page.waitForTimeout(250);
  }
  throw new Error("No publication appeared for the repository in time");
}
