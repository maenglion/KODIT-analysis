import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const relationPlanUrl = new URL(
  "../../reports/measurements/2026-10-03-work-trace-regulation-function-v1/result.json",
  import.meta.url,
);
const tracePlanUrl = new URL(
  "../../reports/measurements/2026-10-03-work-trace-run-v1/result.json",
  import.meta.url,
);
const configUrl = new URL("../../config/work-trace-run-v1.json", import.meta.url);

const [relationPlan, tracePlan, config] = await Promise.all(
  [relationPlanUrl, tracePlanUrl, configUrl].map(async (url) =>
    JSON.parse(await readFile(url, "utf8")),
  ),
);

function md5Uuid(value) {
  const hex = createHash("md5").update(value, "utf8").digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function expectedCaseId({ notice_id, regulation_id, work_observation_key }) {
  return md5Uuid(
    `kodit:core:work-trace-case-v1:${notice_id}:${regulation_id ?? "UNRESOLVED_REGULATION"}:${work_observation_key}`,
  );
}

assert.equal(tracePlan.trace_contract_version, config.trace_contract_version);
assert.equal(tracePlan.relation_contract_version, relationPlan.contract_version);
assert.ok(["preflight", "apply"].includes(tracePlan.mode));
if (tracePlan.mode === "apply") {
  assert.deepEqual(tracePlan.apply_result, {
    relation_evidence_received: 1243,
    relation_evidence_inserted: 0,
    relation_rows_received: 994,
    relation_rows_inserted: 0,
    evidence_received: 1622,
    evidence_inserted: 1272,
    run_inserted: 1,
    branches_received: 1272,
    results_inserted: 1272,
    needs_received: 677,
    needs_inserted: 677,
    validated_branch_count: 1272,
  });
}
assert.equal(tracePlan.summary.residual_notice_count, 1272);
assert.equal(tracePlan.branches.length, 1272);
assert.equal(new Set(tracePlan.branches.map((item) => item.case.notice_id)).size, 1272);
assert.equal(new Set(tracePlan.branches.map((item) => item.case.trace_case_id)).size, 1272);
assert.equal(new Set(tracePlan.branches.map((item) => item.result.branch_result_id)).size, 1272);

const forbiddenKeys = new Set(config.leakage_policy.forbidden_input_fields);
function walk(value) {
  if (Array.isArray(value)) {
    value.forEach(walk);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(!forbiddenKeys.has(key), `forbidden input/output key in trace plan: ${key}`);
    walk(child);
  }
}
walk(tracePlan);

const evidence = new Map(
  tracePlan.evidence_references.map((item) => [item.evidence_reference_id, item]),
);
assert.equal(evidence.size, tracePlan.evidence_references.length);
assert.equal(evidence.size, tracePlan.summary.evidence_reference_count);
const relationRows = new Map(
  relationPlan.relations.map((item) => [item.regulation_function_correspondence_id, item]),
);
const resultById = new Map(
  tracePlan.branches.map((item) => [item.result.branch_result_id, item.result]),
);

const outcomes = new Map();
const endpointWidths = new Map();
for (const branch of tracePlan.branches) {
  const { case: traceCase, result, steps, branch_break: branchBreak, correspondences } = branch;
  assert.equal(traceCase.trace_case_id, expectedCaseId(traceCase));
  assert.equal(result.trace_case_id, traceCase.trace_case_id);
  assert.equal(result.trace_run_id, tracePlan.run.trace_run_id);
  assert.ok(!Object.hasOwn(traceCase, "release_id"), "trace case must be release independent");
  assert.ok(steps.length >= 1);
  assert.equal(steps[0].step_kind, "NOTICE_OBSERVED");
  assert.equal(steps[0].notice_id, traceCase.notice_id);
  assert.equal(new Set(steps.map((step) => step.step_order)).size, steps.length);
  assert.deepEqual(
    steps.map((step) => step.step_order),
    Array.from({ length: steps.length }, (_, index) => index + 1),
  );
  assert.ok(steps.some((step) => step.trace_step_id === result.last_verified_step_id));

  for (const step of steps) {
    assert.ok(step.evidence_links.length > 0, "every trace step needs evidence");
    for (const link of step.evidence_links) {
      assert.ok(evidence.has(link.evidence_reference_id), "step cites missing evidence");
    }
    if (step.step_basis === "TEXT_COMPARISON") {
      const roles = new Set(step.evidence_links.map((link) => link.evidence_role));
      assert.ok(roles.has("SUPPORTS_TEXT_COMPARISON_SOURCE"));
      assert.ok(roles.has("SUPPORTS_TEXT_COMPARISON_TARGET"));
    }
  }

  const endpointCount = new Set(correspondences.map((item) => item.org_node_id)).size;
  endpointWidths.set(endpointCount, (endpointWidths.get(endpointCount) ?? 0) + 1);
  if (result.terminal_outcome === "FUNCTION_MULTIPLE_CANDIDATES") {
    assert.ok(endpointCount >= 2);
    assert.equal(branchBreak, null);
  } else {
    assert.ok(endpointCount <= 1);
  }

  const gapOutcomes = new Set([
    "SOURCE_DOCUMENT_GAP",
    "RELATION_EVIDENCE_GAP",
    "FUNCTION_CORRESPONDENCE_UNCONFIRMED",
  ]);
  if (gapOutcomes.has(result.terminal_outcome)) {
    assert.equal(branchBreak.break_kind, result.terminal_outcome);
    if (result.last_verified_date && branchBreak.gap_from) {
      assert.ok(result.last_verified_date <= branchBreak.gap_from);
    }
  } else {
    assert.equal(branchBreak, null);
  }

  if (result.terminal_outcome === "COMPLETE") {
    assert.equal(result.completion_scope, "CURRENT_FUNCTION_OBSERVED");
    assert.ok(correspondences.length > 0);
    assert.ok(correspondences.every((item) => item.correspondence_basis === "FUNCTION_DIRECT"));
  } else {
    assert.equal(result.completion_scope, null);
  }

  for (const item of correspondences) {
    const relation = relationRows.get(item.regulation_function_correspondence_id);
    assert.ok(relation, "branch cites a missing common regulation-function relation");
    assert.equal(relation.regulation_id, traceCase.regulation_id);
    assert.equal(relation.org_node_id, item.org_node_id);
    assert.equal(relation.function_assignment_id, item.function_assignment_id);
    assert.equal(relation.correspondence_basis, item.correspondence_basis);
    const step = steps.find((candidate) => candidate.trace_step_id === item.trace_step_id);
    assert.ok(step);
    assert.equal(step.org_node_id, item.org_node_id);
    if (item.correspondence_basis === "FUNCTION_DIRECT") {
      assert.equal(step.step_basis, "OFFICIAL_DOCUMENT");
    } else {
      assert.equal(step.step_basis, "TEXT_COMPARISON");
    }
  }

  outcomes.set(
    result.terminal_outcome,
    (outcomes.get(result.terminal_outcome) ?? 0) + 1,
  );
}

assert.deepEqual(Object.fromEntries([...outcomes].sort()), tracePlan.summary.terminal_outcomes);
assert.deepEqual(
  Object.fromEntries([...endpointWidths].sort((a, b) => a[0] - b[0]).map(([key, value]) => [String(key), value])),
  tracePlan.summary.endpoint_width,
);

for (const need of tracePlan.evidence_needs) {
  assert.ok(need.branch_result_ids.length > 0);
  for (const resultId of need.branch_result_ids) {
    const result = resultById.get(resultId);
    assert.ok(result);
    assert.equal(result.terminal_outcome, need.need_kind);
    assert.ok(!["COMPLETE", "FUNCTION_MULTIPLE_CANDIDATES"].includes(result.terminal_outcome));
  }
}

assert.deepEqual(tracePlan.summary.leakage, {
  notice_department_fields_read: 0,
  person_identifiers_read: 0,
  linked_regulation_version_ids_used_as_proposal: 0,
  person_to_org_relations_created: 0,
});

console.log("work trace run plan: PASS");
