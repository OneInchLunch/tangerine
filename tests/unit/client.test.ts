import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, apiUrl } from "../../src/api/client";
import { normalizeConfig, setConfig } from "../../src/lib/config";

setConfig(normalizeConfig({}));

test("apiUrl normalizes absolute and relative Pulp hrefs", () => {
  assert.equal(
    apiUrl("https://pulp.example.com/pulp/api/v3/repositories/file/file/abc/?x=1"),
    "/pulp/api/v3/repositories/file/file/abc/?x=1",
  );
  assert.equal(apiUrl("/pulp/api/v3/status/"), "/pulp/api/v3/status/");
  assert.equal(apiUrl("status/"), "/pulp/api/v3/status/");
  assert.equal(apiUrl("/"), "/pulp/api/v3/");
});

test("ApiError exposes status-based convenience getters", () => {
  const error = new ApiError("Unauthorized", { status: 401 });
  assert.equal(error.isUnauthorized, true);
  assert.equal(error.name, "ApiError");
});
