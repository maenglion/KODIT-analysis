import assert from "node:assert/strict";
import fs from "node:fs";
import { chooseRegulationDataset } from "../packages/common/src/regulations/index.ts";

const migration = fs.readFileSync("supabase/migrations/20260909000300_approved_regulation_releases.sql", "utf8");
const workflow = fs.readFileSync(".github/workflows/publish-regulation-release.yml", "utf8");
const publicLoader = fs.readFileSync("apps/public-site/lib/review-data.ts", "utf8");
const scheduleWorkflow = fs.readFileSync(".github/workflows/ten-day-collection.yml", "utf8");

for (const predicate of ["r.status = 'published'", "r.is_latest", "r.published_at is not null", "r.published_at <= now()"])
  assert.ok(migration.includes(predicate), `missing public release predicate: ${predicate}`);
assert.doesNotMatch(migration.match(/create function api\.public_regulation_rows\(\)[\s\S]*?\$\$;/i)?.[0] ?? "", /storage_path|error_summary|"case"\./i);
assert.match(migration, /publish_regulation_release[\s\S]*security definer set search_path = ''/i);
assert.match(migration, /revoke all on function api\.publish_regulation_release[\s\S]*from public, anon, authenticated, service_role/i);
assert.match(migration, /grant execute on function api\.upsert_draft_regulation_rows[\s\S]*publish_regulation_release[\s\S]*to service_role/i);
assert.match(migration, /published or latest release snapshots are immutable/);
assert.doesNotMatch(migration, /grant execute on function api\.publish_regulation_release[^;]+to (anon|authenticated|public)/i);
for (const input of ["release_id", "confirmation", "approval_note"]) assert.match(workflow, new RegExp(`${input}:`));
assert.match(workflow, /test "\$CONFIRMATION" = "PUBLISH"/);
assert.doesNotMatch(scheduleWorkflow, /publish_regulation_release|publish_release\.py/);
assert.doesNotMatch(publicLoader, /KODIT_SUPABASE_SERVICE_ROLE_KEY|Authorization:/);
assert.match(publicLoader, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
assert.match(publicLoader, /row\.release_status === "published"/);

const fallback = [{ regulation_code: "fallback" }];
assert.equal(chooseRegulationDataset([], fallback).source, "fallback");
assert.equal(chooseRegulationDataset([], fallback).rows, fallback);
const approved = [{ regulation_code: "approved", release_id: "r1", release_as_of_date: "2026-09-08" }];
assert.equal(chooseRegulationDataset(approved, fallback).source, "approved");
assert.equal(chooseRegulationDataset(approved, fallback).rows, approved);
assert.throws(() => chooseRegulationDataset([
  { regulation_code: "a", release_id: "r1", release_as_of_date: "2026-09-08" },
  { regulation_code: "b", release_id: "r2", release_as_of_date: "2026-09-08" },
], fallback));

console.log("approved release contract: published/latest only, service-only approval, fallback/DB switching PASS");
