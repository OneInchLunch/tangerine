import assert from "node:assert/strict";
import test from "node:test";
import {
  cvssV3BaseScore,
  normalizeSeverity,
  reportHrefKey,
  severityFromVulnerability,
  summarizeVulnerabilities,
} from "../../src/lib/vulnerabilities";

test("cvssV3BaseScore scores common vectors", () => {
  assert.equal(cvssV3BaseScore("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"), 9.8);
  assert.equal(cvssV3BaseScore("CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H"), 8.1);
  assert.equal(cvssV3BaseScore("CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H"), 7.8);
  assert.equal(cvssV3BaseScore("CVSS:3.1/AV:L/AC:H/PR:L/UI:N/S:U/C:N/I:N/A:H"), 4.7);
  assert.equal(cvssV3BaseScore("CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:H/I:H/A:H"), 9.6);
  assert.equal(cvssV3BaseScore("CVSS:2.0/AV:N"), null);
  assert.equal(cvssV3BaseScore("not a vector"), null);
});

test("normalizeSeverity maps vendor labels", () => {
  assert.equal(normalizeSeverity("Critical"), "critical");
  assert.equal(normalizeSeverity("Important"), "high");
  assert.equal(normalizeSeverity("Moderate"), "medium");
  assert.equal(normalizeSeverity("Low"), "low");
  assert.equal(normalizeSeverity("Negligible"), "low");
  assert.equal(normalizeSeverity("none"), null);
});

test("severityFromVulnerability prefers labels, then summary, then CVSS", () => {
  assert.equal(
    severityFromVulnerability({ database_specific: { severity: "critical" } }),
    "critical",
  );
  assert.equal(severityFromVulnerability({ summary: "Important: nginx security update" }), "high");
  assert.equal(severityFromVulnerability({ summary: "Moderate: nginx security update" }), "medium");
  assert.equal(
    severityFromVulnerability({
      summary: "nginx security update",
      severity: [{ type: "CVSS_V3", score: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" }],
    }),
    "critical",
  );
  assert.equal(severityFromVulnerability({ summary: "no severity" }), "unknown");
});

test("summarizeVulnerabilities dedupes advisories and counts CVEs", () => {
  const summary = summarizeVulnerabilities([
    {
      id: "RLSA-2026:1",
      upstream: ["CVE-2026-0001", "CVE-2026-0002"],
      summary: "Critical: nginx security update",
      affected: [{ ranges: [{ events: [{ introduced: "0" }, { fixed: "1:1.26.3-1" }] }] }],
    },
    {
      id: "RLSA-2026:2",
      upstream: ["CVE-2026-0001"],
      summary: "Moderate: nginx:1.24 security update",
      affected: [{ ranges: [{ events: [{ fixed: "1:1.24.0-2" }] }] }],
    },
    {
      id: "RLSA-2026:1",
      summary: "duplicate",
    },
    {
      id: "RLSA-2026:3",
      summary: "Low: nginx documentation",
    },
  ]);

  assert.equal(summary.total, 3);
  assert.equal(summary.bySeverity.critical, 1);
  assert.equal(summary.bySeverity.medium, 1);
  assert.equal(summary.bySeverity.low, 1);
  assert.equal(summary.highest, "critical");
  assert.equal(summary.cveCount, 2);
  assert.deepEqual(summary.cveIds.sort(), ["CVE-2026-0001", "CVE-2026-0002"]);
  assert.deepEqual(summary.entries[0].fixedVersions, ["1:1.26.3-1"]);
  assert.equal(summary.entries[0].url, "https://osv.dev/vulnerability/RLSA-2026%3A1");
});

test("summarizeVulnerabilities tolerates empty or malformed payloads", () => {
  assert.equal(summarizeVulnerabilities(null).total, 0);
  assert.equal(summarizeVulnerabilities({}).total, 0);
  const summary = summarizeVulnerabilities([{ summary: "missing id" }]);
  assert.equal(summary.total, 0);
  assert.equal(summary.highest, null);
});

test("reportHrefKey normalizes absolute and relative report links", () => {
  assert.equal(
    reportHrefKey("http://localhost:8080/pulp/api/v3/vuln_report/abc/"),
    "/pulp/api/v3/vuln_report/abc",
  );
  assert.equal(reportHrefKey("/pulp/api/v3/vuln_report/abc/"), "/pulp/api/v3/vuln_report/abc");
});
