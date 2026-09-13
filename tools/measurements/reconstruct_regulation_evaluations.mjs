#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const LEGACY_DIR = path.join(ROOT, "apps/public-site/data/review-20260908");
const OUTPUT_DIR = path.join(ROOT, "reports/measurements/2026-09-13-reconstructed-evaluation");
const SNAPSHOT_DIR = path.join(ROOT, "apps/public-site/data/review-20260913-reconstructed");
const EVALUATED_AT = "2026-09-13T21:00:00+09:00";

const sources = {
  legacyCsv: path.join(LEGACY_DIR, "regulations.csv"),
  legacyManifest: path.join(LEGACY_DIR, "manifest.json"),
  hwp: path.join(ROOT, "reports/measurements/2026-09-13-runtime-v1-reproduction/hwp/batch-run.json"),
  hwpx: path.join(ROOT, "reports/measurements/2026-09-13-runtime-v1-reproduction/hwpx/batch-run.json"),
  pdf: path.join(ROOT, "reports/measurements/2026-09-13-pdf-full-corpus/batch-run.json"),
};

function parseCsv(text) {
  const records = []; let record = [], cell = "", quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted && char === '"' && input[i + 1] === '"') { cell += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { record.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[i + 1] === "\n") i++;
      record.push(cell); cell = "";
      if (record.some((value) => value !== "")) records.push(record);
      record = [];
    } else cell += char;
  }
  if (cell || record.length) { record.push(cell); records.push(record); }
  const [headers, ...rows] = records;
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

const csvCell = (value) => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const toCsv = (columns, rows) => "\uFEFF" + [
  columns.join(","),
  ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
].join("\r\n") + "\r\n";
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileSha = async (file) => sha256(await fs.readFile(file));

function representation(batchName, item) {
  const attempt = item.attempts?.[0] ?? {};
  const format = batchName === "pdf" ? "PDF" : batchName === "hwp" ? "HWP" : "HWPX";
  const identified = batchName === "pdf" ? item.outcome === "SUCCESS" : item.classification === "PARSE_OK_AND_IDENTIFIED";
  return {
    format,
    source_path: item.relative_path,
    input_sha256: item.baseline_sha256,
    extraction_outcome: attempt.result ?? item.outcome ?? "UNKNOWN",
    parser_name: attempt.parser_name ?? "",
    parser_version: attempt.parser_version ?? "",
    runtime_version: attempt.runtime_version ?? "",
    environment_fingerprint: attempt.environment_fingerprint ?? "",
    parser_run_id: attempt.parser_run_id ?? "",
    extract_hash: attempt.extract_hash ?? "",
    identity_result: batchName === "pdf" ? "NOT_EVALUATED" : identified ? "MATCHED" : "UNRESOLVED",
    evidence_as_of: attempt.evidence_as_of ?? "",
    verified_official_fulltext: identified,
  };
}

const statusLabels = {
  FULLTEXT_PUBLIC: "전문 공개",
  NOTICE_ONLY: "사전예고만",
  SOURCE_UNKNOWN: "출처불명",
  REEVALUATION_PENDING: "재평가 대기",
};

const [legacyText, legacyManifestText, hwpText, hwpxText, pdfText] = await Promise.all([
  fs.readFile(sources.legacyCsv, "utf8"), fs.readFile(sources.legacyManifest, "utf8"),
  fs.readFile(sources.hwp, "utf8"), fs.readFile(sources.hwpx, "utf8"), fs.readFile(sources.pdf, "utf8"),
]);
const legacyRows = parseCsv(legacyText);
const legacyManifest = JSON.parse(legacyManifestText);
const batches = { hwp: JSON.parse(hwpText), hwpx: JSON.parse(hwpxText), pdf: JSON.parse(pdfText) };
assert.equal(legacyRows.length, 1041);

const evidenceBySha = new Map();
for (const [name, batch] of Object.entries(batches)) {
  for (const item of batch.results) evidenceBySha.set(item.baseline_sha256, { batchName: name, batch, item });
}

const evaluations = legacyRows.map((legacy) => {
  const linked = legacy.document_sha256 ? evidenceBySha.get(legacy.document_sha256) : null;
  const rep = linked ? representation(linked.batchName, linked.item) : null;
  let status = "REEVALUATION_PENDING";
  let reasonCode = "DETERMINISTIC_LINKAGE_MISSING";
  let reason = "최신 문서 측정과 이 규정 버전을 결정적으로 연결하지 못해 재평가를 보류했습니다.";
  let evidenceSummary = "최신 재평가 대기";
  let unresolvedReason = "IDENTITY_OR_LINKAGE_UNRESOLVED";

  if (rep?.verified_official_fulltext) {
    status = "FULLTEXT_PUBLIC";
    reasonCode = "VERIFIED_OFFICIAL_REPRESENTATION";
    reason = `공식 ${rep.format} representation에서 본문 추출과 규정 동일성이 확인되었습니다.`;
    evidenceSummary = `공식 전문 확인 · ${rep.format}`;
    unresolvedReason = "";
  } else if (linked && rep && rep.identity_result === "UNRESOLVED") {
    reasonCode = "IDENTITY_RESIDUAL_CANDIDATE";
    reason = "공식 문서는 정상 파싱됐지만 보존된 규정 식별정보와 본문 동일성이 해결되지 않았습니다.";
    evidenceSummary = "문서 확인 · 동일성 재평가 대기";
    unresolvedReason = "IDENTITY_RESIDUAL_CANDIDATE";
  } else if (legacy.public_status_code === "NOTICE_ONLY") {
    status = "NOTICE_ONLY";
    reasonCode = "VERIFIED_OFFICIAL_NOTICE_WITHOUT_LINKED_FULLTEXT";
    reason = "공식 사전예고 근거는 연결되어 있으나 해당 규정 버전의 검증된 전문 representation은 연결되지 않았습니다.";
    evidenceSummary = "공식 사전예고 확인";
    unresolvedReason = "FULLTEXT_REPRESENTATION_NOT_LINKED";
  } else if (legacy.public_status_code === "SOURCE_UNKNOWN") {
    status = "SOURCE_UNKNOWN";
    reasonCode = "OFFICIAL_SOURCE_LINKAGE_UNRESOLVED";
    reason = "전문 후보 기록은 있으나 공식 원출처와 문서의 결정적 연결 근거가 없습니다.";
    evidenceSummary = "원출처 미확인";
    unresolvedReason = "SOURCE_LINKAGE_RESIDUAL_CANDIDATE";
  }

  const evidenceRefs = [];
  if (rep && linked) evidenceRefs.push({
    evidence_type: "PARSER_RUNTIME_MEASUREMENT",
    batch_run_id: linked.batch.batch_run_id,
    parser_run_id: rep.parser_run_id,
    document_sha256: rep.input_sha256,
    format: rep.format,
  });
  if (/^https?:\/\//.test(legacy.official_url)) evidenceRefs.push({ evidence_type: "OFFICIAL_URL", url: legacy.official_url });

  return {
    evaluation_id: crypto.randomUUID(),
    regulation_code: legacy.regulation_code,
    regulation_name: legacy.regulation_name,
    provenance: "RECONSTRUCTED_EVALUATION",
    methodology_version: "v0.5",
    evaluated_at: EVALUATED_AT,
    evidence_as_of: rep?.evidence_as_of || legacy.last_verified_at || legacyManifest.finished_at,
    previous_legacy_status: legacy.public_status_code,
    previous_legacy_status_label: legacy.public_status_label,
    previous_legacy_reason_code: legacy.decision_reason_code,
    previous_legacy_reason: legacy.decision_reason,
    reconstructed_status: status,
    reconstructed_status_label: statusLabels[status],
    processing_status: status === "REEVALUATION_PENDING" ? "REEVALUATION_PENDING" : "EVALUATED",
    reason_code: reasonCode,
    reason,
    evidence_summary: evidenceSummary,
    evidence_refs: evidenceRefs,
    representations: rep ? [rep] : [],
    unresolved_reason: unresolvedReason,
    changed: status !== legacy.public_status_code,
  };
});

const evaluationByCode = new Map(evaluations.map((row) => [row.regulation_code, row]));
const snapshotRows = legacyRows.map((legacy) => {
  const current = evaluationByCode.get(legacy.regulation_code);
  assert.ok(current);
  return {
    ...legacy,
    public_status_code: current.reconstructed_status,
    public_status_label: current.reconstructed_status_label,
    lifecycle_code: "unknown",
    document_verification_code: current.processing_status,
    nonpublic_stage: "0",
    decision_reason_code: current.reason_code,
    decision_reason: current.reason,
    last_verified_at: current.evaluated_at,
    methodology_version: "v0.5",
    release_status: "review_pending",
    evaluation_provenance: current.provenance,
    evaluated_at: current.evaluated_at,
    evidence_as_of: current.evidence_as_of,
    processing_status: current.processing_status,
    evidence_summary: current.evidence_summary,
    unresolved_reason: current.unresolved_reason,
    evidence_refs_json: JSON.stringify(current.evidence_refs),
    representations_json: JSON.stringify(current.representations),
    previous_public_status_code: current.previous_legacy_status,
    previous_public_status_label: current.previous_legacy_status_label,
    previous_decision_reason_code: current.previous_legacy_reason_code,
    previous_decision_reason: current.previous_legacy_reason,
    previous_evaluation_date: "2026-09-08",
  };
});

const counts = Object.fromEntries(Object.keys(statusLabels).map((code) => [code, evaluations.filter((row) => row.reconstructed_status === code).length]));
const changedCount = evaluations.filter((row) => row.changed).length;
const unresolvedCount = evaluations.filter((row) => row.unresolved_reason).length;
assert.deepEqual(counts, { FULLTEXT_PUBLIC: 203, NOTICE_ONLY: 831, SOURCE_UNKNOWN: 5, REEVALUATION_PENDING: 2 });
assert.equal(changedCount, 182);

const evaluationText = JSON.stringify({
  evaluation_run_id: crypto.randomUUID(), provenance: "RECONSTRUCTED_EVALUATION", methodology_version: "v0.5",
  evaluated_at: EVALUATED_AT, evidence_as_of: "2026-09-13", population_count: evaluations.length,
  evaluable_count: evaluations.length - counts.REEVALUATION_PENDING, status_counts: counts,
  changed_count: changedCount, unresolved_count: unresolvedCount, evaluations,
}, null, 2) + "\n";
const comparisonColumns = ["regulation_code", "regulation_name", "legacy_status", "reconstructed_status", "changed", "reason_code", "evidence_count", "evidence_type", "unresolved_reason"];
const comparisonRows = evaluations.map((row) => ({
  regulation_code: row.regulation_code, regulation_name: row.regulation_name,
  legacy_status: row.previous_legacy_status, reconstructed_status: row.reconstructed_status,
  changed: row.changed, reason_code: row.reason_code, evidence_count: row.evidence_refs.length,
  evidence_type: row.evidence_refs.map((item) => item.evidence_type).join("|"), unresolved_reason: row.unresolved_reason,
}));
const comparisonText = toCsv(comparisonColumns, comparisonRows);

const sourceHashes = Object.fromEntries(await Promise.all(Object.entries(sources).map(async ([name, file]) => [name, { path: path.relative(ROOT, file).replaceAll("\\", "/"), sha256: await fileSha(file) }])));
const manifest = {
  artifact_type: "REGULATION_RECONSTRUCTED_EVALUATION",
  provenance: "RECONSTRUCTED_EVALUATION",
  methodology_version: "v0.5",
  evaluated_at: EVALUATED_AT,
  evidence_as_of: "2026-09-13",
  population_count: evaluations.length,
  evaluable_count: evaluations.length - counts.REEVALUATION_PENDING,
  status_counts: counts,
  changed_count: changedCount,
  identity_linkage_unresolved_count: counts.REEVALUATION_PENDING,
  source_hashes: sourceHashes,
  safeguards: {
    legacy_snapshot_modified: false, database_modified: false, filename_only_identity_used: false,
    extraction_failure_lowers_availability: false, confidence_derived: false,
  },
};

const columns = Object.keys(snapshotRows[0]);
const snapshotText = toCsv(columns, snapshotRows);
const snapshotManifest = {
  ...manifest,
  release_status: "review_pending",
  data_source: "server-bundled review-20260913-reconstructed",
  result_count: snapshotRows.length,
  status_distribution: {
    "전문 공개": counts.FULLTEXT_PUBLIC, "사전예고만": counts.NOTICE_ONLY,
    "출처불명": counts.SOURCE_UNKNOWN, "재평가 대기": counts.REEVALUATION_PENDING,
  },
  snapshot_sha256: sha256(Buffer.from(snapshotText, "utf8")),
};

await fs.mkdir(OUTPUT_DIR, { recursive: true });
await fs.mkdir(SNAPSHOT_DIR, { recursive: true });
await fs.writeFile(path.join(OUTPUT_DIR, "reconstructed-evaluation.json"), evaluationText);
await fs.writeFile(path.join(OUTPUT_DIR, "comparison-with-v04.csv"), comparisonText);
await fs.writeFile(path.join(OUTPUT_DIR, "manifest.json"), JSON.stringify({
  ...manifest,
  output_hashes: {
    "reconstructed-evaluation.json": sha256(Buffer.from(evaluationText)),
    "comparison-with-v04.csv": sha256(Buffer.from(comparisonText)),
  },
}, null, 2) + "\n");
await fs.writeFile(path.join(OUTPUT_DIR, "README.md"), `# 2026-09-13 reconstructed evaluation\n\n- Provenance: \`RECONSTRUCTED_EVALUATION\`\n- Methodology: \`v0.5\`\n- Population: 1,041\n- Deterministically evaluated: ${evaluations.length - counts.REEVALUATION_PENDING}\n- FULLTEXT_PUBLIC: ${counts.FULLTEXT_PUBLIC}\n- NOTICE_ONLY: ${counts.NOTICE_ONLY}\n- SOURCE_UNKNOWN: ${counts.SOURCE_UNKNOWN}\n- REEVALUATION_PENDING: ${counts.REEVALUATION_PENDING}\n- Changed from v0.4: ${changedCount}\n\nA successful parser result was accepted as fulltext evidence only when the release row's document SHA matched the immutable runtime-v1 measurement and HWP/HWPX identity was resolved. Name-only matches were not used. The legacy 2026-09-08 snapshot and database were not modified.\n`);
await fs.writeFile(path.join(SNAPSHOT_DIR, "regulations.csv"), snapshotText);
await fs.writeFile(path.join(SNAPSHOT_DIR, "manifest.json"), JSON.stringify(snapshotManifest, null, 2) + "\n");

console.log(JSON.stringify({ population: evaluations.length, evaluable: evaluations.length - counts.REEVALUATION_PENDING, counts, changedCount, unresolvedCount }, null, 2));
