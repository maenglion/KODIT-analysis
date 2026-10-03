import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../../supabase/migrations/20261003000300_work_trace_evidence_chain.sql",
  import.meta.url,
);
const writerMigrationUrl = new URL(
  "../../supabase/migrations/20261003000310_work_trace_service_writer.sql",
  import.meta.url,
);
const architectureUrl = new URL(
  "../../docs/architecture/work-trace-evidence-chain.md",
  import.meta.url,
);
const publicUiUrl = new URL(
  "../../docs/architecture/work-trace-public-ui-contract.md",
  import.meta.url,
);
const relationConfigUrl = new URL(
  "../../config/work-trace-regulation-function-v1.json",
  import.meta.url,
);
const relationBuilderUrl = new URL(
  "./build_regulation_function_correspondence.py",
  import.meta.url,
);
const traceConfigUrl = new URL("../../config/work-trace-run-v1.json", import.meta.url);
const traceBuilderUrl = new URL("./build_work_trace_run.py", import.meta.url);

const [sql, writerSql, architecture, publicUi, relationConfigText, relationBuilder, traceConfigText, traceBuilder] = await Promise.all([
  readFile(migrationUrl, "utf8"),
  readFile(writerMigrationUrl, "utf8"),
  readFile(architectureUrl, "utf8"),
  readFile(publicUiUrl, "utf8"),
  readFile(relationConfigUrl, "utf8"),
  readFile(relationBuilderUrl, "utf8"),
  readFile(traceConfigUrl, "utf8"),
  readFile(traceBuilderUrl, "utf8"),
]);
const relationConfig = JSON.parse(relationConfigText);
const traceConfig = JSON.parse(traceConfigText);

for (const table of [
  "work_trace_evidence_references",
  "regulation_function_correspondences",
  "work_trace_cases",
  "work_trace_runs",
  "work_trace_run_evidence_references",
  "work_trace_branch_results",
  "work_trace_steps",
  "work_trace_step_evidence_links",
  "work_trace_branch_breaks",
  "work_trace_function_correspondences",
  "work_trace_branch_corrections",
  "work_trace_evidence_needs",
  "work_trace_evidence_need_branches",
  "work_trace_run_validations",
]) {
  assert.match(sql, new RegExp(`create table core\\.${table}\\b`, "i"), `missing ${table}`);
}

for (const view of [
  "work_trace_branch_audit",
  "work_trace_run_deltas",
  "work_trace_research_backlog",
  "work_trace_evidence_need_effects",
]) {
  assert.match(sql, new RegExp(`create view analytics\\.${view}\\b`, "i"), `missing ${view}`);
}

for (const outcome of [
  "COMPLETE",
  "SOURCE_DOCUMENT_GAP",
  "RELATION_EVIDENCE_GAP",
  "FUNCTION_CORRESPONDENCE_UNCONFIRMED",
  "FUNCTION_MULTIPLE_CANDIDATES",
]) {
  assert.ok(sql.includes(`'${outcome}'`), `missing terminal outcome ${outcome}`);
}

for (const scope of [
  "CURRENT_FUNCTION_OBSERVED",
  "OFFICIAL_TRANSFER_PATH_VERIFIED",
]) {
  assert.ok(sql.includes(`'${scope}'`), `missing completion scope ${scope}`);
}

for (const basis of ["FUNCTION_DIRECT", "FUNCTION_PHRASE_CANDIDATE"]) {
  assert.ok(sql.includes(`'${basis}'`), `missing correspondence basis ${basis}`);
}

for (const change of [
  "EXTENDED",
  "COMPLETED",
  "OUTCOME_CHANGED",
  "SHORTENED_CORRECTION",
  "UNCHANGED",
  "ADDED_CASE",
  "OUT_OF_SCOPE_CASE",
]) {
  assert.ok(sql.includes(`'${change}'`), `missing run delta ${change}`);
}

const caseIdFunction = sql.match(
  /create function core\.work_trace_case_id[\s\S]*?\$\$;\s*/i,
)?.[0];
assert.ok(caseIdFunction, "missing deterministic work_trace_case_id function");
assert.ok(!/release_id/i.test(caseIdFunction), "trace_case_id must be release independent");
assert.match(caseIdFunction, /p_notice_id/);
assert.match(caseIdFunction, /p_regulation_id/);
assert.match(caseIdFunction, /p_work_observation_key/);

assert.match(sql, /create function core\.validate_work_trace_run/i);
assert.match(sql, /create function core\.regulation_function_correspondence_id/i);
assert.match(sql, /create function core\.validate_regulation_function_correspondence/i);
assert.match(sql, /regulation evidence mismatch/i);
assert.match(sql, /assignment evidence mismatch/i);
assert.match(sql, /work trace step without evidence/i);
assert.match(sql, /work trace step evidence entity mismatch/i);
assert.match(sql, /last verified date after gap start/i);
assert.match(sql, /multiple correspondence with fewer than two orgs/i);
assert.match(sql, /invalid evidence backlog membership/i);

assert.match(sql, /create trigger %I_append_only/i);
assert.match(sql, /force row level security/i);
assert.match(sql, /grant select,insert on core\.%I to service_role/i);
assert.ok(!/grant\s+[^;]*\s+to\s+(anon|authenticated)/i.test(sql), "no public core/read grant is allowed");
assert.ok(!/create\s+(or\s+replace\s+)?function\s+publish\./i.test(sql), "public RPC is out of scope");

for (const writer of [
  "record_work_trace_evidence_batch",
  "record_regulation_function_correspondence_batch",
  "record_work_trace_run_header",
  "record_work_trace_branch_batch",
  "record_work_trace_evidence_need_batch",
  "finalize_work_trace_run",
]) {
  assert.match(writerSql, new RegExp(`create function api\\.${writer}\\b`, "i"), `missing service writer ${writer}`);
  assert.match(writerSql, new RegExp(`grant execute on function api\\.${writer}[\\s\\S]*?to service_role`, "i"), `service_role grant missing for ${writer}`);
}
assert.ok(!/grant\s+execute[\s\S]*?to\s+(anon|authenticated)/i.test(writerSql), "work trace writers must remain service-only");
assert.match(writerSql, /idempotency conflict/i);
assert.match(writerSql, /perform core\.validate_work_trace_run/i);

assert.equal(relationConfig.contract_version, "work-trace-regulation-function-v1");
assert.match(relationConfig.regulation_identity_bridge, /exact, unique/i);
assert.equal(
  relationConfig.regulation_identity_bridge_kind,
  "SAME_UPSTREAM_CORPUS_EXACT_IDENTITY_RECONCILIATION",
);
assert.match(relationConfig.regulation_identity_bridge_interpretation, /not independent cross-source validation/i);
assert.equal(relationConfig.leakage_policy.residual_rows_queried, false);
for (const forbidden of ["notice_department", "raw_label", "comparison_label", "person_mentions", "org_mentions", "email_mentions"]) {
  assert.ok(relationConfig.leakage_policy.forbidden_input_fields.includes(forbidden), `missing forbidden input ${forbidden}`);
}
assert.match(relationBuilder, /OBSERVED_DEPARTMENT_REPRODUCTION_DIAGNOSTIC/);
assert.match(relationBuilder, /not a function-owner gold label/i);
assert.match(relationBuilder, /FUNCTION_DIRECT/);
assert.match(relationBuilder, /FUNCTION_PHRASE_CANDIDATE/);
assert.doesNotMatch(relationBuilder, /from\s+publish\.notice_department_residual_occurrences/i);
assert.match(relationBuilder, /r\.canonical_name=p\.display_name/);
assert.match(relationBuilder, /"reference_kind": "REGULATION"/);

assert.equal(traceConfig.trace_contract_version, "work-trace-run-v1");
assert.equal(traceConfig.relation_contract_version, relationConfig.contract_version);
for (const forbidden of ["notice_department", "raw_label", "comparison_label", "public_alias", "person_mentions", "org_mentions", "email_mentions"]) {
  assert.ok(traceConfig.leakage_policy.forbidden_input_fields.includes(forbidden), `trace config missing forbidden input ${forbidden}`);
}
assert.match(traceBuilder, /analytics\.notice_rule_change_assertions/);
assert.doesNotMatch(traceBuilder, /select[\s\S]{0,200}linked_regulation_version_ids/i);
assert.doesNotMatch(traceBuilder, /select[\s\S]{0,120}\bnotice_department\b/i);
assert.match(traceBuilder, /FUNCTION_MULTIPLE_CANDIDATES/);
assert.match(traceBuilder, /APPLY_WORK_TRACE_RUN/);
assert.match(traceBuilder, /selected\s*=\s*\[dict\(item\) for item in chosen\]/);
assert.doesNotMatch(
  traceBuilder,
  /relations_by_regulation\[[^\]]+\][\s\S]{0,500}trace_step_id\s*=/,
  "trace planning must not mutate reusable relation-plan rows",
);

for (const phrase of [
  "추적은 답을 만들어 내는 일이 아니라",
  "자료 부재",
  "연결 근거 부재",
  "대응 미확인",
  "복수 대응",
  "PERSON→ORG 공개 relation은 0건",
  "696건은 residual 1,272건의 부분집합이 아니다",
]) {
  assert.ok(architecture.includes(phrase), `architecture contract missing: ${phrase}`);
}

for (const phrase of [
  "업무 이동 근거 추적",
  "현재 확보 범위에서 추적을 멈추게 한 자료·근거 유형",
  "공식 업무분장에서 직접 확인",
  "업무 문구 대조 후보",
  "후속 실행에서 정정됨",
  "PERSON과 organization payload client-side join",
  "verified snapshot 이전 운영 배포",
]) {
  assert.ok(publicUi.includes(phrase), `public UI contract missing: ${phrase}`);
}

console.log("work trace evidence-chain contract: PASS");
