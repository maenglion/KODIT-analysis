import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const report = path.join(root, "reports/measurements/2026-09-19-topic-membership-v2");
const [summary, members, contract] = await Promise.all([
  readFile(path.join(report, "summary.json"), "utf8").then(JSON.parse),
  readFile(path.join(report, "member-review.json"), "utf8").then(JSON.parse),
  readFile(path.join(root, "config/topic-membership-v2.json"), "utf8").then(JSON.parse),
]);

assert.equal(summary.contract_version, "topic-membership-v2");
assert.equal(contract.contract_version, summary.contract_version);
assert.equal(members.length, summary.v2_notices);
const familyByCode = new Map(contract.families.filter((family) => family.status === "APPROVED_CHILD_FAMILY").map((family) => [family.family_code, family]));
assert.equal(familyByCode.size, 9);
const seen = new Set();
const notices = members.map((row) => {
  assert.equal(row.membership_contract, "topic-membership-v2");
  assert.equal(row.topic_code, "INVESTMENT_GUARANTEE");
  assert.match(row.posted_date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(row.notice_number && !seen.has(row.notice_number), "notice numbers must be unique");
  assert.ok(row.child_families.length && row.child_families.every((code) => familyByCode.has(code)));
  seen.add(row.notice_number);
  const sourceUrl = /^https:\/\/www\.kodit\.or\.kr\//.test(row.source_location ?? "") ? row.source_location : null;
  return {
    number: row.notice_number,
    title: row.title,
    date: row.posted_date,
    sourceUrl,
    families: row.child_families,
    evidence: row.evidence_basis,
  };
});
assert.equal(new Set(notices.map((row) => row.number)).size, summary.v2_notices);

const publicSnapshot = {
  contract: "topic-public-static-v2",
  measuredAt: "2026-09-19",
  membershipContract: summary.contract_version,
  scope: summary.scope_wording,
  noticeCount: summary.v2_notices,
  period: { start: summary.period_start, end: summary.period_end },
  regulationCount: summary.regulation_count,
  yearly: summary.yearly,
  families: summary.child_families.map((item) => ({
    code: item.family_code,
    name: familyByCode.get(item.family_code).name,
    noticeCount: item.notice_count,
    referenceUrl: familyByCode.get(item.family_code).official_reference_url,
  })),
  mostMentioned: summary.top_mentioned_regulations.slice(0, 5).map((row) => ({ name: row.canonical_name, count: row.notice_count })),
  mostProposed: summary.top_proposed_change_regulations.slice(0, 5).map((row) => ({ name: row.canonical_name, count: row.notice_count })),
  notices,
};
const destination = path.join(root, "apps/public-site/data/topic-public-v2.json");
await writeFile(destination, `${JSON.stringify(publicSnapshot, null, 2)}\n`);
console.log(`Wrote ${destination} (${notices.length} approved notices, ${publicSnapshot.families.length} families)`);
