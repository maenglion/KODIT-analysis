import fs from "node:fs";
import assert from "node:assert/strict";

const schemaPath = "supabase/migrations/20260918000600_historical_organization_evidence_corpus.sql";
const backfillPath = "supabase/migrations/20260918000610_historical_organization_evidence_backfill.sql";
const auditPath = "supabase/migrations/20260918000620_historical_organization_evidence_attribution_audit.sql";
const functionPath = "supabase/migrations/20260918000630_historical_organization_function_integrity.sql";
const schema = fs.readFileSync(schemaPath, "utf8");
const backfill = fs.readFileSync(backfillPath, "utf8");
const audit = fs.readFileSync(auditPath, "utf8");
const functions = fs.readFileSync(functionPath, "utf8");

for (const object of [
  "organization_document_series",
  "organization_document_versions",
  "organization_document_version_series",
  "organization_evidence_spans",
  "organization_snapshots",
  "organization_snapshot_observations",
  "organization_function_observations",
  "organization_function_assignment_spans",
]) {
  assert.match(schema, new RegExp(`create table core\\.${object}\\b`, "i"), `missing ${object}`);
  assert.match(schema, new RegExp(`${object}.*append_only`, "is"), `missing append-only protection: ${object}`);
}

for (const rpc of [
  "public_organization_evidence_catalog_v2",
  "public_organization_evidence_document_detail",
]) {
  assert.match(schema, new RegExp(`create function publish\\.${rpc}\\b`, "i"), `missing ${rpc}`);
  assert.match(schema, new RegExp(`grant execute on function publish\\.${rpc}`, "i"), `missing public execute grant: ${rpc}`);
}

assert.match(schema, /security definer set search_path=''/i);
assert.match(schema, /enable row level security/i);
assert.match(schema, /force row level security/i);
assert.match(backfill, /organization-document-version-v1/);
assert.match(backfill, /organization-snapshot-v1/);
assert.match(backfill, /organization-function-observation-v1/);
assert.match(backfill, /org-work-attribution-v1-evidence-r2/);
assert.match(backfill, /evidence_contract_version='organization-evidence-document-v2'/);
assert.match(backfill, /!~\* 'ACSIC'/);
assert.match(audit, /organization-evidence-document-v2/);
assert.match(audit, /ORGANIZATION_DOCUMENT/);
assert.match(audit, /귀속 확정 근거 아님/);
assert.match(audit, /org_work_attribution_evidence_r2_audit/);
assert.match(functions, /DIRECT_FUNCTION_ASSIGNMENT/);
assert.match(functions, /org-function-assignment-v3/);
assert.match(functions, /\[valid_from, valid_to\)/);
assert.match(functions, /canonical_organization_function_assignments/);

for (const forbidden of [
  /\bdelete\s+from\b/i,
  /\bupdate\s+core\./i,
  /\bdrop\s+(table|column|schema)\b/i,
  /MENTIONS_(PERSON|ORG|RULE|WORK|EMAIL)/,
  /PERSON\s*[-=]>\s*ORG/i,
]) {
  assert.doesNotMatch(`${schema}\n${backfill}\n${audit}\n${functions}`, forbidden);
}

console.log(JSON.stringify({
  schema: schemaPath,
  backfill: backfillPath,
  audit: auditPath,
  functions: functionPath,
  additive_only: true,
  public_rpcs: 2,
  t07_ui: false,
}, null, 2));
