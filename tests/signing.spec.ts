import { expect, test } from "@playwright/test";
import { login, uniqueName } from "./helpers";

const SIGNING_SERVICE = {
  pulp_href: "/pulp/api/v3/signing-services/00000000-0000-0000-0000-000000000001/",
  name: "rpm-signing-service",
  script: "/var/lib/pulp/scripts/rpm_script.sh",
  pubkey_fingerprint: "0123456789ABCDEF0123456789ABCDEF01234567",
  public_key: "-----BEGIN PGP PUBLIC KEY BLOCK-----\n-----END PGP PUBLIC KEY BLOCK-----\n",
  pulp_created: "2026-01-01T00:00:00Z",
};

test("superusers can attach an RPM metadata signing service", async ({ page }) => {
  await page.route(/\/pulp\/api\/v3\/signing-services\//, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ count: 1, next: null, previous: null, results: [SIGNING_SERVICE] }),
    });
  });

  let posted: Record<string, unknown> | undefined;
  await page.route("**/pulp/api/v3/repositories/rpm/rpm/", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    posted = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        pulp_href: "/pulp/api/v3/repositories/rpm/rpm/00000000-0000-0000-0000-000000000002/",
        name: posted?.name ?? "signing-test",
      }),
    });
  });

  await login(page);
  await page.getByRole("link", { name: "Repositories", exact: true }).click();
  await page.getByRole("button", { name: "Create repository" }).click();

  const dialog = page.getByRole("dialog", { name: "Create repository" });
  await dialog.getByLabel("Repository type").selectOption("rpm");

  const signingField = dialog.getByLabel("Metadata signing service");
  await expect(signingField).toBeVisible();
  await signingField.selectOption(SIGNING_SERVICE.pulp_href);
  await expect(dialog.getByText(SIGNING_SERVICE.pubkey_fingerprint)).toBeVisible();
  await expect(dialog.getByText(/Package signing is not offered/)).toBeVisible();

  await dialog.getByLabel("Name").fill(uniqueName("e2e-rpm-signing"));
  await dialog.getByRole("button", { name: "Create repository" }).click();

  await expect.poll(() => posted?.metadata_signing_service).toBe(SIGNING_SERVICE.pulp_href);
  await expect(dialog).toBeHidden();
});
