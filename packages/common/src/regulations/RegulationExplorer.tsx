"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  availabilityLabels, availabilityOrder, filterAndSortNotices, filterPublishRegulations, latestNoticeDates, organizationSnapshot,
  publishNoticesToCsv, publishRowsToCsv, sortPublishRegulations, validPublicUrl,
  type NoticeFilters, type PublicRegulationFilters, type PublicRegulationSourceRow, type PublishNoticeRow,
  type PublishRegulationRow, type PublishReleaseMetadata, type RegulationSort,
} from "./index";
import { CopyTitleButton } from "./CopyTitleButton";
import { RegulationAdvancedSearch } from "./RegulationAdvancedSearch";
import {
  defaultDetailSettings, filterDetailedNotices, filterDetailedRegulations, officialDepartmentCounts,
  hasDetailCriteria, settingsForScope, type DetailScope, type EvidenceGroup, type OfficialDepartmentCount, type RegulationDetailSettings,
} from "./regulation-detail-ui";

import { publicPostsToCsv, filterPublicPosts, type PublicPost, type PublicPostsCoverage } from "./public-posts";

type Scope = DetailScope;
type RevisionHistory = { source_url: string; entries: { label: string; date: string; quote: string }[]; note: string };
type Props = { revisionHistories?: Record<string, RevisionHistory>; publicPosts?: PublicPost[]; externalPosts?: PublicPost[]; postsCoverage?: PublicPostsCoverage; rows: PublishRegulationRow[]; notices: PublishNoticeRow[]; sources: PublicRegulationSourceRow[]; release: PublishReleaseMetadata; initialScope?: Scope; initialQuery?: string; initialCategory?: PublicRegulationFilters["availability"]; metadataSlot?: ReactNode; insightSlot?: ReactNode };
const emptyRegulationFilters: PublicRegulationFilters = { query: "", availability: "ALL", currentness: "", partialType: "ALL" };
const emptyNoticeFilters: NoticeFilters = { query: "", startDate: "", endDate: "", year: "", department: "", unmappedOnly: false };
const partialTypeLabels: Record<string, string> = { ALIO: "ALIO", KODIT_PAGE: "신보 사이트", ATTACHMENT: "첨부파일" };

function downloadCsv(name: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Pagination({ page, pageCount, setPage, label = "검색 결과" }: { page: number; pageCount: number; setPage: (page: number | ((value: number) => number)) => void; label?: string }) {
  if (pageCount < 2) return null;
  const first = Math.max(1, Math.min(page - 2, pageCount - 4));
  const pages = Array.from({ length: Math.min(5, pageCount) }, (_, index) => first + index);
  return <nav className="pagination" aria-label={`${label} 페이지 이동`}>
    <button type="button" aria-label={`${label} 이전 페이지`} disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>‹</button>
    {pages.map((number) => <button key={number} type="button" className={page === number ? "active" : ""} aria-current={page === number ? "page" : undefined} aria-label={`${label} ${number}페이지`} onClick={() => setPage(number)}>{number}</button>)}
    <button type="button" aria-label={`${label} 다음 페이지`} disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>›</button>
  </nav>;
}

export function RegulationExplorer({ revisionHistories = {}, publicPosts = [], externalPosts = [], postsCoverage, rows, notices, sources, release, initialScope = "master", initialQuery = "", initialCategory = "ALL", metadataSlot, insightSlot }: Props) {
  const [scope, setScope] = useState<Scope>(initialScope);
  const [filters, setFilters] = useState<PublicRegulationFilters>({ ...emptyRegulationFilters, query: initialQuery, availability: initialCategory });
  const [noticeFilters, setNoticeFilters] = useState<NoticeFilters>({ ...emptyNoticeFilters, query: initialQuery });
  const [regulationSort, setRegulationSort] = useState<RegulationSort>(initialCategory === "NOTICE_ONLY" ? "NOTICE_DESC" : "REVISION_DESC");
  const [page, setPage] = useState(1);
  const [combinedRegPage, setCombinedRegPage] = useState(1);
  const [combinedNoticePage, setCombinedNoticePage] = useState(1);
  const [combinedPostsPage, setCombinedPostsPage] = useState(1);
  const [termsOpen, setTermsOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const settingsTrigger = useRef<HTMLButtonElement | null>(null);
  const [appliedDetail, setAppliedDetail] = useState<RegulationDetailSettings>(() => ({
    ...defaultDetailSettings(initialScope),
    availabilityStatuses: initialScope === "notice" || initialCategory === "ALL" ? [] : [initialCategory],
  }));
  const noticeDates = useMemo(() => latestNoticeDates(notices), [notices]);
  const noticeHistory = useMemo(() => {
    const map = new Map<string, { count: number; latest: string | null }>();
    for (const notice of notices) for (const id of notice.linked_regulation_version_ids) {
      const current = map.get(id) ?? { count: 0, latest: null };
      current.count += 1;
      if (!current.latest || notice.posted_date > current.latest) current.latest = notice.posted_date;
      map.set(id, current);
    }
    return map;
  }, [notices]);
  const sourcesByVersion = useMemo(() => {
    const map = new Map<string, PublicRegulationSourceRow[]>();
    for (const source of sources) map.set(source.regulation_version_id, [...(map.get(source.regulation_version_id) ?? []), source]);
    return map;
  }, [sources]);
  const regulationNames = useMemo(() => new Map(rows.map(row => [row.regulation_version_id, row.display_name])), [rows]);
  const officialDepartments = useMemo(() => {
    const officialNames = organizationSnapshot.hierarchy.flatMap(group => group.units);
    return officialDepartmentCounts(officialNames, rows, notices).sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [rows, notices]);
  const alioCount = useMemo(() => new Set(sources.filter(source => source.source_kind === "ALIO").map(source => source.regulation_version_id)).size, [sources]);
  const availableEvidenceGroups = useMemo(() => [
    ...(sources.some(source => source.source_kind === "ALIO") ? ["ALIO" as const] : []),
    ...(sources.some(source => source.source_kind === "KODIT_ATTACHMENT" || source.source_kind === "KODIT_PAGE") ? ["KODIT" as const] : []),
    ...(sources.some(source => source.source_kind === "OFFICIAL_OTHER") ? ["OTHER" as const] : []),
  ], [sources]);
  const counts = useMemo(() => Object.fromEntries(availabilityOrder.map((status) => [status, rows.filter((row) => row.availability === status).length])) as Record<PublishRegulationRow["availability"], number>, [rows]);
  const filteredRegulations = useMemo(() => sortPublishRegulations(
    filterDetailedRegulations(filterPublishRegulations(rows, { ...filters, query: "" }), filters.query, appliedDetail, noticeDates, sourcesByVersion),
    filters.availability === "NOTICE_ONLY" ? "NOTICE_DESC" : regulationSort, noticeDates,
  ), [rows, filters, appliedDetail, regulationSort, noticeDates, sourcesByVersion]);
  const filteredNotices = useMemo(() => filterAndSortNotices(
    filterDetailedNotices(notices, noticeFilters.query, appliedDetail, regulationNames),
    { ...noticeFilters, query: "" },
  ), [notices, noticeFilters, appliedDetail, regulationNames]);
  const filteredPosts = useMemo(() => filterPublicPosts(publicPosts, filters.query, appliedDetail), [publicPosts, filters.query, appliedDetail]);
  const filteredExternalPosts = useMemo(() => filterPublicPosts(externalPosts, filters.query, appliedDetail), [externalPosts, filters.query, appliedDetail]);
  const pageSize = 50;
  const activeLength = scope === "posts" ? filteredPosts.length : scope === "notice" ? filteredNotices.length : filteredRegulations.length;
  const pageCount = Math.max(1, Math.ceil(activeLength / pageSize));
  const currentPage = Math.min(page, pageCount);
  const offset = (currentPage - 1) * pageSize;
  const combinedRegPages = Math.max(1, Math.ceil(filteredRegulations.length / pageSize));
  const combinedNoticePages = Math.max(1, Math.ceil(filteredNotices.length / pageSize));
  const combinedPostsPages = Math.max(1, Math.ceil(filteredPosts.length / pageSize));
  const currentCombinedPostsPage = Math.min(combinedPostsPage, combinedPostsPages);
  const currentCombinedRegPage = Math.min(combinedRegPage, combinedRegPages);
  const currentCombinedNoticePage = Math.min(combinedNoticePage, combinedNoticePages);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("scope", scope);
    const query = scope === "notice" ? noticeFilters.query : filters.query;
    if (query) params.set("q", query);
    if ((scope === "master" || scope === "all") && filters.availability !== "ALL") params.set("category", filters.availability);
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  }, [scope, filters.query, filters.availability, noticeFilters.query]);

  const updateRegulations = (next: Partial<PublicRegulationFilters>) => { setFilters((old) => ({ ...old, ...next })); setPage(1); setCombinedRegPage(1); setCombinedPostsPage(1); };
  const updateNotices = (next: Partial<NoticeFilters>) => { setNoticeFilters((old) => ({ ...old, ...next })); setPage(1); setCombinedNoticePage(1); };
  const chooseScope = (next: Scope) => { const query = scope === "notice" ? noticeFilters.query : filters.query; setFilters(old => ({ ...old, query })); setNoticeFilters(old => ({ ...old, query })); setScope(next); setAppliedDetail(old => settingsForScope(old, next)); setPage(1); if (next === "notice") updateNotices({ query }); else updateRegulations({ query }); };
  const chooseCategory = (availability: PublicRegulationFilters["availability"]) => { setScope("master"); setAppliedDetail(old => ({ ...settingsForScope(old, "master"), availabilityStatuses: availability === "ALL" ? [] : [availability] })); updateRegulations({ availability, partialType: "ALL" }); if (availability === "NOTICE_ONLY") setRegulationSort("NOTICE_DESC"); };
  const toggleSettings = (trigger: HTMLButtonElement) => { settingsTrigger.current = trigger; setAdvancedOpen(open => !open); };
  const closeSettings = () => { setAdvancedOpen(false); const target = settingsTrigger.current?.isConnected ? settingsTrigger.current : document.querySelector<HTMLButtonElement>(".notice-heading .detail-button"); target?.focus(); };
  useEffect(() => {
    if (advancedOpen) document.getElementById("advanced-search-panel")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }, [advancedOpen]);

  return <>
    <section className="public-page-intro">
      <div className="shell intro-inner intro-inner-with-status">
        <div className="intro-copy">
          <p className="breadcrumb"><a href="/regulations">규정·법령</a> &gt; <b>{scope === "posts" ? "신용보증기금 전체게시물" : scope === "all" ? "전체 검색" : scope === "notice" ? "사규예고" : "내부규정"}</b></p>
          <h1>{scope === "posts" ? "신용보증기금 전체게시물" : scope === "all" ? "신용보증기금 공개자료 통합검색" : scope === "notice" ? "신용보증기금 사규예고" : "신용보증기금 규정 공개현황"}</h1>
          <p className="intro-description">{scope === "posts" ? "홈페이지 게시판의 공개 목록을 수집한 자료입니다. 전체 게시판 모집단 및 비메뉴 게시판은 수집 대상에 포함되지 않았으며, 본 자료는 기존 사규 매핑 분석에 사용되지 않았습니다." : "규정 버전과 사규예고 게시물을 구분해 공식 출처와 공개 범위를 확인합니다."}{scope === "posts" && <> <a className="posts-coverage-link" href="/public-posts-coverage">게시판 수집현황</a></>}</p>
          <button className="terms-button" type="button" aria-expanded={termsOpen} aria-controls="public-terms" onClick={() => setTermsOpen((value) => !value)}><img src="/figma-icons/help.svg" alt=""/>용어 및 해석</button>
        </div>
        {metadataSlot ?? <div className="database-state"><b>승인된 정적 공개본</b><span>기준일 {release.evidence_as_of}</span></div>}
      </div>
    </section>
    {termsOpen && <aside className="terms-content" id="public-terms" aria-label="공개 데이터 용어 및 해석"><div className="shell">
      <div><strong>공개결론</strong><p>공식 경로에서 확인된 자료의 공개 범위입니다. 규정의 현행 여부나 법적 효력을 뜻하지 않습니다.</p></div>
      <div><strong>데이터 기준일</strong><p>승인된 공개본이 참조한 근거 기준일입니다. 생성일은 파일을 만든 날짜이며 실시간 수집 시각이 아닙니다.</p></div>
      <div><strong>사규예고 이력</strong><p>규정 버전에 연결된 예고 게시물의 수입니다. 예고 이력이 있다고 개정이 확정되었다는 뜻은 아닙니다.</p></div>
    </div></aside>}
    {(scope === "master" || scope === "all") && insightSlot}
    {(scope === "master" || scope === "all") && <section className="shell regulation-overview" aria-label="내부규정 요약">
      <div className="regulation-overview-grid">
        <div><span>전체 사규예고</span><strong>{notices.length.toLocaleString("ko-KR")}<small>건</small></strong><p>중복 제거 게시물</p></div>
        <div><span>승인 공개본 전체 규정</span><strong>{rows.length.toLocaleString("ko-KR")}<small>건</small></strong><p>규정 버전</p></div>
        <div><span>ALIO 출처 연결</span><strong>{alioCount.toLocaleString("ko-KR")}<small>건</small></strong><p>서로 다른 규정 버전</p></div>
        <div><span>사전예고만 확인</span><strong>{counts.NOTICE_ONLY.toLocaleString("ko-KR")}<small>건</small></strong><p>공개결론 NOTICE_ONLY</p></div>
      </div>
    </section>}
    <main className="public-table-shell posts-search-area">
      <div className="shell">
        <SearchBar scope={scope} initialScope={initialScope} filters={filters} noticeFilters={noticeFilters} updateRegulations={updateRegulations} updateNotices={updateNotices} chooseScope={chooseScope} officialDepartments={officialDepartments} availableEvidenceGroups={availableEvidenceGroups} availabilityCounts={counts} release={release} appliedDetail={appliedDetail} onApplyDetail={setAppliedDetail} advancedOpen={advancedOpen} onCloseSettings={closeSettings} count={scope === "all" ? filteredRegulations.length + filteredNotices.length + filteredPosts.length + filteredExternalPosts.length : activeLength} />
        {scope === "all" && <p><a className="posts-coverage-link" href="/public-posts-coverage">게시판 수집현황</a></p>}
        <div id="search-results">
          {(scope === "master" || scope === "all") && <><RegulationTable revisionHistories={revisionHistories} rows={scope === "all" ? filteredRegulations.slice((currentCombinedRegPage - 1) * pageSize, currentCombinedRegPage * pageSize) : filteredRegulations.slice(offset, offset + pageSize)} allRows={filteredRegulations} rowOffset={scope === "all" ? (currentCombinedRegPage - 1) * pageSize : offset} release={release} noticeDates={noticeDates} noticeHistory={noticeHistory} sourcesByVersion={sourcesByVersion} sort={regulationSort} setSort={setRegulationSort} category={filters.availability} partialType={filters.partialType} onClearPartial={() => updateRegulations({ partialType: "ALL" })} grouped={scope === "all"} advancedOpen={advancedOpen} onToggleSettings={toggleSettings} detailApplied={hasDetailCriteria(appliedDetail, scope) || filters.availability !== "ALL"} selectedAvailability={appliedDetail.availabilityStatuses} />{scope === "all" && <Pagination label="규정 검색 결과" page={currentCombinedRegPage} pageCount={combinedRegPages} setPage={setCombinedRegPage} />}</>}
          {(scope === "notice" || scope === "all") && <><NoticeTable rows={scope === "all" ? filteredNotices.slice((currentCombinedNoticePage - 1) * pageSize, currentCombinedNoticePage * pageSize) : filteredNotices.slice(offset, offset + pageSize)} allRows={filteredNotices} rowOffset={scope === "all" ? (currentCombinedNoticePage - 1) * pageSize : offset} release={release} grouped={scope === "all"} advancedOpen={advancedOpen} onToggleSettings={toggleSettings} detailApplied={hasDetailCriteria(appliedDetail, "notice")} />{scope === "all" && <Pagination label="사규예고 검색 결과" page={currentCombinedNoticePage} pageCount={combinedNoticePages} setPage={setCombinedNoticePage} />}</>}
          {(scope === "all" || scope === "posts") && <PublicPostsTable posts={scope === "posts" ? filteredPosts.slice(offset, offset + pageSize) : filteredPosts.slice((currentCombinedPostsPage - 1) * pageSize, currentCombinedPostsPage * pageSize)} count={filteredPosts.length} allPosts={filteredPosts} onToggleSettings={toggleSettings} />}
          {scope === "all" && <Pagination label="일반 게시물 검색 결과" page={currentCombinedPostsPage} pageCount={combinedPostsPages} setPage={setCombinedPostsPage} />}
          {scope === "all" && <PublicPostsTable posts={filteredExternalPosts} count={filteredExternalPosts.length} allPosts={filteredExternalPosts} external onToggleSettings={toggleSettings} />}
          {scope !== "all" && <Pagination page={currentPage} pageCount={pageCount} setPage={setPage} />}
        </div>
        {(scope === "master" || scope === "all") && <details className="category-disclosure">
          <summary>공개 범위별 현황 <span>전체 {rows.length.toLocaleString("ko-KR")}건 · {appliedDetail.availabilityStatuses.length > 1 ? "공개결론 복수 선택 중" : "분류 선택"}</span></summary>
          <div className="category-grid" aria-label="공개현황 분류">
            <button type="button" className={scope === "master" && !appliedDetail.availabilityStatuses.length ? "active" : ""} aria-pressed={scope === "master" && !appliedDetail.availabilityStatuses.length} onClick={() => chooseCategory("ALL")}><span>전체 규정</span><strong>{rows.length.toLocaleString("ko-KR")}</strong></button>
            {availabilityOrder.map((status) => <button type="button" key={status} className={scope === "master" && appliedDetail.availabilityStatuses.length === 1 && appliedDetail.availabilityStatuses[0] === status ? "active" : ""} aria-pressed={scope === "master" && appliedDetail.availabilityStatuses.length === 1 && appliedDetail.availabilityStatuses[0] === status} onClick={() => chooseCategory(status)}><span>{availabilityLabels[status]}</span><strong>{counts[status].toLocaleString("ko-KR")}</strong></button>)}
          </div>
          {filters.availability === "PARTIAL_PUBLIC" && <div className="partial-tabs">{[["ALL", "전체"], ["ALIO", "ALIO"], ["KODIT_PAGE", "신보 사이트"], ["ATTACHMENT", "첨부파일"]].map(([value, label]) => <button type="button" key={value} aria-pressed={filters.partialType === value} className={filters.partialType === value ? "active" : ""} onClick={() => updateRegulations({ partialType: value as PublicRegulationFilters["partialType"] })}>{label}</button>)}</div>}
          {filters.availability === "SOURCE_UNKNOWN" && <p className="source-unknown-note">이 버전에 검증된 공식 전문·일부공개·사규예고 출처가 연결되지 않았습니다. 단순 URL 결측과는 다릅니다.</p>}
        </details>}
      </div>
    </main>
  </>;
}

function SearchBar({ scope, initialScope, filters, noticeFilters, updateRegulations, updateNotices, chooseScope, officialDepartments, availableEvidenceGroups, availabilityCounts, release, appliedDetail, onApplyDetail, advancedOpen, onCloseSettings, count }: {
  scope: Scope;
  initialScope: Scope;
  filters: PublicRegulationFilters;
  noticeFilters: NoticeFilters;
  updateRegulations: (value: Partial<PublicRegulationFilters>) => void;
  updateNotices: (value: Partial<NoticeFilters>) => void;
  chooseScope: (next: Scope) => void;
  officialDepartments: OfficialDepartmentCount[];
  availableEvidenceGroups: EvidenceGroup[];
  availabilityCounts: Record<PublishRegulationRow["availability"], number>;
  release: PublishReleaseMetadata;
  appliedDetail: RegulationDetailSettings;
  onApplyDetail: (value: RegulationDetailSettings) => void;
  advancedOpen: boolean;
  onCloseSettings: () => void;
  count: number;
}) {
  const value = scope === "notice" ? noticeFilters.query : filters.query;
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const setQuery = (query: string) => { updateRegulations({ query }); updateNotices({ query }); };
  const apply = (settings: { scope: Scope; detail: RegulationDetailSettings }, query: string) => {
    if (settings.scope !== scope) chooseScope(settings.scope);
    const selected = settings.detail.availabilityStatuses;
    updateRegulations({ query, availability: (settings.scope === "master" || settings.scope === "all") && selected.length === 1 ? selected[0] : "ALL", currentness: "", partialType: "ALL" });
    updateNotices({ ...emptyNoticeFilters, query });
    onApplyDetail(settings.detail);
  };
  const reset = () => {
    if (scope !== initialScope) chooseScope(initialScope);
    updateRegulations(emptyRegulationFilters);
    updateNotices(emptyNoticeFilters);
    onApplyDetail(defaultDetailSettings(initialScope));
  };
  return <section className="public-searchbar posts-searchbar" aria-label="공개 자료 검색">
    <form className="search-field" role="search" onSubmit={(event) => { event.preventDefault(); setQuery(draft.trim()); }}>
      <label htmlFor="public-search"><span className="sr-only">규정·사규예고·일반 게시물 검색어</span></label>
      <input id="public-search" type="search" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={scope === "posts" ? "게시물 및 첨부문서 제목을 검색하세요" : scope === "notice" ? "사규예고 제목 또는 담당 표기를 검색하세요" : "규정명, 담당 표기, 개정연도를 검색하세요"} />
      <button type="submit">검색</button>
    </form>
    {(scope === "posts" || scope === "all") && <div className="topic-keyword-cloud" aria-label="주요 주제 검색"><span>주요 주제</span>{["책임경영", "연대보증", "대표자", "손해배상", "구상권", "구상금", "채권관리", "소송", "소송위임", "개인정보", "신용정보", "정보공개", "감사", "내부통제", "투자옵션부보증"].map(term => <button key={term} type="button" aria-pressed={value === term} onClick={() => { setDraft(term); setQuery(term); }}>{term}</button>)}</div>}
    <div className="search-meta"><span role="status" aria-live="polite">검색 결과 <strong>{count.toLocaleString("ko-KR")}</strong>건</span><span>검색 버튼 또는 Enter를 눌러 적용합니다.</span></div>
    <RegulationAdvancedSearch open={advancedOpen} onClose={onCloseSettings}
      scope={scope} initialScope={initialScope} availability={filters.availability} appliedDetail={appliedDetail}
      officialDepartments={officialDepartments} availableEvidenceGroups={availableEvidenceGroups} availabilityCounts={availabilityCounts} evidenceAsOf={release.evidence_as_of}
      query={draft} onQueryChange={setDraft} onApply={apply} onReset={reset} />
  </section>;
}

function RegulationTable({ revisionHistories, rows, allRows, rowOffset, release, noticeDates, noticeHistory, sourcesByVersion, sort, setSort, category, partialType, onClearPartial, grouped, advancedOpen, onToggleSettings, detailApplied, selectedAvailability }: { revisionHistories: Record<string, RevisionHistory>; rows: PublishRegulationRow[]; allRows: PublishRegulationRow[]; rowOffset: number; release: PublishReleaseMetadata; noticeDates: Map<string, string>; noticeHistory: Map<string, { count: number; latest: string | null }>; sourcesByVersion: Map<string, PublicRegulationSourceRow[]>; sort: RegulationSort; setSort: (value: RegulationSort) => void; category: PublicRegulationFilters["availability"]; partialType: PublicRegulationFilters["partialType"]; onClearPartial: () => void; grouped: boolean; advancedOpen: boolean; onToggleSettings: (trigger: HTMLButtonElement) => void; detailApplied: boolean; selectedAvailability: PublishRegulationRow["availability"][] }) {
  const noticeOnly = category === "NOTICE_ONLY";
  const activePartial = category === "PARTIAL_PUBLIC" && partialType !== "ALL" ? partialTypeLabels[partialType] : null;
  return <section className="result-group"><div className="notice-heading"><h2>{grouped ? "규정 검색 결과" : category === "ALL" ? "내부규정" : availabilityLabels[category]} <span>({allRows.length.toLocaleString("ko-KR")}건)</span></h2><div className="table-actions">{selectedAvailability.length > 1 && <span className="detail-availability-applied">공개결론: {selectedAvailability.map(status => availabilityLabels[status]).join(" · ")}</span>}{activePartial && <button className="partial-filter-clear" type="button" onClick={onClearPartial} aria-label={`부분공개 속성 ${activePartial} 필터 해제`}>부분공개 속성: {activePartial} <span aria-hidden="true">×</span></button>}{detailApplied && <span className="detail-applied-badge">설정 적용 중</span>}<button className="csv-button" type="button" onClick={() => downloadCsv("kodit_public_regulations.csv", publishRowsToCsv(allRows, release, noticeDates))}><img src="/figma-icons/download.svg" alt=""/>필터 결과 전체 CSV</button><button className="detail-button" type="button" aria-expanded={advancedOpen} aria-controls="advanced-search-panel" onClick={event => onToggleSettings(event.currentTarget)}><img src="/figma-icons/filter.svg" alt=""/>상세 설정</button><select aria-label="규정 정렬" value={sort} onChange={(event) => setSort(event.target.value as RegulationSort)}><option value="REVISION_DESC">최신 개정일 기준</option><option value="NAME_ASC">규정명 가나다</option><option value="NOTICE_DESC">최근 사규예고일 기준</option></select></div></div>
    <div className="table-scroll"><table className="regulations-table public-regulations-table"><thead><tr><th>NO</th><th>규정명</th><th>{noticeOnly ? "최근 사전예고일" : "개정일"}</th><th>확보 상태</th><th>담당부서</th><th>사규예고 이력</th><th>원문 개정이력</th></tr></thead><tbody>{rows.map((row, index) => {
      const url = validPublicUrl(row.source_location); const evidence = sourcesByVersion.get(row.regulation_version_id) ?? [];
      const history = noticeHistory.get(row.regulation_version_id);
      return <tr key={row.regulation_version_id}><td data-label="번호">{rowOffset + index + 1}</td><td data-label="규정명">{url ? <a className="name-link" href={url} target="_blank" rel="noopener noreferrer">{row.display_name}</a> : row.display_name}{row.is_new && <small className="change-mark">NEW</small>}{row.is_updated && <small className="change-mark">UPDATED</small>}</td><td data-label={noticeOnly ? "최근 사전예고일" : "개정일"}>{noticeOnly ? noticeDates.get(row.regulation_version_id) ?? "—" : row.revision_date ?? "—"}</td><td data-label="확보 상태"><span className={`status-flag status-${row.availability.toLowerCase()}`}>{availabilityLabels[row.availability]}</span></td><td data-label="담당부서">{row.notice_department ?? "—"}</td><td data-label="사규예고 이력"><b>{history ? `${history.count}건` : "0건"}</b>{history?.latest && <small>최종: {history.latest}</small>}{row.availability === "SOURCE_UNKNOWN" && <EvidenceLinks rows={evidence} />}</td><td data-label="원문 개정이력">{revisionHistories[row.regulation_version_id] ? <details><summary>제정·개정 {revisionHistories[row.regulation_version_id].entries.length}건</summary><ul>{revisionHistories[row.regulation_version_id].entries.map(entry => <li key={`${entry.label}:${entry.date}`} title={entry.quote}>{entry.label} {entry.date}</li>)}</ul><small>{revisionHistories[row.regulation_version_id].note}</small><a href={revisionHistories[row.regulation_version_id].source_url} target="_blank" rel="noopener noreferrer">근거 전문 ↗</a></details> : "미추출"}</td></tr>;
    })}{allRows.length === 0 && <tr><td colSpan={6} className="empty-result">일치하는 규정이 없습니다. 검색어나 상세 설정을 바꿔 주세요.</td></tr>}</tbody></table></div>
  </section>;
}

function EvidenceLinks({ rows }: { rows: PublicRegulationSourceRow[] }) {
  const safeRows = rows.filter((row) => validPublicUrl(row.source_location)); if (!safeRows.length) return <>확인자료 없음</>;
  return <ul className="evidence-links">{safeRows.map((row, index) => <li key={`${row.source_location}-${index}`}><a href={validPublicUrl(row.source_location)!} target="_blank" rel="noopener noreferrer">{row.attachment_name || row.evidence_role || row.source_kind} ↗</a></li>)}</ul>;
}

function NoticeTable({ rows, allRows, rowOffset, release, grouped, advancedOpen, onToggleSettings, detailApplied }: { rows: PublishNoticeRow[]; allRows: PublishNoticeRow[]; rowOffset: number; release: PublishReleaseMetadata; grouped: boolean; advancedOpen: boolean; onToggleSettings: (trigger: HTMLButtonElement) => void; detailApplied: boolean }) {
  return <section className="result-group"><div className="notice-heading"><h2>{grouped ? "사규예고 검색 결과" : "사규예고 전체"} <span>({allRows.length.toLocaleString("ko-KR")}건)</span></h2><div className="table-actions">{detailApplied && <span className="detail-applied-badge">설정 적용 중</span>}<button className="csv-button" type="button" onClick={() => downloadCsv("kodit_public_notices.csv", publishNoticesToCsv(allRows, release))}>필터 결과 전체 CSV</button><button className="detail-button" type="button" aria-expanded={advancedOpen} aria-controls="advanced-search-panel" onClick={event => onToggleSettings(event.currentTarget)}><img src="/figma-icons/filter.svg" alt=""/>상세 설정</button></div></div><div className="table-scroll"><table className="regulations-table notice-table"><thead><tr><th>번호</th><th>제목</th><th>담당부서</th><th>게시일</th></tr></thead><tbody>{rows.map((notice, index) => <tr key={notice.notice_number}><td data-label="번호">{rowOffset + index + 1}</td><td data-label="제목">{validPublicUrl(notice.source_location) ? <a className="name-link" href={notice.source_location} target="_blank" rel="noopener noreferrer">{notice.title}</a> : notice.title}<CopyTitleButton title={notice.title} /></td><td data-label="담당부서">{notice.notice_department ?? "—"}</td><td data-label="게시일">{notice.posted_date}</td></tr>)}{allRows.length === 0 && <tr><td colSpan={4} className="empty-result">일치하는 사규예고가 없습니다. 검색어나 상세 설정을 바꿔 주세요.</td></tr>}</tbody></table></div></section>;
}

function PublicPostsTable({ posts, count, allPosts, external = false, onToggleSettings }: { posts: PublicPost[]; allPosts: PublicPost[]; count: number; external?: boolean; onToggleSettings: (trigger: HTMLButtonElement) => void }) {
  return <section className="result-group" aria-label="일반 게시물 검색 결과"><div className="notice-heading"><h2>{external ? "외부 공식자료 검색결과" : "전체게시물 검색결과"} ({count.toLocaleString("ko-KR")}건)</h2><div className="table-actions"><button type="button" className="csv-button" onClick={() => downloadCsv("kodit_public_posts.csv", publicPostsToCsv(allPosts))}><img src="/figma-icons/download.svg" alt=""/>필터 결과 전체 CSV</button><button type="button" className="detail-button" aria-controls="advanced-search-panel" onClick={event => onToggleSettings(event.currentTarget)}><img src="/figma-icons/filter.svg" alt=""/>상세 설정</button></div></div><div className="table-scroll"><table className="regulations-table public-posts-table"><thead><tr><th>자료 유형</th><th>제목</th><th>첨부문서</th><th>게시판</th><th>게시일</th></tr></thead><tbody>{posts.map(post => <tr key={`${post.board_id}:${post.post_id ?? post.attachments[0]?.attachment_id}`}><td>{post.document_type}</td><td>{validPublicUrl(post.source_url) ? <a className="name-link" href={post.source_url} target="_blank" rel="noopener noreferrer">{post.title}</a> : post.title}<CopyTitleButton title={post.title} /></td><td>{post.attachments.length ? post.attachments.map(item => <p key={item.attachment_id}>{item.title}</p>) : post.attachment_status === "상세 확인" ? "첨부문서 없음" : "첨부목록 미확인"}</td><td>{post.source_institution ?? "신용보증기금"} · {post.board_name}</td><td>{post.posted_date ?? "게시일 미확인"}</td></tr>)}{count === 0 && <tr><td colSpan={5} className="empty-result">일치하는 일반 게시물이 없습니다.</td></tr>}</tbody></table></div></section>;
}
