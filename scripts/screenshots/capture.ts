import type { Locator, Page } from "@playwright/test";
import { Buffer } from "node:buffer";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { Capture } from "./types";

export const VIEWPORT = { width: 1600, height: 1000 } as const;

export async function freezeMotion(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `*, *::before, *::after {
      animation: none !important;
      transition: none !important;
      caret-color: transparent !important;
    }`,
  });
}

export async function settle(page: Page, selector: string): Promise<void> {
  await page.locator(selector).first().waitFor({ state: "visible", timeout: 30_000 });
  await page
    .waitForFunction(() => document.querySelectorAll(".animate-pulse").length === 0, undefined, {
      timeout: 20_000,
    })
    .catch(() => undefined);
  await page
    .waitForFunction(() => !document.body.textContent?.includes("Loading roles"), undefined, {
      timeout: 10_000,
    })
    .catch(() => undefined);
  await page.waitForTimeout(400);
}

export async function go(
  page: Page,
  baseURL: string,
  pathname: string,
  selector: string,
): Promise<void> {
  await page.goto(`${baseURL}${pathname}`);
  await freezeMotion(page);
  await settle(page, selector);
}

export async function closeOverlays(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if ((await page.locator('[role="dialog"]').count()) === 0) {
      break;
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }
}

export async function chooseCombobox(
  page: Page | Locator,
  label: string,
  optionLabel: string,
  search?: string,
): Promise<void> {
  await page.getByLabel(label, { exact: true }).click();
  const panel = page.getByRole("dialog", { name: label });
  await panel.waitFor();
  if (search) {
    await panel.getByRole("combobox").fill(search);
  }
  await panel.getByRole("option", { name: optionLabel, exact: false }).first().click();
  await panel.waitFor({ state: "hidden" });
}

export async function capture(
  captureContext: Capture,
  name: string,
  options: { fullPage?: boolean } = {},
): Promise<void> {
  const { cdp, outDir } = captureContext;
  const params: Record<string, unknown> = { format: "webp", quality: 88 };

  if (options.fullPage) {
    const metrics = (await cdp.send("Page.getLayoutMetrics")) as {
      cssContentSize: { width: number; height: number };
    };
    const height = Math.min(Math.ceil(metrics.cssContentSize.height), 2000);
    params.captureBeyondViewport = true;
    params.clip = { x: 0, y: 0, width: VIEWPORT.width, height, scale: 1 };
  }

  const { data } = (await cdp.send("Page.captureScreenshot", params)) as { data: string };
  const file = path.join(outDir, `${name}.webp`);
  await writeFile(file, Buffer.from(data, "base64"));
  console.log(`  ${name}.webp`);
}
