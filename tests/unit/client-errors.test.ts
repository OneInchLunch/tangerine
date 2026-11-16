import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, apiRequest, extractErrorPayload, toApiError } from "../../src/api/client";
import { normalizeConfig, setConfig } from "../../src/lib/config";

setConfig(normalizeConfig({}));

test("extractErrorPayload reads detail and field errors", () => {
  assert.deepEqual(
    extractErrorPayload({
      detail: "Invalid input.",
      name: ["This field is required."],
      retain_repo_versions: "Must be a positive integer.",
    }),
    {
      detail: "Invalid input.",
      fieldErrors: {
        name: ["This field is required."],
        retain_repo_versions: ["Must be a positive integer."],
      },
    },
  );
});

test("extractErrorPayload promotes non_field_errors to detail", () => {
  assert.deepEqual(
    extractErrorPayload({
      non_field_errors: ["Repository and publication are mutually exclusive."],
    }),
    {
      detail: "Repository and publication are mutually exclusive.",
      fieldErrors: {},
    },
  );
});

test("extractErrorPayload ignores primitive payloads", () => {
  assert.deepEqual(extractErrorPayload("plain text"), {});
  assert.deepEqual(extractErrorPayload(null), {});
  assert.deepEqual(extractErrorPayload(["array"]), {});
});

test("toApiError parses JSON bodies, correlation IDs, and field errors", async () => {
  const response = new Response(
    JSON.stringify({
      name: ["A repository with this name already exists."],
    }),
    {
      status: 400,
      statusText: "Bad Request",
      headers: {
        "content-type": "application/json",
        "Correlation-ID": "corr-123",
      },
    },
  );

  const error = await toApiError(response);
  assert.ok(error instanceof ApiError);
  assert.equal(error.status, 400);
  assert.equal(error.message, "name: A repository with this name already exists.");
  assert.equal(error.correlationId, "corr-123");
  assert.deepEqual(error.fieldErrors, {
    name: ["A repository with this name already exists."],
  });
  assert.deepEqual(error.body, {
    name: ["A repository with this name already exists."],
  });
});

test("toApiError falls back to trimmed plain text", async () => {
  const response = new Response("  upstream unavailable  ", {
    status: 503,
    statusText: "Service Unavailable",
  });

  const error = await toApiError(response);
  assert.equal(error.message, "upstream unavailable");
  assert.equal(error.correlationId, null);
  assert.equal(error.detail, undefined);
});

test("apiRequest surfaces parsed API errors and sends session headers", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ detail: "Not found." }), {
      status: 404,
      statusText: "Not Found",
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => apiRequest("/pulp/api/v3/repositories/file/file/missing/"),
      (caught: unknown) => {
        assert.ok(caught instanceof ApiError);
        assert.equal(caught.status, 404);
        assert.equal(caught.detail, "Not found.");
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, "/pulp/api/v3/repositories/file/file/missing/");
  const headers = new Headers(calls[0].init?.headers);
  assert.equal(headers.get("Accept"), "application/json");
  assert.equal(headers.get("Authorization"), "TangerineSession");
  assert.equal(calls[0].init?.credentials, "same-origin");
});
