import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260918000500_org_work_attribution_ledger.sql",
  "utf8",
);
const integrity = readFileSync(
  "supabase/migrations/20260918000510_org_work_attribution_integrity.sql",
  "utf8",
);
const backfill = readFileSync(
  "tools/organizations/backfill_org_work_attribution.py",
  "utf8",
);
const config = JSON.parse(readFileSync("config/org-work-similarity-v1.json", "utf8"));

const coreTables = [
  "organization_evidence_documents",
  "organization_evidence_document_links",
  "organization_change_events",
  "organization_change_event_nodes",
  "organization_function_assignments",
  "notice_work_contexts",
  "organization_anchor_notices",
  "org_work_attribution_runs",
  "org_work_attribution_candidates",
  "org_work_attribution_steps",
  "org_work_attribution_path_steps",
  "org_work_attribution_evidence",
];

for (const table of coreTables) {
  assert.match(migration, new RegExp(`create table core\\.${table}\\b`, "i"));
  assert.ok(migration.includes(`'${table}'`), `missing ${table} from protection loop`);
}
assert.equal((migration.match(/create table core\./gi) ?? []).length, 12);
assert.match(migration, /alter table core\.%I force row level security/i);
assert.match(migration, /execute function core\.reject_history_mutation\(\)/i);
assert.match(migration, /create view analytics\.org_work_attribution_audit with \(security_invoker=true\)/i);
assert.match(migration, /create function publish\.public_organization_evidence_catalog\(\)/i);
assert.match(migration, /security definer set search_path=''/i);
assert.match(migration, /revoke all on function publish\.public_organization_evidence_catalog\(\) from public,anon,authenticated,service_role/i);
assert.match(migration, /grant execute on function publish\.public_organization_evidence_catalog\(\) to anon,authenticated,service_role/i);
for (const term of [
  "organization_evidence_documents_extraction_binary_fk",
  "validate_official_organization_evidence_pair",
  "validate_org_work_candidate_anchor",
  "org_work_attribution_unresolved_has_no_resolved_org",
]) assert.ok(integrity.includes(term), `missing integrity contract: ${term}`);

for (const forbidden of ["MENTIONS_PERSON", "MENTIONS_ORG", "MENTIONS_RULE", "MENTIONS_WORK", "PERSON_TO_ORG"])
  assert.ok(!migration.includes(forbidden), `forbidden T07/T03 relation in migration: ${forbidden}`);

assert.equal(config.contract_version, "org-work-similarity-v1");
assert.equal(config.person_signal_weight, 0);
assert.equal(config.raw_department_signal_weight, 0);
assert.ok(config.weights.same_attachment > config.weights.title_jaccard);
assert.ok(config.weights.same_proposed_regulation > config.weights.title_jaccard);
assert.ok(config.weights.same_regulation > config.weights.title_jaccard);
assert.ok(!Object.keys(config.weights).some((key) => /person|department/i.test(key)));
assert.match(backfill, /excluded \|= tokens\(observed\)/);
assert.match(backfill, /final_status<>'UNRESOLVED'/);
assert.ok(!/PERSON[^\n]*combined_score/i.test(backfill));
assert.ok(!/raw_label[^\n]*combined_score/i.test(backfill));

console.log("T06.6 static contract: PASS (12 core ledgers, 1 audit view, 1 public RPC)");
