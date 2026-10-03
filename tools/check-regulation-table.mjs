import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { filterAndSortNotices, filterPublishRegulations, latestNoticeDates, normalizePublicSearch, organizationSnapshot, publicResidualLabel, publishNoticesToCsv, publishRowsToCsv, residualLabelsToCsv, residualOccurrencesToCsv, sortPublishRegulations, validPublicUrl } from "../packages/common/src/regulations/index.ts";
import { RESIDUAL_PAGE_SIZE, mentionSourceLinks, publicPersonObservation, publicPersonSummary, publicResidualLabelsToCsv, publicResidualOccurrencesToCsv, residualOccurrencesForLabels, selectResidualLabels } from "../packages/common/src/regulations/residual-ui.ts";
import { addDetailTerm, defaultDetailSettings, departmentRegulationCount, detailDateRange, filterDetailedNotices, filterDetailedRegulations, officialDepartmentCounts, settingsForScope } from "../packages/common/src/regulations/regulation-detail-ui.ts";
import { filterTopicNotices, topicEvidenceUrl, topicNoticesToCsv } from "../apps/public-site/lib/topic-notice-filter.ts";

const manifest = JSON.parse(await readFile(new URL("../reports/projections/2026-09-14-v06-baseline-correction/manifest.json", import.meta.url), "utf8"));
const explorerText = await readFile(new URL("../packages/common/src/regulations/RegulationExplorer.tsx", import.meta.url), "utf8");
const advancedText = await readFile(new URL("../packages/common/src/regulations/RegulationAdvancedSearch.tsx", import.meta.url), "utf8");
const collectionText = await readFile(new URL("../apps/public-site/components/CollectionStatus.tsx", import.meta.url), "utf8");
const collectionRouteText = await readFile(new URL("../apps/public-site/app/api/collection-state/route.ts", import.meta.url), "utf8");
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
const purposeText = await readFile(new URL("../apps/public-site/components/DataPurposeContent.tsx", import.meta.url), "utf8");
const parserText = await readFile(new URL("../apps/public-site/components/ParserEvidence.tsx", import.meta.url), "utf8");
const organizationText = await readFile(new URL("../packages/common/src/regulations/index.ts", import.meta.url), "utf8");
const evidenceText = await readFile(new URL("../apps/public-site/app/investment-statistics/evidence-notices/page.tsx", import.meta.url), "utf8");
const diagramText = await readFile(new URL("../apps/public-site/components/DiagramViewer.tsx", import.meta.url), "utf8");
const helpText = await readFile(new URL("../packages/common/src/regulations/MetricHelp.tsx", import.meta.url), "utf8");
const topicStyleText = await readFile(new URL("../apps/public-site/app/styles/topic.css", import.meta.url), "utf8");
const topicSnapshot = JSON.parse(await readFile(new URL("../apps/public-site/data/topic-public-v2.json", import.meta.url), "utf8"));
const parserMeasurements = JSON.parse(await readFile(new URL("../apps/public-site/data/public-parser-measurements.json", import.meta.url), "utf8"));

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
const detailDefault = defaultDetailSettings();
const sampleSources = new Map([
  [base.regulation_version_id, [{ regulation_version_id: base.regulation_version_id, source_kind: "ALIO", attachment_name: "투자 옵션 자료.pdf" }]],
  [rows[1].regulation_version_id, [{ regulation_version_id: rows[1].regulation_version_id, source_kind: "KODIT_ATTACHMENT", attachment_name: "그 외 첨부.hwp" }]],
]);
assert.deepEqual(filterDetailedRegulations(rows, "투자 옵션", detailDefault, noticeDates, sampleSources).map(row => row.regulation_code), ["A"]);
assert.deepEqual(filterDetailedRegulations(rows, "", { ...detailDefault, fields: ["ATTACHMENT_NAME"], includes: ["첨부"] }, noticeDates, sampleSources).map(row => row.regulation_code), ["B"]);
assert.deepEqual(filterDetailedRegulations(rows, "", { ...detailDefault, excludes: ["투자"] }, noticeDates, sampleSources).map(row => row.regulation_code), ["B"]);
assert.deepEqual(filterDetailedRegulations(rows, "", { ...detailDefault, evidenceGroups: ["ALIO"] }, noticeDates, sampleSources).map(row => row.regulation_code), ["A"]);
assert.deepEqual(filterDetailedRegulations(rows, "", { ...detailDefault, availabilityStatuses: ["FULLTEXT_PUBLIC"] }, noticeDates, sampleSources).map(row => row.regulation_code), ["A"]);
assert.deepEqual(filterDetailedRegulations(rows, "", { ...detailDefault, availabilityStatuses: ["FULLTEXT_PUBLIC", "PARTIAL_PUBLIC"] }, noticeDates, sampleSources).map(row => row.regulation_code), ["A", "B"]);
assert.deepEqual(filterDetailedRegulations(rows, "", { ...detailDefault, dateField: "REVISION", startDate: "2024-01-01", endDate: "2024-12-31" }, noticeDates, sampleSources).map(row => row.regulation_code), ["A"]);
assert.deepEqual(filterDetailedNotices(notices, "투자", { ...defaultDetailSettings("notice"), fields: ["LINKED_REGULATION_NAME"] }, new Map([[base.regulation_version_id, base.display_name]])).map(row => row.notice_number), ["9"]);
assert.deepEqual(detailDateRange("2026-09-13", 1), { startDate: "2026-08-13", endDate: "2026-09-13" });
assert.equal(addDetailTerm(["투자", "보증", "규정"], "네 번째").length, 3);
assert.deepEqual(settingsForScope({ ...detailDefault, fields: ["TITLE", "ATTACHMENT_NAME"], evidenceGroups: ["ALIO"], dateField: "REVISION" }, "notice"), { ...detailDefault, fields: ["TITLE"], evidenceGroups: [], dateField: "POSTED" });
assert.deepEqual(settingsForScope({ ...detailDefault, fields: ["ATTACHMENT_NAME"], availabilityStatuses: ["FULLTEXT_PUBLIC"] }, "notice").fields, defaultDetailSettings("notice").fields);
assert.deepEqual(settingsForScope({ ...detailDefault, availabilityStatuses: ["FULLTEXT_PUBLIC"] }, "notice").availabilityStatuses, []);
const departmentFixture = officialDepartmentCounts(["보증부", "신용보증부", "현재 일치 없음"], rows, notices);
assert.deepEqual(departmentFixture.map(row => [row.name, departmentRegulationCount(row, []), row.notices]), [["보증부", 2, 0], ["신용보증부", 0, 1], ["현재 일치 없음", 0, 0]]);
assert.deepEqual(departmentFixture.map(row => departmentRegulationCount(row, ["PARTIAL_PUBLIC"])), [1, 0, 0]);
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
assert.ok(residualAnalysisText.includes('담당 표기 관측 / 사규예고') && residualAnalysisText.includes('본문 언급(mention)은 담당 칸과 별도로'));
assert.ok(residualAnalysisText.includes('id="residual-selected-detail"') && residualAnalysisText.includes('aria-expanded={selected===row.label_id}') && residualAnalysisText.includes('scrollIntoView('));
assert.ok(informationText.includes('href: "/residual-data"') && !informationText.includes('href="/department-statistics#residual-analysis"'));
assert.ok(informationText.includes("function InformationRelated") && !informationText.includes("자료와 근거를 함께 보세요"));
assert.ok(diagramText.includes('id="residual-ledger-erd"') && residualPageText.includes('/methodology#residual-ledger-erd'));
assert.ok(explorerText.includes("필터 결과 전체 CSV"));
assert.ok(explorerText.includes('onToggleSettings={toggleSettings}') && explorerText.includes('settingsTrigger.current?.isConnected') && explorerText.includes('target?.focus()') && explorerText.includes('id="search-results"'));
assert.ok(explorerText.includes('aria-controls="advanced-search-panel"') && advancedText.includes('id="advanced-search-panel"'));
assert.ok(advancedText.includes('panelRef.current?.focus()') && advancedText.includes('handleEscape') && advancedText.includes('aria-labelledby="advanced-search-title"'));
assert.ok(explorerText.includes('partial-filter-clear') && explorerText.includes('부분공개 속성:') && explorerText.includes('onClearPartial={() => updateRegulations({ partialType: "ALL" })}'));
for (const field of ["포함 단어", "제외 단어", "담당부서 및 조직", "공식 근거 경로", "기간 설정", "공개결론"]) assert.ok(advancedText.includes(field));
assert.ok(advancedText.includes('disabled={unsupported}') && advancedText.includes('aria-describedby={unsupported ?') && advancedText.includes('내부규정 단독 검색에서만 사용') && advancedText.includes('사규예고 단독 검색에서만 사용'));
assert.ok(advancedText.includes('공식 근거 없는 과거→현재 조직 자동 매칭은 제공하지 않습니다') && !advancedText.includes('과거 부서 자동 매칭 (미제공)'));
assert.ok(advancedText.includes('availabilityOrder.map(status => <label') && !advancedText.includes('공개 자료 상태<select'));
assert.ok(advancedText.includes('전체 선택') && advancedText.includes('선택 해제') && advancedText.includes('0건도 표시') && advancedText.includes('오늘 기준 아님') && advancedText.includes('className="apply-button" onClick={apply}>적용</button>'));
assert.ok(advancedText.includes('<p className="detail-department-mode"><strong>담당 표기 정확 일치</strong></p>') && !advancedText.includes('name="department-match"'));
assert.ok(advancedText.includes('본문 텍스트는 이 공개본에 없어 검색하지 않습니다'));
assert.ok(explorerText.includes('ALIO 출처 연결') && explorerText.includes('승인 공개본 전체 규정') && explorerText.includes('전체 사규예고'));
assert.ok(explorerText.indexOf('<span>전체 사규예고</span>') < explorerText.indexOf('<span>승인 공개본 전체 규정</span>'));
assert.ok(explorerText.indexOf('<span>승인 공개본 전체 규정</span>') < explorerText.indexOf('<span>ALIO 출처 연결</span>'));
assert.ok(explorerText.includes('officialDepartmentCounts(officialNames, rows, notices)') && explorerText.includes('selectedAvailability.length > 1'));
assert.ok(explorerText.includes('regulation-overview-grid') && explorerText.includes('notices.length.toLocaleString("ko-KR")') && !explorerText.includes('regulation-overview-note'));
assert.ok(regulationsText.includes('<CollectionStatus') && collectionRouteText.includes('public_collection_state'));
assert.ok(collectionRouteText.includes('expectedHost = "jacyalxzejzrlspmojps.supabase.co"') && collectionRouteText.includes('Cache-Control": "no-store"'));
assert.ok(!collectionRouteText.includes('service_role') && collectionText.includes('모든 출처의 완료나 공개본 승인을 뜻하지 않습니다'));
assert.ok(collectionText.includes('<dt>자동수집 주기</dt><dd>10일</dd>') && collectionText.includes('기본 수집 간격은 10일입니다'));
for (const label of ['공개 데이터 기준일', '공개본 생성일', '마지막 성공 수집일', '다음 수집 예정일', '자동수집 주기']) assert.ok(collectionText.includes(label));
assert.ok(collectionText.includes('aria-haspopup="dialog"') && collectionText.includes('<dialog ref={dialogRef}') && collectionText.includes('onClose={() => triggerRef.current?.focus()}'));
for (const page of [residualPageText, semanticText, historyText, topicText, purposeText, detailText, informationText]) assert.ok(page.includes('<CollectionStatus'), '공개 페이지 오른쪽 날짜 슬롯 누락');
assert.ok(departmentText.includes('metadataSlot') && historyText.includes('organizationSnapshot.snapshotDate') && organizationText.includes('snapshotDate: "2026-09-15"'));
assert.ok(topicText.includes('evidenceAsOf={snapshot.measuredAt}') && !topicText.includes('snapshotGeneratedAt={snapshot.measuredAt}'));
assert.ok(informationText.includes('Next 서버에서 읽어 화면에 전달합니다') && informationText.includes('/api/collection-state') && !informationText.includes('현재 브라우저는 공개본의'));
assert.ok(parserText.includes('본문 추출 및 규정 식별 결과') && parserText.includes('별도 형식 판별 지표') && parserText.includes('추출 가능한 텍스트 없음'));
assert.deepEqual([
  parserMeasurements.formats.reduce((sum, format) => sum + format.documents, 0),
  parserMeasurements.audit.replayAttempts, parserMeasurements.ledger.parserRuns,
  parserMeasurements.ledger.nonemptyOccurrences, parserMeasurements.ledger.uniqueExtractions,
], [2414, 4828, 2414, 2403, 2397]);
for (const [name, identified, unresolved, missing, mismatch, extensionMismatch] of [["HWP", 298, 28, 17, 11, 28], ["HWPX", 353, 5, 4, 1, 2]]) {
  const format = parserMeasurements.formats.find(row => row.format === name);
  assert.deepEqual([format.parsedAndIdentified, format.parsedIdentityUnresolved, format.referenceMissing, format.textMismatch, format.extensionMismatch], [identified, unresolved, missing, mismatch, extensionMismatch]);
  assert.equal(identified + unresolved, format.documents);
  assert.equal(missing + mismatch, unresolved);
  assert.equal(format.parserFailed, 0);
}
assert.deepEqual([parserMeasurements.formats.find(row => row.format === "PDF").noText, parserMeasurements.formats.find(row => row.format === "PDF").readFailed], [1, 10]);
assert.ok(advancedText.includes("통합검색") && explorerText.includes("최근 사규예고일 기준"));
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
assert.ok(topicText.includes('집계 기준 구분') && topicText.includes('규정 목록의 2026-09-13 집계와 합산하지 않습니다.'));
assert.ok(!topicText.includes('기준이 다른 두 공개본'));
assert.ok(topicText.includes('onClick={() => saveCsv(filtered)}') && topicText.includes('topicEvidenceUrl({ year })') && topicText.includes('window.history.replaceState('));
assert.ok(topicStyleText.includes('color:#217a39') && topicStyleText.includes('border:1px solid var(--figma-green)'));
assert.ok(helpText.includes('>i</button>') && !helpText.includes('>ⓘ</button>'));
assert.ok(!departmentText.includes("DepartmentResidualAnalysis"));
assert.ok(!detailText.includes("confidence_level") && !detailText.includes("sha256") && !detailText.includes("checks"));

const residualSnapshot = JSON.parse(gunzipSync(await readFile(new URL("../apps/public-site/data/public-snapshot-v1.json.gz", import.meta.url))));
assert.equal(residualSnapshot.rows.length, 1041);
assert.equal(residualSnapshot.notices.length, 2089);
const approvedDepartments = officialDepartmentCounts(organizationSnapshot.hierarchy.flatMap(group => group.units), residualSnapshot.rows, residualSnapshot.notices);
assert.equal(approvedDepartments.length, 20);
assert.equal(approvedDepartments.reduce((sum, option) => sum + departmentRegulationCount(option, []), 0), 502);
assert.equal(approvedDepartments.reduce((sum, option) => sum + option.notices, 0), 817);
assert.ok(approvedDepartments.every(option => departmentRegulationCount(option, ["PARTIAL_PUBLIC"]) === 0));
assert.equal(residualSnapshot.rows.filter(row => row.availability === "NOTICE_ONLY").length, 831);
const approvedSourceMap = new Map();
for (const source of residualSnapshot.sources) approvedSourceMap.set(source.regulation_version_id, [...(approvedSourceMap.get(source.regulation_version_id) ?? []), source]);
const approvedAlio = filterDetailedRegulations(residualSnapshot.rows, "", { ...defaultDetailSettings(), evidenceGroups: ["ALIO"] }, latestNoticeDates(residualSnapshot.notices), approvedSourceMap);
assert.equal(approvedAlio.length, 205);
assert.ok(approvedAlio.every(row => approvedSourceMap.get(row.regulation_version_id).some(source => source.source_kind === "ALIO")));
const residualCategories = ["PERSON_EVIDENCE", "ORG_CURRENT", "ORG_HISTORICAL", "UNTYPED", "AMBIGUOUS"];
const nonPersonIds = new Set(residualSnapshot.residuals.filter(row => row.resolution_class !== "PERSON_EVIDENCE").map(row => row.residual_id));
assert.equal(residualSnapshot.attributionExplanations.filter(row => nonPersonIds.has(row.residual_id)).length, 159);
const personSourceRows = residualSnapshot.residuals.filter(row => row.resolution_class === "PERSON_EVIDENCE");
const personSourceLabels = residualSnapshot.residualLabels.filter(row => row.resolution_class === "PERSON_EVIDENCE");
const personProjections = personSourceRows.map(publicPersonObservation);
const personSummaryProjections = personSourceLabels.map(publicPersonSummary);
assert.equal(personProjections.length, 1113);
assert.equal(personSummaryProjections.length, 317);
assert.equal(new Set(personSummaryProjections.map(row => row.alias)).size, 317);
assert.ok(personProjections.every(row => Object.keys(row).sort().join(",") === "alias,notice_title,observed_at,official_url"));
assert.ok(personSummaryProjections.every(row => Object.keys(row).sort().join(",") === "alias,first_observed_at,last_observed_at,mention_count,notice_count,observation_count,source_urls"));
assert.ok(!Object.hasOwn(publicPersonObservation({ ...personSourceRows[0], current_org_candidate: "UNSAFE" }), "current_org_candidate"));
assert.ok(!Object.hasOwn(publicPersonSummary({ ...personSourceLabels[0], path_steps: ["UNSAFE"] }), "path_steps"));
assert.throws(() => publicPersonObservation({ ...personSourceRows[0], raw_label: "홍길동", label_type: "OTHER" }), /PERSON 공개 별칭/);
assert.throws(() => publicPersonSummary({ ...personSourceLabels[0], raw_label: "홍길동", label_type: "PERSON" }), /PERSON 공개 별칭/);
assert.throws(() => publicPersonObservation({ ...personSourceRows[0], source_location: "https://example.test/notice" }), /PERSON 공식 게시물 URL/);
assert.throws(() => publicPersonSummary({ ...personSourceLabels[0], mention_source_locations: ["https://example.test/a"] }), /PERSON 공식 게시물 URL/);
const safePersonCsv = publicResidualOccurrencesToCsv(personSourceRows);
assert.equal(safePersonCsv.split("\r\n").length, 1115);
assert.ok(!/notice_id|release_id|org_official_name|org_valid_from|org_valid_to/.test(safePersonCsv.split("\r\n")[0]));
assert.ok(!/label_id|org_official_name|org_valid_from|org_valid_to/.test(publicResidualLabelsToCsv(personSourceLabels).split("\r\n")[0]));
assert.ok(!safePersonCsv.includes(personSourceRows[0].notice_id));
assert.ok(residualPageText.includes('personObservations={personObservations} personSummary={personSummary}') && residualPageText.includes('const publicAttributions = dataset.attributionExplanations.filter(row => nonPersonResidualIds.has(row.residual_id))'));
assert.ok(!residualPageText.includes('personNoticeBasis') && !residualAnalysisText.includes('personNoticeBasis') && residualAnalysisText.includes('row.resolution_class!=="PERSON_EVIDENCE"&&<details className="residual-rubric"'));
const allResiduals = selectResidualLabels(residualSnapshot.residualLabels, residualCategories, "OCCURRENCE_DESC");
assert.equal(allResiduals.length, 355);
assert.ok(allResiduals.every(row => Number(row.residual_occurrence_count) === Number(row.notice_count)));
const picturedResidual = allResiduals.find(row => row.raw_label === "ㅇㄷㅎ(8053)");
assert.ok(picturedResidual);
assert.deepEqual([picturedResidual.residual_occurrence_count, picturedResidual.notice_count, picturedResidual.mention_occurrence_count], [18, 18, 24]);
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
assert.equal(publicResidualLabelsToCsv(personLabels).split("\r\n").length, 319);
assert.equal(publicResidualOccurrencesToCsv(personOccurrences).split("\r\n").length, 1115);
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
assert.ok(residualAnalysisText.includes('row.resolution_class!=="PERSON_EVIDENCE"&&activeAttribution&&<div id={`residual-explanation-${selectedResidual}`}><AttributionExplanation detail={activeAttribution}/></div>'));
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
