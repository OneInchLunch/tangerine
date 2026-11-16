import assert from "node:assert/strict";
import test from "node:test";
import type { OpenApiDocument } from "../../src/lib/openapi-schema";
import {
  buildMultipartForm,
  multipartContentForOperation,
  multipartFieldsForSchema,
} from "../../src/lib/multipart";

const document: OpenApiDocument = {
  openapi: "3.0.0",
  paths: {},
  components: { schemas: {} },
};

const operation = {
  requestBody: {
    content: {
      "multipart/form-data": {
        schema: {
          type: "object" as const,
          required: ["relative_path", "file"],
          properties: {
            relative_path: { type: "string" },
            overwrite: { type: "boolean", default: false },
            file: { type: "string", format: "binary" },
            labels: { type: "object" },
          },
        },
      },
    },
  },
};

test("multipartFieldsForSchema classifies binary, boolean, text, and JSON fields", () => {
  const fields = multipartFieldsForSchema(
    document,
    operation.requestBody.content["multipart/form-data"].schema,
  );
  assert.deepEqual(
    fields.map((field) => ({ name: field.name, kind: field.kind })),
    [
      { name: "relative_path", kind: "text" },
      { name: "overwrite", kind: "boolean" },
      { name: "file", kind: "file" },
      { name: "labels", kind: "json" },
    ],
  );
});

test("multipartContentForOperation requires a multipart body with a binary field", () => {
  assert.equal(multipartContentForOperation(document, operation)?.hasBinary, true);
  assert.equal(
    multipartContentForOperation(document, {
      requestBody: {
        content: {
          "application/json": { schema: { type: "object" } },
        },
      },
    }),
    null,
  );
});

test("buildMultipartForm appends files, booleans, and JSON", () => {
  const content = multipartContentForOperation(document, operation);
  assert.ok(content);
  const file = new File(["hello"], "hello.txt", { type: "text/plain" });
  const form = buildMultipartForm(
    content.fields,
    { relative_path: "hello.txt", overwrite: true, labels: '{"env":"test"}' },
    { file },
  );

  assert.equal(form.get("relative_path"), "hello.txt");
  assert.equal(form.get("overwrite"), "true");
  assert.deepEqual(JSON.parse(String(form.get("labels"))), { env: "test" });
  assert.ok(form.get("file") instanceof File);
});

test("buildMultipartForm rejects missing required fields and invalid JSON", () => {
  const content = multipartContentForOperation(document, operation);
  assert.ok(content);
  assert.throws(() => buildMultipartForm(content.fields, {}, {}), /Relative Path is required/);
  assert.throws(
    () =>
      buildMultipartForm(
        content.fields,
        { relative_path: "x", labels: "{" },
        { file: new File(["x"], "x") },
      ),
    /Labels must be valid JSON/,
  );
});
