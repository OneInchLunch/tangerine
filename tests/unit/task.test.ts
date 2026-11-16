import assert from "node:assert/strict";
import test from "node:test";
import { friendlyTaskName } from "../../src/lib/task-name";
import {
  TASK_STATE_FILTERS,
  isTerminalTask,
  taskStateLabel,
  taskStateTone,
} from "../../src/lib/task-state";

test("friendlyTaskName uses exact and suffix mappings", () => {
  assert.equal(
    friendlyTaskName("pulpcore.app.tasks.orphan.orphan_cleanup"),
    "Clean up orphaned content",
  );
  assert.equal(
    friendlyTaskName("pulp_rpm.app.tasks.synchronizing.synchronize"),
    "Sync repository (RPM)",
  );
  assert.equal(
    friendlyTaskName("pulp_file.app.tasks.publishing.publish"),
    "Publish repository (File)",
  );
  assert.equal(friendlyTaskName(undefined), "Unknown task");
});

test("task state metadata drives labels, tones, and terminal checks", () => {
  assert.equal(taskStateLabel("running"), "Running");
  assert.equal(taskStateTone("failed"), "danger");
  assert.equal(isTerminalTask("completed"), true);
  assert.equal(isTerminalTask("canceling"), false);
  assert.equal(isTerminalTask("unknown"), false);
  assert.equal(TASK_STATE_FILTERS[0].value, "");
  assert.ok(TASK_STATE_FILTERS.some((item) => item.value === "skipped"));
});
