import assert from "node:assert/strict";
import fs from "node:fs";

const readJson = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const config = readJson("config/topic-boundary-audit-v1.json");
const summary = readJson("reports/measurements/2026-09-19-topic-boundary-audit-v1/summary.json");
const candidates = readJson("reports/measurements/2026-09-19-topic-boundary-audit-v1/candidate-notices.json");
const sql = fs.readFileSync("tools/analytics/audit_topic_boundary_v1.sql", "utf8");

assert.equal(config.membership_mutation_allowed, false);
assert.equal(summary.baseline.membership_rows, 39);
assert.equal(summary.baseline.evidence_rows, 106);
assert.deepEqual(summary.baseline.topic_notices, { LITIGATION: 21, INVESTMENT_GUARANTEE: 18 });
assert.equal(summary.precision_sanity.membership_review_required, 0);
assert.equal(candidates.length, 35);
assert.deepEqual(summary.false_negative_candidates, { STRONG: 0, MEDIUM: 24, WEAK: 11, TOTAL: 35 });
assert.equal(new Set(candidates.map((r) => `${r.candidate_topic}:${r.notice_id}`)).size, candidates.length);
assert.equal(candidates.filter((r) => r.current_membership).length, 0);
assert.equal(candidates.filter((r) => r.candidate_strength_class === "STRONG").length, 0);
assert.equal(candidates.filter((r) => r.candidate_strength_class === "MEDIUM").length, 24);
assert.equal(candidates.filter((r) => r.candidate_strength_class === "WEAK").length, 11);
assert.equal(candidates.filter((r) => r.candidate_topic === "LITIGATION").length, 3);
assert.equal(candidates.filter((r) => r.candidate_topic === "INVESTMENT_GUARANTEE").length, 32);
assert.equal(summary.candidate_overlap, 0);
assert.doesNotMatch(sql, /\b(insert|update|delete|merge|alter|create|drop|truncate|grant|revoke)\b/i);
assert.doesNotMatch(sql, /MENTIONS_PERSON|MENTIONS_EMAIL|NOTICE_DEPARTMENT|functional_attribution/i);
assert.match(sql, /SAME_PROPOSED_REGULATION/);
assert.match(sql, /MEMBER_DERIVED_BODY_PHRASE/);

console.log(JSON.stringify({
  contract: config.audit_contract_version,
  candidates: candidates.length,
  membershipRows: summary.baseline.membership_rows,
  evidenceRows: summary.baseline.evidence_rows,
  membershipMutation: false
}, null, 2));
