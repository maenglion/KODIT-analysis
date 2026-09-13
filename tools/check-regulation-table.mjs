import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { filterRegulations, processingStatusLabel, rowsToCsv, validOfficialUrl } from "../packages/common/src/regulations/index.ts";

const dataDir = new URL("../apps/public-site/data/review-20260913-reconstructed/", import.meta.url);
function parseCsv(text) {
  const records = []; let record = [], cell = "", quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted && char === '"' && input[i + 1] === '"') { cell += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { record.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && input[i + 1] === "\n") i++; record.push(cell); cell = ""; if (record.some(Boolean)) records.push(record); record = []; }
    else cell += char;
  }
  const [headers, ...values] = records;
  return values.map((fields) => Object.fromEntries(headers.map((header, index) => [header, fields[index] ?? ""])));
}

const rawRows = parseCsv(await readFile(new URL("regulations.csv", dataDir), "utf8"));
const rows = rawRows.map((row) => ({ ...row, nonpublic_stage: Number(row.nonpublic_stage), confidence_level: Number(row.confidence_level), official_source_count: Number(row.official_source_count), search_verification_count: Number(row.search_verification_count), human_confirmed: row.human_confirmed.toLowerCase() === "true" }));
const manifestText = await readFile(new URL("manifest.json", dataDir), "utf8");
const manifest = JSON.parse(manifestText);
const explorerText = await readFile(new URL("../packages/common/src/regulations/RegulationExplorer.tsx", import.meta.url), "utf8");
const cssText = await readFile(new URL("../apps/public-site/app/styles.css", import.meta.url), "utf8");
const loaderText = await readFile(new URL("../apps/public-site/lib/review-data.ts", import.meta.url), "utf8");
const empty = { query: "", statuses: [], lifecycle: "" };

assert.equal(rows.length, 1041);
assert.deepEqual(manifest.status_counts, { FULLTEXT_PUBLIC: 203, NOTICE_ONLY: 831, SOURCE_UNKNOWN: 5, REEVALUATION_PENDING: 2 });
for (const [status, expected] of [["FULLTEXT_PUBLIC", 203], ["NOTICE_ONLY", 831], ["SOURCE_UNKNOWN", 5], ["REEVALUATION_PENDING", 2]]) assert.equal(filterRegulations(rows, { ...empty, statuses: [status] }).length, expected);
assert.equal(filterRegulations(rows, { ...empty, query: "투자옵션부보증 운용기준" }).length, 1);
assert.equal(rows.filter((row) => processingStatusLabel(row).includes("대기")).length, 2);
assert.equal(rows.filter((row) => row.methodology_version === "v0.5" && row.evaluation_provenance === "RECONSTRUCTED_EVALUATION").length, 1041);
assert.ok(explorerText.includes('["규정명", "현재 판정상태", "현행상태", "근거요약", "기준일 / 최근검증일"]'));
for (const removed of ["신뢰도", "confidence_level", "인간확정 여부", "공식출처 수", "엔진 검증 수", "미공개 검증단계", "문서검증 코드"]) assert.ok(!explorerText.includes(removed));
assert.ok(explorerText.includes("평가 근거 원장"));
assert.ok(explorerText.includes("현재 평가"));
assert.ok(explorerText.includes("공식 근거"));
assert.ok(explorerText.includes("문서 처리"));
assert.ok(explorerText.includes("이전 평가"));
assert.ok(explorerText.includes("미해결 사항"));
assert.ok(explorerText.includes('target="_blank" rel="noopener noreferrer"'));
assert.ok(explorerText.includes("상세 보기 →"));
assert.equal(validOfficialUrl("javascript:alert(1)"), null);
assert.equal(validOfficialUrl("https://www.kodit.or.kr/rule.pdf"), "https://www.kodit.or.kr/rule.pdf");
assert.ok(!/\.regulations-table\s*\{[^}]*min-width:\s*1100px/.test(cssText));
assert.ok(cssText.includes(".regulations-table { min-width:0; table-layout:fixed; }"));
assert.ok(loaderText.includes('review-20260913-reconstructed'));
assert.ok(loaderText.includes('row.methodology_version === "v0.5"'));
const csv = rowsToCsv(rows.slice(0, 2));
assert.ok(csv.startsWith("\uFEFF") && csv.includes("\r\n"));
assert.ok(!csv.split("\r\n", 1)[0].includes("confidence_level"));
assert.ok(!csv.split("\r\n", 1)[0].includes("human_confirmed"));
assert.ok(csv.split("\r\n", 1)[0].includes("evidence_summary"));
assert.ok(!manifestText.includes("C:\\") && !manifestText.includes("service_role"));

console.log("regulation table contract: reconstructed 1041, status 203/831/5/2, five-column evidence UI PASS");
