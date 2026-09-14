import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { filterAndSortNotices, filterPublishRegulations, latestNoticeDates, normalizePublicSearch, publishNoticesToCsv, publishRowsToCsv, sortPublishRegulations, validPublicUrl } from "../packages/common/src/regulations/index.ts";

const manifest = JSON.parse(await readFile(new URL("../reports/projections/2026-09-14-v06-baseline-correction/manifest.json", import.meta.url), "utf8"));
const explorerText = await readFile(new URL("../packages/common/src/regulations/RegulationExplorer.tsx", import.meta.url), "utf8");
const loaderText = await readFile(new URL("../apps/public-site/lib/review-data.ts", import.meta.url), "utf8");
const layoutText = await readFile(new URL("../apps/public-site/app/layout.tsx", import.meta.url), "utf8");
const detailText = await readFile(new URL("../apps/public-site/app/regulations/investment-option-guarantee/page.tsx", import.meta.url), "utf8");
const departmentText = await readFile(new URL("../packages/common/src/regulations/DepartmentStatistics.tsx", import.meta.url), "utf8");

const base = {
  release_id: manifest.correction_release_id, regulation_version_id: "00000000-0000-0000-0000-000000000001", regulation_code: "A", display_name: "투자옵션부보증 운용기준", normalized_name: "투자옵션부보증운용기준", availability: "FULLTEXT_PUBLIC", currentness: "unknown", revision_date: "2024-02-23", notice_department: "보증부", official_source_available: true, source_location: "https://www.kodit.or.kr/rule.pdf", partial_alio: false, partial_kodit_page: false, partial_attachment: false, is_new: false, is_updated: false,
};
const rows = [base, { ...base, regulation_version_id: "00000000-0000-0000-0000-000000000002", regulation_code: "B", display_name: "일부 규정", normalized_name: "일부규정", revision_date: null, availability: "PARTIAL_PUBLIC", partial_alio: true }];
const empty = { query: "", availability: "ALL", currentness: "", partialType: "ALL" };

assert.equal(manifest.expected.regulations, 1041);
assert.equal(manifest.expected.notices, 2089);
assert.deepEqual(manifest.expected.availability, { FULLTEXT_PUBLIC: 205, NOTICE_ONLY: 831, SOURCE_UNKNOWN: 5, NULL: 0 });
assert.equal(filterPublishRegulations(rows, { ...empty, query: "투자옵션" }).length, 1);
assert.equal(filterPublishRegulations(rows, { ...empty, query: "투자 옵션 2024" }).length, 1);
assert.equal(normalizePublicSearch("문화(산업), 보증"), "문화 산업 보증");
assert.equal(filterPublishRegulations(rows, { ...empty, availability: "PARTIAL_PUBLIC", partialType: "ALIO" }).length, 1);
assert.equal(filterPublishRegulations(rows, { ...empty, currentness: "unknown" }).length, 2);
assert.equal(validPublicUrl("javascript:alert(1)"), null);
assert.equal(validPublicUrl(base.source_location), base.source_location);

const csv = publishRowsToCsv(rows);
const header = csv.split("\r\n", 1)[0];
assert.ok(csv.startsWith("\uFEFF") && csv.endsWith("\r\n"));
for (const forbidden of ["confidence", "human", "sha256", "parser", "identity", "residual", "provenance"]) assert.ok(!header.toLowerCase().includes(forbidden));
assert.ok(header.includes("official_source_url"));
assert.ok(header.includes("row_number") && header.includes("latest_notice_date") && header.includes("release_id") && header.includes("evidence_as_of"));

const notices = [
  { release_id: manifest.correction_release_id, notice_number: "9", title: "투자 옵션 예고", notice_department: "신용보증부", posted_date: "2026-09-01", source_location: "https://example.test/9", linked_regulation_version_ids: [base.regulation_version_id] },
  { release_id: manifest.correction_release_id, notice_number: "10", title: "다른 예고", notice_department: "개인 이름", posted_date: "2026-09-01", source_location: "https://example.test/10", linked_regulation_version_ids: [] },
];
const noticeDates = latestNoticeDates(notices);
assert.equal(noticeDates.get(base.regulation_version_id), "2026-09-01");
assert.equal(sortPublishRegulations(rows, "NAME_ASC", noticeDates)[0].display_name, "일부 규정");
const noticeFilters = { query: "", startDate: "", endDate: "", year: "", department: "", unmappedOnly: false };
assert.equal(filterAndSortNotices(notices, noticeFilters)[0].notice_number, "10");
assert.equal(filterAndSortNotices(notices, { ...noticeFilters, unmappedOnly: true }).length, 1);
assert.ok(publishNoticesToCsv(notices, { release_id: manifest.correction_release_id, release_type: "baseline_correction", schema_version: "v0.6", evidence_as_of: "2026-09-14", generated_at: "2026-09-14", source_snapshot_hash: "", projection_hash: "", population: 1041 }).includes("linked_regulation_count"));

assert.ok(loaderText.includes('"Content-Profile": "publish"'));
for (const rpc of ["public_release_metadata", "public_regulation_rows", "public_notice_rows", "public_regulation_source_rows"]) assert.ok(loaderText.includes(`"${rpc}"`));
assert.ok(!loaderText.includes("review-20260913-reconstructed"));
assert.ok(!loaderText.includes("service_role"));
for (const forbidden of ["SHA-256", "parser", "identity", "residual", "confidence", "human confirmation", "evaluation provenance", "평가 근거 원장"]) assert.ok(!explorerText.toLowerCase().includes(forbidden.toLowerCase()));
assert.ok(explorerText.includes("상세검색"));
assert.ok(explorerText.includes("현재 목록 CSV"));
assert.ok(explorerText.includes("통합검색") && explorerText.includes("최근 사규예고일 최신순"));
assert.ok(!explorerText.includes("인쇄"));
assert.ok(explorerText.includes('target="_blank" rel="noopener noreferrer"'));
assert.ok(!layoutText.includes('["홈", "/"]'));
assert.ok(layoutText.includes("Soulspectrum Inc. · nanyoung이 만들었습니다."));
assert.ok(departmentText.includes("organizationSnapshot") && departmentText.includes("개인·미매핑 표기"));
assert.ok(!detailText.includes("confidence_level") && !detailText.includes("sha256") && !detailText.includes("checks"));

console.log("public regulation UI contract: publish RPC, 1041 regulations, 2089 notices, public-safe CSV PASS");
