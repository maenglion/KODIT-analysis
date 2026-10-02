import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { filterAndSortNotices, filterPublishRegulations, latestNoticeDates, normalizePublicSearch, publicResidualLabel, publishNoticesToCsv, publishRowsToCsv, residualLabelsToCsv, residualOccurrencesToCsv, sortPublishRegulations, validPublicUrl } from "../packages/common/src/regulations/index.ts";
import { RESIDUAL_PAGE_SIZE, mentionSourceLinks, residualOccurrencesForLabels, selectResidualLabels } from "../packages/common/src/regulations/residual-ui.ts";
import { filterTopicNotices, topicEvidenceUrl, topicNoticesToCsv } from "../apps/public-site/lib/topic-notice-filter.ts";

const manifest = JSON.parse(await readFile(new URL("../reports/projections/2026-09-14-v06-baseline-correction/manifest.json", import.meta.url), "utf8"));
const explorerText = await readFile(new URL("../packages/common/src/regulations/RegulationExplorer.tsx", import.meta.url), "utf8");
const homeText = await readFile(new URL("../apps/public-site/app/page.tsx", import.meta.url), "utf8");
const regulationsText = await readFile(new URL("../apps/public-site/app/regulations/page.tsx", import.meta.url), "utf8");
const residualPageText = await readFile(new URL("../apps/public-site/app/residual-data/page.tsx", import.meta.url), "utf8");
const residualAnalysisText = await readFile(new URL("../packages/common/src/regulations/DepartmentResidualAnalysis.tsx", import.meta.url), "utf8");
const navigationText = await readFile(new URL("../apps/public-site/components/SiteNavigation.tsx", import.meta.url), "utf8");
const informationText = await readFile(new URL("../apps/public-site/components/InformationPages.tsx", import.meta.url), "utf8");
const loaderText = await readFile(new URL("../apps/public-site/lib/review-data.ts", import.meta.url), "utf8");
const layoutText = await readFile(new URL("../apps/public-site/app/layout.tsx", import.meta.url), "utf8");
const detailText = await readFile(new URL("../apps/public-site/app/regulations/investment-option-guarantee/page.tsx", import.meta.url), "utf8");
const departmentText = await readFile(new URL("../packages/common/src/regulations/DepartmentStatistics.tsx", import.meta.url), "utf8");
const semanticText = await readFile(new URL("../apps/public-site/app/department-statistics/semantic-matching/page.tsx", import.meta.url), "utf8");
const historyText = await readFile(new URL("../apps/public-site/app/department-statistics/organization-history/page.tsx", import.meta.url), "utf8");
const topicText = await readFile(new URL("../apps/public-site/components/TopicDashboard.tsx", import.meta.url), "utf8");
const evidenceText = await readFile(new URL("../apps/public-site/app/investment-statistics/evidence-notices/page.tsx", import.meta.url), "utf8");
const diagramText = await readFile(new URL("../apps/public-site/components/DiagramViewer.tsx", import.meta.url), "utf8");
const helpText = await readFile(new URL("../packages/common/src/regulations/MetricHelp.tsx", import.meta.url), "utf8");
const topicStyleText = await readFile(new URL("../apps/public-site/app/styles/topic.css", import.meta.url), "utf8");
const topicSnapshot = JSON.parse(await readFile(new URL("../apps/public-site/data/topic-public-v2.json", import.meta.url), "utf8"));

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

const residualOccurrenceCsv = residualOccurrencesToCsv([{ release_id: manifest.correction_release_id, residual_id: "00000000-0000-0000-0000-000000000010", notice_id: "00000000-0000-0000-0000-000000000011", raw_label: "ㅇㄱㅅ(7135)", comparison_label: "ㅇㄱㅅ(7135)", posted_at: "2021-11-22", title: "예고", source_location: "https://example.test/notice", resolution_class: "PERSON_EVIDENCE", label_type: "PERSON", label_id: "00000000-0000-0000-0000-000000000012" }]);
const residualLabelCsv = residualLabelsToCsv([{ release_id: manifest.correction_release_id, label_id: "00000000-0000-0000-0000-000000000012", raw_label: "ㅇㄱㅅ(7135)", comparison_label: "ㅇㄱㅅ(7135)", resolution_class: "PERSON_EVIDENCE", label_type: "PERSON", residual_occurrence_count: 1, notice_count: 1, first_posted_at: "2021-11-22", last_posted_at: "2021-11-22", org_node_id: null, org_official_name: null, org_valid_from: null, org_valid_to: null, org_evidence_url: null, org_lineage: [], mention_occurrence_count: 1, person_extractor_rules: { PERSON_CONTACT_BLOCK_PHONE: 1 }, mention_source_locations: ["https://example.test/notice"] }]);
for (const output of [residualOccurrenceCsv, residualLabelCsv]) assert.ok(output.startsWith("\uFEFF") && output.endsWith("\r\n"));
assert.ok(residualOccurrenceCsv.includes("notice_id") && residualOccurrenceCsv.includes("resolution_class") && residualOccurrenceCsv.includes("label_occurrence_count") && residualOccurrenceCsv.includes("source_location"));
assert.ok(residualLabelCsv.includes("display_label") && residualLabelCsv.includes("resolution_class") && residualLabelCsv.includes("residual_occurrence_count"));
for (const label of ["ㅇㅅ(1234)", "ㅇㄱㅅ(7135)", "ㄱㅁㅅㅌ(0000)"]) assert.equal(publicResidualLabel(label, "PERSON"), label);
for (const unsafe of ["이경선", "이*선", "인물(0000)", "ㅇㄱㅅ(123)", " ㅇㄱㅅ(7135)", "ㅇㄱㅅ(7135) "]) assert.throws(() => publicResidualLabel(unsafe, "PERSON"), /공개 별칭 형식 오류/);
for (const output of [residualOccurrenceCsv, residualLabelCsv]) assert.ok(output.includes("ㅇㄱㅅ(7135)") && !output.includes("이*선") && !output.includes("이경선"));
assert.ok(residualAnalysisText.includes('publicResidualLabel(detail.masked_label,detail.label_type)'));

assert.ok(loaderText.includes('public-snapshot-v1.json.gz'));
assert.ok(!loaderText.includes('/rest/v1/rpc/'));
assert.ok(!loaderText.includes('NEXT_PUBLIC_SUPABASE_'));
assert.ok(!loaderText.includes("service_role"));
for (const forbidden of ["SHA-256", "parser", "identity", "residual", "confidence", "human confirmation", "evaluation provenance", "평가 근거 원장"]) assert.ok(!explorerText.toLowerCase().includes(forbidden.toLowerCase()));
assert.ok(explorerText.includes("상세 설정") && explorerText.includes("onSubmit=") && explorerText.includes("setQuery(draft.trim())"));
assert.ok(homeText.includes("redirect(`/regulations") && regulationsText.includes("<RegulationExplorer") && regulationsText.includes("getPublishDataset"));
assert.ok(navigationText.includes('href="/residual-data"') && !navigationText.includes('href="/">HOME'));
assert.ok(residualPageText.includes("DepartmentResidualAnalysis") && residualPageText.includes("getPublishDataset"));
assert.ok(residualPageText.includes('row.resolution_class !== "PERSON_EVIDENCE"') && residualPageText.includes('attributions={publicAttributions}'));
assert.ok(residualAnalysisText.indexOf('<article ref={detailRef}') > residualAnalysisText.indexOf('<div className="table-scroll">'));
assert.ok(residualAnalysisText.includes('<tr className="residual-detail-row">') && residualAnalysisText.includes('colSpan={6}'));
assert.ok(residualAnalysisText.includes('aria-haspopup="dialog"') && residualAnalysisText.includes('type="checkbox"'));
assert.ok(residualAnalysisText.includes('RESIDUAL_PAGE_SIZE') && residualAnalysisText.includes('담당 표기 관측 게시물') && residualAnalysisText.includes('근거 게시물과 이동 설명'));
assert.ok(residualAnalysisText.includes('id="residual-selected-detail"') && residualAnalysisText.includes('aria-expanded={selected===row.label_id}') && residualAnalysisText.includes('scrollIntoView('));
assert.ok(informationText.includes('href: "/residual-data"') && !informationText.includes('href="/department-statistics#residual-analysis"'));
assert.ok(informationText.includes("function InformationRelated") && !informationText.includes("자료와 근거를 함께 보세요"));
assert.ok(diagramText.includes('id="residual-ledger-erd"') && residualPageText.includes('/methodology#residual-ledger-erd'));
assert.ok(explorerText.includes("현재 목록 CSV"));
assert.ok(explorerText.includes("통합검색") && explorerText.includes("최근 사규예고일 기준"));
assert.ok(!explorerText.includes("인쇄"));
assert.ok(explorerText.includes('target="_blank" rel="noopener noreferrer"'));
assert.ok(!layoutText.includes('["홈", "/"]'));
assert.ok(layoutText.includes("Soulspectrum Inc. · nanyoung이 만들었습니다."));
assert.ok(departmentText.includes("organizationSnapshot") && departmentText.includes("별도 잔차 원장"));
assert.ok(departmentText.includes("DepartmentSelectorDialog") && !departmentText.includes("<OrganizationHistory") && !departmentText.includes("<DepartmentEvidenceGuide"));
assert.ok(semanticText.includes("DepartmentEvidenceGuide") && historyText.includes("OrganizationHistory"));
assert.ok(navigationText.includes('href="/department-statistics/semantic-matching"') && navigationText.includes('href="/department-statistics/organization-history"'));
assert.ok(navigationText.includes('href="/investment-statistics/yearly-notices"') && navigationText.includes('href="/investment-statistics/evidence-notices"'));
assert.ok(topicText.includes('view === "summary"') && topicText.includes('view === "yearly"') && topicText.includes('view === "evidence"') && evidenceText.includes('initialFamily={family}') && evidenceText.includes('initialYear={year}'));
assert.ok(topicText.includes('onClick={() => saveCsv(filtered)}') && topicText.includes('topicEvidenceUrl({ year })') && topicText.includes('window.history.replaceState('));
assert.ok(topicStyleText.includes('color:#217a39') && topicStyleText.includes('border:1px solid var(--figma-green)'));
assert.ok(helpText.includes('>i</button>') && !helpText.includes('>ⓘ</button>'));
assert.ok(!departmentText.includes("DepartmentResidualAnalysis"));
assert.ok(!detailText.includes("confidence_level") && !detailText.includes("sha256") && !detailText.includes("checks"));

const residualSnapshot = JSON.parse(gunzipSync(await readFile(new URL("../apps/public-site/data/public-snapshot-v1.json.gz", import.meta.url))));
const residualCategories = ["PERSON_EVIDENCE", "ORG_CURRENT", "ORG_HISTORICAL", "UNTYPED", "AMBIGUOUS"];
const nonPersonIds = new Set(residualSnapshot.residuals.filter(row => row.resolution_class !== "PERSON_EVIDENCE").map(row => row.residual_id));
assert.equal(residualSnapshot.attributionExplanations.filter(row => nonPersonIds.has(row.residual_id)).length, 159);
const allResiduals = selectResidualLabels(residualSnapshot.residualLabels, residualCategories, "OCCURRENCE_DESC");
assert.equal(allResiduals.length, 355);
assert.equal(RESIDUAL_PAGE_SIZE, 10);
assert.equal(Math.ceil(allResiduals.length / RESIDUAL_PAGE_SIZE), 36);
const personAndHistorical = selectResidualLabels(residualSnapshot.residualLabels, ["PERSON_EVIDENCE", "ORG_HISTORICAL"], "LABEL_ASC");
assert.equal(personAndHistorical.length, 319);
assert.ok(personAndHistorical.slice(1).every((row, index) =>
  new Intl.Collator("ko-KR", { numeric: true }).compare(publicResidualLabel(personAndHistorical[index].raw_label, personAndHistorical[index].label_type), publicResidualLabel(row.raw_label, row.label_type)) <= 0,
));
const personLabels = selectResidualLabels(residualSnapshot.residualLabels, ["PERSON_EVIDENCE"], "NOTICE_DESC");
const personOccurrences = residualOccurrencesForLabels(residualSnapshot.residuals, personLabels);
assert.equal(personLabels.length, 317);
assert.equal(personOccurrences.length, 1113);
assert.equal(residualLabelsToCsv(personLabels).split("\r\n").length, 319);
assert.equal(residualOccurrencesToCsv(personOccurrences).split("\r\n").length, 1115);
assert.ok(personOccurrences.every(row => /^[ㄱ-ㅎ]+\(\d{4}\)$/.test(row.raw_label)));
assert.deepEqual(mentionSourceLinks(["https://example.test/a", "https://example.test/b"], [
  { source_location: "https://example.test/a", title: "공식 공고" },
  { source_location: "https://example.test/b", title: "공식 공고" },
]).map(link => link.label), ["공식 공고 (1)", "공식 공고 (2)"]);
assert.deepEqual(mentionSourceLinks(["https://example.test/a", "https://example.test/b"], [
  { source_location: "https://example.test/a", title: "서로 다른 제목 A" },
  { source_location: "https://example.test/a", title: "서로 다른 제목 B" },
]).map(link => link.label), ["본문 근거 원문 (1)", "본문 근거 원문 (2)"]);
const officialListPages = [1, 2].map(number => `https://www.kodit.or.kr/kodit/na/ntt/selectNttList.do?mi=2812&bbsId=322&listCo=500&currPage=${number}`);
assert.deepEqual(mentionSourceLinks(officialListPages, [
  { source_location: officialListPages[0], title: "개별 게시물 제목 A" },
  { source_location: officialListPages[1], title: "개별 게시물 제목 B" },
]).map(link => link.label), ["사규 제개정 예고 (1)", "사규 제개정 예고 (2)"]);
assert.ok(!residualAnalysisText.includes('>본문 근거 원문 ↗</a>') && residualAnalysisText.includes("공개된 근거 링크는 신보의 사규 제개정 예고"));
assert.ok(residualAnalysisText.includes('row.resolution_class!=="PERSON_EVIDENCE"&&activeAttribution&&<AttributionExplanation'));
assert.ok(residualAnalysisText.includes("const evidenceUrl=validPublicUrl(step.evidence_url)"));

const topicNames = new Map(topicSnapshot.families.map((item) => [item.code, item.name]));
const allTopics = filterTopicNotices(topicSnapshot.notices, { family: "ALL", year: "", query: "" }, topicNames);
const firstFamily = topicSnapshot.families[0];
const familyTopics = filterTopicNotices(topicSnapshot.notices, { family: firstFamily.code, year: "", query: "" }, topicNames);
const yearTopics = filterTopicNotices(topicSnapshot.notices, { family: "ALL", year: "2014", query: "" }, topicNames);
const combinedTopics = filterTopicNotices(topicSnapshot.notices, { family: firstFamily.code, year: "2014", query: "" }, topicNames);
assert.equal(allTopics.length, topicSnapshot.noticeCount);
assert.equal(familyTopics.length, firstFamily.noticeCount);
assert.ok(familyTopics.every((notice) => notice.families.includes(firstFamily.code)));
assert.equal(yearTopics.length, topicSnapshot.yearly["2014"]);
assert.ok(yearTopics.every((notice) => notice.date.startsWith("2014")));
assert.equal(combinedTopics.length, topicSnapshot.notices.filter((notice) => notice.date.startsWith("2014") && notice.families.includes(firstFamily.code)).length);
assert.equal(topicEvidenceUrl({ family: firstFamily.code }), `/investment-statistics/evidence-notices?family=${firstFamily.code}`);
assert.equal(topicEvidenceUrl({ family: "ALL", year: "2014" }), "/investment-statistics/evidence-notices?year=2014");
assert.equal(topicEvidenceUrl({ family: firstFamily.code, year: "2014" }), `/investment-statistics/evidence-notices?family=${firstFamily.code}&year=2014`);
assert.equal(topicEvidenceUrl(), "/investment-statistics/evidence-notices");
const filteredCsv = topicNoticesToCsv(familyTopics, topicNames);
assert.ok(filteredCsv.startsWith('\uFEFF"게시번호"') && filteredCsv.endsWith("\r\n"));
assert.equal(filteredCsv.split("\r\n").length, familyTopics.length + 2);
assert.ok(filteredCsv.split("\r\n").slice(1, -1).every((line) => line.includes(firstFamily.name)));

console.log("public regulation UI contract: static approved snapshot, 1041 regulations, 2089 notices, public-safe CSV PASS");
