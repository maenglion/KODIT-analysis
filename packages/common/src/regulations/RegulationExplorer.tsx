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
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
}
function Pagination({ page, pageCount, setPage }: { page: number; pageCount: number; setPage: (page: number | ((value: number) => number)) => void }) {
  return <div className="pagination"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>이전</button><span>{page} / {pageCount}</span><button disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>다음</button></div>;
}

export function RegulationExplorer({ rows, notices, sources, release, initialScope = "master", initialQuery = "", initialCategory = "ALL" }: Props) {
  const [scope, setScope] = useState<Scope>(initialScope);
  const [filters, setFilters] = useState<PublicRegulationFilters>({ ...emptyRegulationFilters, query: initialQuery, availability: initialCategory });
  const [noticeFilters, setNoticeFilters] = useState<NoticeFilters>({ ...emptyNoticeFilters, query: initialQuery });
  const [regulationSort, setRegulationSort] = useState<RegulationSort>(initialCategory === "NOTICE_ONLY" ? "NOTICE_DESC" : "REVISION_DESC");
  const [page, setPage] = useState(1); const [feedback, setFeedback] = useState(false);
  const noticeDates = useMemo(() => latestNoticeDates(notices), [notices]);
  const filteredRegulations = useMemo(() => sortPublishRegulations(filterPublishRegulations(rows, filters), filters.availability === "NOTICE_ONLY" ? "NOTICE_DESC" : regulationSort, noticeDates), [rows, filters, regulationSort, noticeDates]);
  const filteredNotices = useMemo(() => filterAndSortNotices(notices, noticeFilters), [notices, noticeFilters]);
  const counts = useMemo(() => Object.fromEntries(availabilityOrder.map((status) => [status, rows.filter((row) => row.availability === status).length])) as Record<PublishRegulationRow["availability"], number>, [rows]);
  const currentnessOptions = useMemo(() => [...new Set(rows.map((row) => row.currentness))].sort(), [rows]);
  const departments = useMemo(() => [...new Set(notices.map((row) => row.notice_department).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "ko")), [notices]);
  const sourcesByVersion = useMemo(() => { const map = new Map<string, PublicRegulationSourceRow[]>(); for (const source of sources) map.set(source.regulation_version_id, [...(map.get(source.regulation_version_id) ?? []), source]); return map; }, [sources]);
  const pageSize = 50; const activeLength = scope === "notice" ? filteredNotices.length : filteredRegulations.length;
  const pageCount = Math.max(1, Math.ceil(activeLength / pageSize)); const currentPage = Math.min(page, pageCount); const offset = (currentPage - 1) * pageSize;
  const shownRows = filteredRegulations.slice(offset, offset + pageSize); const shownNotices = filteredNotices.slice(offset, offset + pageSize);

  useEffect(() => {
    const params = new URLSearchParams(); params.set("scope", scope); const query = scope === "notice" ? noticeFilters.query : filters.query;
    if (query) params.set("q", query); if (scope !== "notice" && filters.availability !== "ALL") params.set("category", filters.availability);
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  }, [scope, filters.query, filters.availability, noticeFilters.query]);

  const flash = () => { setFeedback(false); window.setTimeout(() => setFeedback(true), 0); window.setTimeout(() => setFeedback(false), 220); };
  const updateRegulations = (next: Partial<PublicRegulationFilters>) => { setFilters((old) => ({ ...old, ...next })); setPage(1); };
  const updateNotices = (next: Partial<NoticeFilters>) => { setNoticeFilters((old) => ({ ...old, ...next })); setPage(1); };
  const chooseScope = (next: Scope) => { setScope(next); setPage(1); if (next === "notice") updateNotices({ query: filters.query }); else updateRegulations({ query: noticeFilters.query }); };
  const chooseCategory = (availability: PublicRegulationFilters["availability"]) => { setScope("master"); updateRegulations({ availability, partialType: "ALL" }); if (availability === "NOTICE_ONLY") setRegulationSort("NOTICE_DESC"); flash(); };

  return <>
    <section className="review-hero shell public-summary">
      <p className="eyebrow">규정·법령</p><div className="title-line"><h1>신용보증기금 규정 공개현황</h1><span className="review-badge">승인본</span></div>
      <dl className="public-release-meta"><div><dt>데이터 기준일</dt><dd>{release.evidence_as_of}</dd></div><div><dt>공개본 생성일</dt><dd>{release.generated_at.slice(0, 10)}</dd></div><div><dt>전체 규정</dt><dd>{release.population.toLocaleString("ko-KR")}건</dd></div></dl>
      <div className="category-grid" aria-label="공개현황 분류">
        <button className={scope === "notice" ? "active" : ""} onClick={() => chooseScope("notice")}><span>사규예고</span><strong>{notices.length.toLocaleString("ko-KR")}</strong></button>
        <button className={scope === "master" && filters.availability === "ALL" ? "active" : ""} onClick={() => chooseCategory("ALL")}><span>전체 규정</span><strong>{rows.length.toLocaleString("ko-KR")}</strong></button>
        {availabilityOrder.map((status) => <button key={status} className={scope === "master" && filters.availability === status ? "active" : ""} onClick={() => chooseCategory(status)}><span>{availabilityLabels[status]}</span><strong>{counts[status].toLocaleString("ko-KR")}</strong></button>)}
      </div>
      {filters.availability === "PARTIAL_PUBLIC" && scope === "master" && <div className="partial-tabs">{[["ALL", "전체"], ["ALIO", "ALIO"], ["KODIT_PAGE", "신보 사이트"], ["ATTACHMENT", "첨부파일"]].map(([value, label]) => <button key={value} className={filters.partialType === value ? "active" : ""} onClick={() => updateRegulations({ partialType: value as PublicRegulationFilters["partialType"] })}>{label}</button>)}</div>}
      {filters.availability === "SOURCE_UNKNOWN" && scope === "master" && <p className="source-unknown-note">해당 규정 버전에 검증된 공식 전문·일부공개·사규예고 출처가 연결되지 않은 상태입니다. 단순 URL 결측을 뜻하지 않습니다.</p>}
    </section>

    <main className={`shell public-table-shell ${feedback ? "category-feedback" : ""}`}>
      <section className="table-panel">
        <div className="scope-tabs" aria-label="검색 범위">{[["master", "전체 규정"], ["notice", "사규예고"], ["all", "통합검색"]].map(([value, label]) => <button key={value} className={scope === value ? "active" : ""} onClick={() => chooseScope(value as Scope)}>{label}</button>)}</div>
        <SearchBar scope={scope} filters={filters} noticeFilters={noticeFilters} updateRegulations={updateRegulations} updateNotices={updateNotices} currentnessOptions={currentnessOptions} departments={departments} count={scope === "all" ? filteredRegulations.length + filteredNotices.length : activeLength} />
        {scope !== "notice" && <RegulationTable rows={scope === "all" ? filteredRegulations.slice(0, 50) : shownRows} allRows={filteredRegulations} rowOffset={scope === "all" ? 0 : offset} release={release} noticeDates={noticeDates} sourcesByVersion={sourcesByVersion} sort={regulationSort} setSort={setRegulationSort} category={filters.availability} grouped={scope === "all"} />}
        {scope !== "master" && <NoticeTable rows={scope === "all" ? filteredNotices.slice(0, 50) : shownNotices} allRows={filteredNotices} rowOffset={scope === "all" ? 0 : offset} release={release} grouped={scope === "all"} />}
        {scope !== "all" && <Pagination page={currentPage} pageCount={pageCount} setPage={setPage} />}
      </section>
    </main>
  </>;
}

function SearchBar({ scope, filters, noticeFilters, updateRegulations, updateNotices, currentnessOptions, departments, count }: { scope: Scope; filters: PublicRegulationFilters; noticeFilters: NoticeFilters; updateRegulations: (value: Partial<PublicRegulationFilters>) => void; updateNotices: (value: Partial<NoticeFilters>) => void; currentnessOptions: string[]; departments: string[]; count: number }) {
  const value = scope === "notice" ? noticeFilters.query : filters.query; const setQuery = (query: string) => { updateRegulations({ query }); updateNotices({ query }); };
  return <div className="public-searchbar"><label><span className="sr-only">검색</span><input type="search" value={value} onChange={(event) => setQuery(event.target.value)} placeholder={scope === "notice" ? "사규예고 제목을 검색하세요" : "규정명·부서·개정연도를 검색하세요"} /></label>
    <details><summary>상세검색</summary><div className="detail-search">
      {scope !== "notice" && <><label><span>공개결론</span><select value={filters.availability} onChange={(event) => updateRegulations({ availability: event.target.value as PublicRegulationFilters["availability"] })}><option value="ALL">전체</option>{availabilityOrder.map((status) => <option key={status} value={status}>{availabilityLabels[status]}</option>)}</select></label><label><span>현행상태</span><select value={filters.currentness} onChange={(event) => updateRegulations({ currentness: event.target.value })}><option value="">전체</option>{currentnessOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label></>}
      {scope !== "master" && <><label><span>시작일</span><input type="date" value={noticeFilters.startDate} onChange={(event) => updateNotices({ startDate: event.target.value })} /></label><label><span>종료일</span><input type="date" value={noticeFilters.endDate} onChange={(event) => updateNotices({ endDate: event.target.value })} /></label><label><span>연도</span><input inputMode="numeric" value={noticeFilters.year} onChange={(event) => updateNotices({ year: event.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="예: 2026" /></label><label><span>담당부서</span><select value={noticeFilters.department} onChange={(event) => updateNotices({ department: event.target.value })}><option value="">전체</option>{departments.map((item) => <option key={item}>{item}</option>)}</select></label><label className="check-label"><input type="checkbox" checked={noticeFilters.unmappedOnly} onChange={(event) => updateNotices({ unmappedOnly: event.target.checked })} /> 기타·개인표기</label></>}
      <button onClick={() => { updateRegulations(emptyRegulationFilters); updateNotices(emptyNoticeFilters); }}>검색조건 초기화</button>
    </div></details><div className="result-count"><span>검색 결과</span><strong>{count.toLocaleString("ko-KR")}건</strong></div>
  </div>;
}

function RegulationTable({ rows, allRows, rowOffset, release, noticeDates, sourcesByVersion, sort, setSort, category, grouped }: { rows: PublishRegulationRow[]; allRows: PublishRegulationRow[]; rowOffset: number; release: PublishReleaseMetadata; noticeDates: Map<string, string>; sourcesByVersion: Map<string, PublicRegulationSourceRow[]>; sort: RegulationSort; setSort: (value: RegulationSort) => void; category: PublicRegulationFilters["availability"]; grouped: boolean }) {
  const noticeOnly = category === "NOTICE_ONLY";
  return <div className="result-group"><div className="notice-heading"><div><p>{grouped ? "규정 검색 결과" : category === "ALL" ? "전체 규정" : availabilityLabels[category]}</p><strong>{allRows.length.toLocaleString("ko-KR")}건</strong></div><div className="table-actions"><select value={sort} onChange={(event) => setSort(event.target.value as RegulationSort)}><option value="REVISION_DESC">개정일 최신순</option><option value="NAME_ASC">규정명 가나다</option><option value="NOTICE_DESC">최근 사규예고일 최신순</option></select><button className="csv-button" onClick={() => downloadCsv("kodit_public_regulations.csv", publishRowsToCsv(allRows, release, noticeDates))}>현재 목록 CSV</button></div></div>
    <div className="table-scroll"><table className="regulations-table public-regulations-table"><thead><tr><th>번호</th><th>규정명</th><th>공개결론</th><th>{noticeOnly ? "최근 사전예고일" : "개정일"}</th><th>사규예고 담당부서</th><th>{category === "SOURCE_UNKNOWN" ? "확인자료" : "공식 링크"}</th></tr></thead><tbody>{rows.map((row, index) => {
      const url = validPublicUrl(row.source_location); const evidence = sourcesByVersion.get(row.regulation_version_id) ?? [];
      return <tr key={row.regulation_version_id}><td data-label="번호">{rowOffset + index + 1}</td><td data-label="규정명">{url ? <a className="name-link" href={url} target="_blank" rel="noopener noreferrer">{row.display_name}</a> : row.display_name}{row.is_new && <small className="change-mark">NEW</small>}{row.is_updated && <small className="change-mark">UPDATED</small>}</td><td data-label="공개결론"><span className={`status-flag status-${row.availability.toLowerCase()}`}>{availabilityLabels[row.availability]}</span></td><td data-label={noticeOnly ? "최근 사전예고일" : "개정일"}>{noticeOnly ? noticeDates.get(row.regulation_version_id) ?? "—" : row.revision_date ?? "—"}</td><td data-label="담당부서">{row.notice_department ?? "—"}</td><td data-label="확인자료">{row.availability === "SOURCE_UNKNOWN" ? <EvidenceLinks rows={evidence} /> : url ? <a className="source-text-link" href={url} target="_blank" rel="noopener noreferrer">열기 ↗</a> : "—"}</td></tr>;
    })}</tbody></table></div></div>;
}

function EvidenceLinks({ rows }: { rows: PublicRegulationSourceRow[] }) {
  const safeRows = rows.filter((row) => validPublicUrl(row.source_location)); if (!safeRows.length) return <>확인자료 없음</>;
  return <ul className="evidence-links">{safeRows.map((row, index) => <li key={`${row.source_location}-${index}`}><a href={validPublicUrl(row.source_location)!} target="_blank" rel="noopener noreferrer">{row.attachment_name || row.evidence_role || row.source_kind} ↗</a></li>)}</ul>;
}

function NoticeTable({ rows, allRows, rowOffset, release, grouped }: { rows: PublishNoticeRow[]; allRows: PublishNoticeRow[]; rowOffset: number; release: PublishReleaseMetadata; grouped: boolean }) {
  return <div className="result-group"><div className="notice-heading"><div><p>{grouped ? "사규예고 검색 결과" : "사규예고 전체"}</p><strong>{allRows.length.toLocaleString("ko-KR")}건</strong></div><button className="csv-button" onClick={() => downloadCsv("kodit_public_notices.csv", publishNoticesToCsv(allRows, release))}>현재 목록 CSV</button></div><div className="table-scroll"><table className="regulations-table notice-table"><thead><tr><th>번호</th><th>제목</th><th>담당부서</th><th>게시일</th></tr></thead><tbody>{rows.map((notice, index) => <tr key={notice.notice_number}><td data-label="번호">{rowOffset + index + 1}</td><td data-label="제목">{validPublicUrl(notice.source_location) ? <a className="name-link" href={notice.source_location} target="_blank" rel="noopener noreferrer">{notice.title}</a> : notice.title}</td><td data-label="담당부서">{notice.notice_department ?? "—"}</td><td data-label="게시일">{notice.posted_date}</td></tr>)}</tbody></table></div></div>;
}
