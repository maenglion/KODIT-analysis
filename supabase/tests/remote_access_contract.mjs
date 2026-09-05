import assert from "node:assert/strict";
import crypto from "node:crypto";
import pg from "pg";

const { Client } = pg;

const requiredEnvironment = [
  "KODIT_SUPABASE_URL",
  "KODIT_SUPABASE_PUBLISHABLE_KEY",
  "KODIT_SUPABASE_SERVICE_ROLE_KEY",
  "KODIT_SUPABASE_DB_URL",
];

for (const name of requiredEnvironment) {
  if (!process.env[name]) throw new Error(`Missing environment variable: ${name}`);
}

const baseUrl = process.env.KODIT_SUPABASE_URL.replace(/\/$/, "");
const publishableKey = process.env.KODIT_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.KODIT_SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = new URL(process.env.KODIT_SUPABASE_DB_URL);
const database = new Client({
  connectionString: databaseUrl.toString(),
  ssl: ["localhost", "127.0.0.1"].includes(databaseUrl.hostname) ? false : { rejectUnauthorized: false },
});
const createdUserIds = [];
let fixtureId;
let storageObjectPath;
let databaseConnected = false;

async function request(path, { apiKey, bearer, method = "GET", body, schema = "api" } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      apikey: apiKey,
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      "Content-Type": "application/json",
      ...(schema ? { "Accept-Profile": schema, "Content-Profile": schema } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { response, payload };
}

// service_role is deliberately confined to Auth and Storage fixture lifecycle.
function adminRequest(path, options = {}) {
  return request(path, { ...options, apiKey: serviceRoleKey, bearer: serviceRoleKey });
}

function clientRequest(path, token, options = {}) {
  if (token) assert.notEqual(token, serviceRoleKey, "service_role must never be used for access assertions");
  return request(path, { ...options, apiKey: publishableKey, bearer: token });
}

async function uploadFixtureObject(objectPath) {
  const response = await fetch(`${baseUrl}/storage/v1/object/release-artifacts/${objectPath}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "text/plain",
      "x-upsert": "true",
    },
    body: "KODIT access-contract fixture",
  });
  assert.ok(response.ok, "service_role failed to prepare Storage fixture");
}

async function downloadFixtureObject(objectPath, token) {
  return clientRequest(`/storage/v1/object/release-artifacts/${objectPath}`, token, { schema: null });
}

async function createAuthUser(label) {
  const suffix = crypto.randomUUID();
  const email = `kodit-${label}-${suffix}@example.invalid`;
  const password = `K0dit!${crypto.randomBytes(18).toString("base64url")}`;
  const { response, payload } = await adminRequest("/auth/v1/admin/users", {
    method: "POST",
    schema: null,
    body: { email, password, email_confirm: true, user_metadata: { purpose: "kodit-rls-test" } },
  });
  assert.equal(response.status, 200, `failed to create ${label} Auth user`);
  createdUserIds.push(payload.id);
  return { id: payload.id, email, password };
}

async function signIn(user) {
  const { response, payload } = await request("/auth/v1/token?grant_type=password", {
    apiKey: publishableKey,
    method: "POST",
    schema: null,
    body: { email: user.email, password: user.password },
  });
  assert.equal(response.status, 200, "test Auth sign-in failed");
  assert.ok(payload.access_token, "Auth did not return a JWT");
  return payload.access_token;
}

async function setAccess(userId, accessLevel) {
  await database.query(
    "select test_support.admin_set_user_access($1::uuid, $2::text)",
    [userId, accessLevel],
  );
}

async function selectClaims(view, token) {
  const query = new URLSearchParams({
    select: "claim_text,visibility:claim_type",
    subject_id: `eq.${fixtureId}`,
    order: "claim_text.asc",
  });
  return clientRequest(`/rest/v1/${view}?${query}`, token);
}

function claimTexts(payload) {
  return payload.map((row) => row.claim_text).sort();
}

async function cleanup() {
  if (storageObjectPath) {
    await adminRequest("/storage/v1/object/release-artifacts", {
      method: "DELETE",
      schema: null,
      body: { prefixes: [storageObjectPath] },
    }).catch(() => undefined);
  }
  if (fixtureId) {
    await database.query(
      "select test_support.admin_cleanup_access_contract($1::uuid)",
      [fixtureId],
    ).catch(() => undefined);
  }
  for (const userId of createdUserIds) {
    if (databaseConnected) {
      await database.query(
        "select test_support.admin_remove_user_access($1::uuid)",
        [userId],
      ).catch(() => undefined);
    }
    await adminRequest(`/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      schema: null,
    }).catch(() => undefined);
  }
}

try {
  await database.connect();
  databaseConnected = true;

  const generalUser = await createAuthUser("general");
  const officeUser = await createAuthUser("office");
  const internalUser = await createAuthUser("internal");
  await setAccess(generalUser.id, "public");
  await setAccess(officeUser.id, "office");
  await setAccess(internalUser.id, "internal");

  const seeded = await database.query("select test_support.admin_seed_access_contract() as fixture_id");
  fixtureId = seeded.rows[0].fixture_id;
  storageObjectPath = `access-contract/${fixtureId}.txt`;
  await uploadFixtureObject(storageObjectPath);

  const generalJwt = await signIn(generalUser);
  const officeJwt = await signIn(officeUser);
  const internalJwt = await signIn(internalUser);

  const anonPublic = await selectClaims("public_claims", null);
  assert.equal(anonPublic.response.status, 200, "anon cannot read public allowlist");
  assert.deepEqual(claimTexts(anonPublic.payload), ["public fixture"]);

  const anonOffice = await selectClaims("office_claims", null);
  assert.ok(!anonOffice.response.ok, "anon unexpectedly reached office view");
  const anonInternal = await selectClaims("internal_verification_queue", null);
  assert.ok(!anonInternal.response.ok, "anon unexpectedly reached internal view");

  const generalPublic = await selectClaims("public_claims", generalJwt);
  assert.equal(generalPublic.response.status, 200, "general JWT cannot read public allowlist");
  assert.deepEqual(claimTexts(generalPublic.payload), ["public fixture"]);
  const generalOffice = await selectClaims("office_claims", generalJwt);
  assert.ok(!generalOffice.response.ok, "general JWT unexpectedly reached office view");
  const generalInternal = await selectClaims("internal_verification_queue", generalJwt);
  assert.ok(!generalInternal.response.ok, "general JWT unexpectedly reached internal view");

  const anonDownload = await downloadFixtureObject(storageObjectPath, null);
  assert.ok(!anonDownload.response.ok, "anon unexpectedly downloaded an office artifact");
  const generalDownload = await downloadFixtureObject(storageObjectPath, generalJwt);
  assert.ok(!generalDownload.response.ok, "general JWT unexpectedly downloaded an office artifact");

  const officeClaims = await selectClaims("office_claims", officeJwt);
  assert.equal(officeClaims.response.status, 200, "office JWT cannot read office view");
  assert.deepEqual(claimTexts(officeClaims.payload), ["office fixture", "public fixture"]);
  const officeInternal = await selectClaims("internal_verification_queue", officeJwt);
  assert.ok(!officeInternal.response.ok, "office JWT unexpectedly reached internal view");
  const officeDownload = await downloadFixtureObject(storageObjectPath, officeJwt);
  assert.equal(officeDownload.response.status, 200, "office JWT cannot download an approved artifact");

  const internalOffice = await selectClaims("office_claims", internalJwt);
  assert.equal(internalOffice.response.status, 200, "internal JWT cannot read office view");
  assert.deepEqual(claimTexts(internalOffice.payload), ["office fixture", "public fixture"]);
  const internalQueue = await selectClaims("internal_verification_queue", internalJwt);
  assert.equal(internalQueue.response.status, 200, "internal JWT cannot read internal view");
  assert.deepEqual(claimTexts(internalQueue.payload), ["internal fixture", "office fixture", "public fixture"]);
  const internalDownload = await downloadFixtureObject(storageObjectPath, internalJwt);
  assert.equal(internalDownload.response.status, 200, "internal JWT cannot download an approved artifact");

  for (const [label, token] of [
    ["anon", null], ["general", generalJwt], ["office", officeJwt], ["internal", internalJwt],
  ]) {
    const core = await clientRequest("/rest/v1/claims?select=claim_id&limit=0", token, { schema: "core" });
    assert.equal(core.response.status, 406, `${label} can address the core schema through Data API`);
    const caseSchema = await clientRequest("/rest/v1/cases?select=case_id&limit=0", token, { schema: "case" });
    assert.equal(caseSchema.response.status, 406, `${label} can address the case schema through Data API`);
  }

  console.log("Remote access contract passed with anon, office JWT and internal JWT.");
} finally {
  await cleanup();
  if (databaseConnected) await database.end();
}
