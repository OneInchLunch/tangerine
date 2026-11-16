import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRepositoryContentQuery,
  MAX_CONTENT_REPOSITORY_FILTERS,
  parseRepositoryHrefs,
  serializeRepositoryHrefs,
} from "../../src/lib/content-repositories";

const repo = (id: string) => `/pulp/api/v3/repositories/file/file/${id}/`;

test("parses, trims, dedupes, and caps repository hrefs", () => {
  assert.deepEqual(parseRepositoryHrefs(undefined), []);
  assert.deepEqual(parseRepositoryHrefs(""), []);
  assert.deepEqual(parseRepositoryHrefs(`${repo("a")}, ${repo("b")},${repo("a")}`), [
    repo("a"),
    repo("b"),
  ]);

  const many = Array.from({ length: 10 }, (_, index) => repo(String(index)));
  assert.equal(parseRepositoryHrefs(many.join(",")).length, MAX_CONTENT_REPOSITORY_FILTERS);
});

test("serializes only a meaningful selection", () => {
  assert.equal(serializeRepositoryHrefs([]), undefined);
  assert.equal(serializeRepositoryHrefs(["", ""]), undefined);
  assert.equal(
    serializeRepositoryHrefs([repo("a"), repo("a"), repo("b")]),
    `${repo("a")},${repo("b")}`,
  );
});

test("builds a typed filter for one repository", () => {
  assert.deepEqual(buildRepositoryContentQuery([]), {});
  assert.deepEqual(buildRepositoryContentQuery([repo("a")]), {
    repository_version: repo("a"),
  });
});

test("builds an expression filter for several repositories", () => {
  assert.deepEqual(buildRepositoryContentQuery([repo("a"), repo("b")]), {
    q: `repository_version="${repo("a")}" OR repository_version="${repo("b")}"`,
  });
});

test("caps the expression at Pulp's complexity limit", () => {
  const hrefs = Array.from({ length: 9 }, (_, index) => repo(String(index)));
  const query = buildRepositoryContentQuery(hrefs);
  assert.equal((query.q as string).split(" OR ").length, MAX_CONTENT_REPOSITORY_FILTERS);
});

test("escapes quotes in filter values", () => {
  const query = buildRepositoryContentQuery([repo("a"), `${repo("b")}"`]);
  assert.match(query.q as string, /\\"/);
});
