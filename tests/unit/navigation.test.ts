import assert from "node:assert/strict";
import test from "node:test";
import { isAdminUser, navigation, visibleNavigation } from "../../src/lib/navigation";

const labels = (admin: boolean) =>
  visibleNavigation(admin).flatMap((section) => section.items.map((item) => item.label));

test("staff accounts see every navigation entry", () => {
  const all = navigation.flatMap((section) => section.items.map((item) => item.label));
  assert.deepEqual(labels(true), all);
});

test("non-staff accounts lose the administration-only entries", () => {
  const visible = labels(false);
  for (const hidden of ["Users", "Groups", "Roles", "API admin"]) {
    assert.equal(visible.includes(hidden), false, hidden);
  }
  // Read-only inventories and personal settings stay available.
  for (const kept of ["Signing", "Plugins", "Dashboard", "Repositories", "Tasks"]) {
    assert.equal(visible.includes(kept), true, kept);
  }
});

test("isAdminUser accepts staff and superusers only", () => {
  assert.equal(isAdminUser(null), false);
  assert.equal(isAdminUser({}), false);
  assert.equal(isAdminUser({ is_staff: false }), false);
  assert.equal(isAdminUser({ is_staff: true }), true);
  assert.equal(isAdminUser({ is_staff: false, is_superuser: true }), true);
});

test("repository-scoped admins see scoped content but not operations or administration", () => {
  const visible = visibleNavigation(false, {
    isSuperuser: false,
    isStaff: true,
    manageSso: false,
    repositoryAdmin: true,
    tasksRead: false,
    operationsRead: false,
    importExportRead: false,
    signingRead: false,
    contentRead: true,
  }).flatMap((section) => section.items.map((item) => item.label));

  for (const kept of [
    "Dashboard",
    "Repositories",
    "Remotes",
    "Distributions",
    "Publications",
    "Content",
    "Plugins",
  ]) {
    assert.equal(visible.includes(kept), true, kept);
  }
  for (const hidden of [
    "Tasks",
    "Workers",
    "Operations",
    "Import / export",
    "Signing",
    "Users",
    "Groups",
    "Roles",
    "API admin",
  ]) {
    assert.equal(visible.includes(hidden), false, hidden);
  }
});
