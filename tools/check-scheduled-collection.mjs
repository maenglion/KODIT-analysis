import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/20260909000100_ten_day_collection_schedule.sql", "utf8");
const pendingMigration = fs.readFileSync("supabase/migrations/20260909000200_include_review_pending_in_collection_state.sql", "utf8");
const workflow = fs.readFileSync(".github/workflows/ten-day-collection.yml", "utf8");
const collector = fs.readFileSync("workers/collector/scheduled_collection.py", "utf8");
const ui = fs.readFileSync("apps/public-site/lib/review-data.ts", "utf8");

for (const token of ["job_code", "trigger_type", "scheduled_for", "completed_at", "last_successful_at", "next_due_at", "collected_count", "changed_count", "failed_source_count", "error_summary", "draft_release_id"]) {
  assert.ok(migration.includes(token), `missing schedule field: ${token}`);
}
assert.match(workflow, /cron: ["']20 18 \* \* \*["']/);
assert.match(workflow, /workflow_dispatch:/);
assert.match(workflow, /permissions:\s*\n\s*contents: read/);
assert.match(workflow, /concurrency:/);
assert.doesNotMatch(workflow, /pull_request|workflow_run|repository_dispatch/);
assert.match(migration, /last_successful_at \+ interval '10 days'/);
assert.match(migration, /crawl_runs_one_running_job_idx/);
assert.match(migration, /status = 'running'/);
assert.match(migration, /p_status in \('succeeded', 'no_change'\).*p_completed_at \+ interval '10 days'/s);
assert.match(migration, /'draft'.*false/s);
assert.doesNotMatch(migration, /update\s+core\.releases[\s\S]{0,200}(published|is_latest)/i);
assert.match(migration, /next_verification_engine.*grok/);
assert.match(migration, /search_verification_count.*default 0/);
for (const fn of ["collection_job_state", "claim_collection_run", "complete_collection_run"]) {
  assert.match(migration, new RegExp(`security definer set search_path = ''[\\s\\S]+?${fn}|${fn}[\\s\\S]+?security definer set search_path = ''`, "i"));
  assert.match(migration, new RegExp(`grant execute on function api\\.${fn}[\\s\\S]+?to service_role`, "i"));
}
assert.doesNotMatch(workflow, /echo.*(SUPABASE|SERVICE_ROLE)|upload-artifact/i);
assert.doesNotMatch(collector, /print\([^\n]*(service_key|\.key)/i);
assert.match(collector, /HWP\/HWPX never become full-text-public/);
assert.match(ui, /collection_job_state/);
assert.match(pendingMigration, /assigned_by like 'regenerator:%:review_pending'/);
assert.match(pendingMigration, /workflow_status = 'verification_pending'/);
console.log("scheduled collection contract: PASS");
