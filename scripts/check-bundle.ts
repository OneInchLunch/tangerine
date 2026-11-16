import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

/**
 * Guards the initial download and total asset weight after a production build.
 *
 * The eager set is whatever `index.html` references as a script or module
 * preload. Route chunks are intentionally excluded: they load on navigation.
 */
const DIST = "dist";
const EAGER_GZIP_BUDGET = 150 * 1024;
const TOTAL_ASSET_BUDGET = 1_200 * 1024;

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

const html = readFileSync(join(DIST, "index.html"), "utf8");
const eagerPaths = [...new Set([...html.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map((m) => m[1]))];

if (eagerPaths.length === 0) {
  console.error("build-check: index.html does not reference any JavaScript assets");
  process.exit(1);
}

const eagerGzip = eagerPaths.reduce((total, path) => {
  const file = join(DIST, path.replace(/^\/?ui\//, ""));
  return total + gzipSync(readFileSync(file)).length;
}, 0);

const assetsDir = join(DIST, "assets");
const totalAssets = readdirSync(assetsDir).reduce(
  (total, name) => total + statSync(join(assetsDir, name)).size,
  0,
);

let failed = false;
console.log(`Eager JS:    ${kb(eagerGzip)} (budget ${kb(EAGER_GZIP_BUDGET)})`);
console.log(`dist/assets: ${kb(totalAssets)} (budget ${kb(TOTAL_ASSET_BUDGET)})`);

if (eagerGzip > EAGER_GZIP_BUDGET) {
  console.error("build-check: eager JavaScript exceeds the gzip budget");
  failed = true;
}
if (totalAssets > TOTAL_ASSET_BUDGET) {
  console.error("build-check: dist/assets exceeds the total size budget");
  failed = true;
}

if (failed) {
  process.exit(1);
}
