import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("API admin can execute a GET request", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "API admin", exact: true }).click();
  await expect(page.getByRole("heading", { name: "API admin" })).toBeVisible();
  // Pulp's live schema is several megabytes; over a tunnel or a cold cache the
  // render can take longer than the default expect budget.
  await expect(page.getByText("Endpoints", { exact: true })).toBeVisible({ timeout: 30_000 });

  await page.getByLabel("Filter API endpoints").fill("status");
  await page.getByRole("button").filter({ hasText: "/status/" }).first().click();
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator("pre")).toContainText("versions", { timeout: 15_000 });
});
