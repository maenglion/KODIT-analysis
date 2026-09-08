import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = path.join(root, "supabase", "migrations", "20260905000100_initial_secure_schema.sql");
const configPath = path.join(root, "supabase", "config.toml");
const accessTestPath = path.join(root, "supabase", "tests", "remote_access_contract.mjs");
const accessContractSqlPath = path.join(root, "supabase", "tests", "0001_access_contract.sql");
const fixturePath = path.join(root, "supabase", "tests", "fixtures", "0001_access_contract_fixtures.sql");
const storageDraftPath = path.join(root, "supabase", "drafts", "20260905_storage_policy_draft.sql");
const migration = fs.readFileSync(migrationPath, "utf8");
const config = fs.readFileSync(configPath, "utf8");
const accessTest = fs.readFileSync(accessTestPath, "utf8");
const accessContractSql = fs.readFileSync(accessContractSqlPath, "utf8");
const fixtures = fs.readFileSync(fixturePath, "utf8");
const storageDraft = fs.readFileSync(storageDraftPath, "utf8");
const apiSection = migration.slice(
  migration.indexOf("create function api.current_access_level"),
  migration.indexOf("\ncommit;", migration.indexOf("create function api.current_access_level")),
);

const checks = [];
function check(name, operation) {
  try {
    operation();
    checks.push({ name, passed: true });
  } catch (error) {
    checks.push({ name, passed: false, error: error.message });
  }
}

check("public has zero business tables", () => {
  assert.doesNotMatch(migration, /^\s*create\s+table\s+public\./im);
});
check("core, case and api schemas exist", () => {
  for (const schema of ["core", '"case"', "api"]) {
    assert.match(migration, new RegExp(`create\\s+schema\\s+if\\s+not\\s+exists\\s+${schema}`, "i"));
  }
});
check("normalized URL is not unique", () => {
  assert.doesNotMatch(migration, /normalized_url\s+text\s+unique/i);
  assert.match(migration, /document_url_observations/i);
});
check("HWP result vocabulary and publication gates exist", () => {
  for (const value of ["success", "unsupported_format", "drm", "failed", "skipped_twin_pdf"]) {
    assert.match(migration, new RegExp(`'${value}'`));
  }
  for (const gate of ["hwp_pending_until_extracted", "hwp_fulltext_publication_gate", "validate_hwp_twin_pdf"]) {
    assert.match(migration, new RegExp(gate));
  }
});
check("pending documents cannot advance nonpublic verification", () => {
  assert.match(migration, /validate_status_assignment_gate/);
  assert.match(migration, /EXTRACTION_PENDING document cannot advance/);
});
check("v0.4 evidence and release columns are retained", () => {
  for (const marker of [
    "is_primary", "confidence_level", "search_verification_count", "official_source_count",
    "human_confirmed", "source_type text not null", "changed_record_count", "withdrawal_reason", "is_latest",
  ]) assert.match(migration, new RegExp(marker));
});
check("versioned decision structures coexist", () => {
  assert.match(migration, /unique\(methodology_version, status_code\)/i);
  assert.match(migration, /publication_decision_rules/i);
  assert.match(migration, /supersedes_assignment_id/i);
});
check("all visibility columns have explicit value checks", () => {
  const columns = migration.match(/visibility\s+text\s+not\s+null[^\n]*/gi) ?? [];
  assert.ok(columns.length > 0);
  assert.ok(columns.every((line) => /check\s*\(visibility\s+in\s*\('public',\s*'office',\s*'internal'\)\)/i.test(line)));
});
check("core never references case", () => {
  const coreSection = migration.slice(migration.indexOf("create table core.user_access_profiles"), migration.indexOf('create table "case".cases'));
  assert.doesNotMatch(coreSection, /references\s+"case"\./i);
});
check("api never references case", () => {
  assert.doesNotMatch(apiSection, /"case"\./i);
});
check("raw schemas revoke browser privileges and enable forced RLS", () => {
  assert.match(migration, /revoke all on all tables in schema core,\s*"case" from public, anon, authenticated/i);
  assert.match(migration, /force row level security/i);
  assert.match(migration, /alter default privileges[\s\S]*schema core[\s\S]*revoke all on tables/i);
});
check("initial migration has no Supabase Storage objects or policies", () => {
  assert.doesNotMatch(migration, /storage\.buckets/i);
  assert.doesNotMatch(migration, /storage\.objects/i);
  assert.doesNotMatch(migration, /create\s+policy[^;]+\bon\s+storage\./is);
});
check("Storage SQL is retained only as a non-migration draft", () => {
  for (const marker of [
    "core-documents", "case-documents", "release-artifacts",
    "kodit_internal_core_objects_select", "kodit_office_release_artifacts_select",
    "kodit_internal_core_objects_insert", "kodit_internal_core_objects_update",
    "kodit_internal_core_objects_delete",
  ]) assert.match(storageDraft, new RegExp(marker));
  const migrationsDirectory = path.join(root, "supabase", "migrations") + path.sep;
  assert.ok(!storageDraftPath.startsWith(migrationsDirectory));
  assert.doesNotMatch(config, /drafts/i);
});
check("every API view is security_invoker", () => {
  const views = migration.match(/^\s*create\s+view\s+api\.[^\n]+/gim) ?? [];
  assert.ok(views.length > 0);
  assert.ok(views.every((line) => /security_invoker\s*=\s*true/i.test(line)));
});
check("API definer functions have a fixed path and explicit owner", () => {
  const functions = [...migration.matchAll(/create\s+function\s+api\.[\s\S]*?\$\$;/gi)].map((match) => match[0]);
  assert.equal(functions.length, 10);
  assert.ok(functions.every((definition) => /security\s+definer\s+set\s+search_path\s*=\s*''/i.test(definition)));
  const owners = migration.match(/^alter function api\.[^(]+\([^;]*\) owner to postgres;/gim) ?? [];
  assert.equal(owners.length, functions.length);
});
check("core trigger functions remain invoker-only for browser roles", () => {
  const functions = [...migration.matchAll(/create\s+function\s+core\.[\s\S]*?\$\$;/gi)].map((match) => match[0]);
  assert.equal(functions.length, 3);
  assert.ok(functions.every((definition) => !/security\s+definer/i.test(definition)));
  assert.match(migration, /revoke all on all functions in schema core,\s*"case" from public, anon, authenticated/i);
});
check("function PUBLIC defaults and effective grants are closed", () => {
  assert.match(migration, /alter default privileges for role postgres in schema api revoke execute on functions from public, anon, authenticated/i);
  assert.match(migration, /revoke all on all functions in schema api from public, anon, authenticated, service_role/i);
  assert.doesNotMatch(migration, /grant execute[^;]+\bpublic\b/i);
});
check("definer inputs and publication filters are constrained", () => {
  assert.match(migration, /required_level is null or required_level not in \('public', 'office', 'internal'\)/i);
  for (const marker of [
    "r.visibility = 'public'",
    "f.visibility = 'public' and f.verification_status = 'verified'",
    "e.visibility = 'public'",
    "n.visibility = 'public' and n.published_at is not null",
    "c.visibility = 'public' and c.confidence_gate_passed and c.confidence_level >= 4",
    "r.status = 'published' and r.published_at is not null",
  ]) assert.ok(migration.includes(marker), marker);
});
check("operating API has no access mutation or test administration RPC", () => {
  for (const name of [
    "admin_set_user_access", "admin_remove_user_access",
    "admin_seed_access_contract", "admin_cleanup_access_contract",
  ]) {
    assert.doesNotMatch(migration, new RegExp(`api\\.${name}`, "i"));
    assert.match(fixtures, new RegExp(`test_support\\.${name}`, "i"));
  }
  assert.doesNotMatch(apiSection, /\b(insert\s+into|update|delete\s+from|merge\s+into)\s+core\./i);
});
check("test helpers cannot be reached through PostgREST roles", () => {
  assert.match(fixtures, /create schema if not exists test_support/i);
  assert.match(fixtures, /security invoker/gi);
  assert.match(fixtures, /revoke all on all functions in schema test_support\s+from public, anon, authenticated, service_role/i);
  const schemasLine = config.match(/^schemas\s*=\s*\[[^\n]+/m)?.[0] ?? "";
  assert.doesNotMatch(schemasLine, /"test_support"/);
  assert.doesNotMatch(accessTest, /\/rest\/v1\/rpc\/admin_/i);
  assert.match(accessTest, /database\.query\(\s*"select test_support\./i);
});
check("PostgREST exposes api but not raw schemas", () => {
  const schemasLine = config.match(/^schemas\s*=\s*\[[^\n]+/m)?.[0] ?? "";
  assert.match(schemasLine, /"api"/);
  assert.doesNotMatch(schemasLine, /"core"|"case"|"public"/);
});
check("remote test uses real Auth JWT roles", () => {
  for (const marker of ["generalJwt", "officeJwt", "internalJwt", "grant_type=password"]) {
    assert.match(accessTest, new RegExp(marker));
  }
});
check("SQL tests cover URL topology and historical reproduction", () => {
  const sqlTests = fs.readFileSync(path.join(root, "supabase", "tests", "0002_hwp_and_history.sql"), "utf8");
  for (const marker of [
    "one URL retains multiple document hashes", "one SHA may be discovered at multiple URLs",
    "past methodology decision remains reproducible", "EXTRACTION_PENDING document cannot advance",
  ]) assert.match(sqlTests, new RegExp(marker));
});
check("PostgreSQL 17 definition checks materialize typed API allowlists", () => {
  const functionCalls = accessContractSql.match(/pg_get_functiondef\s*\(\s*oid\s*\)/gi) ?? [];
  const functionScopes = accessContractSql.match(
    /with\s+api_functions\s+as\s+materialized\s*\([\s\S]*?select\s+1\s+from\s+api_functions\s+where\s+pg_get_functiondef\s*\(\s*oid\s*\)/gi,
  ) ?? [];
  assert.equal(functionCalls.length, 2);
  assert.equal(functionScopes.length, 2);
  for (const scope of functionScopes) {
    assert.match(scope, /n\.nspname\s*=\s*'api'/i);
    assert.match(scope, /p\.prokind\s*=\s*'f'/i);
    for (const name of [
      "current_access_level", "has_access", "public_regulation_rows", "public_fact_rows",
      "public_event_rows", "public_notice_rows", "public_claim_rows", "public_release_rows",
      "office_claim_rows", "internal_verification_queue_rows",
    ]) assert.match(scope, new RegExp(`'${name}'`));
    assert.doesNotMatch(scope, /p\.prokind\s*=\s*'[awp]'/i);
  }

  const viewCalls = accessContractSql.match(/pg_get_viewdef\s*\(\s*oid\s*\)/gi) ?? [];
  const viewScopes = accessContractSql.match(
    /with\s+api_views\s+as\s+materialized\s*\([\s\S]*?select\s+1\s+from\s+api_views\s+where\s+pg_get_viewdef\s*\(\s*oid\s*\)/gi,
  ) ?? [];
  assert.equal(viewCalls.length, 1);
  assert.equal(viewScopes.length, 1);
  assert.match(viewScopes[0], /n\.nspname\s*=\s*'api'/i);
  assert.match(viewScopes[0], /c\.relkind\s*=\s*'v'/i);
  for (const name of [
    "public_regulations", "public_facts", "public_events", "public_notices",
    "public_releases", "public_claims", "office_claims", "internal_verification_queue",
  ]) assert.match(viewScopes[0], new RegExp(`'${name}'`));
  assert.doesNotMatch(accessContractSql, /pg_get_triggerdef\s*\(/i);
});
check("service role is restricted to setup and cleanup helper", () => {
  assert.match(accessTest, /function adminRequest/);
  assert.match(accessTest, /service_role must never be used for access assertions/);
  assert.doesNotMatch(accessTest, /adminRequest\("\/rest\/v1\/rpc\//i);
});
check("repository contains no credential values or old project refs", () => {
  const forbidden = /github_pat_|sb_publishable_[A-Za-z0-9_-]{8,}|pecxdwbhhaahbicdqgha|jacyalxzejzrlspmojps/;
  for (const file of walk(root)) {
    if (file === fileURLToPath(import.meta.url)) continue;
    if (file === path.join(root, "tools", "check-vertical-slice.mjs")) continue;
    if (file.includes(`${path.sep}.git${path.sep}`)) continue;
    const stat = fs.statSync(file);
    if (stat.size > 2_000_000) continue;
    assert.doesNotMatch(fs.readFileSync(file, "utf8"), forbidden, file);
  }
});

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if ([".git", ".next", "node_modules", ".pnpm-store", ".temp"].includes(entry.name)) return [];
    if (entry.isSymbolicLink()) return [];
    if (entry.isDirectory()) return walk(target);
    return entry.isFile() ? [target] : [];
  });
}

const failures = checks.filter((item) => !item.passed);
console.log(JSON.stringify({ passed: checks.length - failures.length, failed: failures.length, checks }, null, 2));
if (failures.length) process.exitCode = 1;
