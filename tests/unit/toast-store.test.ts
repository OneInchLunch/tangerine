import assert from "node:assert/strict";
import test from "node:test";
import { dismiss, dismissAll, getToasts, subscribe, toast } from "../../src/lib/toast-store";

test("toasts queue in order and cap at three", () => {
  dismissAll();
  toast.success("One", { durationMs: 0 });
  toast.error("Two", { durationMs: 0 });
  toast.info("Three", { durationMs: 0 });
  toast.success("Four", { durationMs: 0 });

  const titles = getToasts().map((item) => item.title);
  assert.deepEqual(titles, ["Two", "Three", "Four"]);
  dismissAll();
  assert.deepEqual(getToasts(), []);
});

test("dismiss removes one toast and notifies subscribers", () => {
  dismissAll();
  let notifications = 0;
  const unsubscribe = subscribe(() => {
    notifications += 1;
  });
  const id = toast.success("Saved", { durationMs: 0 });
  assert.equal(notifications, 1);

  dismiss(id);
  assert.deepEqual(getToasts(), []);
  assert.ok(notifications >= 2);
  unsubscribe();
});

test("task actions ride along with the toast", () => {
  dismissAll();
  toast.success("Sync started", {
    durationMs: 0,
    action: { label: "View task", taskHref: "/pulp/api/v3/tasks/abc/" },
  });
  assert.equal(getToasts()[0]?.action?.taskHref, "/pulp/api/v3/tasks/abc/");
  dismissAll();
});
