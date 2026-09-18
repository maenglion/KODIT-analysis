import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../../", import.meta.url);
const read = (path) => JSON.parse(fs.readFileSync(new URL(path, root), "utf8"));
const result = read("reports/measurements/2026-09-18-org-function-precision-gate-v1/result.json");
const config = read("config/org-function-precision-gate-v1.json");

assert.equal(result.contract_version, "org-function-precision-gate-v1");
assert.equal(result.contract_version, config.contract_version);
assert.equal(result.population.known_answer, 817);
assert.equal(result.population.strict_subset, 728);
assert.deepEqual(result.gold_semantics, {
  CURRENT_FUNCTION_GOLD: 27,
  HISTORICAL_ASOF_GOLD: 18,
  OBSERVED_DEPARTMENT_ONLY: 683,
});
assert.equal(result.split.calibration, 19);
assert.equal(result.split.holdout, 8);
assert.equal(result.split.overlap, 0);
assert.equal(result.temporal_reclassification.NEITHER, 0);
assert.equal(result.current_gold_diagnostics.population, 27);
assert.equal(result.leakage.leakage_count, 0);
assert.equal(result.leakage.residual_rows_queried, false);
assert.equal(result.leakage.holdout_used_for_rule_selection, false);
assert.equal(result.auto_accept.authorized, false);
assert.equal(result.auto_accept.residual_run_created, false);
const target = result.policy_results.find((item) => item.precision_target === 0.95);
assert.ok(target);
assert.equal(target.holdout.accepted, 2);
assert.equal(target.holdout.correct, 1);
assert.equal(target.holdout.precision, 0.5);
assert.equal(result.legacy_metric_semantics.not_current_function_accuracy, true);
console.log("T06.8.1 precision gate contract passed");
