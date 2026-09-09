import assert from "node:assert/strict";
import fs from "node:fs";
import { chooseRegulationDataset, resolveRegulationDataset, rowsToCsv } from "../packages/common/src/regulations/index.ts";

const migration = fs.readFileSync("supabase/migrations/20260909000300_approved_regulation_releases.sql", "utf8");
const workflow = fs.readFileSync(".github/workflows/publish-regulation-release.yml", "utf8");
const publicLoader = fs.readFileSync("apps/public-site/lib/review-data.ts", "utf8");
const scheduleWorkflow = fs.readFileSync(".github/workflows/ten-day-collection.yml", "utf8");
const provenanceMigration = fs.readFileSync("supabase/migrations/20260909000400_regulation_snapshot_provenance.sql", "utf8");
const staging = fs.readFileSync("workers/collector/stage_review_release.py", "utf8");

for (const predicate of ["r.status = 'published'", "r.is_latest", "r.published_at is not null", "r.published_at <= now()"])
  assert.ok(migration.includes(predicate), `missing public release predicate: ${predicate}`);
assert.doesNotMatch(migration.match(/create function api\.public_regulation_rows\(\)[\s\S]*?\$\$;/i)?.[0] ?? "", /storage_path|error_summary|"case"\./i);
assert.match(migration, /publish_regulation_release[\s\S]*security definer set search_path = ''/i);
assert.match(migration, /revoke all on function api\.publish_regulation_release[\s\S]*from public, anon, authenticated, service_role/i);
assert.match(migration, /grant execute on function api\.upsert_draft_regulation_rows[\s\S]*publish_regulation_release[\s\S]*to service_role/i);
assert.match(migration, /published or latest release snapshots are immutable/);
assert.match(provenanceMigration, /source_sha256 char\(64\)/);
assert.match(provenanceMigration, /v_regulation_count <> v_manifest\.source_row_count/);
assert.match(staging, /remote draft snapshot row count differs from source CSV/);
assert.doesNotMatch(migration, /grant execute on function api\.publish_regulation_release[^;]+to (anon|authenticated|public)/i);
for (const input of ["release_id", "confirmation", "approval_note"]) assert.match(workflow, new RegExp(`${input}:`));
assert.match(workflow, /test "\$CONFIRMATION" = "PUBLISH"/);
assert.doesNotMatch(scheduleWorkflow, /publish_regulation_release|publish_release\.py/);
assert.doesNotMatch(publicLoader, /KODIT_SUPABASE_SERVICE_ROLE_KEY|Authorization:/);
assert.match(publicLoader, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
assert.match(publicLoader, /row\.release_status === "published"/);
assert.match(publicLoader, /AbortSignal\.timeout\(5000\)/);
assert.match(publicLoader, /`\?limit=\$\{range\.to - range\.from \+ 1\}&offset=\$\{range\.from\}`/);
assert.match(publicLoader, /const pageSize = 1000/);
assert.match(publicLoader, /console\.warn\("\[regulations\] public RPC fallback"/);
assert.doesNotMatch(publicLoader, /console\.(?:warn|error|log)\([^\n]*(?:config\.key|config\.url|SUPABASE_PUBLISHABLE)/i);

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

const approvedPayload = {
  rows: approved, releaseId: "r1", asOf: "2026-09-08", approvedAt: "2026-09-09T00:00:00Z",
  snapshotRowCount: 1, csvSha256: "a".repeat(64),
};
const fromDb = await resolveRegulationDataset(async () => approvedPayload, fallback);
assert.equal(fromDb.source, "approved");
assert.match(rowsToCsv(fromDb.rows), /approved/);
assert.doesNotMatch(rowsToCsv(fromDb.rows), /fallback/);
const fromEmpty = await resolveRegulationDataset(async () => null, fallback);
assert.equal(fromEmpty.source, "fallback");
let failureObserved = false;
const fromTimeout = await resolveRegulationDataset(async () => { throw new DOMException("timeout", "TimeoutError"); }, fallback, () => { failureObserved = true; });
assert.equal(fromTimeout.source, "fallback");
assert.equal(fromTimeout.rpcFailed, true);
assert.equal(failureObserved, true);
const fallbackCsv = rowsToCsv(fromTimeout.rows);
assert.ok(fallbackCsv.startsWith("\uFEFF"));
assert.ok(fallbackCsv.endsWith("\r\n"));
assert.match(fallbackCsv, /fallback/);
assert.doesNotMatch(fallbackCsv, /approved/);

console.log("approved release contract: published/latest only, service-only approval, fallback/DB switching PASS");
