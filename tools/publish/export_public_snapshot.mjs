#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = path.resolve(import.meta.dirname, "../..");
const ENV_PATH = path.join(ROOT, "apps/public-site/.env.local");
const OUTPUT_PATH = path.join(ROOT, "apps/public-site/data/public-snapshot-v1.json.gz");
const PAGE_SIZE = 1000;
const canonicalDepartments = new Set([
  "경영기획부", "성과관리부", "ICT전략부", "신용보증부", "자본시장부", "4.0창업부", "플랫폼금융부", "빅데이터부",
  "신용보험부", "기업개선부", "인프라금융부", "인재경영부", "업무지원부", "고객지원부", "안전관리관", "감사실",
  "미래전략실", "리스크준법실", "홍보실", "비서실",
]);

const localEnv = Object.fromEntries(
  (await fs.readFile(ENV_PATH, "utf8"))
    .split(/\r?\n/)
    .filter((line) => line && line.includes("=") && !line.startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1).replace(/^["']|["']$/g, "")];
    }),
);
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || localEnv.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || localEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
assert.ok(url && key, "public snapshot export requires the existing public Supabase environment");

async function rpc(name, offset = 0, limit = PAGE_SIZE) {
  const response = await fetch(`${url}/rest/v1/rpc/${name}?limit=${limit}&offset=${offset}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Content-Profile": "publish", "Accept-Profile": "publish" },
    body: "{}",
  });
  assert.equal(response.status, 200, `${name} HTTP ${response.status}`);
  return await response.json();
}

async function paged(name) {
  const rows = [];
  for (let offset = 0; offset < 100_000; offset += PAGE_SIZE) {
    const page = await rpc(name, offset);
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
  throw new Error(`${name} pagination overflow`);
}

const [metadata, regulations, notices, rawSources, residuals, residualLabels, attributionExplanations] = await Promise.all([
  rpc("public_release_metadata", 0, 1),
  paged("public_regulation_rows"),
  paged("public_notice_rows"),
  paged("public_regulation_source_rows"),
  paged("public_department_residual_analysis_rows_safe"),
  paged("public_department_residual_label_rows_safe"),
  paged("public_department_attribution_explanation_rows_safe"),
]);

const release = metadata[0];
assert.ok(release, "missing approved release metadata");
assert.equal(regulations.length, Number(release.population));
assert.equal(notices.length, 2089);
assert.equal(residuals.length, 1272);
assert.equal(residualLabels.length, 355);

const publicDepartment = (value) => {
  const exact = typeof value === "string" ? value.trim() : "";
  return exact ? (canonicalDepartments.has(exact) ? exact : "개인·미매핑 표기") : null;
};
const rows = regulations.map((row) => ({ ...row, notice_department: publicDepartment(row.notice_department) }));
const publicNotices = notices.map((row) => ({ ...row, notice_department: publicDepartment(row.notice_department) }));
const sources = rawSources.map(({ release_id, regulation_version_id, regulation_code, source_kind, evidence_role, source_location, attachment_name }) => ({ release_id, regulation_version_id, regulation_code, source_kind, evidence_role, source_location, attachment_name }));
for (const collection of [rows, publicNotices, sources, residuals, residualLabels, attributionExplanations]) {
  assert.ok(collection.every((row) => row.release_id === release.release_id), "mixed release rows in public snapshot");
}
assert.ok(!JSON.stringify({ rows, notices: publicNotices }).includes('"document_sha256"'));

const snapshot = {
  snapshot_contract: "public-static-snapshot-v1",
  release,
  rows,
  notices: publicNotices,
  sources,
  residuals,
  residualLabels,
  attributionExplanations,
};
await fs.writeFile(OUTPUT_PATH, gzipSync(Buffer.from(JSON.stringify(snapshot))));
console.log(JSON.stringify({ output: path.relative(ROOT, OUTPUT_PATH).replaceAll("\\", "/"), release_id: release.release_id, regulations: rows.length, notices: publicNotices.length, residuals: residuals.length, labels: residualLabels.length, explanations: attributionExplanations.length }, null, 2));
