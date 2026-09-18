import assert from "node:assert/strict";
import fs from "node:fs";

const script = fs.readFileSync("tools/organizations/evaluate_org_function_positive_control.py", "utf8");
const config = JSON.parse(fs.readFileSync("config/org-function-positive-control-v4.json", "utf8"));
const report = JSON.parse(fs.readFileSync("reports/measurements/2026-09-18-org-function-positive-control-v4/result.json", "utf8"));

const featureQuery = script.slice(script.indexOf("def feature_rows"), script.indexOf("def parse_arrays"));
assert.ok(featureQuery.length > 0);
assert.doesNotMatch(featureQuery, /n\.notice_department|raw_label|comparison_label/);
assert.doesNotMatch(script, /publish\.notice_department_residual_occurrences/);
assert.equal(config.contract_version, "org-function-positive-control-v4");
assert.equal(report.contract_version, config.contract_version);
assert.equal(report.population.known_answer_total, 817);
assert.equal(report.population.strict_subset, 728);
assert.deepEqual(report.population.exclusion_reasons, {
  GROUND_TRUTH_HAS_NO_ATOMIC_ASSIGNMENT: 85,
  NO_NON_TITLE_SIGNAL: 4,
});
assert.equal(report.leakage.leakage_count, 0);
assert.equal(report.leakage.residual_rows_queried, false);
assert.equal(report.phrase_grain_audit.canonical_assignment_count, 202);
assert.equal(report.phrase_grain_audit.atomic_scorer_assignment_count, 137);
assert.equal(report.metrics.coverage_count, 670);
assert.equal(report.metrics.top1_correct, 468);
assert.equal(report.metrics.top3_correct, 607);
assert.equal(report.metrics.ambiguous_count, 162);
assert.equal(report.metrics.no_candidate_count, 58);
assert.equal(report.rows.length, 817);
assert.ok(report.rows.every((row) => !("notice_department" in row)));
console.log("T06.8 positive-control contract passed");
