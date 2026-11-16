/**
 * Capture the screenshots used by the user guide in `docs/`.
 *
 * The script talks to a live Pulp instance and to the Tangerine dev server, so
 * every image is a real screenshot of the application rather than a mockup. It
 * seeds a small `demo-*` dataset so the walkthrough shows meaningful content,
 * then removes it again on the way out.
 *
 * Prerequisites (see `docs/README.md`):
 *   docker compose up -d
 *   npm run dev
 *
 * Usage:
 *   npm run docs:screenshots                 # capture everything
 *   npm run docs:screenshots -- --only repo  # capture shots whose name matches
 *   npm run docs:screenshots -- --list       # print shot names
 *   npm run docs:screenshots -- --keep       # keep demo data for debugging
 *
 * WebP comes straight from Chromium's DevTools Protocol, so no image tooling is
 * required.
 */

import { chromium, request, type APIRequestContext, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Buffer } from "node:buffer";
import { freezeMotion, VIEWPORT } from "./screenshots/capture";
import { shots } from "./screenshots/shots";
import type { CliOptions, DemoState } from "./screenshots/types";
import { resetDemoData, seedDemoData } from "./screenshots/seed";
import { sleep } from "./screenshots/sleep";
import type { Capture } from "./screenshots/types";

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173",
    apiURL: process.env.PULP_API_URL ?? "http://localhost:8080",
    username: process.env.PULP_USERNAME ?? "admin",
    password: process.env.PULP_PASSWORD ?? "admin",
    outDir: path.resolve("docs/images"),
    only: null,
    keep: false,
    list: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--base-url":
        options.baseURL = argv[++index] ?? options.baseURL;
        break;
      case "--api-url":
        options.apiURL = argv[++index] ?? options.apiURL;
        break;
      case "--user":
        options.username = argv[++index] ?? options.username;
        break;
      case "--password":
        options.password = argv[++index] ?? options.password;
        break;
      case "--out":
        options.outDir = path.resolve(argv[++index] ?? options.outDir);
        break;
      case "--only":
        options.only = argv[++index] ?? null;
        break;
      case "--keep":
        options.keep = true;
        break;
      case "--list":
        options.list = true;
        break;
      case "--help":
        console.log(
          [
            "Capture user-guide screenshots from a running Tangerine + Pulp pair.",
            "",
            "  --base-url <url>   Tangerine base URL (default http://127.0.0.1:5173)",
            "  --api-url <url>    Pulp base URL (default http://localhost:8080)",
            "  --user <name>      Pulp superuser (default admin)",
            "  --password <pass>  Pulp password (default admin)",
            "  --out <dir>        Output directory (default docs/images)",
            "  --only <text>      Only capture shots whose name contains <text>",
            "  --keep             Keep the seeded demo data after the run",
            "  --list             List shot names and exit",
          ].join("\n"),
        );
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

/** Thin wrapper around the Pulp REST API using basic auth for seeding. */
export class PulpApi {
  constructor(private readonly request: APIRequestContext) {}

  static async create(apiURL: string, username: string, password: string): Promise<PulpApi> {
    const context = await request.newContext({
      baseURL: apiURL,
      httpCredentials: { username, password },
      extraHTTPHeaders: { Accept: "application/json" },
    });
    return new PulpApi(context);
  }

  async get<T>(pathOrHref: string): Promise<T> {
    const response = await this.request.get(pathOrHref);
    if (!response.ok()) {
      throw new Error(`GET ${pathOrHref} failed: ${response.status()} ${await response.text()}`);
    }
    return (await response.json()) as T;
  }

  async post<T>(pathOrHref: string, data?: unknown): Promise<T> {
    const response = await this.request.post(pathOrHref, { data: data ?? {} });
    if (!response.ok()) {
      throw new Error(`POST ${pathOrHref} failed: ${response.status()} ${await response.text()}`);
    }
    return (await response.json()) as T;
  }

  async patch<T>(pathOrHref: string, data: unknown): Promise<T> {
    const response = await this.request.patch(pathOrHref, { data });
    if (!response.ok()) {
      throw new Error(`PATCH ${pathOrHref} failed: ${response.status()} ${await response.text()}`);
    }
    return (await response.json()) as T;
  }

  async uploadFile(relativePath: string, contents: string): Promise<string> {
    const response = await this.request.post("/pulp/api/v3/content/file/files/", {
      multipart: {
        relative_path: relativePath,
        file: {
          name: path.basename(relativePath),
          mimeType: "text/plain",
          buffer: Buffer.from(contents),
        },
      },
    });
    if (!response.ok()) {
      throw new Error(`Upload failed: ${response.status()} ${await response.text()}`);
    }
    const body = (await response.json()) as { task?: string; pulp_href?: string };
    if (body.task) {
      const task = await this.waitForTask(body.task);
      const href = task.created_resources?.[0];
      if (!href) {
        throw new Error("Upload task did not report a created content unit");
      }
      return href;
    }
    if (!body.pulp_href) {
      throw new Error("Upload response did not include a content unit href");
    }
    return body.pulp_href;
  }

  /** Wait for a Pulp task to finish and return its terminal state. */
  async waitForTask(href: string): Promise<{ state: string; created_resources?: string[] }> {
    for (let attempt = 0; attempt < 240; attempt += 1) {
      const task = await this.get<{ state: string; created_resources?: string[] }>(href);
      if (task.state === "completed") {
        return task;
      }
      if (task.state === "failed" || task.state === "canceled") {
        throw new Error(`Task ${href} ended in state ${task.state}`);
      }
      await sleep(250);
    }
    throw new Error(`Task ${href} did not finish in time`);
  }

  async delete(href: string): Promise<void> {
    const response = await this.request.delete(href);
    if (response.ok() || response.status() === 404) {
      return;
    }
    const body = (await response.text()).slice(0, 200);
    throw new Error(`DELETE ${href} failed: ${response.status()} ${body}`);
  }

  async deleteAndWait(href: string): Promise<void> {
    const response = await this.request.delete(href);
    if (!response.ok()) {
      if (response.status() === 404) {
        return;
      }
      throw new Error(`DELETE ${href} failed: ${response.status()} ${await response.text()}`);
    }
    if (response.status() === 202) {
      const body = (await response.json()) as { task?: string };
      if (body.task) {
        await this.waitForTask(body.task);
      }
    }
  }

  async list<T>(pathname: string): Promise<T[]> {
    const results: T[] = [];
    let next: string | null = pathname;
    while (next) {
      const page: { results: T[]; next: string | null } = await this.get(next);
      results.push(...page.results);
      next = page.next;
    }
    return results;
  }

  async close(): Promise<void> {
    await this.request.dispose();
  }
}

/**
 * Remove every resource the script owns. Runs before seeding as well, so a
 * previous crashed run never blocks a new one.
 */
async function login(
  page: Page,
  baseURL: string,
  username: string,
  password: string,
): Promise<void> {
  await page.goto(`${baseURL}/ui/`);
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("heading", { name: "Dashboard" }).waitFor({ timeout: 30_000 });
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.list) {
    for (const shot of shots) {
      console.log(shot.name);
    }
    return;
  }

  await mkdir(options.outDir, { recursive: true });

  const api = await PulpApi.create(options.apiURL, options.username, options.password);
  const selected = options.only
    ? shots.filter((shot) => shot.name.includes(options.only ?? ""))
    : shots;

  if (selected.length === 0) {
    throw new Error(`No shots match "${options.only}". Run with --list to see names.`);
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    colorScheme: "light",
    baseURL: options.baseURL,
  });

  // Pin the light theme and the expanded sidebar before the app boots.
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("tangerine.theme", "light");
      window.localStorage.setItem("tangerine.nav.collapsed", "false");
    } catch {
      // Storage can be unavailable; the colorScheme option still forces light.
    }
  });

  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const captureContext: Capture = { page, cdp, outDir: options.outDir };
  let state: DemoState | null = null;

  try {
    await resetDemoData(api);

    const needsSeed = selected.some((shot) => shot.name !== "login");
    if (needsSeed) {
      // Login first so the seeded data is created while the UI session is live.
      await page.goto(`${options.baseURL}/ui/login`);
      await freezeMotion(page);
      await page.waitForTimeout(300);
    }

    if (selected.some((shot) => shot.name === "login")) {
      await shots
        .find((shot) => shot.name === "login")!
        .run({
          page,
          baseURL: options.baseURL,
          api,
          state: {} as DemoState,
          capture: captureContext,
        });
    }

    if (needsSeed) {
      await login(page, options.baseURL, options.username, options.password);
      state = await seedDemoData(api);
    }

    console.log(`Capturing ${selected.length} screenshots into ${options.outDir}`);
    for (const shot of selected) {
      if (shot.name === "login") {
        continue;
      }
      if (!state) {
        throw new Error(`Shot "${shot.name}" needs seeded data`);
      }
      console.log(`${shot.name}`);
      await shot.run({
        page,
        baseURL: options.baseURL,
        api,
        state,
        capture: captureContext,
      });
    }

    console.log("Screenshots captured.");
  } finally {
    if (!options.keep) {
      await resetDemoData(api).catch((error: unknown) => {
        console.error("Cleanup failed:", error);
      });
    }
    await api.close();
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
