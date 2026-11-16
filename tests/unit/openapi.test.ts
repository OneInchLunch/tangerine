import assert from "node:assert/strict";
import test from "node:test";
import {
  exampleFromSchema,
  pathParameterNames,
  requestBodyExample,
  type OpenApiDocument,
} from "../../src/features/api-admin/openapi";

const document: OpenApiDocument = {
  openapi: "3.0.3",
  paths: {
    "/repositories/{id}/": {
      get: { operationId: "read" },
      parameters: [{ name: "id", in: "path", required: true }],
    },
  },
  components: {
    schemas: {
      Repository: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          retain_repo_versions: { type: "integer" },
          autopublish: { type: "boolean" },
        },
      },
    },
  },
};

test("pathParameterNames extracts placeholders", () => {
  assert.deepEqual(pathParameterNames("/tasks/{id}/children/{child}/"), ["id", "child"]);
});

test("exampleFromSchema resolves refs and required fields", () => {
  const example = exampleFromSchema(document, {
    $ref: "#/components/schemas/Repository",
  });
  assert.deepEqual(example, {
    name: "",
    retain_repo_versions: 0,
    autopublish: false,
  });
});

test("requestBodyExample serializes a generated body", () => {
  const body = requestBodyExample(document, {
    requestBody: {
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/Repository" },
        },
      },
    },
  });
  assert.equal(body, '{\n  "name": "",\n  "retain_repo_versions": 0,\n  "autopublish": false\n}');
});
