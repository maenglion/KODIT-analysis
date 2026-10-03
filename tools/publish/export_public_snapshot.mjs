#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = path.resolve(import.meta.dirname, "../..");
const ENV_PATH = path.join(ROOT, "apps/public-site/.env.local");
const OUTPUT_PATH = path.join(ROOT, "apps/public-site/data/public-snapshot-v2.json.gz");
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

const [metadata, regulations, notices, rawSources, residuals, residualLabels, personResidualObservations, organizationAttributionExplanations] = await Promise.all([
  rpc("public_release_metadata", 0, 1),
  paged("public_regulation_rows"),
  paged("public_notice_rows"),
  paged("public_regulation_source_rows"),
  paged("public_department_residual_analysis_rows_safe"),
  paged("public_department_residual_label_rows_safe"),
  paged("public_person_residual_observation_rows"),
  paged("public_organization_attribution_explanation_rows"),
]);

const release = metadata[0];
assert.ok(release, "missing approved release metadata");
assert.equal(regulations.length, Number(release.population));
assert.equal(notices.length, 2089);
assert.equal(residuals.length + personResidualObservations.length, 1272);
assert.equal(residualLabels.length + new Set(personResidualObservations.map((row) => row.public_alias)).size, 355);
const personAliasPattern = /^[ㄱ-ㅎ]+\(\d{4}\)$/;
const personAllowedKeys = ["observation_count", "posted_at", "public_alias", "source_location", "title"];
const forbiddenPersonKey = /(org|organization|department|role|candidate|path|confidence|reasoning|function|assignment|movement)/i;
assert.ok(personResidualObservations.every((row) => personAliasPattern.test(row.public_alias)), "PERSON observation must use the approved public alias");
assert.ok(personResidualObservations.every((row) => JSON.stringify(Object.keys(row).sort()) === JSON.stringify(personAllowedKeys)), "PERSON observation schema must contain only the five approved public keys");
assert.ok(personResidualObservations.every((row) => Object.keys(row).every((key) => !forbiddenPersonKey.test(key))), "PERSON observation contains an organization-shaped key");
assert.equal(new Set(personResidualObservations.map((row) => row.public_alias)).size, 317);
assert.ok(personResidualObservations.every((row) => Number(row.observation_count) === 1), "PERSON observation count must use occurrence grain");
assert.equal(residuals.filter((row) => row.label_type === "PERSON").length, 0, "mixed residual contract must not contain PERSON rows");
assert.equal(residualLabels.filter((row) => row.label_type === "PERSON").length, 0, "mixed label contract must not contain PERSON rows");
assert.ok(organizationAttributionExplanations.every((row) => !Object.hasOwn(row, "label_type")), "ORG attribution schema must not expose a PERSON discriminator");
assert.ok(organizationAttributionExplanations.every((row) => !personAliasPattern.test(row.display_label)), "PERSON-to-ORG public relationship detected");

const publicDepartment = (value) => {
  const exact = typeof value === "string" ? value.trim() : "";
  return exact ? (canonicalDepartments.has(exact) ? exact : "개인·미매핑 표기") : null;
};
const rows = regulations.map((row) => ({ ...row, notice_department: publicDepartment(row.notice_department) }));
const publicNotices = notices.map((row) => ({ ...row, notice_department: publicDepartment(row.notice_department) }));
const sources = rawSources.map(({ release_id, regulation_version_id, regulation_code, source_kind, evidence_role, source_location, attachment_name }) => ({ release_id, regulation_version_id, regulation_code, source_kind, evidence_role, source_location, attachment_name }));
for (const collection of [rows, publicNotices, sources, residuals, residualLabels, organizationAttributionExplanations]) {
  assert.ok(collection.every((row) => row.release_id === release.release_id), "mixed release rows in public snapshot");
}
assert.ok(!JSON.stringify({ rows, notices: publicNotices }).includes('"document_sha256"'));

const snapshot = {
  snapshot_contract: "public-static-snapshot-v2",
  release,
  rows,
  notices: publicNotices,
  sources,
  residuals,
  residualLabels,
  personResidualObservations,
  organizationAttributionExplanations,
};
await fs.writeFile(OUTPUT_PATH, gzipSync(Buffer.from(JSON.stringify(snapshot))));
console.log(JSON.stringify({ output: path.relative(ROOT, OUTPUT_PATH).replaceAll("\\", "/"), release_id: release.release_id, regulations: rows.length, notices: publicNotices.length, nonperson_residuals: residuals.length, nonperson_labels: residualLabels.length, person_observations: personResidualObservations.length, organization_explanations: organizationAttributionExplanations.length }, null, 2));
