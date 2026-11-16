import assert from "node:assert/strict";
import test from "node:test";
import { entityIcons } from "../../src/lib/icons";
import { navigation } from "../../src/lib/navigation";

const icons = Object.values(entityIcons);

test("entity icons are distinct", () => {
  assert.equal(new Set(icons).size, icons.length);
});

test("navigation uses the shared entity icons without repeating one", () => {
  const navIcons = navigation.flatMap((section) => section.items.map((item) => item.icon));
  assert.equal(new Set(navIcons).size, navIcons.length);
  for (const icon of navIcons) {
    assert.equal(icons.includes(icon), true);
  }
});
