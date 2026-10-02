import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const snapshot = JSON.parse(gunzipSync(readFileSync(join(root, "apps/public-site/data/public-snapshot-v1.json.gz"))).toString("utf8"));
const archive = JSON.parse(readFileSync(join(root, "config/historical-enacted-org-corpus-v1.json"), "utf8"));
const outputPath = join(root, "apps/public-site/data/organization-public-history-v1.json");
const documentPattern = /직제규정|본부점\s*세부운영기준|직무전결요령|조직(?:개편|규정|운영)/;
const seriesNames = { ORGANIZATION_RULE: "직제규정", BRANCH_OPERATION: "본부점 세부운영기준", DELEGATION: "직무전결요령" };
const isPublic = (value) => { try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol); } catch { return false; } };

const notices = snapshot.notices.filter((notice) => documentPattern.test(notice.title) && isPublic(notice.source_location))
  .map(({ notice_number, title, posted_date, source_location }) => ({ id: notice_number, title, date: posted_date, url: source_location }))
  .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title, "ko"));
const published = snapshot.rows.filter((row) => documentPattern.test(row.display_name) && isPublic(row.source_location))
  .map(({ regulation_version_id, display_name, revision_date, source_location, availability }) => ({ id: regulation_version_id, title: display_name, date: revision_date, url: source_location, availability }))
  .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || a.title.localeCompare(b.title, "ko"));
const enacted = archive.versions.map((version, index) => {
  const base = archive.archives[version.series];
  assert.ok(base && seriesNames[version.series], `unrecognized official document series: ${version.series}`);
  const fileNumber = version.file_no ?? base.file_no;
  const url = `https://www.alio.go.kr/download/rulefiledown.json?fileNo=${fileNumber}${version.archive_index == null ? "" : `#entry=${version.archive_index}`}`;
  return {
    id: `${version.series}-${version.revision_date}-${index}`,
    title: version.file_name ?? `${seriesNames[version.series]} (${version.revision_date} 개정, 공식 보존 ZIP 묶음)` ,
    series: seriesNames[version.series],
    date: version.effective_date ?? version.revision_date,
    dateBasis: version.effective_date ? "시행일" : "개정일(시행일 미확인)",
    revisionDate: version.revision_date,
    url,
    archiveBundle: version.archive_index != null,
  };
}).sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title, "ko"));

const eventMap = new Map();
for (const label of snapshot.residualLabels) for (const edge of label.lineage_edges) {
  if (edge.relation_type !== "FUNCTION_TRANSFERRED_TO" || !isPublic(edge.evidence_url)) continue;
  const key = `${edge.effective_date}:${edge.from_name}:${edge.to_name}:${edge.edge_scope}`;
  eventMap.set(key, { id: key, date: edge.effective_date, from: edge.from_name, to: edge.to_name, scope: edge.edge_scope, url: edge.evidence_url, relation: "FUNCTION_TRANSFER" });
}
const events = [...eventMap.values()].sort((a, b) => a.date.localeCompare(b.date));
assert.equal(snapshot.release.release_id, "47c5562f-b3be-5105-8e4f-dca2f56574f6", "approved snapshot changed; review projection before publishing");
assert.equal(archive.contract_version, "historical-enacted-org-corpus-v1");
assert.equal(events.length, 2, "only two function-transfer events have been publicly verified; review new evidence before publishing");
assert.equal(enacted.length, 31);
assert.equal(published.length, 3);
const output = {
  contract: "organization-public-history-v1",
  releaseId: snapshot.release.release_id,
  noticeEvidenceAsOf: snapshot.release.evidence_as_of,
  enactedEvidenceAsOf: archive.evidence_as_of,
  eventMeaning: "확인된 특정 기능의 담당 이동. 조직 전체 명칭변경·승계 또는 신설을 뜻하지 않음",
  events,
  notices,
  published,
  enacted,
  confirmedCreations: [],
};
const encoded = `${JSON.stringify(output, null, 2)}\n`;
if (process.argv.includes("--check")) assert.equal(readFileSync(outputPath, "utf8"), encoded, "public organization history projection is stale");
else writeFileSync(outputPath, encoded);
console.log(`public organization history ${process.argv.includes("--check") ? "verified" : "generated"}: ${events.length} scoped events, ${notices.length} notices, ${published.length} current published rules, ${enacted.length} archived versions, 0 confirmed creations`);
