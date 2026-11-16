import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const PULP_URL = (process.env.PULP_URL ?? "http://localhost:8080").replace(/\/+$/, "");
const SCHEMA_URL = `${PULP_URL}/pulp/api/v3/docs/api.json`;
const schemaPath = path.resolve("schema/pulp.json");
const typesPath = path.resolve("src/api/schema.d.ts");

async function main() {
  console.log(`Fetching OpenAPI schema from ${SCHEMA_URL}`);
  const response = await fetch(SCHEMA_URL, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Schema request failed: ${response.status} ${response.statusText}`);
  }

  const schema = await response.text();
  await mkdir(path.dirname(schemaPath), { recursive: true });
  await writeFile(schemaPath, schema, "utf8");
  console.log(`Wrote ${schemaPath}`);

  execFileSync("npx", ["--no-install", "openapi-typescript", schemaPath, "-o", typesPath], {
    stdio: "inherit",
  });
  console.log(`Wrote ${typesPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
