#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

function argsOf(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    if (!key || argv[i + 1] === undefined) throw new Error(`invalid argument near ${argv[i] ?? "end"}`);
    result[key] = argv[i + 1];
  }
  return result;
}

function parseCsv(text) {
  const records = [];
  let record = [], cell = "", quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted && char === '"' && input[i + 1] === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { record.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      record.push(cell); cell = "";
      if (record.some((value) => value !== "")) records.push(record);
      record = [];
    } else cell += char;
  }
  if (cell || record.length) { record.push(cell); records.push(record); }
  const [headers, ...rows] = records;
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function csv(columns, rows) {
  const encode = (value) => {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return "\uFEFF" + [columns.join(","), ...rows.map((row) => columns.map((column) => encode(row[column])).join(","))].join("\r\n") + "\r\n";
}

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileSha256 = async (file) => sha256(await fs.readFile(file));
const normalize = (value) => String(value ?? "").normalize("NFKC").replace(/[^0-9A-Za-z가-힣]/g, "").toLowerCase();
const countBy = (rows, key) => rows.reduce((map, row) => map.set(row[key], (map.get(row[key]) ?? 0) + 1), new Map());

const args = argsOf(process.argv.slice(2));
for (const required of ["release-csv", "release-manifest", "extraction-manifest", "alio-json", "preannouncements-json", "rule-mentions", "output-dir"]) {
  if (!args[required]) throw new Error(`missing --${required}`);
}

const executedAt = new Date().toISOString();
const measurementRunId = crypto.randomUUID();
const releaseRows = parseCsv(await fs.readFile(args["release-csv"], "utf8"));
const releaseManifest = JSON.parse(await fs.readFile(args["release-manifest"], "utf8"));
const extractionRows = parseCsv(await fs.readFile(args["extraction-manifest"], "utf8"));
const alioRows = JSON.parse(await fs.readFile(args["alio-json"], "utf8"));
const preannouncementRows = JSON.parse(await fs.readFile(args["preannouncements-json"], "utf8"));
const mentionRows = parseCsv(await fs.readFile(args["rule-mentions"], "utf8"));
const pending = releaseRows.filter((row) => row.public_status_code === "EXTRACTION_PENDING");
assert.equal(pending.length, 182, "measurement population must be the 182 pending rows");

const extractionByUrl = new Map(extractionRows.map((row) => [row.download_url, row]));
const extractionByOwner = Map.groupBy(extractionRows, (row) => row.owner_id);
const extractionBySha = Map.groupBy(extractionRows.filter((row) => row.sha256), (row) => row.sha256);
const alioByName = new Map(alioRows.map((row) => [normalize(row.title), row]));
const preannouncementNumbers = new Set(preannouncementRows.map((row) => String(row.number)));
const verifiedNoticeNames = new Set(mentionRows
  .filter((row) => {
    const attachment = extractionByUrl.get(row.attachment_url);
    return preannouncementNumbers.has(String(row.post_number))
      && /^https?:\/\//.test(row.post_url || "")
      && attachment?.http_status === "200"
      && attachment?.status === "downloaded"
      && Boolean(attachment.content_type)
      && Boolean(attachment.sha256);
  })
  .map((row) => normalize(row.normalized_rule_name || row.rule_name)));

const itemColumns = [
  "measurement_run_id", "regulation_id", "regulation_code", "regulation_name", "legacy_status", "legacy_reason_code",
  "document_sha256", "source_url", "http_status", "content_type", "content_length", "download_status", "magic_verified",
  "detected_format", "extraction_status", "parser_name", "parser_version", "alternate_url_count", "same_sha_alternate_url_count",
  "same_post_pdf_available", "notice_evidence_status", "official_source_evidence_status",
];
const residualColumns = [
  "measurement_run_id", "regulation_id", "regulation_code", "regulation_name", "residual_type", "unclassified_reason",
  "blocking", "observed_basis", "related_document_sha256", "related_url", "detected_at",
];

const items = pending.map((row) => {
  const observed = extractionByUrl.get(row.official_url);
  assert.ok(observed, `no extraction observation for ${row.regulation_code}`);
  assert.equal(observed.sha256, row.document_sha256, `SHA mismatch for ${row.regulation_code}`);
  const sameOwner = extractionByOwner.get(observed.owner_id) ?? [];
  const sameSha = extractionBySha.get(observed.sha256) ?? [];
  const alio = alioByName.get(normalize(row.regulation_name));
  const officialAttachment = alio?.attachments?.some((attachment) => attachment.download_url === row.official_url) ?? false;
  const officialVerified = officialAttachment && observed.status === "downloaded" && observed.http_status === "200" && observed.sha256 === row.document_sha256;
  return {
    measurement_run_id: measurementRunId, regulation_id: "", regulation_code: row.regulation_code,
    regulation_name: row.regulation_name, legacy_status: row.public_status_code, legacy_reason_code: row.decision_reason_code,
    document_sha256: row.document_sha256, source_url: row.official_url, http_status: observed.http_status,
    content_type: observed.content_type, content_length: Number(observed.bytes || 0),
    download_status: observed.status === "downloaded" ? "DOWNLOADED" : observed.status || "UNKNOWN",
    magic_verified: "UNKNOWN", detected_format: row.document_format || "UNKNOWN",
    extraction_status: observed.extraction_status || "UNKNOWN", parser_name: "UNKNOWN", parser_version: "UNKNOWN",
    alternate_url_count: Math.max(0, new Set(sameOwner.map((candidate) => candidate.download_url)).size - 1),
    same_sha_alternate_url_count: Math.max(0, new Set(sameSha.map((candidate) => candidate.download_url)).size - 1),
    same_post_pdf_available: sameOwner.some((candidate) => /\.pdf$/i.test(candidate.filename)) ? "TRUE" : "FALSE",
    notice_evidence_status: verifiedNoticeNames.has(normalize(row.normalized_name || row.regulation_name)) ? "VERIFIED_EXISTS" : "UNKNOWN",
    official_source_evidence_status: officialVerified ? "VERIFIED_EXISTS" : "UNKNOWN",
  };
});

const residuals = items.map((item) => ({
  measurement_run_id: measurementRunId, regulation_id: item.regulation_id, regulation_code: item.regulation_code,
  regulation_name: item.regulation_name,
  residual_type: item.extraction_status === "ole_error:AttributeError" ? "PARSER_RESIDUAL" : "UNCLASSIFIED_RESIDUAL",
  unclassified_reason: item.extraction_status === "ole_error:AttributeError" ? "" : "UNKNOWN_LEGACY_REASON",
  blocking: "TRUE",
  observed_basis: `download=${item.download_status}; http=${item.http_status}; format=${item.detected_format}; sha=matched; extraction=${item.extraction_status}; parser=UNKNOWN`,
  related_document_sha256: item.document_sha256, related_url: item.source_url, detected_at: executedAt,
}));

const summaryRows = [];
const addSummary = (dimension, value, count, notes = "") => summaryRows.push({ dimension, value, count, notes });
addSummary("population", "EXTRACTION_PENDING", items.length, "2026-09-08 release snapshot");
for (const [value, count] of countBy(items, "detected_format")) addSummary("detected_format", value, count);
for (const [value, count] of countBy(items, "extraction_status")) addSummary("extraction_status", value, count);
for (const [value, count] of countBy(residuals, "residual_type")) addSummary("residual_type", value, count);
for (const [value, count] of countBy(items, "notice_evidence_status")) addSummary("notice_evidence_status", value, count);
for (const [value, count] of countBy(items, "official_source_evidence_status")) addSummary("official_source_evidence_status", value, count);
addSummary("field_coverage", "regulation_id_missing", items.filter((item) => !item.regulation_id).length, "not exposed by release snapshot");
addSummary("field_coverage", "magic_verified_unknown", items.filter((item) => item.magic_verified === "UNKNOWN").length);
addSummary("field_coverage", "parser_identity_unknown", items.filter((item) => item.parser_name === "UNKNOWN").length);
addSummary("automatic_resolution_candidate", "PARSER_RETRY_REQUIRED", residuals.filter((row) => row.residual_type === "PARSER_RESIDUAL").length);
addSummary("human_review_trigger", "OPEN", 0, "measurement does not create review triggers");

assert.equal(items.length, 182);
assert.equal(residuals.length, 182);
assert.equal(items.filter((item) => item.http_status === "200" && item.download_status === "DOWNLOADED").length, 182);
assert.equal(items.filter((item) => item.extraction_status === "ole_error:AttributeError").length, 182);
assert.equal(items.filter((item) => item.official_source_evidence_status === "VERIFIED_EXISTS").length, 182);

await fs.mkdir(args["output-dir"], { recursive: true });
const outputs = {
  "measurement_items.csv": csv(itemColumns, items),
  "measurement_residuals.csv": csv(residualColumns, residuals),
  "measurement_summary.csv": csv(["dimension", "value", "count", "notes"], summaryRows),
};
for (const [name, contents] of Object.entries(outputs)) await fs.writeFile(path.join(args["output-dir"], name), contents, "utf8");

const queryContract = {
  population: "public_status_code = EXTRACTION_PENDING",
  join: "release official_url = extraction_manifest.download_url AND document_sha256 equal",
  noticeEvidence: "rule mention post_number exists in stored preannouncement inventory; attachment observation has HTTP 200, successful download, content type, and SHA-256",
  officialEvidence: "ALIO title match plus attachment URL match plus stored HTTP 200/download/SHA match",
  externalHttp: false,
};
const sourceFiles = {};
for (const [logicalName, argument] of [
  ["release_csv", "release-csv"], ["release_manifest", "release-manifest"], ["extraction_manifest", "extraction-manifest"],
  ["alio_inventory", "alio-json"], ["preannouncement_inventory", "preannouncements-json"], ["rule_mentions", "rule-mentions"],
]) sourceFiles[logicalName] = { sha256: await fileSha256(args[argument]) };

const manifest = {
  measurement_run_id: measurementRunId, executed_at: executedAt,
  source_db_snapshot_as_of: releaseManifest.finished_at, source_release_run_id: releaseManifest.run_id,
  source_methodology_version: releaseManifest.methodology_version,
  git_commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  query_hash: sha256(JSON.stringify(queryContract)), query_contract: queryContract,
  row_count: items.length, residual_count: residuals.length, external_http_used: false, rate_limit_policy: "not_applicable",
  remote_db_read_only_observation: {
    project_ref: args["project-ref"] || "UNKNOWN", observation_method: "supabase inspect db table-stats --linked",
    counts_are_estimates: true, core_regulations: 1041, core_release_regulation_rows: 1041, core_documents: 1,
    core_document_urls: 1, core_document_url_observations: 2, core_claim_checks: 5,
    conclusion: "normalized document evidence for the 182 rows is not present in core; measurement joined the immutable release export to its archived extraction evidence",
  },
  identity_limitation: "regulation_id is not exposed by the release snapshot; regulation_code is retained and regulation_id is blank",
  source_files: sourceFiles,
  output_files: Object.fromEntries(await Promise.all(Object.keys(outputs).map(async (name) => [name, {
    sha256: await fileSha256(path.join(args["output-dir"], name)),
    data_rows: name === "measurement_items.csv" ? items.length : name === "measurement_residuals.csv" ? residuals.length : summaryRows.length,
  }]))),
};
await fs.writeFile(path.join(args["output-dir"], "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

console.log(JSON.stringify({ outputDir: args["output-dir"], items: items.length, residuals: residuals.length, summaryRows: summaryRows.length, measurementRunId }, null, 2));
