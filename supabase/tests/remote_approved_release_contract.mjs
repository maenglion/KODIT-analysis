import assert from "node:assert/strict";

const url = process.env.KODIT_SUPABASE_URL?.replace(/\/$/, "");
const publishableKey = process.env.KODIT_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.KODIT_SUPABASE_SERVICE_ROLE_KEY;
const draftReleaseId = process.env.KODIT_TEST_DRAFT_RELEASE_ID;
if (!url || !publishableKey) throw new Error("public Supabase test environment is incomplete");

async function rpc(name, key, body) {
  return fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Content-Profile": "api", "Accept-Profile": "api" },
    body: JSON.stringify(body),
  });
}

const publicRowsResponse = await rpc("public_regulation_rows", publishableKey, {});
assert.equal(publicRowsResponse.status, 200);
const publicRows = await publicRowsResponse.json();
assert.ok(Array.isArray(publicRows));
if (publicRows.length) {
  assert.equal(new Set(publicRows.map((row) => row.release_id)).size, 1);
  assert.ok(publicRows.every((row) => row.release_status === "published"));
  for (const forbidden of ["storage_path", "error_summary", "raw_response", "internal_note"])
    assert.ok(publicRows.every((row) => !(forbidden in row)));
}

const denied = await rpc("publish_regulation_release", publishableKey, {
  p_release_id: draftReleaseId ?? "00000000-0000-0000-0000-000000000000",
  p_confirmation: "PUBLISH", p_approval_note: "access denial check", p_approved_by_actor: "contract-test", p_dry_run: true,
});
assert.ok([401, 403, 404].includes(denied.status), `anon approval RPC unexpectedly returned ${denied.status}`);

if (draftReleaseId) {
  if (!serviceKey) throw new Error("service key is required for an explicit dry-run candidate");
  const dryRun = await rpc("publish_regulation_release", serviceKey, {
    p_release_id: draftReleaseId, p_confirmation: "PUBLISH", p_approval_note: "contract dry run",
    p_approved_by_actor: "contract-test", p_dry_run: true,
  });
  assert.equal(dryRun.status, 200);
  const [result] = await dryRun.json();
  assert.equal(result.result, "dry_run");
}

console.log(`remote approved release contract: public rows ${publicRows.length}, anon approval denied, mutation 0`);
