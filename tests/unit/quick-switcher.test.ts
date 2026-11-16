import assert from "node:assert/strict";
import test from "node:test";
import {
  flattenSections,
  pageCommands,
  QUICK_SWITCHER_GROUPS,
  taskSubtitle,
} from "../../src/lib/quick-switcher";
import type { NavSection } from "../../src/lib/navigation";
import { entityIcons } from "../../src/lib/icons";

const sections: NavSection[] = [
  {
    label: "Content",
    items: [
      { label: "Repositories", to: "/repositories", icon: entityIcons.repositories },
      { label: "Content", to: "/content", icon: entityIcons.content },
    ],
  },
  {
    label: "Administration",
    items: [{ label: "Users", to: "/users", icon: entityIcons.users, adminOnly: true }],
  },
];

test("pageCommands filters pages by label and keeps section subtitles", () => {
  const all = pageCommands(sections, "");
  assert.deepEqual(
    all.map((item) => item.title),
    ["Repositories", "Content", "Users"],
  );
  assert.equal(all[0]?.subtitle, "Content");

  const filtered = pageCommands(sections, "repo");
  assert.deepEqual(
    filtered.map((item) => item.title),
    ["Repositories"],
  );
  assert.equal(filtered[0]?.to, "/repositories");
});

test("flattenSections follows the fixed group order and caps results", () => {
  const items = flattenSections(
    [
      { group: "Tasks", items: [{ id: "t", group: "Tasks", title: "Task", to: "/tasks/x" }] },
      {
        group: "Repositories",
        items: [{ id: "r", group: "Repositories", title: "Repo", to: "/repositories" }],
      },
      {
        group: "Pages",
        items: [{ id: "p", group: "Pages", title: "Page", to: "/" }],
      },
    ],
    2,
  );
  assert.deepEqual(
    items.map((item) => item.group),
    ["Pages", "Repositories"],
  );
  assert.deepEqual(QUICK_SWITCHER_GROUPS.slice(0, 3), ["Pages", "Repositories", "Remotes"]);
});

test("taskSubtitle keeps the raw task name and state", () => {
  assert.equal(
    taskSubtitle("pulpcore.app.tasks.sync", "running"),
    "pulpcore.app.tasks.sync · running",
  );
  assert.equal(taskSubtitle("name", undefined), "name");
});
