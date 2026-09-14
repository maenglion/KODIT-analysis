#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/20260914000100_publish_read_model.sql", "utf8");
const projector = fs.readFileSync("tools/publish/project_v06_baseline.mjs", "utf8");
const manifest = JSON.parse(fs.readFileSync("reports/projections/2026-09-14-v06-baseline/manifest.json", "utf8"));
const requiredTables = ["releases", "current_release", "regulations", "regulation_sources", "notices", "regulation_changes", "spec_registry"];

assert.match(migration, /create schema if not exists publish;/i);
for (const table of requiredTables) {
  assert.match(migration, new RegExp(`create table publish\\.${table} \\(`, "i"));
}
assert.doesNotMatch(migration, /\b(?:alter|drop|rename|truncate)\b[^;]*(?:core|"?case"?|api)\./i);
assert.doesNotMatch(migration, /references\s+(?:core|"?case"?|api)\./i);
assert.doesNotMatch(migration, /publication_department|confidence|human_confirmed|residual|traceback|claim_check/i);
assert.match(migration, /singleton_key boolean primary key default true check \(singleton_key = true\)/i);
assert.match(migration, /release_id uuid not null references publish\.releases\(release_id\) on delete restrict/i);
assert.match(migration, /alter table %I\.%I force row level security/i);
assert.match(migration, /revoke all on all tables in schema publish from public, anon, authenticated/i);
assert.doesNotMatch(migration, /grant\s+select\s+on\s+(?:all tables in schema publish|publish\.[^;]+)\s+to\s+(?:anon|authenticated)/i);

const rpcDefinitions = [...migration.matchAll(/create function publish\.public_[\s\S]*?\$\$;/gi)].map((match) => match[0]);
assert.equal(rpcDefinitions.length, 4);
for (const definition of rpcDefinitions) {
  assert.match(definition, /security definer/i);
  assert.match(definition, /set search_path = ''/i);
  assert.match(definition, /publish\.current_release/i);
  assert.match(definition, /status = 'approved'/i);
  assert.doesNotMatch(definition, /core\.|"case"\.|api\./i);
}
assert.equal((migration.match(/grant execute on function publish\.public_/gi) ?? []).length, 4);

assert.equal(manifest.baseline_release_id, "9a87d0c2-2901-5fc8-bceb-f068f02b697a");
assert.equal(manifest.baseline_collection_cycle_id, "3773771c-af63-570a-ad4d-1fae255da383");
assert.equal(manifest.coverage.regulations, 1041);
assert.equal(manifest.coverage.source_location_non_null, 1035);
assert.equal(manifest.coverage.source_location_null, 6);
assert.equal(manifest.coverage.notice_department_non_null, 982);
assert.equal(manifest.coverage.document_source_linkage, 1015);
assert.equal(manifest.coverage.regulation_changes, 0);
assert.match(projector, /is_new: false/);
assert.match(projector, /is_updated: false/);
assert.match(projector, /pg_advisory_xact_lock/);
assert.match(projector, /existing baseline release metadata differs/);
assert.match(projector, /current release already points to a different approved release/);

console.log(JSON.stringify({
  passed: true,
  migration_tables: requiredTables,
  public_safe_rpcs: rpcDefinitions.length,
  baseline_release_id: manifest.baseline_release_id,
  coverage: manifest.coverage,
}, null, 2));
