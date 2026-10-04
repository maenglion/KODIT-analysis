import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { filterAndSortNotices, filterPublishRegulations, latestNoticeDates, normalizePublicSearch, organizationSnapshot, personResidualObservationsToCsv, publicResidualLabel, publishNoticesToCsv, publishRowsToCsv, residualLabelsToCsv, residualOccurrencesToCsv, sortPublishRegulations, validPublicUrl } from "../packages/common/src/regulations/index.ts";
import * as residualUi from "../packages/common/src/regulations/residual-ui.ts";
import { addDetailTerm, defaultDetailSettings, departmentRegulationCount, detailDateRange, filterDetailedNotices, filterDetailedRegulations, officialDepartmentCounts, settingsForScope } from "../packages/common/src/regulations/regulation-detail-ui.ts";
import { filterTopicNotices, topicEvidenceUrl, topicNoticesToCsv, topicRegulationAvailability } from "../apps/public-site/lib/topic-notice-filter.ts";

const { RESIDUAL_PAGE_SIZE, mentionSourceLinks, residualOccurrencesForLabels, selectResidualLabels } = residualUi;
const manifest = JSON.parse(await readFile(new URL("../reports/projections/2026-09-14-v06-baseline-correction/manifest.json", import.meta.url), "utf8"));
const explorerText = await readFile(new URL("../packages/common/src/regulations/RegulationExplorer.tsx", import.meta.url), "utf8");
const advancedText = await readFile(new URL("../packages/common/src/regulations/RegulationAdvancedSearch.tsx", import.meta.url), "utf8");
const collectionText = await readFile(new URL("../apps/public-site/components/CollectionStatus.tsx", import.meta.url), "utf8");
const collectionRouteText = await readFile(new URL("../apps/public-site/app/api/collection-state/route.ts", import.meta.url), "utf8");
const homeText = await readFile(new URL("../apps/public-site/app/page.tsx", import.meta.url), "utf8");
const regulationsText = await readFile(new URL("../apps/public-site/app/regulations/page.tsx", import.meta.url), "utf8");
const insightText = await readFile(new URL("../apps/public-site/components/PublicInsightStrip.tsx", import.meta.url), "utf8");
const residualPageText = await readFile(new URL("../apps/public-site/app/residual-data/page.tsx", import.meta.url), "utf8");
const residualAnalysisText = await readFile(new URL("../packages/common/src/regulations/DepartmentResidualAnalysis.tsx", import.meta.url), "utf8");
const residualUiText = await readFile(new URL("../packages/common/src/regulations/residual-ui.ts", import.meta.url), "utf8");
const personObservationText = await readFile(new URL("../packages/common/src/regulations/PersonResidualObservations.tsx", import.meta.url), "utf8");
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
const topicPageText = await readFile(new URL("../apps/public-site/app/investment-statistics/page.tsx", import.meta.url), "utf8");
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
assert.deepEqual(filterDetailedRegulations(rows, "", { ...detailDefault, dateField: "REVISION", startDate: "2024-01-01", endDate: "2024-12-31" }, noticeDates, sampleSources).map(row => row.regulation_code), ["A"]);
assert.deepEqual(filterDetailedNotices(notices, "투자", { ...defaultDetailSettings("notice"), fields: ["LINKED_REGULATION_NAME"] }, new Map([[base.regulation_version_id, base.display_name]])).map(row => row.notice_number), ["9"]);
assert.deepEqual(detailDateRange("2026-09-13", 1), { startDate: "2026-08-13", endDate: "2026-09-13" });
assert.equal(addDetailTerm(["투자", "보증", "규정"], "네 번째").length, 3);
assert.deepEqual(settingsForScope({ ...detailDefault, fields: ["TITLE", "ATTACHMENT_NAME"], evidenceGroups: ["ALIO"], dateField: "REVISION" }, "notice"), { ...detailDefault, fields: ["TITLE"], evidenceGroups: [], dateField: "POSTED" });
assert.deepEqual(settingsForScope({ ...detailDefault, availabilityStatuses: ["FULLTEXT_PUBLIC", "NOTICE_ONLY"] }, "notice").availabilityStatuses, []);
assert.deepEqual(filterDetailedRegulations(rows, "", { ...detailDefault, availabilityStatuses: ["FULLTEXT_PUBLIC", "NOTICE_ONLY"] }, noticeDates, sampleSources).map(row => row.regulation_code), ["A"]);
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
assert.ok(!residualAnalysisText.includes("masked_label") && !residualAnalysisText.includes("detail.label_type"));

assert.ok(loaderText.includes('public-snapshot-v2.json.gz'));
assert.ok(!loaderText.includes('/rest/v1/rpc/'));
assert.ok(!loaderText.includes('NEXT_PUBLIC_SUPABASE_'));
assert.ok(!loaderText.includes("service_role"));
for (const forbidden of ["SHA-256", "parser", "identity", "residual", "confidence", "human confirmation", "evaluation provenance", "평가 근거 원장"]) assert.ok(!explorerText.toLowerCase().includes(forbidden.toLowerCase()));
assert.ok(explorerText.includes("상세 설정") && explorerText.includes("onSubmit=") && explorerText.includes("setQuery(draft.trim())"));
assert.ok(homeText.includes("redirect(`/regulations") && regulationsText.includes("<RegulationExplorer") && regulationsText.includes("getPublishDataset"));
assert.ok(navigationText.includes('href="/residual-data"') && !navigationText.includes('href="/">HOME'));
const regulationSubmenu = navigationText.split('aria-label="규정 하위 메뉴"')[1]?.split('aria-label="부서 통계 하위 메뉴"')[0] ?? "";
assert.ok(regulationSubmenu.includes('>내부규정</Link>') && !regulationSubmenu.includes('>내부규정(분석)</Link>'));
assert.ok(!regulationSubmenu.includes('>조직도</Link>'));
assert.ok(navigationText.includes('>조직 히스토리</Link>'));
assert.ok(explorerText.includes('insightSlot') && explorerText.includes('scope !== "notice" && insightSlot'));
const introPosition = explorerText.indexOf('<section className="public-page-intro">');
const insightPosition = explorerText.indexOf('scope !== "notice" && insightSlot');
const overviewPosition = explorerText.indexOf('<div className="regulation-overview');
const searchPosition = explorerText.indexOf('<SearchBar');
assert.ok(introPosition >= 0 && introPosition < insightPosition && insightPosition < overviewPosition && overviewPosition < searchPosition);
assert.ok(explorerText.includes('scope === "notice" ? "사규예고" : "내부규정"'));
assert.ok(regulationsText.includes('href="/residual-data#residual-index"') && residualPageText.includes('id="residual-index"'));
for (const term of ["초기 미일치", "인물형 관측", "공식 근거로 조직 확인", "유형 미확정"]) assert.ok(regulationsText.includes(term));
for (const fragment of ["앞뒤 공백을 제거", "현재 조직 확인", "과거 조직 확인", "이 수치는 부서 재배정 건수가 아닙니다", "DRM 건수와도 별개의 통계입니다"]) assert.ok(regulationsText.includes(fragment));
assert.ok(regulationsText.includes("담당 표기와 같은 문자열이 다른 문서 본문에서 인물형 문맥으로 관측된 건수입니다."));
assert.ok(regulationsText.includes("실제 인물의 신원, 직원 여부, 기안자·담당자 역할 또는 소속을 확정하지 않습니다."));
assert.ok(regulationsText.includes("전체 사규예고의 ${percent(untypedCount)}"));
assert.ok(!regulationsText.includes("사람 이름 형태의 문자열"));
assert.ok(insightText.includes('aria-expanded={isExpanded}') && insightText.includes('aria-controls={detailId}') && insightText.includes('aria-describedby={tooltipId}'));
assert.ok(insightText.includes('role="tooltip"') && insightText.includes('role="region"') && insightText.includes('event.key === "Escape"'));
assert.ok(!regulationsText.includes('organizationAttributionExplanations') && !regulationsText.includes('work_context'));
assert.ok(residualPageText.includes("DepartmentResidualAnalysis") && residualPageText.includes("getPublishDataset"));
assert.ok(residualPageText.includes("PersonResidualObservations") && residualPageText.includes("organizationAttributionExplanations"));
assert.ok(personObservationText.includes("personResidualObservationsToCsv") && !personObservationText.includes("org_") && !personObservationText.includes("reasoning"));
assert.deepEqual(Object.keys(residualUi).sort(), ["RESIDUAL_PAGE_SIZE", "mentionSourceLinks", "residualOccurrencesForLabels", "selectResidualLabels"]);
for (const removed of ["PersonObservation", "PersonObservationSummary", "publicPersonObservation", "publicPersonSummary", "publicResidualOccurrencesToCsv", "publicResidualLabelsToCsv", "mention_count", "official_source_urls", "residualLabelsToCsv", "residualOccurrencesToCsv"]) {
  assert.ok(!residualUiText.includes(removed), `residual-ui.ts에 구 PERSON 혼합 계약 잔존: ${removed}`);
}
assert.ok(residualAnalysisText.indexOf('<article ref={detailRef}') > residualAnalysisText.indexOf('<div className="table-scroll">'));
assert.ok(residualAnalysisText.includes('<tr className="residual-detail-row">') && residualAnalysisText.includes('colSpan={6}'));
assert.ok(residualAnalysisText.includes('aria-haspopup="dialog"') && residualAnalysisText.includes('type="checkbox"'));
assert.ok(residualAnalysisText.includes('RESIDUAL_PAGE_SIZE') && residualAnalysisText.includes('근거 게시물과 이동 설명'));
assert.ok(residualAnalysisText.includes('담당 표기 관측 / 사규예고') && residualAnalysisText.includes('라벨 분류 근거'));
assert.ok(residualAnalysisText.includes('조직 변경 추적') && residualAnalysisText.includes('ObservationClassificationEvidence'));
assert.ok(residualAnalysisText.includes('residual-inline-evidence') && residualAnalysisText.includes('aria-expanded={expanded}'));
assert.ok(personObservationText.includes('RESIDUAL_PAGE_SIZE') && personObservationText.includes('residual-detail-row') && personObservationText.includes('colSpan={4}'));
assert.ok(personObservationText.includes('personResidualObservationsToCsv(safeRows)') && personObservationText.includes('publicResidualLabel(row.public_alias, "PERSON")'));
assert.ok(personObservationText.includes('officialNoticeListUrl(row.source_location)') && personObservationText.includes('사규 제개정 예고 목록 페이지'));
assert.ok(personObservationText.includes('aria-controls=') && personObservationText.includes('scrollIntoView('));
assert.ok(!personObservationText.includes('inference_basis') && !personObservationText.includes('work_context') && !personObservationText.includes('org_node_id'));
assert.ok(residualAnalysisText.includes('id="residual-selected-detail"') && residualAnalysisText.includes('aria-expanded={selected===row.label_id}') && residualAnalysisText.includes('scrollIntoView('));
assert.ok(informationText.includes('href: "/residual-data"') && !informationText.includes('href="/department-statistics#residual-analysis"'));
assert.ok(informationText.includes("function InformationRelated") && !informationText.includes("자료와 근거를 함께 보세요"));
assert.ok(diagramText.includes('id="residual-ledger-erd"') && residualPageText.includes('/methodology#residual-ledger-erd'));
assert.ok(explorerText.includes("필터 결과 전체 CSV"));
assert.ok(explorerText.includes('onToggleSettings={toggleSettings}') && explorerText.includes('settingsTrigger.current?.isConnected') && explorerText.includes('target?.focus()') && explorerText.includes('id="search-results"'));
assert.ok(explorerText.includes('aria-controls="advanced-search-panel"') && advancedText.includes('id="advanced-search-panel"'));
assert.ok(advancedText.includes('panelRef.current?.focus()') && advancedText.includes('handleEscape') && advancedText.includes('aria-labelledby="advanced-search-title"'));
assert.ok(explorerText.includes('partial-filter-clear') && explorerText.includes('부분공개 속성:') && explorerText.includes('onClearPartial={() => updateRegulations({ partialType: "ALL" })}'));
for (const field of ["포함 단어", "제외 단어", "담당부서 및 조직", "공식 근거 경로", "기간 설정", ">적용<"]) assert.ok(advancedText.includes(field));
assert.ok(advancedText.includes('과거→현재 조직 자동 매칭은 제공하지 않습니다') && advancedText.includes('본문 텍스트는 이 공개본에 없어 검색하지 않습니다'));
assert.ok(explorerText.includes('ALIO 출처 연결') && explorerText.includes('승인 공개본 전체 규정') && explorerText.includes('전체 사규예고'));
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
assert.ok(navigationText.includes('>투자 보증</Link>') && navigationText.includes('개인정보보호 <small>준비중</small>'));
assert.ok(topicText.includes('topic-page-links') && topicText.includes('href="/investment-statistics/yearly-notices"') && topicText.includes('topicEvidenceUrl()'));
assert.ok(topicText.includes('view === "summary"') && topicText.includes('view === "yearly"') && topicText.includes('view === "evidence"') && evidenceText.includes('initialFamily={family}') && evidenceText.includes('initialYear={year}'));
assert.ok(topicText.includes('집계 기준 구분') && topicText.includes('규정 목록의 2026-09-13 집계와 합산하지 않습니다.'));
assert.ok(!topicText.includes('기준이 다른 두 공개본'));
assert.ok(topicText.includes('saveCsv(filtered, noticeRegulationStatuses') && topicText.includes('topicEvidenceUrl({ year })') && topicText.includes('window.history.replaceState('));
assert.ok(topicStyleText.includes('color:#217a39') && topicStyleText.includes('border:1px solid var(--figma-green)'));
assert.ok(helpText.includes('>i</button>') && !helpText.includes('>ⓘ</button>'));
assert.ok(!departmentText.includes("DepartmentResidualAnalysis"));
assert.ok(!detailText.includes("confidence_level") && !detailText.includes("sha256") && !detailText.includes("checks"));

const residualSnapshot = JSON.parse(gunzipSync(await readFile(new URL("../apps/public-site/data/public-snapshot-v2.json.gz", import.meta.url))));
assert.equal(residualSnapshot.snapshot_contract, "public-static-snapshot-v2");
assert.equal(residualSnapshot.rows.length, 1041);
assert.equal(residualSnapshot.notices.length, 2089);
const initialUnmatched = residualSnapshot.personResidualObservations.length + residualSnapshot.residuals.length;
const byResidualClass = Object.groupBy(residualSnapshot.residuals, row => row.resolution_class);
const currentOrg = byResidualClass.ORG_CURRENT?.length ?? 0;
const historicalOrg = byResidualClass.ORG_HISTORICAL?.length ?? 0;
const untyped = byResidualClass.UNTYPED?.length ?? 0;
const ambiguous = byResidualClass.AMBIGUOUS?.length ?? 0;
assert.deepEqual([initialUnmatched, residualSnapshot.personResidualObservations.length, currentOrg, historicalOrg, untyped, ambiguous], [1272, 1113, 30, 15, 114, 0]);
assert.equal(initialUnmatched, residualSnapshot.personResidualObservations.length + currentOrg + historicalOrg + untyped + ambiguous);
assert.equal((initialUnmatched / residualSnapshot.notices.length * 100).toFixed(1), "60.9");
assert.equal((untyped / residualSnapshot.notices.length * 100).toFixed(1), "5.5");
assert.equal(residualSnapshot.personResidualObservations.length + currentOrg + historicalOrg, 1158);
assert.equal(organizationSnapshot.hierarchy.flatMap(group => group.units).length, 20);
assert.equal(organizationSnapshot.snapshotDate, "2026-09-15");
assert.equal(residualSnapshot.rows.filter(row => row.availability === "NOTICE_ONLY").length, 831);
const approvedSourceMap = new Map();
for (const source of residualSnapshot.sources) approvedSourceMap.set(source.regulation_version_id, [...(approvedSourceMap.get(source.regulation_version_id) ?? []), source]);
const approvedAlio = filterDetailedRegulations(residualSnapshot.rows, "", { ...defaultDetailSettings(), evidenceGroups: ["ALIO"] }, latestNoticeDates(residualSnapshot.notices), approvedSourceMap);
assert.equal(approvedAlio.length, 205);
assert.ok(approvedAlio.every(row => approvedSourceMap.get(row.regulation_version_id).some(source => source.source_kind === "ALIO")));
const selectedConclusions = filterDetailedRegulations(residualSnapshot.rows, "", { ...defaultDetailSettings(), availabilityStatuses: ["FULLTEXT_PUBLIC", "NOTICE_ONLY"] }, latestNoticeDates(residualSnapshot.notices), approvedSourceMap);
assert.equal(selectedConclusions.length, 1036);
const officialDepartments = organizationSnapshot.hierarchy.flatMap(group => group.units);
const departmentCounts = officialDepartmentCounts(officialDepartments, residualSnapshot.rows, residualSnapshot.notices);
assert.equal(departmentCounts.length, 20);
assert.equal(departmentCounts.reduce((sum, option) => sum + departmentRegulationCount(option, []), 0), 502);
assert.equal(departmentCounts.reduce((sum, option) => sum + option.notices, 0), 817);
assert.ok(departmentCounts.every(option => departmentRegulationCount(option, ["PARTIAL_PUBLIC"]) === 0));
const residualCategories = ["ORG_CURRENT", "ORG_HISTORICAL", "UNTYPED", "AMBIGUOUS"];
assert.equal(residualSnapshot.residuals.filter(row => row.label_type === "PERSON").length, 0);
assert.equal(residualSnapshot.residualLabels.filter(row => row.label_type === "PERSON").length, 0);
assert.ok(residualSnapshot.organizationAttributionExplanations.every(row => !("label_type" in row) && !/^[ㄱ-ㅎ]+\(\d{4}\)$/.test(row.display_label)));
const allResiduals = selectResidualLabels(residualSnapshot.residualLabels, residualCategories, "OCCURRENCE_DESC");
assert.equal(allResiduals.length + new Set(residualSnapshot.personResidualObservations.map(row => row.public_alias)).size, 355);
assert.ok(allResiduals.every(row => Number(row.residual_occurrence_count) === Number(row.notice_count)));
assert.equal(RESIDUAL_PAGE_SIZE, 10);
assert.equal(residualSnapshot.personResidualObservations.length, 1113);
assert.ok(diagramText.includes("이 그림은 잔차·라벨·귀속을 기록한 기존 원장입니다."));
assert.ok(diagramText.includes("추적 계층") && diagramText.includes('href="/work-traces"'));
assert.ok(diagramText.includes("이 원장을 바꾸거나 대체하지 않고 별도로 추가했습니다."));
assert.equal(new Set(residualSnapshot.personResidualObservations.map(row => row.public_alias)).size, 317);
const allowedPersonKeys = ["observation_count", "posted_at", "public_alias", "source_location", "title"];
const forbiddenPersonKey = /(org|organization|department|role|candidate|path|confidence|reasoning|function|assignment|movement)/i;
assert.ok(residualSnapshot.personResidualObservations.every(row => JSON.stringify(Object.keys(row).sort()) === JSON.stringify(allowedPersonKeys)));
assert.ok(residualSnapshot.personResidualObservations.every(row => Object.keys(row).every(key => !forbiddenPersonKey.test(key))));
assert.ok(residualSnapshot.personResidualObservations.every(row => /^[ㄱ-ㅎ]+\(\d{4}\)$/.test(row.public_alias)));
assert.ok(residualSnapshot.personResidualObservations.every(row => Number(row.observation_count) === 1));
assert.ok(residualSnapshot.personResidualObservations.every(row => {
  const url = new URL(row.source_location);
  return url.protocol === "https:" && url.hostname === "www.kodit.or.kr" && url.pathname.endsWith("/selectNttList.do") && url.searchParams.get("bbsId") === "322";
}));
const personCsv = personResidualObservationsToCsv(residualSnapshot.personResidualObservations);
assert.equal(personCsv.split("\r\n").length, 1115);
assert.equal(personCsv.split("\r\n", 1)[0], "﻿public_alias,posted_at,title,source_location,observation_count");
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
assert.ok(!personObservationText.includes('>{row.title} ↗</a>') && personObservationText.includes('개별 게시물 원문이 아닌'));
assert.ok(!residualAnalysisText.includes('row.resolution_class==="PERSON_EVIDENCE"') && !residualAnalysisText.includes('person-observation'));
assert.ok(residualAnalysisText.includes('<AttributionExplanation detail={attribution}') && residualAnalysisText.includes('<ObservationClassificationEvidence occurrence={item}'));
assert.ok(residualAnalysisText.includes("const evidenceUrl=validPublicUrl(step.evidence_url)"));

const topicNames = new Map(topicSnapshot.families.map((item) => [item.code, item.name]));
const allTopics = filterTopicNotices(topicSnapshot.notices, { family: "ALL", year: "", query: "" }, topicNames);
const firstFamily = topicSnapshot.families[0];
const familyTopics = filterTopicNotices(topicSnapshot.notices, { family: firstFamily.code, year: "", query: "" }, topicNames);
const yearTopics = filterTopicNotices(topicSnapshot.notices, { family: "ALL", year: "2014", query: "" }, topicNames);
const combinedTopics = filterTopicNotices(topicSnapshot.notices, { family: firstFamily.code, year: "2014", query: "" }, topicNames);
const rankedRegulationNames = [...new Set([...topicSnapshot.mostMentioned, ...topicSnapshot.mostProposed].map((item) => item.name))];
const rankedAvailability = topicRegulationAvailability(rankedRegulationNames, residualSnapshot.rows);
assert.equal(Object.keys(rankedAvailability).length, rankedRegulationNames.length);
assert.deepEqual(Object.values(rankedAvailability).reduce((counts, status) => ({ ...counts, [status]: (counts[status] ?? 0) + 1 }), {}), { FULLTEXT_PUBLIC: 2, NOTICE_ONLY: 5 });
assert.ok(topicPageText.includes("getPublishDataset") && topicPageText.includes("topicRegulationAvailability"));
assert.ok(topicText.includes("topic-rank-availability") && topicText.includes("사전예고만") && topicText.includes("비공개 확정이 아니라"));
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
