import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { filterRegulations, processingStatusLabel, publicAvailabilityLabel, rowsToCsv, validOfficialUrl } from "../packages/common/src/regulations/index.ts";

const dataDir = new URL("../apps/public-site/data/review-20260908/", import.meta.url);

function parseCsv(text) {
  const records = [];
  let record = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted && char === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { record.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      record.push(cell); cell = "";
      if (record.some(Boolean)) records.push(record);
      record = [];
    } else cell += char;
  }
  if (cell || record.length) { record.push(cell); records.push(record); }
  const [headers, ...values] = records;
  return values.map((fields) => Object.fromEntries(headers.map((header, i) => [header, fields[i] ?? ""])));
}

const rawRows = parseCsv(await readFile(new URL("regulations.csv", dataDir), "utf8"));
const rows = rawRows.map((row) => ({
  ...row,
  nonpublic_stage: Number(row.nonpublic_stage),
  confidence_level: Number(row.confidence_level),
  official_source_count: Number(row.official_source_count),
  search_verification_count: Number(row.search_verification_count),
  human_confirmed: row.human_confirmed.toLowerCase() === "true",
}));
const exceptionRows = parseCsv(await readFile(new URL("unpublished-unknown.csv", dataDir), "utf8"));
const manifestText = await readFile(new URL("manifest.json", dataDir), "utf8");
const manifest = JSON.parse(manifestText);
const explorerText = await readFile(new URL("../packages/common/src/regulations/RegulationExplorer.tsx", import.meta.url), "utf8");
const loaderText = await readFile(new URL("../apps/public-site/lib/review-data.ts", import.meta.url), "utf8");
const empty = { query: "", statuses: [], lifecycle: "", verification: "" };

assert.equal(rows.length, 1041);
assert.deepEqual(Object.fromEntries(Object.entries(manifest.status_distribution)), {
  "판정대기": 182, "사전예고만": 831, "전문 공개": 23, "출처불명": 5,
});
for (const [status, expected] of [["FULLTEXT_PUBLIC", 23], ["EXTRACTION_PENDING", 182], ["NOTICE_ONLY", 831], ["SOURCE_UNKNOWN", 5]]) {
  assert.equal(filterRegulations(rows, { ...empty, statuses: [status] }).length, expected);
}
assert.equal(filterRegulations(rows, { ...empty, query: "투자옵션부보증 운용기준" }).length, 1);
const legacyPending = rows.find((row) => row.public_status_code === "EXTRACTION_PENDING");
assert.ok(legacyPending);
assert.equal(publicAvailabilityLabel(legacyPending), "미확정");
assert.equal(processingStatusLabel(legacyPending), "v0.5 재평가 대기");
assert.equal(exceptionRows.length, 5);
assert.equal(rows.filter((row) => ["EXTRACTION_PENDING", "NOTICE_ONLY", "SOURCE_UNKNOWN"].includes(row.public_status_code)).length, 1018);
assert.ok(explorerText.includes("이전 기록상 자동·엔진 검증 대상"));
assert.ok(explorerText.includes("미산정 · v0.5 trigger 필요"));
assert.ok(!explorerText.includes("인간 검토 대기 건수"));
assert.ok(!explorerText.includes("신뢰도"));
assert.ok(!explorerText.includes("confidence_level"));
assert.ok(!explorerText.includes("외부전달용 CSV"));
assert.ok(!explorerText.includes("인간확정 여부"));
assert.ok(!explorerText.includes("v0.4 판정 상세"));
assert.ok(explorerText.includes("이전 판정 기록"));
assert.ok(explorerText.includes("현재 처리상태: v0.5 재평가 대기"));
assert.ok(explorerText.includes("이전 판정 상태 · v0.4"));
assert.ok(explorerText.includes('target="_blank" rel="noopener noreferrer"'));
assert.ok(explorerText.includes("상세 보기 →"));
assert.equal(validOfficialUrl("javascript:alert(1)"), null);
assert.equal(validOfficialUrl("ftp://example.com/rule.pdf"), null);
assert.equal(validOfficialUrl("not a url"), null);
assert.equal(validOfficialUrl("https://www.kodit.or.kr/rule.pdf"), "https://www.kodit.or.kr/rule.pdf");
assert.ok(loaderText.includes("humanReviewPendingCount: null"));
assert.ok(!loaderText.includes("rows.filter((row) => !row.human_confirmed).length"));
assert.ok(rowsToCsv(rows.slice(0, 1)).startsWith("\uFEFF"));
assert.ok(!rowsToCsv(rows.slice(0, 1)).split("\r\n", 1)[0].includes("confidence_level"));
assert.ok(!rowsToCsv(rows.slice(0, 1)).split("\r\n", 1)[0].includes("human_confirmed"));
assert.ok(rowsToCsv(rows.slice(0, 1)).split("\r\n", 1)[0].includes("previous_public_status_code"));
assert.ok(rowsToCsv(rows.slice(0, 1)).split("\r\n", 1)[0].includes("current_processing_status"));
assert.ok(!manifestText.includes("C:\\") && !manifestText.includes("/Users/") && !manifestText.includes("service_role"));
assert.equal(manifest.release_status, "review_pending");

console.log("regulation table contract: 1041 rows, status 23/182/831/5, public legacy confidence removed, filters PASS");
