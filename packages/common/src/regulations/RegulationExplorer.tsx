"use client";

import { useEffect, useMemo, useState } from "react";
import {
  availabilityLabels, availabilityOrder, filterAndSortNotices, filterPublishRegulations, latestNoticeDates,
  publishNoticesToCsv, publishRowsToCsv, sortPublishRegulations, validPublicUrl,
  type NoticeFilters, type PublicRegulationFilters, type PublicRegulationSourceRow, type PublishNoticeRow,
  type PublishRegulationRow, type PublishReleaseMetadata, type RegulationSort,
} from "./index";

type Scope = "master" | "notice" | "all";
type Props = { rows: PublishRegulationRow[]; notices: PublishNoticeRow[]; sources: PublicRegulationSourceRow[]; release: PublishReleaseMetadata; initialScope?: Scope; initialQuery?: string; initialCategory?: PublicRegulationFilters["availability"] };
const emptyRegulationFilters: PublicRegulationFilters = { query: "", availability: "ALL", currentness: "", partialType: "ALL" };
const emptyNoticeFilters: NoticeFilters = { query: "", startDate: "", endDate: "", year: "", department: "", unmappedOnly: false };

function downloadCsv(name: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toggleAdvancedSearch() {
  const panel = document.getElementById("advanced-search-panel") as HTMLDetailsElement | null;
  if (!panel) return;
  panel.open = !panel.open;
  if (panel.open) panel.scrollIntoView({ behavior: "smooth", block: "center" });
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

export function RegulationExplorer({ rows, notices, sources, release, initialScope = "master", initialQuery = "", initialCategory = "ALL" }: Props) {
  const [scope, setScope] = useState<Scope>(initialScope);
  const [filters, setFilters] = useState<PublicRegulationFilters>({ ...emptyRegulationFilters, query: initialQuery, availability: initialCategory });
  const [noticeFilters, setNoticeFilters] = useState<NoticeFilters>({ ...emptyNoticeFilters, query: initialQuery });
  const [regulationSort, setRegulationSort] = useState<RegulationSort>(initialCategory === "NOTICE_ONLY" ? "NOTICE_DESC" : "REVISION_DESC");
  const [page, setPage] = useState(1);
  const [combinedRegPage, setCombinedRegPage] = useState(1);
  const [combinedNoticePage, setCombinedNoticePage] = useState(1);
  const [termsOpen, setTermsOpen] = useState(false);
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
  const filteredRegulations = useMemo(() => sortPublishRegulations(filterPublishRegulations(rows, filters), filters.availability === "NOTICE_ONLY" ? "NOTICE_DESC" : regulationSort, noticeDates), [rows, filters, regulationSort, noticeDates]);
  const filteredNotices = useMemo(() => filterAndSortNotices(notices, noticeFilters), [notices, noticeFilters]);
  const counts = useMemo(() => Object.fromEntries(availabilityOrder.map((status) => [status, rows.filter((row) => row.availability === status).length])) as Record<PublishRegulationRow["availability"], number>, [rows]);
  const currentnessOptions = useMemo(() => [...new Set(rows.map((row) => row.currentness))].sort(), [rows]);
  const departments = useMemo(() => [...new Set(notices.map((row) => row.notice_department).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "ko")), [notices]);
  const sourcesByVersion = useMemo(() => {
    const map = new Map<string, PublicRegulationSourceRow[]>();
    for (const source of sources) map.set(source.regulation_version_id, [...(map.get(source.regulation_version_id) ?? []), source]);
    return map;
  }, [sources]);
  const pageSize = 50;
  const activeLength = scope === "notice" ? filteredNotices.length : filteredRegulations.length;
  const pageCount = Math.max(1, Math.ceil(activeLength / pageSize));
  const currentPage = Math.min(page, pageCount);
  const offset = (currentPage - 1) * pageSize;
  const combinedRegPages = Math.max(1, Math.ceil(filteredRegulations.length / pageSize));
  const combinedNoticePages = Math.max(1, Math.ceil(filteredNotices.length / pageSize));
  const currentCombinedRegPage = Math.min(combinedRegPage, combinedRegPages);
  const currentCombinedNoticePage = Math.min(combinedNoticePage, combinedNoticePages);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("scope", scope);
    const query = scope === "notice" ? noticeFilters.query : filters.query;
    if (query) params.set("q", query);
    if (scope !== "notice" && filters.availability !== "ALL") params.set("category", filters.availability);
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  }, [scope, filters.query, filters.availability, noticeFilters.query]);

  const updateRegulations = (next: Partial<PublicRegulationFilters>) => { setFilters((old) => ({ ...old, ...next })); setPage(1); setCombinedRegPage(1); };
  const updateNotices = (next: Partial<NoticeFilters>) => { setNoticeFilters((old) => ({ ...old, ...next })); setPage(1); setCombinedNoticePage(1); };
  const chooseScope = (next: Scope) => { setScope(next); setPage(1); if (next === "notice") updateNotices({ query: filters.query }); else updateRegulations({ query: noticeFilters.query }); };
  const chooseCategory = (availability: PublicRegulationFilters["availability"]) => { setScope("master"); updateRegulations({ availability, partialType: "ALL" }); if (availability === "NOTICE_ONLY") setRegulationSort("NOTICE_DESC"); };

  return <>
    <section className="public-page-intro">
      <div className="shell intro-inner">
        <div className="intro-copy">
          <p className="breadcrumb"><a href="/">HOME</a> &gt; <b>{scope === "notice" ? "사규예고" : "내부규정(분석)"}</b></p>
          <h1>{scope === "notice" ? "신용보증기금 사규예고" : "신용보증기금 규정 공개현황"}</h1>
          <p>전체 사규예고 {notices.length.toLocaleString("ko-KR")}건의 공식 관찰값을 규정에 연결해 보여줍니다. 동일 규정의 여러 예고는 하나의 규정 버전으로 묶으며, 공개 범위와 공식 원문은 승인된 근거를 따릅니다.</p>
        </div>
        <div className="database-state"><img src="/figma-icons/database.svg" alt=""/><b>승인된 정적 공개본</b><span>생성일: {release.generated_at.slice(0, 10).replaceAll("-", ".")}</span></div>
      </div>
    </section>
    <section className="release-meta-bar"><div className="shell">
      <dl className="public-release-meta"><div><dt>데이터 기준일</dt><dd>{release.evidence_as_of}</dd></div><div><dt>공개본 생성일</dt><dd>{release.generated_at.slice(0, 10)}</dd></div><div><dt>전체 규정</dt><dd>{release.population.toLocaleString("ko-KR")}건</dd></div></dl>
      <button className="terms-button" type="button" aria-expanded={termsOpen} aria-controls="public-terms" onClick={() => setTermsOpen((value) => !value)}><img src="/figma-icons/help.svg" alt=""/>용어 및 해석</button>
    </div></section>
    {termsOpen && <aside className="terms-content" id="public-terms" aria-label="공개 데이터 용어 및 해석"><div className="shell">
      <div><strong>공개결론</strong><p>공식 경로에서 확인된 자료의 공개 범위입니다. 규정의 현행 여부나 법적 효력을 뜻하지 않습니다.</p></div>
      <div><strong>데이터 기준일</strong><p>승인된 공개본이 참조한 근거 기준일입니다. 생성일은 파일을 만든 날짜이며 실시간 수집 시각이 아닙니다.</p></div>
      <div><strong>사규예고 이력</strong><p>규정 버전에 연결된 예고 게시물의 수입니다. 예고 이력이 있다고 개정이 확정되었다는 뜻은 아닙니다.</p></div>
    </div></aside>}
    <main className="public-table-shell">
      <div className="shell">
        <SearchBar scope={scope} filters={filters} noticeFilters={noticeFilters} updateRegulations={updateRegulations} updateNotices={updateNotices} chooseScope={chooseScope} currentnessOptions={currentnessOptions} departments={departments} count={scope === "all" ? filteredRegulations.length + filteredNotices.length : activeLength} />
        <div id="search-results">
          {scope !== "notice" && <><RegulationTable rows={scope === "all" ? filteredRegulations.slice((currentCombinedRegPage - 1) * pageSize, currentCombinedRegPage * pageSize) : filteredRegulations.slice(offset, offset + pageSize)} allRows={filteredRegulations} rowOffset={scope === "all" ? (currentCombinedRegPage - 1) * pageSize : offset} release={release} noticeDates={noticeDates} noticeHistory={noticeHistory} sourcesByVersion={sourcesByVersion} sort={regulationSort} setSort={setRegulationSort} category={filters.availability} grouped={scope === "all"} />{scope === "all" && <Pagination label="규정 검색 결과" page={currentCombinedRegPage} pageCount={combinedRegPages} setPage={setCombinedRegPage} />}</>}
          {scope !== "master" && <><NoticeTable rows={scope === "all" ? filteredNotices.slice((currentCombinedNoticePage - 1) * pageSize, currentCombinedNoticePage * pageSize) : filteredNotices.slice(offset, offset + pageSize)} allRows={filteredNotices} rowOffset={scope === "all" ? (currentCombinedNoticePage - 1) * pageSize : offset} release={release} grouped={scope === "all"} />{scope === "all" && <Pagination label="사규예고 검색 결과" page={currentCombinedNoticePage} pageCount={combinedNoticePages} setPage={setCombinedNoticePage} />}</>}
          {scope !== "all" && <Pagination page={currentPage} pageCount={pageCount} setPage={setPage} />}
        </div>
        {scope !== "notice" && <details className="category-disclosure">
          <summary>공개 범위별 현황 <span>전체 {rows.length.toLocaleString("ko-KR")}건 · 분류 선택</span></summary>
          <div className="category-grid" aria-label="공개현황 분류">
            <button type="button" className={scope === "master" && filters.availability === "ALL" ? "active" : ""} aria-pressed={scope === "master" && filters.availability === "ALL"} onClick={() => chooseCategory("ALL")}><span>전체 규정</span><strong>{rows.length.toLocaleString("ko-KR")}</strong></button>
            {availabilityOrder.map((status) => <button type="button" key={status} className={scope === "master" && filters.availability === status ? "active" : ""} aria-pressed={scope === "master" && filters.availability === status} onClick={() => chooseCategory(status)}><span>{availabilityLabels[status]}</span><strong>{counts[status].toLocaleString("ko-KR")}</strong></button>)}
          </div>
          {filters.availability === "PARTIAL_PUBLIC" && <div className="partial-tabs">{[["ALL", "전체"], ["ALIO", "ALIO"], ["KODIT_PAGE", "신보 사이트"], ["ATTACHMENT", "첨부파일"]].map(([value, label]) => <button type="button" key={value} aria-pressed={filters.partialType === value} className={filters.partialType === value ? "active" : ""} onClick={() => updateRegulations({ partialType: value as PublicRegulationFilters["partialType"] })}>{label}</button>)}</div>}
          {filters.availability === "SOURCE_UNKNOWN" && <p className="source-unknown-note">이 버전에 검증된 공식 전문·일부공개·사규예고 출처가 연결되지 않았습니다. 단순 URL 결측과는 다릅니다.</p>}
        </details>}
      </div>
    </main>
  </>;
}

function SearchBar({ scope, filters, noticeFilters, updateRegulations, updateNotices, chooseScope, currentnessOptions, departments, count }: {
  scope: Scope;
  filters: PublicRegulationFilters;
  noticeFilters: NoticeFilters;
  updateRegulations: (value: Partial<PublicRegulationFilters>) => void;
  updateNotices: (value: Partial<NoticeFilters>) => void;
  chooseScope: (next: Scope) => void;
  currentnessOptions: string[];
  departments: string[];
  count: number;
}) {
  const value = scope === "notice" ? noticeFilters.query : filters.query;
  const [draft, setDraft] = useState(value);
  const [settings, setSettings] = useState({ scope, availability: filters.availability, currentness: filters.currentness, startDate: noticeFilters.startDate, endDate: noticeFilters.endDate, year: noticeFilters.year, department: noticeFilters.department, unmappedOnly: noticeFilters.unmappedOnly });
  useEffect(() => setDraft(value), [value]);
  useEffect(() => setSettings({ scope, availability: filters.availability, currentness: filters.currentness, startDate: noticeFilters.startDate, endDate: noticeFilters.endDate, year: noticeFilters.year, department: noticeFilters.department, unmappedOnly: noticeFilters.unmappedOnly }), [scope, filters.availability, filters.currentness, noticeFilters.startDate, noticeFilters.endDate, noticeFilters.year, noticeFilters.department, noticeFilters.unmappedOnly]);
  const setQuery = (query: string) => { updateRegulations({ query }); updateNotices({ query }); };
  const apply = () => {
    if (settings.scope !== scope) chooseScope(settings.scope);
    updateRegulations({ query: draft.trim(), availability: settings.availability, currentness: settings.currentness });
    updateNotices({ query: draft.trim(), startDate: settings.startDate, endDate: settings.endDate, year: settings.year, department: settings.department, unmappedOnly: settings.unmappedOnly });
  };
  const reset = () => {
    setDraft("");
    updateRegulations(emptyRegulationFilters);
    updateNotices(emptyNoticeFilters);
    setSettings({ scope, availability: "ALL", currentness: "", startDate: "", endDate: "", year: "", department: "", unmappedOnly: false });
  };
  return <section className="public-searchbar" aria-label="공개 자료 검색">
    <form className="search-field" role="search" onSubmit={(event) => { event.preventDefault(); setQuery(draft.trim()); }}>
      <label htmlFor="public-search"><span className="sr-only">규정 및 사규예고 검색어</span></label>
      <input id="public-search" type="search" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={scope === "notice" ? "사규예고 제목을 입력해 검색하세요" : "규정명, 부서, 주제, 개정연도 등을 입력해 검색하세요"} />
      <button type="submit">검색</button>
    </form>
    <div className="search-meta"><span role="status" aria-live="polite">검색 결과 <strong>{count.toLocaleString("ko-KR")}</strong>건</span><span>검색 버튼 또는 Enter를 눌러 적용합니다.</span></div>
    <details className="advanced-search" id="advanced-search-panel"><summary>상세 설정 <span aria-hidden="true">⌄</span></summary>
      <div className="detail-search">
        <fieldset className="search-scope"><legend>검색 범위</legend>{[["master", "내부규정"], ["notice", "사규예고"], ["all", "통합검색"]].map(([item, label]) => <label key={item}><input type="radio" name="scope" checked={settings.scope === item} onChange={() => setSettings((old) => ({ ...old, scope: item as Scope }))} /> {label}</label>)}</fieldset>
        {settings.scope !== "notice" && <><label>공개결론<select value={settings.availability} onChange={(event) => setSettings((old) => ({ ...old, availability: event.target.value as PublicRegulationFilters["availability"] }))}><option value="ALL">전체</option>{availabilityOrder.map((status) => <option key={status} value={status}>{availabilityLabels[status]}</option>)}</select></label><label>현행상태<select value={settings.currentness} onChange={(event) => setSettings((old) => ({ ...old, currentness: event.target.value }))}><option value="">전체</option>{currentnessOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label></>}
        {settings.scope !== "master" && <><label>시작일<input type="date" value={settings.startDate} onChange={(event) => setSettings((old) => ({ ...old, startDate: event.target.value }))} /></label><label>종료일<input type="date" value={settings.endDate} onChange={(event) => setSettings((old) => ({ ...old, endDate: event.target.value }))} /></label><label>게시 연도<input inputMode="numeric" value={settings.year} onChange={(event) => setSettings((old) => ({ ...old, year: event.target.value.replace(/\D/g, "").slice(0, 4) }))} placeholder="예: 2026" /></label><label>담당부서<select value={settings.department} onChange={(event) => setSettings((old) => ({ ...old, department: event.target.value }))}><option value="">전체</option>{departments.map((item) => <option key={item}>{item}</option>)}</select></label><label className="check-label"><input type="checkbox" checked={settings.unmappedOnly} onChange={(event) => setSettings((old) => ({ ...old, unmappedOnly: event.target.checked }))} /> 기타·개인 표기만</label></>}
        <div className="detail-search-actions"><button type="button" className="reset-button" onClick={reset}>초기화</button><button type="button" className="apply-button" onClick={apply}>적용</button></div>
      </div>
    </details>
  </section>;
}

function RegulationTable({ rows, allRows, rowOffset, release, noticeDates, noticeHistory, sourcesByVersion, sort, setSort, category, grouped }: { rows: PublishRegulationRow[]; allRows: PublishRegulationRow[]; rowOffset: number; release: PublishReleaseMetadata; noticeDates: Map<string, string>; noticeHistory: Map<string, { count: number; latest: string | null }>; sourcesByVersion: Map<string, PublicRegulationSourceRow[]>; sort: RegulationSort; setSort: (value: RegulationSort) => void; category: PublicRegulationFilters["availability"]; grouped: boolean }) {
  const noticeOnly = category === "NOTICE_ONLY";
  return <section className="result-group"><div className="notice-heading"><h2>{grouped ? "규정 검색 결과" : category === "ALL" ? "내부규정" : availabilityLabels[category]} <span>({allRows.length.toLocaleString("ko-KR")}건)</span></h2><div className="table-actions"><button className="csv-button" type="button" onClick={() => downloadCsv("kodit_public_regulations.csv", publishRowsToCsv(allRows, release, noticeDates))}><img src="/figma-icons/download.svg" alt=""/>다운로드(CSV)</button><button className="detail-button" type="button" onClick={toggleAdvancedSearch}><img src="/figma-icons/filter.svg" alt=""/>상세 설정</button><select aria-label="규정 정렬" value={sort} onChange={(event) => setSort(event.target.value as RegulationSort)}><option value="REVISION_DESC">최신 개정일 기준</option><option value="NAME_ASC">규정명 가나다</option><option value="NOTICE_DESC">최근 사규예고일 기준</option></select></div></div>
    <div className="table-scroll"><table className="regulations-table public-regulations-table"><thead><tr><th>NO</th><th>규정명</th><th>{noticeOnly ? "최근 사전예고일" : "개정일"}</th><th>확보 상태</th><th>담당부서</th><th>사규예고 이력</th></tr></thead><tbody>{rows.map((row, index) => {
      const url = validPublicUrl(row.source_location); const evidence = sourcesByVersion.get(row.regulation_version_id) ?? [];
      const history = noticeHistory.get(row.regulation_version_id);
      return <tr key={row.regulation_version_id}><td data-label="번호">{rowOffset + index + 1}</td><td data-label="규정명">{url ? <a className="name-link" href={url} target="_blank" rel="noopener noreferrer">{row.display_name}</a> : row.display_name}{row.is_new && <small className="change-mark">NEW</small>}{row.is_updated && <small className="change-mark">UPDATED</small>}</td><td data-label={noticeOnly ? "최근 사전예고일" : "개정일"}>{noticeOnly ? noticeDates.get(row.regulation_version_id) ?? "—" : row.revision_date ?? "—"}</td><td data-label="확보 상태"><span className={`status-flag status-${row.availability.toLowerCase()}`}>{availabilityLabels[row.availability]}</span></td><td data-label="담당부서">{row.notice_department ?? "—"}</td><td data-label="사규예고 이력"><b>{history ? `${history.count}건` : "0건"}</b>{history?.latest && <small>최종: {history.latest}</small>}{row.availability === "SOURCE_UNKNOWN" && <EvidenceLinks rows={evidence} />}</td></tr>;
    })}{allRows.length === 0 && <tr><td colSpan={6} className="empty-result">일치하는 규정이 없습니다. 검색어나 상세 설정을 바꿔 주세요.</td></tr>}</tbody></table></div>
  </section>;
}

function EvidenceLinks({ rows }: { rows: PublicRegulationSourceRow[] }) {
  const safeRows = rows.filter((row) => validPublicUrl(row.source_location)); if (!safeRows.length) return <>확인자료 없음</>;
  return <ul className="evidence-links">{safeRows.map((row, index) => <li key={`${row.source_location}-${index}`}><a href={validPublicUrl(row.source_location)!} target="_blank" rel="noopener noreferrer">{row.attachment_name || row.evidence_role || row.source_kind} ↗</a></li>)}</ul>;
}

function NoticeTable({ rows, allRows, rowOffset, release, grouped }: { rows: PublishNoticeRow[]; allRows: PublishNoticeRow[]; rowOffset: number; release: PublishReleaseMetadata; grouped: boolean }) {
  return <section className="result-group"><div className="notice-heading"><h2>{grouped ? "사규예고 검색 결과" : "사규예고 전체"} <span>({allRows.length.toLocaleString("ko-KR")}건)</span></h2><button className="csv-button" type="button" onClick={() => downloadCsv("kodit_public_notices.csv", publishNoticesToCsv(allRows, release))}>현재 목록 CSV</button></div><div className="table-scroll"><table className="regulations-table notice-table"><thead><tr><th>번호</th><th>제목</th><th>담당부서</th><th>게시일</th></tr></thead><tbody>{rows.map((notice, index) => <tr key={notice.notice_number}><td data-label="번호">{rowOffset + index + 1}</td><td data-label="제목">{validPublicUrl(notice.source_location) ? <a className="name-link" href={notice.source_location} target="_blank" rel="noopener noreferrer">{notice.title}</a> : notice.title}</td><td data-label="담당부서">{notice.notice_department ?? "—"}</td><td data-label="게시일">{notice.posted_date}</td></tr>)}{allRows.length === 0 && <tr><td colSpan={4} className="empty-result">일치하는 사규예고가 없습니다. 검색어나 상세 설정을 바꿔 주세요.</td></tr>}</tbody></table></div></section>;
}
