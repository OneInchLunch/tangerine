import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDescriptorBody,
  FieldValueError,
  initialDescriptorValues,
  type FieldDescriptor,
} from "../../src/lib/field-descriptors";

const fields: FieldDescriptor[] = [
  { key: "manifest", label: "Manifest", type: "text" },
  { key: "checkpoint", label: "Checkpoint", type: "boolean" },
  {
    key: "layout",
    label: "Layout",
    type: "select",
    options: [{ value: "flat", label: "Flat" }],
  },
  { key: "excluded", label: "Excluded", type: "string-list" },
  { key: "repo_config", label: "Repo config", type: "json" },
  { key: "retries", label: "Retries", type: "number" },
];

test("initialDescriptorValues reads scalar, array, and object values", () => {
  assert.deepEqual(
    initialDescriptorValues(fields, {
      manifest: "PULP_MANIFEST",
      checkpoint: true,
      excluded: ["a", "b"],
      repo_config: { repo: { name: "x" } },
      retries: 3,
    }),
    {
      manifest: "PULP_MANIFEST",
      checkpoint: true,
      layout: "",
      excluded: "a, b",
      repo_config: '{\n  "repo": {\n    "name": "x"\n  }\n}',
      retries: "3",
    },
  );
});

test("buildDescriptorBody parses values and omits empty optional fields", () => {
  assert.deepEqual(
    buildDescriptorBody(fields, {
      manifest: "PULP_MANIFEST",
      checkpoint: true,
      layout: "flat",
      excluded: "a, b\nc",
      repo_config: '{"repo":{"name":"x"}}',
      retries: "2",
    }),
    {
      manifest: "PULP_MANIFEST",
      checkpoint: true,
      layout: "flat",
      excluded: ["a", "b", "c"],
      repo_config: { repo: { name: "x" } },
      retries: 2,
    },
  );

  assert.deepEqual(
    buildDescriptorBody(fields, {
      manifest: "",
      checkpoint: false,
      layout: "",
      excluded: "",
      repo_config: "",
      retries: "",
    }),
    { checkpoint: false },
  );
});

test("buildDescriptorBody rejects invalid numbers and JSON", () => {
  assert.throws(
    () => buildDescriptorBody(fields, { ...initialDescriptorValues(fields), retries: "nope" }),
    FieldValueError,
  );
  assert.throws(
    () => buildDescriptorBody(fields, { ...initialDescriptorValues(fields), repo_config: "{" }),
    FieldValueError,
  );
});

test("buildDescriptorBody emits explicit nulls for cleared edit fields", () => {
  const fields: FieldDescriptor[] = [
    { key: "name", label: "Name", type: "text" },
    { key: "chunk_size", label: "Chunk size", type: "number" },
    { key: "metadata", label: "Metadata", type: "json" },
  ];

  const body = buildDescriptorBody(
    fields,
    { name: "demo", chunk_size: "", metadata: "" },
    {
      clearKeys: ["chunk_size", "metadata"],
    },
  );

  assert.deepEqual(body, { name: "demo", chunk_size: null, metadata: null });
});
