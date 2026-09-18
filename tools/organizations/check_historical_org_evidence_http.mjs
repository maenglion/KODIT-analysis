import fs from "node:fs";
import assert from "node:assert/strict";

const envPath = "apps/public-site/.env.local";
const local = fs.existsSync(envPath)
  ? Object.fromEntries(fs.readFileSync(envPath, "utf8").split(/\r?\n/).filter((x) => x && !x.startsWith("#") && x.includes("=")).map((x) => {
      const i = x.indexOf("=");
      return [x.slice(0, i), x.slice(i + 1).replace(/^['"]|['"]$/g, "")];
    }))
  : {};
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || local.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || local.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
assert.ok(url && key, "public Supabase environment is required");

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  "Content-Profile": "publish",
  "Accept-Profile": "publish",
};
const catalogResponse = await fetch(`${url}/rest/v1/rpc/public_organization_evidence_catalog_v2`, {
  method: "POST", headers, body: "{}",
});
assert.equal(catalogResponse.status, 200, `catalog HTTP ${catalogResponse.status}`);
const catalog = await catalogResponse.json();
assert.equal(catalog.length, 48);
const detailTarget = catalog.find((row) => row.document_type === "ORG_RULE");
assert.ok(detailTarget, "ORG_RULE detail target missing");
const detailResponse = await fetch(`${url}/rest/v1/rpc/public_organization_evidence_document_detail`, {
  method: "POST", headers, body: JSON.stringify({ p_document_id: detailTarget.document_id }),
});
assert.equal(detailResponse.status, 200, `detail HTTP ${detailResponse.status}`);
const detail = await detailResponse.json();
assert.ok(Array.isArray(detail.snapshots) && detail.snapshots.length === 22);
assert.ok(Array.isArray(detail.functions) && detail.functions.length > 0);
const publicJson = JSON.stringify({ catalog, detail });
for (const forbidden of ["extracted_text", "input_context_hash", "residual_id", "raw_label", "person", "confidence", "human_confirmed"]) {
  assert.ok(!publicJson.toLowerCase().includes(forbidden), `public payload contains ${forbidden}`);
}

const coreResponse = await fetch(`${url}/rest/v1/organization_document_series?select=*`, {
  headers: { apikey: key, Authorization: `Bearer ${key}`, "Accept-Profile": "core" },
});
assert.notEqual(coreResponse.status, 200, "anon must not read core tables");
const publishTableResponse = await fetch(`${url}/rest/v1/current_release?select=*`, {
  headers: { apikey: key, Authorization: `Bearer ${key}`, "Accept-Profile": "publish" },
});
assert.notEqual(publishTableResponse.status, 200, "anon must not read publish base tables");

console.log(JSON.stringify({
  catalog_http: catalogResponse.status,
  detail_http: detailResponse.status,
  catalog_rows: catalog.length,
  detail_snapshots: detail.snapshots.length,
  detail_functions: detail.functions.length,
  core_direct_status: coreResponse.status,
  publish_direct_status: publishTableResponse.status,
}, null, 2));
