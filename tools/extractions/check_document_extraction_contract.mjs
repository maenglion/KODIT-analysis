#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const migrationPath = "supabase/migrations/20260917000200_document_extraction_ledger.sql";
const migration = fs.readFileSync(migrationPath, "utf8");
const architecture = fs.readFileSync("docs/architecture/document-extraction-ledger.md", "utf8");
const gitignore = fs.readFileSync(".gitignore", "utf8");
const runners = [
  "workers/collector/hwp_parser_runner.py",
  "workers/collector/hwpx_parser_runner.py",
  "workers/collector/pdf_parser_runner.py",
].map((path) => [path, fs.readFileSync(path, "utf8")]);

for (const table of [
  "source_attachments",
  "source_attachment_observations",
  "document_extractions",
  "parser_runs",
]) {
  assert.match(migration, new RegExp(`create table core\\.${table}\\b`, "i"));
  assert.match(migration, new RegExp(`alter table core\\.${table} enable row level security`, "i"));
  assert.match(migration, new RegExp(`alter table core\\.${table} force row level security`, "i"));
  assert.match(migration, new RegExp(`${table}_append_only[\\s\\S]*core\\.reject_history_mutation`, "i"));
}

assert.match(migration, /unique \(source_record_id, external_attachment_key\)/i);
assert.match(migration, /unique \(attachment_id, document_url_observation_id\)/i);
assert.match(migration, /unique \(document_sha256, extract_hash, extraction_contract_version\)/i);
assert.match(migration, /extract_hash\s*=\s*encode\([\s\S]*digest\([\s\S]*extracted_text/i);
assert.match(migration, /foreign key \(extraction_id, document_sha256\)/i);
assert.match(migration, /parser_result = 'SUCCESS' and extraction_id is not null/i);
assert.match(migration, /parser_result <> 'SUCCESS' and extraction_id is null/i);
assert.match(migration, /validate_source_attachment_observation/i);
assert.match(migration, /validate_parser_run_links/i);
assert.match(migration, /create function core\.record_parser_execution\(/i);
assert.match(migration, /core\.record_parser_execution\([\s\S]*security invoker[\s\S]*set search_path = ''/i);
assert.match(migration, /grant execute on function core\.record_parser_execution\(uuid, jsonb, jsonb\)[\s\S]*to service_role/i);
assert.match(migration, /revoke all on table core\.parser_runs from service_role/i);

assert.doesNotMatch(migration, /create\s+(?:table|view|function)\s+(?:publish|api|"case")\./i);
assert.doesNotMatch(
  migration,
  /MENTIONS_PERSON|MENTIONS_ORG|MENTIONS_RULE|MENTIONS_WORK|PROPOSES_CHANGE_TO|label_id|organization_lineage|vector|embedding/i,
);
assert.doesNotMatch(migration, /grant\s+[^;]+\s+to\s+(?:public|anon|authenticated)/i);

for (const [path, runner] of runners) {
  assert.match(runner, /extraction_sink/i, path);
  assert.match(runner, /--extraction-output/i, path);
  assert.match(runner, /build_extraction_artifact/i, path);
  assert.match(runner, /write_extraction_artifact/i, path);
}

assert.match(
  architecture,
  /Status: \*\*T02-B COMPLETE — REMOTE INTEGRATION VERIFIED/i,
);
assert.match(architecture, /document_extractions.*immutable derived/is);
assert.match(architecture, /compatibility\/cache/i);
assert.match(gitignore, /^artifacts\/$/m);

console.log(JSON.stringify({
  passed: true,
  migration: migrationPath,
  core_tables_added: 4,
  public_rpc_added: false,
  mention_or_label_model_added: false,
  extraction_contract_version: "v1.0",
}, null, 2));
