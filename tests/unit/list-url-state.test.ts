import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeListReturn,
  encodeListReturn,
  hasListSearchParams,
  mergeListSearch,
  nextListSort,
  parseListPage,
  parseListPageSize,
  parseListSort,
} from "../../src/lib/list-url-state";

test("parseListPage accepts numbers, strings, and invalid values", () => {
  assert.equal(parseListPage(undefined), 0);
  assert.equal(parseListPage(null), 0);
  assert.equal(parseListPage(2), 2);
  assert.equal(parseListPage("3"), 3);
  assert.equal(parseListPage(-4), 0);
  assert.equal(parseListPage(2.9), 2);
  assert.equal(parseListPage("not-a-number"), 0);
});

test("mergeListSearch keeps unrelated params and removes cleared ones", () => {
  assert.deepEqual(
    mergeListSearch({ page: 1, q: "file", filter: "abc" }, { page: undefined, q: "" }),
    { filter: "abc" },
  );
  assert.deepEqual(mergeListSearch({}, { page: 2 }), { page: 2 });
  assert.deepEqual(mergeListSearch({ filter: "abc" }, { filter: "" }), {});
});

test("hasListSearchParams detects only list view params", () => {
  assert.equal(hasListSearchParams({ page: 1 }), true);
  assert.equal(hasListSearchParams({ q: "file" }), true);
  assert.equal(hasListSearchParams({ filter: "abc" }), true);
  assert.equal(hasListSearchParams({ href: "/pulp/api/v3/" }), false);
  assert.equal(hasListSearchParams({}), false);
});

test("parseListPageSize only accepts offered sizes", () => {
  assert.equal(parseListPageSize(undefined), 25);
  assert.equal(parseListPageSize("50"), 50);
  assert.equal(parseListPageSize(100), 100);
  assert.equal(parseListPageSize("13"), 25);
  assert.equal(parseListPageSize("abc"), 25);
  assert.equal(parseListPageSize(null, 50), 50);
});

test("parseListSort accepts Pulp ordering tokens and drops junk", () => {
  assert.equal(parseListSort("name"), "name");
  assert.equal(parseListSort("-pulp_last_updated"), "-pulp_last_updated");
  assert.equal(parseListSort(" name "), "name");
  assert.equal(parseListSort("na me"), "");
  assert.equal(parseListSort(undefined), "");
  assert.equal(parseListSort(3), "");
});

test("nextListSort cycles ascending, descending, then clearing", () => {
  assert.equal(nextListSort("", "name"), "name");
  assert.equal(nextListSort("name", "name"), "-name");
  assert.equal(nextListSort("-name", "name"), "");
  assert.equal(nextListSort("-other", "name"), "name");
});

test("list return links carry page size and sort", () => {
  const encoded = encodeListReturn({ q: "file", page: 2, per: 50, sort: "-name" });
  assert.equal(encoded, "q=file&page=2&per=50&sort=-name");
  assert.deepEqual(decodeListReturn(encoded), {
    q: "file",
    page: "2",
    per: "50",
    sort: "-name",
  });
  assert.equal(hasListSearchParams({ per: 50 }), true);
  assert.equal(hasListSearchParams({ sort: "name" }), true);
});
