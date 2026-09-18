import assert from "node:assert/strict";
import fs from "node:fs";

const envPath = "apps/public-site/.env.local";
const localEnv = fs.existsSync(envPath)
  ? Object.fromEntries(
      fs
        .readFileSync(envPath, "utf8")
        .split(/\r?\n/)
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const separator = line.indexOf("=");
          return [
            line.slice(0, separator),
            line.slice(separator + 1).replace(/^["']|["']$/g, ""),
          ];
        }),
    )
  : {};

const supabaseUrl = (
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? localEnv.NEXT_PUBLIC_SUPABASE_URL ?? ""
).replace(/\/$/, "");
const publishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  localEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "";

assert.ok(supabaseUrl && publishableKey, "public Supabase environment is required");

const headers = {
  apikey: publishableKey,
  Authorization: `Bearer ${publishableKey}`,
  "Content-Type": "application/json",
  "Content-Profile": "publish",
  "Accept-Profile": "publish",
};

async function rpc(name, body = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 200, `${name} HTTP ${response.status}`);
  return response.json();
}

const summary = await rpc("public_topic_summary_v1");
assert.equal(summary.length, 2);

const byTopic = Object.fromEntries(summary.map((row) => [row.topic_code, row]));
assert.equal(Number(byTopic.LITIGATION.notice_count), 21);
assert.equal(Number(byTopic.INVESTMENT_GUARANTEE.notice_count), 18);

const [litigationRows, investmentRows, invalidRows] = await Promise.all([
  rpc("public_topic_notice_rows_v1", { p_topic_code: "LITIGATION" }),
  rpc("public_topic_notice_rows_v1", { p_topic_code: "INVESTMENT_GUARANTEE" }),
  rpc("public_topic_notice_rows_v1", { p_topic_code: "NOT_A_TOPIC" }),
]);

assert.equal(litigationRows.length, 21);
assert.equal(investmentRows.length, 18);
assert.equal(invalidRows.length, 0);
assert.equal(new Set(litigationRows.map((row) => row.notice_id)).size, 21);
assert.equal(new Set(investmentRows.map((row) => row.notice_id)).size, 18);

const directCore = await fetch(
  `${supabaseUrl}/rest/v1/topic_notice_memberships?select=topic_membership_id&limit=1`,
  {
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
      "Accept-Profile": "core",
    },
  },
);
assert.notEqual(directCore.status, 200, "anon must not read the core ledger directly");

console.log(
  JSON.stringify(
    {
      http: 200,
      summary_rows: summary.length,
      litigation_rows: litigationRows.length,
      investment_guarantee_rows: investmentRows.length,
      invalid_topic_rows: invalidRows.length,
      direct_core_status: directCore.status,
    },
    null,
    2,
  ),
);
