import assert from "node:assert/strict";
import test from "node:test";
import { formatBytes, formatDuration, formatRelative, truncate } from "../../src/lib/format";

test("formatBytes scales and handles empty values", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1024), "1.0 KiB");
  assert.equal(formatBytes(1536), "1.5 KiB");
  assert.equal(formatBytes(null), "—");
});

test("formatDuration formats seconds, minutes, and hours", () => {
  assert.equal(formatDuration(null, null), "—");
  assert.equal(formatDuration("2024-01-01T00:00:00Z", "2024-01-01T00:00:30Z"), "30s");
  assert.equal(formatDuration("2024-01-01T00:00:00Z", "2024-01-01T00:02:05Z"), "2m 5s");
  assert.equal(formatDuration("2024-01-01T00:00:00Z", "2024-01-01T02:03:00Z"), "2h 3m");
});

test("formatDuration rejects inverted ranges", () => {
  assert.equal(formatDuration("2024-01-02T00:00:00Z", "2024-01-01T00:00:00Z"), "—");
});

test("formatRelative and truncate handle empty and long values", () => {
  assert.equal(formatRelative(null), "—");
  assert.equal(truncate("short", 10), "short");
  assert.equal(truncate("abcdefghij", 5), "abcd…");
});
