import assert from "node:assert/strict";
import test from "node:test";
import { queryKeys } from "../../src/lib/query-keys";

function startsWith(key: readonly unknown[], prefix: readonly unknown[]): boolean {
  return prefix.every((part, index) => key[index] === part);
}

test("repository version invalidation is a prefix of paginated keys", () => {
  const href = "/pulp/api/v3/repositories/file/file/abc/";
  const pageKey = queryKeys.repositoryVersions(href, {
    limit: 25,
    offset: 0,
  });
  const prefix = queryKeys.repositoryVersions(href);
  assert.equal(prefix.length, 2);
  assert.equal(startsWith(pageKey, prefix), true);
});

test("api list invalidation prefixes cover paginated queries", () => {
  const key = queryKeys.apiList.resource("publications", { limit: 25 });
  assert.equal(startsWith(key, queryKeys.apiList.endpoint("publications")), true);
  assert.equal(startsWith(key, queryKeys.apiList.all), true);

  const allKey = queryKeys.apiList.allResults("publications", { repository: "abc" });
  assert.equal(startsWith(allKey, queryKeys.apiList.endpoint("publications")), true);
});
