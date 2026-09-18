import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../../", import.meta.url);
const read = (path) => JSON.parse(fs.readFileSync(new URL(path, root), "utf8"));
const result = read("reports/measurements/2026-09-18-temporal-function-profile-v1/result.json");

assert.equal(result.contract_version, "temporal-function-profile-v1");
assert.equal(result.document_reclassification.historical_t067_documents, 42);
assert.equal(result.document_reclassification.historical_proposed_amendment, 42);
assert.equal(result.document_reclassification.historical_enacted_fulltext, 0);
assert.equal(result.document_reclassification.proposal_with_effective_date_evidence, 0);
assert.equal(result.document_reclassification.version_chain_links, 0);
assert.equal(result.document_reclassification.proposal_promoted_to_enacted, 0);
assert.equal(result.positive_control.known_answer, 817);
assert.equal(result.positive_control.strict_subset, 728);
assert.equal(result.positive_control.asof_department_gold, 23);
assert.equal(result.positive_control.asof_function_gold, 45);
assert.equal(result.positive_control.asof_function_gold_complete_multi_org, 27);
assert.equal(result.positive_control.asof_function_gold_scoped_partial, 18);
assert.equal(result.positive_control.strict_no_matching_answer_profile, 683);
assert.equal(result.positive_control.former_temporal_conflict_reclassified_to_no_profile, 683);
assert.equal(result.positive_control.temporal_conflict_after_asof_filter, 0);
assert.equal(result.leakage.leakage_count, 0);
assert.equal(result.leakage.residual_rows_queried, false);
assert.equal(result.validation_gate.calibration_holdout_performed, false);
assert.equal(result.validation_gate.auto_accept_authorized, false);
assert.equal(result.validation_gate.residual_run_created, false);
console.log("T06.8.2 temporal profile contract passed");
