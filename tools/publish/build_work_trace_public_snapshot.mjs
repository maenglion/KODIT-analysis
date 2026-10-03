#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TRACE_PATH = path.join(ROOT, "reports/measurements/2026-10-03-work-trace-run-v1/result.json");
const RELATION_PATH = path.join(ROOT, "reports/measurements/2026-10-03-work-trace-regulation-function-v1/result.json");
const OUTPUT_PATH = path.join(ROOT, "apps/public-site/data/public-work-trace-v1.json.gz");
const FIXTURE_PATH = path.join(ROOT, "apps/public-site/data/public-work-trace-v1.fixture.json");
const SUPABASE_CLI = "supabase@2.117.0";

const OUTCOMES = [
  "COMPLETE",
  "SOURCE_DOCUMENT_GAP",
  "RELATION_EVIDENCE_GAP",
  "FUNCTION_CORRESPONDENCE_UNCONFIRMED",
  "FUNCTION_MULTIPLE_CANDIDATES",
];

const outcomeLabels = {
  COMPLETE: "확인된 범위까지 추적 완료",
  SOURCE_DOCUMENT_GAP: "자료 부재",
  RELATION_EVIDENCE_GAP: "연결 근거 부재",
  FUNCTION_CORRESPONDENCE_UNCONFIRMED: "대응 미확인",
  FUNCTION_MULTIPLE_CANDIDATES: "복수 대응",
};

const completionLabels = {
  CURRENT_FUNCTION_OBSERVED: "현행 업무분장까지 확인",
  OFFICIAL_TRANSFER_PATH_VERIFIED: "공식 이관 경로까지 확인",
};

const basisLabels = {
  FUNCTION_DIRECT: "공식 업무분장에서 직접 확인",
  FUNCTION_PHRASE_CANDIDATE: "업무 문구 대조 후보",
};

const stepDescriptions = {
  NOTICE_OBSERVED: "공식 사규예고 게시물과 게시일을 확인했습니다.",
  PROPOSES_CHANGE_TO: "사규예고 제목에서 개정 대상 규정을 직접 확인했습니다.",
  REGULATION_WORK_OBSERVED: "규정에서 업무 관측 문구를 확인했습니다.",
  FUNCTION_ASSIGNMENT_OBSERVED: "공식 업무분장에서 해당 업무 문구를 확인했습니다.",
  ORG_CHANGE_EVENT_FOLLOWED: "공식 조직변경 문서에서 다음 단계를 확인했습니다.",
  CURRENT_FUNCTION_OBSERVED: "현행 공식 업무분장에 해당 규정의 관리 문구가 직접 나타납니다.",
  SEPARATE_CURRENT_OBSERVATION: "규정 문구와 현행 업무분장 문구를 조사 목적으로 대조했습니다. 공식 이관이나 소관 확정을 뜻하지 않습니다.",
};

function publicKey(kind, value) {
  return `wt_${kind}_${createHash("sha256").update(`kodit:public-work-trace-v1:${kind}:${value}`).digest("hex").slice(0, 20)}`;
}

function validUrl(value) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

function emptyOutcomeCounts() {
  return Object.fromEntries(OUTCOMES.map((value) => [value, 0]));
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right, "ko"));
}

function query(sql) {
  const tempPath = path.join(tmpdir(), `kodit-work-trace-public-${process.pid}-${randomUUID()}.sql`);
  return writeFile(tempPath, sql, "utf8")
    .then(() => {
      const executable = process.platform === "win32" ? "npx.cmd" : "npx";
      const result = spawnSync(
        executable,
        ["--yes", SUPABASE_CLI, "db", "query", "--linked", "--output-format", "json", "--file", tempPath],
        {
          cwd: ROOT,
          encoding: "utf8",
          maxBuffer: 64 * 1024 * 1024,
          shell: process.platform === "win32",
        },
      );
      if (result.status !== 0) {
        const detail = `${result.error?.message || ""}\n${result.stderr || ""}\n${result.stdout || ""}`
          .replace(/(?:sbp_|eyJ)[A-Za-z0-9._-]+/g, "<REDACTED>")
          .split(/\r?\n/)
          .slice(-12)
          .join(" | ");
        throw new Error(`Supabase CLI query failed: ${detail}`);
      }
      const payload = JSON.parse(result.stdout);
      assert.ok(Array.isArray(payload.rows), "Supabase query returned no row array");
      return payload.rows;
    })
    .finally(() => unlink(tempPath).catch(() => {}));
}

function evidenceSort(left, right) {
  return String(left.reference_kind).localeCompare(String(right.reference_kind))
    || String(left.source_date || left.effective_date || "").localeCompare(String(right.source_date || right.effective_date || ""))
    || String(left.official_title).localeCompare(String(right.official_title), "ko")
    || String(left.source_url || "").localeCompare(String(right.source_url || ""))
    || String(left.evidence_reference_id).localeCompare(String(right.evidence_reference_id));
}

function addAggregate(map, key, factory, branch) {
  if (!map.has(key)) map.set(key, factory());
  const row = map.get(key);
  row.public_branch_keys.add(branch.public_branch_key);
  row.public_notice_keys.add(branch.public_notice_key);
  if (branch.regulation) row.public_regulation_keys.add(branch.regulation.public_regulation_key);
  row.terminal_outcome_counts[branch.terminal_outcome] += 1;
  for (const endpoint of branch.current_endpoints) row.current_org_keys.add(endpoint.current_org_key);
  return row;
}

const [tracePlan, relationPlan] = await Promise.all([
  readFile(TRACE_PATH, "utf8").then(JSON.parse),
  readFile(RELATION_PATH, "utf8").then(JSON.parse),
]);

assert.equal(tracePlan.mode, "apply", "work trace plan was not applied");
assert.equal(tracePlan.run.run_result, "COMPLETED", "work trace run did not complete");
assert.equal(tracePlan.branches.length, 1272, "work trace branch population changed");
assert.equal(tracePlan.apply_result?.validated_branch_count, 1272, "work trace apply validation is missing");
assert.equal(relationPlan.contract_version, tracePlan.relation_contract_version, "relation contract mismatch");

const runId = String(tracePlan.run.trace_run_id);
assert.match(runId, /^[0-9a-f-]{36}$/i, "invalid trace run id");
const validationVersion = String(tracePlan.validation_contract_version).replaceAll("'", "''");

const [runRows, orgRows, regulationRows] = await Promise.all([
  query(`
select r.trace_run_id::text,r.release_id::text,r.trace_contract_version,
  r.evidence_cutoff_date::text,r.completed_at::text,
  exists(select 1 from core.work_trace_run_validations v
    where v.trace_run_id=r.trace_run_id and v.validation_contract_version='${validationVersion}') validated,
  (select count(*) from core.work_trace_branch_results b where b.trace_run_id=r.trace_run_id)::integer branch_count
from core.work_trace_runs r where r.trace_run_id='${runId}'::uuid;
`),
  query(`
select org_node_id::text,official_name,valid_from::text,valid_to::text
from core.organization_nodes order by official_name,org_node_id;
`),
  query(`
with current_release as (select release_id from publish.current_release where singleton_key)
select r.regulation_id::text,r.canonical_name,p.source_location
from core.regulations r
join current_release c on true
left join publish.regulations p on p.release_id=c.release_id and p.display_name=r.canonical_name
order by r.canonical_name,r.regulation_id;
`),
]);

assert.equal(runRows.length, 1, "remote validated run was not found");
assert.equal(runRows[0].validated, true, "remote run lacks the expected validation record");
assert.equal(Number(runRows[0].branch_count), 1272, "remote branch count changed");
assert.equal(runRows[0].trace_contract_version, tracePlan.trace_contract_version, "remote trace contract mismatch");

const orgById = new Map(orgRows.map((row) => [row.org_node_id, row]));
const regulationById = new Map(regulationRows.map((row) => [row.regulation_id, row]));

const evidenceSource = [...tracePlan.evidence_references].sort(evidenceSort);
const evidenceNumberById = new Map();
const evidence = evidenceSource.map((row, index) => {
  const evidenceNo = `E-${String(index + 1).padStart(4, "0")}`;
  evidenceNumberById.set(row.evidence_reference_id, evidenceNo);
  return {
    evidence_no: evidenceNo,
    reference_kind: row.reference_kind,
    title: row.official_title,
    source_url: validUrl(row.source_url),
    source_date: row.source_date || null,
    effective_date: row.effective_date || null,
  };
});

const rawBranchByResultId = new Map(tracePlan.branches.map((branch) => [branch.result.branch_result_id, branch]));
const publicBranchKeyByResultId = new Map();

const branches = tracePlan.branches.map((branch) => {
  const noticeEvidence = tracePlan.evidence_references.find(
    (item) => item.reference_kind === "NOTICE" && item.notice_id === branch.case.notice_id,
  );
  assert.ok(noticeEvidence, "branch notice evidence missing");
  const publicBranchKey = publicKey("branch", branch.case.trace_case_id);
  const publicNoticeKey = publicKey("notice", branch.case.notice_id);
  publicBranchKeyByResultId.set(branch.result.branch_result_id, publicBranchKey);

  const regulation = branch.case.regulation_id ? regulationById.get(branch.case.regulation_id) : null;
  if (branch.case.regulation_id) assert.ok(regulation, "branch regulation dimension missing");
  const publicRegulation = regulation ? {
    public_regulation_key: publicKey("regulation", branch.case.regulation_id),
    title: regulation.canonical_name,
    source_url: validUrl(regulation.source_location),
  } : null;

  const steps = [...branch.steps]
    .sort((left, right) => left.step_order - right.step_order)
    .map((step) => {
      const org = step.org_node_id ? orgById.get(step.org_node_id) : null;
      if (step.org_node_id) assert.ok(org, "step organization dimension missing");
      return {
        step_order: step.step_order,
        step_kind: step.step_kind,
        step_basis: step.step_basis,
        public_description: stepDescriptions[step.step_kind] || step.step_description,
        observed_at: step.observed_at || null,
        effective_at: step.effective_at || null,
        observed_phrase: step.observed_phrase || null,
        matched_phrase: step.matched_phrase || null,
        current_org_key: org ? publicKey("organization", org.org_node_id) : null,
        current_org_name: org?.official_name || null,
        evidence_numbers: [...step.evidence_links]
          .sort((left, right) => left.citation_order - right.citation_order)
          .map((link) => evidenceNumberById.get(link.evidence_reference_id)),
      };
    });

  const stepByInternalId = new Map(branch.steps.map((step) => [step.trace_step_id, step]));
  const currentEndpoints = [...branch.correspondences]
    .map((row) => {
      const org = orgById.get(row.org_node_id);
      const step = stepByInternalId.get(row.trace_step_id);
      assert.ok(org && step, "correspondence dimension or step missing");
      return {
        current_org_key: publicKey("organization", org.org_node_id),
        current_org_name: org.official_name,
        correspondence_basis: row.correspondence_basis,
        correspondence_basis_label: basisLabels[row.correspondence_basis],
        observed_phrase: row.observed_phrase,
        matched_phrase: row.matched_phrase,
        evidence_numbers: [...step.evidence_links]
          .sort((left, right) => left.citation_order - right.citation_order)
          .map((link) => evidenceNumberById.get(link.evidence_reference_id)),
      };
    })
    .sort((left, right) => left.current_org_name.localeCompare(right.current_org_name, "ko")
      || left.correspondence_basis.localeCompare(right.correspondence_basis));

  return {
    public_branch_key: publicBranchKey,
    public_notice_key: publicNoticeKey,
    notice: {
      posted_at: noticeEvidence.source_date,
      title: noticeEvidence.official_title,
      source_url: validUrl(noticeEvidence.source_url),
    },
    regulation: publicRegulation,
    terminal_outcome: branch.result.terminal_outcome,
    terminal_outcome_label: outcomeLabels[branch.result.terminal_outcome],
    completion_scope: branch.result.completion_scope,
    completion_scope_label: branch.result.completion_scope
      ? completionLabels[branch.result.completion_scope]
      : null,
    public_summary: branch.result.public_summary,
    last_verified_date: branch.result.last_verified_date || null,
    current_endpoint_count: new Set(currentEndpoints.map((row) => row.current_org_key)).size,
    steps,
    break: branch.branch_break ? {
      break_kind: branch.branch_break.break_kind,
      missing_relation: branch.branch_break.missing_relation,
      gap_from: branch.branch_break.gap_from || null,
      gap_to: branch.branch_break.gap_to || null,
      required_evidence_description: branch.branch_break.required_evidence_description,
      public_explanation: branch.branch_break.public_explanation,
    } : null,
    current_endpoints: currentEndpoints,
    corrected_by_later_run: Boolean(branch.correction),
  };
}).sort((left, right) => right.notice.posted_at.localeCompare(left.notice.posted_at)
  || left.notice.title.localeCompare(right.notice.title, "ko")
  || left.public_branch_key.localeCompare(right.public_branch_key));

const branchByPublicKey = new Map(branches.map((branch) => [branch.public_branch_key, branch]));
const noticeAggregates = new Map();
const regulationAggregates = new Map();
const organizationAggregates = new Map();

for (const branch of branches) {
  addAggregate(
    noticeAggregates,
    branch.public_notice_key,
    () => ({
      public_notice_key: branch.public_notice_key,
      posted_at: branch.notice.posted_at,
      title: branch.notice.title,
      source_url: branch.notice.source_url,
      public_branch_keys: new Set(), public_notice_keys: new Set(), public_regulation_keys: new Set(),
      terminal_outcome_counts: emptyOutcomeCounts(), current_org_keys: new Set(),
    }),
    branch,
  );

  if (branch.regulation) {
    addAggregate(
      regulationAggregates,
      branch.regulation.public_regulation_key,
      () => ({
        ...branch.regulation,
        public_branch_keys: new Set(), public_notice_keys: new Set(), public_regulation_keys: new Set(),
        terminal_outcome_counts: emptyOutcomeCounts(), current_org_keys: new Set(),
        direct_org_keys: new Set(), candidate_org_keys: new Set(),
      }),
      branch,
    );
    const regulationAggregate = regulationAggregates.get(branch.regulation.public_regulation_key);
    for (const endpoint of branch.current_endpoints) {
      (endpoint.correspondence_basis === "FUNCTION_DIRECT"
        ? regulationAggregate.direct_org_keys
        : regulationAggregate.candidate_org_keys).add(endpoint.current_org_key);
    }
  }

  for (const endpoint of branch.current_endpoints) {
    const aggregate = addAggregate(
      organizationAggregates,
      endpoint.current_org_key,
      () => ({
        current_org_key: endpoint.current_org_key,
        current_org_name: endpoint.current_org_name,
        public_branch_keys: new Set(), public_notice_keys: new Set(), public_regulation_keys: new Set(),
        terminal_outcome_counts: emptyOutcomeCounts(), current_org_keys: new Set(),
        direct_branch_keys: new Set(), candidate_branch_keys: new Set(),
      }),
      branch,
    );
    (endpoint.correspondence_basis === "FUNCTION_DIRECT"
      ? aggregate.direct_branch_keys
      : aggregate.candidate_branch_keys).add(branch.public_branch_key);
  }
}

const axes = {
  notices: [...noticeAggregates.values()].map((row) => ({
    public_notice_key: row.public_notice_key,
    posted_at: row.posted_at,
    title: row.title,
    source_url: row.source_url,
    branch_count: row.public_branch_keys.size,
    public_branch_keys: [...row.public_branch_keys].sort(),
    terminal_outcome_counts: row.terminal_outcome_counts,
    current_org_count: row.current_org_keys.size,
  })).sort((left, right) => right.posted_at.localeCompare(left.posted_at)
    || left.title.localeCompare(right.title, "ko")),
  regulations: [...regulationAggregates.values()].map((row) => ({
    public_regulation_key: row.public_regulation_key,
    title: row.title,
    source_url: row.source_url,
    notice_count: row.public_notice_keys.size,
    branch_count: row.public_branch_keys.size,
    public_branch_keys: [...row.public_branch_keys].sort(),
    terminal_outcome_counts: row.terminal_outcome_counts,
    current_org_count: row.current_org_keys.size,
    direct_current_org_count: row.direct_org_keys.size,
    candidate_current_org_count: row.candidate_org_keys.size,
  })).sort((left, right) => left.title.localeCompare(right.title, "ko")),
  current_organizations: [...organizationAggregates.values()].map((row) => ({
    current_org_key: row.current_org_key,
    current_org_name: row.current_org_name,
    notice_count: row.public_notice_keys.size,
    regulation_count: row.public_regulation_keys.size,
    branch_count: row.public_branch_keys.size,
    direct_branch_count: row.direct_branch_keys.size,
    candidate_branch_count: row.candidate_branch_keys.size,
    public_branch_keys: [...row.public_branch_keys].sort(),
    public_regulation_keys: [...row.public_regulation_keys].sort(),
  })).sort((left, right) => left.current_org_name.localeCompare(right.current_org_name, "ko")),
};

const researchBacklog = tracePlan.evidence_needs.map((need) => {
  const rawBranches = need.branch_result_ids.map((id) => rawBranchByResultId.get(id));
  assert.ok(rawBranches.every(Boolean), "evidence need references an unknown branch");
  const publicBranchKeys = need.branch_result_ids.map((id) => publicBranchKeyByResultId.get(id)).sort();
  const affectedPublicBranches = publicBranchKeys.map((key) => branchByPublicKey.get(key));
  const lastEvidenceNumbers = sortedUnique(rawBranches.flatMap((branch) => {
    const step = branch.steps.find((item) => item.trace_step_id === branch.result.last_verified_step_id);
    assert.ok(step, "last verified step is missing");
    return step.evidence_links.map((link) => evidenceNumberById.get(link.evidence_reference_id));
  }));
  return {
    public_need_key: publicKey("need", need.evidence_need_id),
    need_kind: need.need_kind,
    required_evidence_description: need.required_evidence_description,
    period_from: need.period_from || null,
    period_to: need.period_to || null,
    current_affected_branch_count: publicBranchKeys.length,
    affected_notice_count: new Set(affectedPublicBranches.map((branch) => branch.public_notice_key)).size,
    affected_regulation_count: new Set(
      affectedPublicBranches.map((branch) => branch.regulation?.public_regulation_key).filter(Boolean),
    ).size,
    public_branch_keys: publicBranchKeys,
    last_evidence_numbers: lastEvidenceNumbers,
  };
}).sort((left, right) => right.current_affected_branch_count - left.current_affected_branch_count
  || left.need_kind.localeCompare(right.need_kind)
  || left.public_need_key.localeCompare(right.public_need_key));

const terminalOutcomes = emptyOutcomeCounts();
for (const branch of branches) terminalOutcomes[branch.terminal_outcome] += 1;
const endpointWidth = {};
for (const branch of branches) endpointWidth[branch.current_endpoint_count] = (endpointWidth[branch.current_endpoint_count] || 0) + 1;
const regulationKeys = new Set(branches.map((branch) => branch.regulation?.public_regulation_key).filter(Boolean));
const organizationKeys = new Set(branches.flatMap((branch) => branch.current_endpoints.map((row) => row.current_org_key)));
const singlePhraseCandidateOnly = branches.filter((branch) =>
  branch.current_endpoint_count === 1
  && branch.current_endpoints.every((row) => row.correspondence_basis === "FUNCTION_PHRASE_CANDIDATE"),
).length;

const snapshot = {
  snapshot_contract: "public-work-trace-snapshot-v1",
  trace_contract_version: tracePlan.trace_contract_version,
  validation_contract_version: tracePlan.validation_contract_version,
  relation_contract_version: tracePlan.relation_contract_version,
  public_run_key: publicKey("run", tracePlan.run.trace_run_id),
  parent_public_run_key: tracePlan.run.parent_trace_run_id
    ? publicKey("run", tracePlan.run.parent_trace_run_id)
    : null,
  release_id: tracePlan.run.release_id,
  evidence_as_of: tracePlan.run.evidence_cutoff_date,
  projected_at: tracePlan.run.completed_at,
  summary: {
    notice_count: new Set(branches.map((branch) => branch.public_notice_key)).size,
    branch_count: branches.length,
    regulation_count: regulationKeys.size,
    current_organization_count: organizationKeys.size,
    terminal_outcomes: terminalOutcomes,
    completion_scopes: tracePlan.summary.completion_scopes,
    correspondence_basis: tracePlan.summary.correspondence_basis,
    endpoint_width: Object.fromEntries(Object.entries(endpointWidth).sort(([left], [right]) => Number(left) - Number(right))),
    official_current_function_observed: terminalOutcomes.COMPLETE,
    single_phrase_candidate_only: singlePhraseCandidateOnly,
    multiple_phrase_candidates: terminalOutcomes.FUNCTION_MULTIPLE_CANDIDATES,
    relation_evidence_gap: terminalOutcomes.RELATION_EVIDENCE_GAP,
  },
  branches,
  axes,
  evidence,
  research_backlog: researchBacklog,
  run_comparisons: [],
  data_literacy: {
    evidence_chain: "사규예고, 규정, 업무분장 등 확인된 자료를 순서대로 연결한 기록입니다. 중간 근거가 없으면 선을 이어 그리지 않습니다.",
    trace_branch: "사규예고 한 건에서 출발해 개정 대상 규정과 현행 업무분장 대조까지 조사한 단위입니다.",
    current_function_assignment: "현재 공식 업무분장 문서에 적힌 업무와 담당 조직입니다. 과거 조직에서 현재 조직으로 이관됐다는 뜻은 아닙니다.",
    official_transfer_path: "조직변경이나 업무이관을 명시한 공식 문서로 중간 단계까지 확인된 경로입니다.",
    phrase_comparison: "규정 문구와 현행 업무분장 문구를 조사 후보로 대조한 결과입니다. 담당 부서 확정이나 조직 승계를 뜻하지 않습니다.",
    source_document_gap: "다음 관계를 확인할 자료가 현재 확보 범위에 없습니다. 관련 사건이나 문서가 존재하지 않는다는 뜻은 아닙니다.",
    relation_evidence_gap: "사규예고와 개정 대상 규정을 직접 잇는 공식 근거를 현재 확인하지 못했습니다.",
    function_unconfirmed: "개정 대상 규정은 확인했지만 현행 업무분장에서 직접 대응하는 관리 문구를 확인하지 못했습니다.",
    multiple_correspondence: "둘 이상의 현행 업무분장 문구가 조사 후보로 확인된 결과입니다. 하나를 대표 부서로 선택하지 않습니다.",
    current_impact: "해당 자료나 근거를 확인하지 못해 현재 추적이 멈춘 분기 수입니다. 자료를 확보하면 모두 해결된다는 예상치는 아닙니다.",
    run_change: "같은 조사 계약에서 근거 자료가 달라졌을 때 증거사슬이 얼마나 연장되거나 정정됐는지를 비교한 값입니다.",
    corrected_run: "후속 실행에서 더 정확한 근거가 확인되어 이전 기록보다 경로가 짧아지거나 내용이 바뀐 경우입니다. 이전 실행은 삭제하지 않습니다.",
  },
};

const forbiddenKey = /(?:^|_)(?:person|public_alias|raw_label|comparison_label|notice_department|residual_id|label_id|org_node_id|function_assignment_id|trace_case_id|branch_result_id|evidence_reference_id|work_observation_id)(?:$|_)/i;
function assertPublicBoundary(value, trail = "snapshot") {
  if (Array.isArray(value)) return value.forEach((item, index) => assertPublicBoundary(item, `${trail}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(!forbiddenKey.test(key), `forbidden public key ${trail}.${key}`);
    assertPublicBoundary(child, `${trail}.${key}`);
  }
}
assertPublicBoundary(snapshot);
assert.deepEqual(snapshot.summary.terminal_outcomes, {
  COMPLETE: 38,
  SOURCE_DOCUMENT_GAP: 0,
  RELATION_EVIDENCE_GAP: 362,
  FUNCTION_CORRESPONDENCE_UNCONFIRMED: 650,
  FUNCTION_MULTIPLE_CANDIDATES: 222,
});
assert.equal(snapshot.summary.single_phrase_candidate_only, 219);
assert.deepEqual(snapshot.summary.endpoint_width, { "0": 793, "1": 257, "2": 104, "3": 118 });
assert.equal(snapshot.branches.every((branch) => branch.steps.every((step) => step.evidence_numbers.length > 0)), true);
assert.equal(snapshot.branches.filter((branch) => branch.terminal_outcome === "FUNCTION_MULTIPLE_CANDIDATES")
  .every((branch) => branch.current_endpoint_count >= 2), true);
assert.equal(snapshot.research_backlog.some((row) => row.need_kind === "FUNCTION_MULTIPLE_CANDIDATES"), false);

await writeFile(OUTPUT_PATH, gzipSync(Buffer.from(JSON.stringify(snapshot)), { level: 9, mtime: 0 }));

const sampleOutcomes = ["COMPLETE", "FUNCTION_MULTIPLE_CANDIDATES", "FUNCTION_CORRESPONDENCE_UNCONFIRMED", "RELATION_EVIDENCE_GAP"];
const examples = sampleOutcomes.map((outcome) => snapshot.branches.find((branch) => branch.terminal_outcome === outcome));
assert.ok(examples.every(Boolean), "fixture outcome example missing");
const fixtureEvidenceNumbers = new Set(examples.flatMap((branch) => [
  ...branch.steps.flatMap((step) => step.evidence_numbers),
  ...branch.current_endpoints.flatMap((endpoint) => endpoint.evidence_numbers),
]));
const fixture = {
  fixture_contract: "public-work-trace-fixture-v1",
  snapshot_contract: snapshot.snapshot_contract,
  examples,
  evidence: snapshot.evidence.filter((row) => fixtureEvidenceNumbers.has(row.evidence_no)),
  data_literacy: snapshot.data_literacy,
};
await writeFile(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  output: path.relative(ROOT, OUTPUT_PATH).replaceAll("\\", "/"),
  fixture: path.relative(ROOT, FIXTURE_PATH).replaceAll("\\", "/"),
  public_run_key: snapshot.public_run_key,
  branches: snapshot.branches.length,
  regulations: snapshot.axes.regulations.length,
  current_organizations: snapshot.axes.current_organizations.length,
  evidence: snapshot.evidence.length,
  research_backlog: snapshot.research_backlog.length,
  terminal_outcomes: snapshot.summary.terminal_outcomes,
}, null, 2));
