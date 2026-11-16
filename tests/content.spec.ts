import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("content types open in a side drawer", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.getByRole("link", { name: "Content", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Content", exact: true })).toBeVisible();

  await page.getByLabel("Filter content types").fill("file");
  const filePlugin = page.getByRole("button", { name: /^File\b/ });
  await expect(filePlugin).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: /^Files/ }).click();

  const drawer = page.getByRole("dialog", { name: "File Files content" });
  await expect(drawer).toBeVisible();
  await expect(page.getByRole("heading", { name: "File · Files" })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("plugin")).toBe("file");
  expect(new URL(page.url()).searchParams.get("type")).toBe("files");
  await expect(page.getByLabel("Filter content types")).toBeVisible();

  await page.reload();
  await expect(drawer).toBeVisible();
  await expect(page.getByRole("button", { name: /^File\b/ })).toHaveAttribute(
    "aria-expanded",
    "true",
  );

  await drawer.getByRole("button", { name: "Close content pane" }).click();
  await expect(drawer).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("plugin")).toBeNull();
  expect(new URL(page.url()).searchParams.get("type")).toBeNull();

  await page.getByRole("button", { name: /^Files/ }).click();
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);

  await page.getByRole("button", { name: /^Files/ }).click();
  await expect(drawer).toBeVisible();
  await page
    .getByRole("button", { name: "Dismiss content pane" })
    .click({ position: { x: 24, y: 24 } });
  await expect(drawer).toHaveCount(0);

  await page.getByLabel("Filter content types").fill("packagegroups");
  await page.getByRole("button", { name: /^Package groups/ }).click();
  await expect(page.getByRole("dialog", { name: "RPM Package groups content" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "RPM · Package groups" })).toBeVisible();

  await page.getByRole("button", { name: "Close content pane" }).click();
  await page.getByLabel("Filter content types").fill("");
  const rpmPlugin = page.getByRole("button", { name: /^RPM\b/ });
  await expect(rpmPlugin).toHaveAttribute("aria-expanded", "true");
  await rpmPlugin.click();
  await expect(rpmPlugin).toHaveAttribute("aria-expanded", "false");
});

test("API data opens inside the content drawer", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.getByRole("link", { name: "Content", exact: true }).click();
  await page.getByLabel("Filter content types").fill("file");
  await page.getByRole("button", { name: /^Files/ }).click();

  const drawer = page.getByRole("dialog", { name: "File Files content" });
  await expect(drawer).toBeVisible();

  // The close control sits at the left edge, before the pane heading.
  const closeButton = drawer.getByRole("button", { name: "Close content pane" });
  const heading = drawer.getByRole("heading", { name: "File · Files" });
  const closeBox = await closeButton.boundingBox();
  const headingBox = await heading.boundingBox();
  expect(closeBox?.x ?? Number.POSITIVE_INFINITY).toBeLessThan(headingBox?.x ?? 0);

  await drawer.getByRole("button", { name: "API data", exact: true }).click();
  const panel = drawer.getByRole("region", { name: "File Files API data" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Response body")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Close content pane" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "File Files API data" })).toHaveCount(0);

  // Escape closes the nested view first, then the drawer.
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(drawer).toBeVisible();
  await expect(heading).toBeVisible();

  await drawer.getByRole("button", { name: "API data", exact: true }).click();
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Back to content" }).click();
  await expect(panel).toHaveCount(0);
  await expect(heading).toBeVisible();

  // The close control stays available in the nested view.
  await drawer.getByRole("button", { name: "API data", exact: true }).click();
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Close content pane" }).click();
  await expect(drawer).toHaveCount(0);
});

test("server-backed content search updates while typing", async ({ page }) => {
  let lastRequest = "";
  await page.route("**/pulp/api/v3/content/file/files/**", async (route) => {
    lastRequest = route.request().url();
    await route.fulfill({
      json: {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            pulp_href: "/pulp/api/v3/content/file/files/00000000-0000-0000-0000-000000000001/",
            pulp_last_updated: "2026-11-02T10:43:44Z",
            relative_path: "alpha.txt",
            size: 12,
          },
        ],
      },
    });
  });

  await login(page);
  await page.goto("/ui/content?plugin=file&type=files");
  await expect(page.getByRole("heading", { name: "File · Files" })).toBeVisible();
  await expect(page.getByText("alpha.txt")).toBeVisible();

  lastRequest = "";
  await page.getByLabel("Search files…").fill("alpha");
  await expect.poll(() => lastRequest).toContain("relative_path__contains=alpha");
  expect(new URL(page.url()).searchParams.get("q")).toBe("alpha");
});

test("page-scoped content search filters immediately while typing", async ({ page }) => {
  await page.route("**/pulp/api/v3/content/rpm/advisories/**", async (route) => {
    await route.fulfill({
      json: {
        count: 2,
        next: null,
        previous: null,
        results: [
          {
            pulp_href: "/pulp/api/v3/content/rpm/advisories/00000000-0000-0000-0000-000000000001/",
            pulp_last_updated: "2026-11-02T10:43:44Z",
            title: "Important: nginx security update",
            id: "RLSA-2026:59362",
            severity: "Important",
            version: "2",
            type: "security",
          },
          {
            pulp_href: "/pulp/api/v3/content/rpm/advisories/00000000-0000-0000-0000-000000000002/",
            pulp_last_updated: "2026-11-02T10:43:44Z",
            title: "Moderate: postgresql security update",
            id: "RLSA-2026:59363",
            severity: "Moderate",
            version: "1",
            type: "security",
          },
        ],
      },
    });
  });

  await login(page);
  await page.goto("/ui/content?plugin=rpm&type=advisories");
  await expect(page.getByRole("heading", { name: "RPM · Advisories" })).toBeVisible();
  await expect(page.getByText("2 units")).toBeVisible();
  await expect(page.getByText("Untitled content")).toHaveCount(0);

  const filter = page.getByLabel("Filter this page…");
  await filter.fill("nginx");
  await expect(page.getByText("1 of 2 on this page")).toBeVisible();
  await expect(page.getByText("Important: nginx security update")).toBeVisible();
  await expect(page.getByText("Moderate: postgresql security update")).toHaveCount(0);

  await filter.fill("unmatched");
  await expect(page.getByRole("button", { name: "Clear search" })).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page.getByText("2 units")).toBeVisible();
});

test("the content drawer closes on a phone-sized viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto("/ui/content");
  await page.getByLabel("Filter content types").fill("file");
  await page.getByRole("button", { name: /^Files/ }).click();

  const drawer = page.getByRole("dialog", { name: "File Files content" });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: "Close content pane" }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page.getByLabel("Filter content types")).toBeVisible();

  await page.getByRole("button", { name: /^Files/ }).click();
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
});
