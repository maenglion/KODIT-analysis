#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const migrationPath = "supabase/migrations/20260917000300_extraction_mention_ledger.sql";
const migration = fs.readFileSync(migrationPath, "utf8");
const config = JSON.parse(fs.readFileSync("tools/mentions/mention-v1.json", "utf8"));
const extractor = fs.readFileSync("tools/mentions/mention_extractor.py", "utf8");

assert.match(migration, /create table core\.extraction_mentions\b/i);
assert.match(migration, /references core\.document_extractions\(extraction_id\)/i);
assert.match(migration, /mention_type in \('PERSON', 'ORG', 'RULE', 'WORK', 'EMAIL'\)/i);
assert.match(migration, /core\.extraction_mention_id\([\s\S]*span_start[\s\S]*span_end/i);
assert.match(migration, /raw_text does not match extraction span/i);
assert.match(migration, /extraction_mentions_append_only[\s\S]*core\.reject_history_mutation/i);
assert.match(migration, /enable row level security/i);
assert.match(migration, /force row level security/i);
assert.match(migration, /record_extraction_mentions\(uuid, text, text, jsonb\)[\s\S]*to service_role/i);
assert.match(migration, /extraction_mention_id\(uuid, text, text, integer, integer\)[\s\S]*to service_role/i);
assert.doesNotMatch(migration, /create\s+(?:table|view|function)\s+(?:publish|api|"case")\./i);
assert.doesNotMatch(
  migration,
  /create\s+table\s+core\.(?:labels?|persons?|organizations?|org_nodes?|relations?|topics?)\b/i,
);
assert.doesNotMatch(migration, /grant\s+[^;]+\s+to\s+(?:public|anon|authenticated)/i);

assert.equal(config.mention_contract_version, "mention-v1");
assert.equal(config.rule_dictionary.expected_count, 1041);
assert.equal(config.known_organizations.length, 20);
assert.match(extractor, /zero-based Python\/Unicode code-point offsets/i);
assert.doesNotMatch(extractor, /openai|ollama|grok|gemini|deepseek/i);

console.log(JSON.stringify({
  passed: true,
  migration: migrationPath,
  table: "core.extraction_mentions",
  mention_contract_version: config.mention_contract_version,
  public_rpc_added: false,
  label_or_entity_model_added: false,
}, null, 2));
