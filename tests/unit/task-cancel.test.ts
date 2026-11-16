import assert from "node:assert/strict";
import test from "node:test";
import { cancelTask } from "../../src/api/resources";
import { normalizeConfig, setConfig } from "../../src/lib/config";

setConfig(normalizeConfig({}));

test("cancelTask PATCHes the task with the canceled state", async () => {
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  globalThis.document = { cookie: "csrftoken=test-token" } as Document;
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return new Response(
      JSON.stringify({ pulp_href: "/pulp/api/v3/tasks/abc/", state: "canceling" }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const task = await cancelTask("/pulp/api/v3/tasks/abc/");
    assert.equal(task.state, "canceling");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.document = originalDocument;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, "/pulp/api/v3/tasks/abc/");
  assert.equal(calls[0].init?.method, "PATCH");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { state: "canceled" });
});
