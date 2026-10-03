#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";

const snapshot = JSON.parse(gunzipSync(await readFile(
  new URL("../../apps/public-site/data/public-work-trace-v1.json.gz", import.meta.url),
)).toString("utf8"));
const fixture = JSON.parse(await readFile(
  new URL("../../apps/public-site/data/public-work-trace-v1.fixture.json", import.meta.url),
  "utf8",
));

const outcomeKeys = [
  "COMPLETE",
  "SOURCE_DOCUMENT_GAP",
  "RELATION_EVIDENCE_GAP",
  "FUNCTION_CORRESPONDENCE_UNCONFIRMED",
  "FUNCTION_MULTIPLE_CANDIDATES",
];
const forbiddenKey = /(?:^|_)(?:person|public_alias|raw_label|comparison_label|notice_department|residual_id|label_id|org_node_id|function_assignment_id|trace_case_id|branch_result_id|evidence_reference_id|work_observation_id)(?:$|_)/i;

function inspectBoundary(value, trail = "snapshot") {
  if (Array.isArray(value)) return value.forEach((item, index) => inspectBoundary(item, `${trail}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(!forbiddenKey.test(key), `forbidden key ${trail}.${key}`);
    inspectBoundary(child, `${trail}.${key}`);
  }
}

assert.equal(snapshot.snapshot_contract, "public-work-trace-snapshot-v1");
assert.equal(snapshot.trace_contract_version, "work-trace-run-v1");
assert.equal(snapshot.branches.length, 1272);
assert.equal(snapshot.axes.notices.length, 1272);
assert.equal(snapshot.summary.notice_count, 1272);
assert.equal(snapshot.summary.branch_count, 1272);
assert.deepEqual(Object.keys(snapshot.summary.terminal_outcomes), outcomeKeys);
assert.deepEqual(snapshot.summary.terminal_outcomes, {
  COMPLETE: 38,
  SOURCE_DOCUMENT_GAP: 0,
  RELATION_EVIDENCE_GAP: 362,
  FUNCTION_CORRESPONDENCE_UNCONFIRMED: 650,
  FUNCTION_MULTIPLE_CANDIDATES: 222,
});
assert.deepEqual(snapshot.summary.endpoint_width, { "0": 793, "1": 257, "2": 104, "3": 118 });
assert.equal(snapshot.summary.official_current_function_observed, 38);
assert.equal(snapshot.summary.single_phrase_candidate_only, 219);
assert.equal(snapshot.summary.multiple_phrase_candidates, 222);
assert.equal(snapshot.summary.relation_evidence_gap, 362);
assert.equal(Object.values(snapshot.summary.terminal_outcomes).reduce((sum, value) => sum + value, 0), 1272);

inspectBoundary(snapshot);
assert.ok(!JSON.stringify(snapshot).includes('"PERSON"'), "PERSON discriminator leaked into work-trace snapshot");
assert.ok(!JSON.stringify(snapshot).includes("NOTICE_DEPARTMENT"), "department-label contract leaked into work-trace snapshot");

const evidenceNumbers = new Set(snapshot.evidence.map((row) => row.evidence_no));
assert.equal(evidenceNumbers.size, snapshot.evidence.length);
assert.ok(snapshot.evidence.every((row) => /^E-\d{4}$/.test(row.evidence_no)));
assert.ok(snapshot.evidence.every((row) => row.source_url === null || /^https?:\/\//.test(row.source_url)));

const branchKeys = new Set(snapshot.branches.map((row) => row.public_branch_key));
const noticeKeys = new Set(snapshot.branches.map((row) => row.public_notice_key));
assert.equal(branchKeys.size, 1272);
assert.equal(noticeKeys.size, 1272);
assert.ok(snapshot.branches.every((row) => row.steps.length > 0));
assert.ok(snapshot.branches.every((row) => row.steps.every((step) =>
  step.evidence_numbers.length > 0 && step.evidence_numbers.every((value) => evidenceNumbers.has(value)),
)));
assert.ok(snapshot.branches.every((row) => row.current_endpoints.every((endpoint) =>
  endpoint.evidence_numbers.length > 0
  && endpoint.evidence_numbers.every((value) => evidenceNumbers.has(value)),
)));
assert.ok(snapshot.branches.filter((row) => row.terminal_outcome === "COMPLETE")
  .every((row) => row.completion_scope !== null
    && row.current_endpoint_count === 1
    && row.current_endpoints.every((endpoint) => endpoint.correspondence_basis === "FUNCTION_DIRECT")));
assert.ok(snapshot.branches.filter((row) => row.terminal_outcome === "FUNCTION_MULTIPLE_CANDIDATES")
  .every((row) => row.break === null
    && row.current_endpoint_count >= 2
    && row.current_endpoints.every((endpoint) => endpoint.correspondence_basis === "FUNCTION_PHRASE_CANDIDATE")));
assert.ok(snapshot.branches.filter((row) => [
  "RELATION_EVIDENCE_GAP",
  "FUNCTION_CORRESPONDENCE_UNCONFIRMED",
  "SOURCE_DOCUMENT_GAP",
].includes(row.terminal_outcome)).every((row) => row.break?.break_kind === row.terminal_outcome));
assert.ok(snapshot.branches.filter((row) => row.terminal_outcome === "RELATION_EVIDENCE_GAP")
  .every((row) => row.regulation === null && row.current_endpoint_count === 0));
assert.ok(snapshot.research_backlog.every((row) =>
  !["COMPLETE", "FUNCTION_MULTIPLE_CANDIDATES"].includes(row.need_kind)
  && row.public_branch_keys.length === row.current_affected_branch_count
  && row.public_branch_keys.every((key) => branchKeys.has(key))
  && row.last_evidence_numbers.every((value) => evidenceNumbers.has(value)),
));

assert.equal(snapshot.axes.notices.every((row) =>
  row.public_branch_keys.length === row.branch_count
  && row.public_branch_keys.every((key) => branchKeys.has(key))), true);
assert.equal(snapshot.axes.regulations.every((row) =>
  row.public_branch_keys.length === row.branch_count
  && row.public_branch_keys.every((key) => branchKeys.has(key))), true);
assert.equal(snapshot.axes.current_organizations.every((row) =>
  row.public_branch_keys.length === row.branch_count
  && row.public_branch_keys.every((key) => branchKeys.has(key))), true);

assert.equal(snapshot.run_comparisons.length, 0, "first validated run must not fabricate a comparison");
assert.equal(fixture.fixture_contract, "public-work-trace-fixture-v1");
assert.equal(fixture.snapshot_contract, snapshot.snapshot_contract);
assert.deepEqual(new Set(fixture.examples.map((row) => row.terminal_outcome)), new Set([
  "COMPLETE",
  "FUNCTION_MULTIPLE_CANDIDATES",
  "FUNCTION_CORRESPONDENCE_UNCONFIRMED",
  "RELATION_EVIDENCE_GAP",
]));
inspectBoundary(fixture, "fixture");

console.log(JSON.stringify({
  contract: snapshot.snapshot_contract,
  public_run_key: snapshot.public_run_key,
  branches: snapshot.branches.length,
  regulations: snapshot.axes.regulations.length,
  current_organizations: snapshot.axes.current_organizations.length,
  evidence: snapshot.evidence.length,
  research_backlog: snapshot.research_backlog.length,
  terminal_outcomes: snapshot.summary.terminal_outcomes,
  person_to_org_public_relations: 0,
}, null, 2));
