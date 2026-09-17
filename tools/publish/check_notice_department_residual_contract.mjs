#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const migrationPath = "supabase/migrations/20260917000100_notice_department_residual_occurrences.sql";
const migration = fs.readFileSync(migrationPath, "utf8");
const verification = fs.readFileSync("tools/publish/verify_notice_department_residuals.sql", "utf8");

const requiredColumns = [
  "residual_id", "release_id", "notice_id", "residual_code", "raw_label",
  "comparison_label", "posted_at", "title", "source_location",
];
const canonicalLabels = [
  "경영기획부", "성과관리부", "ICT전략부",
  "신용보증부", "자본시장부", "4.0창업부", "플랫폼금융부", "빅데이터부",
  "신용보험부", "기업개선부", "인프라금융부",
  "인재경영부", "업무지원부", "고객지원부", "안전관리관",
  "감사실", "미래전략실", "리스크준법실", "홍보실", "비서실",
];

assert.match(migration, /create table publish\.notice_department_residual_occurrences/i);
for (const column of requiredColumns) assert.match(migration, new RegExp(`\\b${column}\\b`, "i"));
assert.match(migration, /NOTICE_DEPARTMENT_UNMAPPED_RESIDUAL/g);
assert.doesNotMatch(
  migration,
  /ORG_UNMAPPED_RESIDUAL|PERSON_|NOISE_|ORG_HISTORIC|ORG_CURRENT|people_found|orgs_found|rules_found|organization_lineage/i,
);
assert.doesNotMatch(
  migration,
  /\blabel_id\b|\bfirst_seen_at\b|\blast_seen_at\b|\bnotice_count\b|MENTIONS_PERSON|MENTIONS_ORG|MENTIONS_RULE|MENTIONS_WORK|ORG_NODE|SUCCEEDED_BY|PROPOSES_CHANGE_TO|POSSIBLY_INCORPORATED_INTO/i,
);
assert.doesNotMatch(migration, /create\s+(?:table|view)\s+publish\.[a-z0-9_]*labels?\b/i);

for (const label of canonicalLabels) assert.match(migration, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.equal(canonicalLabels.length, 20);
assert.match(migration, /comparison_label\s*=\s*btrim\(raw_label\)/i);
assert.doesNotMatch(migration, /lower\s*\(|regexp_replace\s*\(|unaccent\s*\(|similarity\s*\(/i);

assert.match(migration, /generated always as[\s\S]*notice_department_residual_id/i);
assert.match(migration, /unique \(release_id, notice_id, residual_code\)/i);
assert.match(migration, /foreign key \(release_id, notice_id\)[\s\S]*references publish\.notices/i);
assert.match(migration, /after insert or update of notice_department, posted_date, title, source_location/i);
assert.match(migration, /publish\.guard_approved_snapshot\(\)/i);

const publicRpc = migration.match(/create function publish\.public_department_residual_rows\(\)[\s\S]*?\$\$;/i)?.[0] ?? "";
assert.ok(publicRpc);
assert.match(publicRpc, /security definer/i);
assert.match(publicRpc, /set search_path = ''/i);
assert.match(publicRpc, /publish\.current_release/i);
assert.match(publicRpc, /r\.status = 'approved'/i);
assert.doesNotMatch(publicRpc, /core\.|"case"\.|api\./i);

assert.match(migration, /enable row level security/i);
assert.match(migration, /force row level security/i);
assert.match(migration, /revoke all on table publish\.notice_department_residual_occurrences[\s\S]*from public, anon, authenticated/i);
assert.match(migration, /grant execute on function publish\.public_department_residual_rows\(\)[\s\S]*to anon, authenticated, service_role/i);
assert.doesNotMatch(migration, /create\s+(?:table|function|view)\s+(?:core|"case"|api)\./i);
assert.doesNotMatch(migration, /(?:update|delete\s+from)\s+publish\.notices/i);

for (const expected of [
  "v_notice_count <> 2089",
  "v_canonical_count <> 817",
  "v_residual_count <> 1272",
  "v_distinct_raw_label_count <> 355",
  "v_link_occurrence_count <> 3775",
  "v_missing_notice_count <> 0",
  "v_duplicate_count <> 0",
  "v_group_mismatch_count <> 0",
  "v_projection_mismatch_count <> 0",
]) assert.ok(verification.includes(expected), expected);

console.log(JSON.stringify({
  passed: true,
  migration: migrationPath,
  residual_code: "NOTICE_DEPARTMENT_UNMAPPED_RESIDUAL",
  required_columns: requiredColumns,
  canonical_exact_match_labels: canonicalLabels.length,
  semantic_classification_added: false,
}, null, 2));
