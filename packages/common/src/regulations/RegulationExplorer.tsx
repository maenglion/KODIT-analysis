"use client";

import { useMemo, useState } from "react";
import { availabilityLabels, availabilityOrder, currentnessLabels, filterPublishRegulations, publishRowsToCsv, validPublicUrl, type PublicRegulationFilters, type PublishNoticeRow, type PublishRegulationRow, type PublishReleaseMetadata } from "./index";

type Props = { rows: PublishRegulationRow[]; notices: PublishNoticeRow[]; release: PublishReleaseMetadata };
type View = "REGULATIONS" | "NOTICES";
const initialFilters: PublicRegulationFilters = { query: "", availability: "ALL", currentness: "", partialType: "ALL" };

function downloadCsv(name: string, rows: PublishRegulationRow[]) {
  const blob = new Blob([publishRowsToCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
}

export function RegulationExplorer({ rows, notices, release }: Props) {
  const [view, setView] = useState<View>("REGULATIONS");
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => filterPublishRegulations(rows, filters), [rows, filters]);
  const counts = useMemo(() => Object.fromEntries(availabilityOrder.map((status) => [status, rows.filter((row) => row.availability === status).length])) as Record<PublishRegulationRow["availability"], number>, [rows]);
  const currentnessOptions = useMemo(() => [...new Set(rows.map((row) => row.currentness))].sort(), [rows]);
  const pageSize = 50;
  const pageCount = Math.max(1, Math.ceil((view === "REGULATIONS" ? filtered.length : notices.length) / pageSize));
  const currentPage = Math.min(page, pageCount);
  const shownRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const shownNotices = notices.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const update = (next: Partial<PublicRegulationFilters>) => { setFilters((old) => ({ ...old, ...next })); setPage(1); setView("REGULATIONS"); };
  const selectStatus = (availability: PublicRegulationFilters["availability"]) => update({ availability, partialType: "ALL" });

  return <>
    <section className="review-hero shell public-summary">
      <p className="eyebrow">규정·법령</p>
      <div className="title-line"><h1>신용보증기금 규정 공개현황</h1><span className="review-badge">승인본</span></div>
      <dl className="public-release-meta">
        <div><dt>데이터 기준일</dt><dd>{release.evidence_as_of}</dd></div>
        <div><dt>공개본 생성일</dt><dd>{release.generated_at.slice(0, 10)}</dd></div>
        <div><dt>전체 규정</dt><dd>{release.population.toLocaleString("ko-KR")}건</dd></div>
      </dl>
      <div className="category-grid" aria-label="공개현황 분류">
        <button className={view === "NOTICES" ? "active" : ""} onClick={() => { setView("NOTICES"); setPage(1); }}><span>사규예고</span><strong>{notices.length.toLocaleString("ko-KR")}</strong></button>
        <button className={view === "REGULATIONS" && filters.availability === "ALL" ? "active" : ""} onClick={() => selectStatus("ALL")}><span>전체 규정</span><strong>{rows.length.toLocaleString("ko-KR")}</strong></button>
        {availabilityOrder.map((status) => <button key={status} className={view === "REGULATIONS" && filters.availability === status ? "active" : ""} onClick={() => selectStatus(status)}><span>{availabilityLabels[status]}</span><strong>{counts[status].toLocaleString("ko-KR")}</strong></button>)}
      </div>
      {filters.availability === "PARTIAL_PUBLIC" && <div className="partial-tabs" aria-label="일부공개 위치">
        {[["ALL", "전체"], ["ALIO", "ALIO"], ["KODIT_PAGE", "신보 사이트"], ["ATTACHMENT", "첨부파일"]].map(([value, label]) => <button key={value} className={filters.partialType === value ? "active" : ""} onClick={() => update({ partialType: value as PublicRegulationFilters["partialType"] })}>{label}</button>)}
      </div>}
    </section>

    <main className="shell public-table-shell">
      {view === "REGULATIONS" ? <section className="table-panel">
        <div className="public-searchbar">
          <label><span className="sr-only">규정명 검색</span><input type="search" value={filters.query} onChange={(event) => update({ query: event.target.value })} placeholder="규정명을 검색하세요" /></label>
          <details><summary>상세검색</summary><div className="detail-search">
            <label><span>공개결론</span><select value={filters.availability} onChange={(event) => update({ availability: event.target.value as PublicRegulationFilters["availability"] })}><option value="ALL">전체</option>{availabilityOrder.map((status) => <option key={status} value={status}>{availabilityLabels[status]}</option>)}</select></label>
            <label><span>현행상태</span><select value={filters.currentness} onChange={(event) => update({ currentness: event.target.value })}><option value="">전체</option>{currentnessOptions.map((value) => <option key={value} value={value}>{currentnessLabels[value] ?? value}</option>)}</select></label>
            <button onClick={() => update(initialFilters)}>검색조건 초기화</button>
          </div></details>
          <div className="result-count"><span>검색 결과</span><strong>{filtered.length.toLocaleString("ko-KR")}건</strong></div>
          <button className="csv-button" onClick={() => downloadCsv("kodit_public_regulations.csv", filtered)}>현재 목록 CSV</button>
          <button className="print-button" onClick={() => window.print()}>인쇄</button>
        </div>
        <div className="table-scroll"><table className="regulations-table public-regulations-table"><thead><tr><th>규정명</th><th>공개결론</th><th>개정일</th><th>사규예고 담당부서</th><th>원문</th></tr></thead><tbody>
          {shownRows.map((row) => { const url = validPublicUrl(row.source_location); return <tr key={row.regulation_version_id} className={row.is_new ? "row-new" : row.is_updated ? "row-updated" : ""}>
            <td data-label="규정명">{url ? <a className="name-link" href={url} target="_blank" rel="noopener noreferrer">{row.display_name}</a> : row.display_name}{row.is_new && <small className="change-mark">NEW</small>}{row.is_updated && <small className="change-mark">UPDATED</small>}</td>
            <td data-label="공개결론"><span className={`status-flag status-${row.availability.toLowerCase()}`}>{availabilityLabels[row.availability]}</span></td>
            <td data-label="개정일">{row.revision_date ?? "—"}</td><td data-label="사규예고 담당부서">{row.notice_department ?? "—"}</td>
            <td data-label="원문">{url ? <a className="source-text-link" href={url} target="_blank" rel="noopener noreferrer">열기 ↗</a> : "—"}</td>
          </tr>; })}
        </tbody></table></div><Pagination page={currentPage} pageCount={pageCount} setPage={setPage} />
      </section> : <section className="table-panel">
        <div className="notice-heading"><div><p>사규예고 전체</p><strong>{notices.length.toLocaleString("ko-KR")}건</strong></div><button className="print-button" onClick={() => window.print()}>인쇄</button></div>
        <div className="table-scroll"><table className="regulations-table notice-table"><thead><tr><th>번호</th><th>제목</th><th>담당부서</th><th>게시일</th></tr></thead><tbody>
          {shownNotices.map((notice) => <tr key={notice.notice_number}><td data-label="번호">{notice.notice_number}</td><td data-label="제목"><a className="name-link" href={notice.source_location} target="_blank" rel="noopener noreferrer">{notice.title}</a></td><td data-label="담당부서">{notice.notice_department ?? "—"}</td><td data-label="게시일">{notice.posted_date}</td></tr>)}
        </tbody></table></div><Pagination page={currentPage} pageCount={pageCount} setPage={setPage} />
      </section>}
    </main>
  </>;
}

function Pagination({ page, pageCount, setPage }: { page: number; pageCount: number; setPage: (page: number | ((value: number) => number)) => void }) {
  return <div className="pagination"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>이전</button><span>{page} / {pageCount}</span><button disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>다음</button></div>;
}
