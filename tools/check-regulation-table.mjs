import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { filterRegulations, rowsToCsv } from "../packages/common/src/regulations/index.ts";

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
const empty = { query: "", statuses: [], confidence: [], lifecycle: "", verification: "", human: "all" };

assert.equal(rows.length, 1041);
assert.deepEqual(Object.fromEntries(Object.entries(manifest.status_distribution)), {
  "판정대기": 182, "사전예고만": 831, "전문 공개": 23, "출처불명": 5,
});
for (const [status, expected] of [["FULLTEXT_PUBLIC", 23], ["EXTRACTION_PENDING", 182], ["NOTICE_ONLY", 831], ["SOURCE_UNKNOWN", 5]]) {
  assert.equal(filterRegulations(rows, { ...empty, statuses: [status] }).length, expected);
}
assert.equal(filterRegulations(rows, { ...empty, confidence: [5, 4, 3] }).length, 23);
assert.equal(filterRegulations(rows, { ...empty, confidence: [5, 4] }).length, 23);
assert.equal(filterRegulations(rows, { ...empty, confidence: [5] }).length, 0);
assert.equal(filterRegulations(rows, { ...empty, human: "yes" }).length, 0);
assert.equal(filterRegulations(rows, { ...empty, human: "no" }).length, 1041);
assert.equal(filterRegulations(rows, { ...empty, query: "투자옵션부보증 운용기준" }).length, 1);
assert.equal(exceptionRows.length, 5);
assert.equal(rows.filter((row) => row.confidence_level >= 4).length, 23);
assert.equal(rows.filter((row) => ["EXTRACTION_PENDING", "NOTICE_ONLY", "SOURCE_UNKNOWN"].includes(row.public_status_code)).length, 1018);
assert.ok(explorerText.includes("자동·엔진 검증 대기"));
assert.ok(explorerText.includes("미산정 · v0.5 trigger 필요"));
assert.ok(!explorerText.includes("인간 검토 대기 건수"));
assert.ok(loaderText.includes("humanReviewPendingCount: null"));
assert.ok(!loaderText.includes("rows.filter((row) => !row.human_confirmed).length"));
assert.ok(rowsToCsv(rows.slice(0, 1)).startsWith("\uFEFF"));
assert.ok(!manifestText.includes("C:\\") && !manifestText.includes("/Users/") && !manifestText.includes("service_role"));
assert.equal(manifest.release_status, "review_pending");

console.log("regulation table contract: 1041 rows, status 23/182/831/5, downloads 1041/5/23, filters PASS");
