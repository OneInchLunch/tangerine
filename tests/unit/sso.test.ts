import assert from "node:assert/strict";
import test from "node:test";
import {
  gatewayPath,
  isSsoManagedUser,
  safeRedirectPath,
  ssoErrorMessage,
  ssoStartUrl,
} from "../../src/lib/sso";
import { normalizeConfig } from "../../src/lib/config";

test("safeRedirectPath only accepts paths inside the UI base path", () => {
  assert.equal(safeRedirectPath("/ui/repositories", "/ui/"), "/ui/repositories");
  assert.equal(
    safeRedirectPath("/ui/repositories?q=file#top", "/ui/"),
    "/ui/repositories?q=file#top",
  );
  assert.equal(safeRedirectPath("/ui", "/ui/"), "/ui/");
  assert.equal(safeRedirectPath("/ui/", "/ui/"), "/ui/");
});

test("safeRedirectPath rejects off-origin and escaping destinations", () => {
  assert.equal(safeRedirectPath("//evil.example/ui/", "/ui/"), null);
  assert.equal(safeRedirectPath("/\\evil.example", "/ui/"), null);
  assert.equal(safeRedirectPath("https://evil.example/ui/", "/ui/"), null);
  assert.equal(safeRedirectPath("/uix/repositories", "/ui/"), null);
  assert.equal(safeRedirectPath("/pulp/api/v3/", "/ui/"), null);
  assert.equal(safeRedirectPath("/ui/../pulp/api/v3/", "/ui/"), null);
  // The URL parser resolves encoded dot segments before the prefix check.
  assert.equal(safeRedirectPath("/ui/%2e%2e/pulp/api/v3/", "/ui/"), null);
  assert.equal(safeRedirectPath("", "/ui/"), null);
  assert.equal(safeRedirectPath(null, "/ui/"), null);
  assert.equal(safeRedirectPath(42, "/ui/"), null);
});

test("gatewayPath joins the configured base path", () => {
  const config = normalizeConfig({ gatewayBasePath: "/sso/" });
  assert.equal(gatewayPath(config, "providers"), "/sso/providers");
  assert.equal(gatewayPath(config, "/admin/csrf"), "/sso/admin/csrf");
  assert.equal(gatewayPath(normalizeConfig({ gatewayBasePath: "sso" }), "session"), "/sso/session");
});

test("ssoStartUrl carries the provider and a validated destination", () => {
  const config = normalizeConfig({ gatewayBasePath: "/sso/" });
  assert.equal(
    ssoStartUrl(config, "microsoft", "/ui/repositories?q=file"),
    "/sso/start?provider=microsoft&next=%2Fui%2Frepositories%3Fq%3Dfile",
  );
  // An off-origin destination is replaced by the UI root, never forwarded.
  assert.equal(
    ssoStartUrl(config, "microsoft", "//evil.example/ui/"),
    "/sso/start?provider=microsoft&next=%2Fui%2F",
  );
  // Starting from the login screen must not loop back to it.
  assert.equal(
    ssoStartUrl(config, "microsoft", "/ui/login?sso_error=access_denied"),
    "/sso/start?provider=microsoft&next=%2Fui%2F",
  );
});

test("ssoErrorMessage maps provider and gateway error codes", () => {
  assert.equal(
    ssoErrorMessage("?sso_error=access_denied"),
    "Sign-in was cancelled at your identity provider.",
  );
  assert.match(ssoErrorMessage("?sso_error=state_mismatch") ?? "", /did not match this browser/);
  assert.match(ssoErrorMessage("?sso_error=unknown_provider") ?? "", /not configured/);
  assert.match(
    ssoErrorMessage("?sso_error=username_collision") ?? "",
    /conflicts with an existing/,
  );
  assert.match(ssoErrorMessage("?sso_error=email_unverified") ?? "", /did not verify your email/);
  assert.match(ssoErrorMessage("?error=invalid_scope") ?? "", /requested scopes/);
  assert.match(ssoErrorMessage("?message=Boom") ?? "", /Single sign-on failed: Boom/);
  assert.equal(ssoErrorMessage("?sso_error=unknown_code"), "Single sign-on failed (unknown_code).");
  assert.equal(ssoErrorMessage("?unrelated=1"), null);
  assert.equal(ssoErrorMessage(""), null);
});

test("isSsoManagedUser matches the configured marker group", () => {
  const user = { groups: [{ name: "sso-managed" }, { name: "developers" }] };
  assert.equal(isSsoManagedUser(user, "sso-managed"), true);
  assert.equal(isSsoManagedUser(user, "other-group"), false);
  assert.equal(isSsoManagedUser(user, null), false);
  assert.equal(isSsoManagedUser({ groups: [] }, "sso-managed"), false);
  assert.equal(isSsoManagedUser(null, "sso-managed"), false);
});
