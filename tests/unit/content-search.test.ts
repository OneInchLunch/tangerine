import assert from "node:assert/strict";
import test from "node:test";
import { contentSearchConfig } from "../../src/lib/content-search";

test("server search parameters mirror Pulp contains filters", () => {
  const files = contentSearchConfig("file", "files");
  assert.equal(files.parameter, "relative_path__contains");
  assert.equal(files.pageScoped, false);
  assert.equal(files.placeholder, "Search files…");

  const packages = contentSearchConfig("rpm", "packages");
  assert.equal(packages.parameter, "name__contains");
  assert.equal(packages.pageScoped, false);
});

test("content types without a contains filter use a page-scoped filter", () => {
  const advisories = contentSearchConfig("rpm", "advisories");
  assert.equal(advisories.parameter, undefined);
  assert.equal(advisories.pageScoped, true);
  assert.equal(advisories.placeholder, "Filter this page…");
});

test("unknown content types fall back to page filtering", () => {
  const custom = contentSearchConfig("custom", "widgets");
  assert.equal(custom.parameter, undefined);
  assert.equal(custom.pageScoped, true);
});
