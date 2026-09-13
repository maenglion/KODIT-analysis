import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const artifact = JSON.parse(await readFile(new URL("reports/measurements/2026-09-13-reconstructed-evaluation/reconstructed-evaluation.json", root), "utf8"));
const manifest = JSON.parse(await readFile(new URL("reports/measurements/2026-09-13-reconstructed-evaluation/manifest.json", root), "utf8"));
const snapshot = await readFile(new URL("apps/public-site/data/review-20260913-reconstructed/regulations.csv", root), "utf8");
const legacy = await readFile(new URL("apps/public-site/data/review-20260908/regulations.csv", root), "utf8");

assert.equal(artifact.population_count, 1041);
assert.equal(artifact.evaluable_count, 1039);
assert.deepEqual(artifact.status_counts, {
  FULLTEXT_PUBLIC: 203,
  NOTICE_ONLY: 831,
  SOURCE_UNKNOWN: 5,
  REEVALUATION_PENDING: 2,
});
assert.equal(artifact.changed_count, 182);
assert.equal(manifest.identity_linkage_unresolved_count, 2);
assert.equal(manifest.safeguards.database_modified, false);
assert.equal(manifest.safeguards.filename_only_identity_used, false);
assert.equal(manifest.safeguards.extraction_failure_lowers_availability, false);
assert.ok(snapshot.startsWith("\uFEFF"));
assert.equal(snapshot.trimEnd().split(/\r?\n/).length - 1, 1041);
assert.equal(legacy.trimEnd().split(/\r?\n/).length - 1, 1041);

const changedPending = artifact.evaluations.filter((row) => row.previous_legacy_status === "EXTRACTION_PENDING");
assert.equal(changedPending.filter((row) => row.reconstructed_status === "FULLTEXT_PUBLIC").length, 180);
assert.equal(changedPending.filter((row) => row.reconstructed_status === "REEVALUATION_PENDING").length, 2);
for (const row of artifact.evaluations.filter((item) => item.reconstructed_status === "FULLTEXT_PUBLIC")) {
  assert.ok(row.representations.some((item) => item.verified_official_fulltext));
  assert.ok(row.evidence_refs.some((item) => item.evidence_type === "PARSER_RUNTIME_MEASUREMENT"));
}
for (const row of artifact.evaluations.filter((item) => item.reconstructed_status === "REEVALUATION_PENDING")) {
  assert.equal(row.reason_code, "IDENTITY_RESIDUAL_CANDIDATE");
}
assert.ok(!snapshot.includes("C:\\Users\\") && !snapshot.includes("service_role"));

console.log("reconstructed evaluation contract: 1041 rows, evaluated 1039, status 203/831/5/2 PASS");
