"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { personResidualObservationsToCsv, publicResidualLabel, validPublicUrl, type PublicPersonResidualObservationRow } from "./index";
import { mentionSourceLinks, RESIDUAL_PAGE_SIZE } from "./residual-ui";

type PersonSort = "COUNT_DESC" | "ALIAS_ASC" | "ALIAS_DESC" | "RECENT_DESC";
type Group = { alias: string; observations: PublicPersonResidualObservationRow[]; count: number };

function officialNoticeListUrl(value: string): string {
  const safe = validPublicUrl(value);
  if (!safe) throw new Error("PERSON 공식 사규예고 URL 형식 오류");
  const url = new URL(safe);
  if (url.protocol !== "https:" || url.hostname !== "www.kodit.or.kr" || url.port || url.username || url.password ||
      !url.pathname.endsWith("/selectNttList.do") || url.searchParams.get("bbsId") !== "322") {
    throw new Error("PERSON 공식 사규예고 출처 계약 불일치");
  }
  return url.href;
}

function safeObservations(rows: PublicPersonResidualObservationRow[]) {
  return rows.map(row => ({
    public_alias: publicResidualLabel(row.public_alias, "PERSON"),
    posted_at: row.posted_at,
    title: row.title,
    source_location: officialNoticeListUrl(row.source_location),
    observation_count: row.observation_count,
  }));
}

function download(body: string) {
  const url = URL.createObjectURL(new Blob([body], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "person-residual-observations.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function PersonResidualObservations({ rows }: { rows: PublicPersonResidualObservationRow[] }) {
  // Do not reconstruct a mixed PERSON→ORG row, a ledger ID, or an attribution object in this component.
  const safeRows = useMemo(() => safeObservations(rows), [rows]);
  const [sort, setSort] = useState<PersonSort>("COUNT_DESC");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const detailRef = useRef<HTMLElement>(null);
  const groups = useMemo(() => {
    const map = new Map<string, PublicPersonResidualObservationRow[]>();
    for (const row of safeRows) {
      const group = map.get(row.public_alias) ?? [];
      group.push(row);
      map.set(row.public_alias, group);
    }
    const result: Group[] = [...map].map(([alias, observations]) => ({
      alias,
      observations: [...observations].sort((a, b) => b.posted_at.localeCompare(a.posted_at) || a.title.localeCompare(b.title, "ko")),
      count: observations.reduce((sum, row) => sum + Number(row.observation_count), 0),
    }));
    return result.sort((a, b) => {
      const compare = a.alias.localeCompare(b.alias, "ko", { numeric: true });
      if (sort === "ALIAS_ASC") return compare;
      if (sort === "ALIAS_DESC") return -compare;
      if (sort === "RECENT_DESC") return (b.observations[0]?.posted_at ?? "").localeCompare(a.observations[0]?.posted_at ?? "") || compare;
      return b.count - a.count || compare;
    });
  }, [safeRows, sort]);
  const pageCount = Math.max(1, Math.ceil(groups.length / RESIDUAL_PAGE_SIZE));
  const pageRows = groups.slice((page - 1) * RESIDUAL_PAGE_SIZE, page * RESIDUAL_PAGE_SIZE);
  const visiblePages = Array.from({ length: Math.min(5, pageCount) }, (_, index) =>
    Math.max(1, Math.min(page - 2, pageCount - 4)) + index);

  useEffect(() => {
    if (!selected || !detailRef.current) return;
    detailRef.current.focus({ preventScroll: true });
    detailRef.current.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "nearest",
    });
  }, [selected]);

  function closeDetail() {
    const previous = selected;
    setSelected(null);
    if (previous) requestAnimationFrame(() => document.getElementById(`person-alias-${previous}`)?.focus());
  }
  function changePage(next: number) { setPage(next); setSelected(null); }
  function changeSort(next: PersonSort) { setSort(next); setPage(1); setSelected(null); }

  return <section className="residual-section person-observation-section" aria-labelledby="person-observation-title">
    <header className="residual-section-header"><div><p className="eyebrow">PERSON OBSERVATION</p><h2 id="person-observation-title">사람형 표기 관측</h2><p>한글 초성+공개용 4자리 별칭과 관측 게시물만 보여줍니다. 조직·직무·업무귀속 또는 이동 경로는 연결하지 않습니다.</p></div><button onClick={() => download(personResidualObservationsToCsv(safeRows))}>관측 CSV<span className="sr-only"> (전체 {safeRows.length}건)</span></button></header>
    <div className="person-observation-toolbar"><label>공개 별칭 정렬 <select aria-label="사람형 표기 정렬" value={sort} onChange={event => changeSort(event.target.value as PersonSort)}><option value="COUNT_DESC">관측 건수 많은 순</option><option value="ALIAS_ASC">공개 별칭 가나다순</option><option value="ALIAS_DESC">공개 별칭 역순</option><option value="RECENT_DESC">최근 관측일 순</option></select></label><p>전체 <b>{groups.length.toLocaleString("ko-KR")}</b>개 별칭 · <b>{safeRows.length.toLocaleString("ko-KR")}</b>건 관측 · {page} / {pageCount}페이지</p></div>
    <div className="table-scroll"><table className="regulations-table residual-table person-observation-table" aria-describedby="person-observation-title"><thead><tr><th scope="col">공개 별칭</th><th scope="col">관측 건수</th><th scope="col">최근 관측일</th><th scope="col">관측 게시물</th></tr></thead><tbody>{pageRows.map(item => <Fragment key={item.alias}>
      <tr className={selected === item.alias ? "is-selected" : undefined}><td><button id={`person-alias-${item.alias}`} className="department-link" aria-expanded={selected === item.alias} aria-controls={selected === item.alias ? "person-observation-detail" : undefined} onClick={() => setSelected(selected === item.alias ? null : item.alias)}>{item.alias}</button></td><td>{item.count.toLocaleString("ko-KR")}</td><td>{item.observations[0] ? <time dateTime={item.observations[0].posted_at}>{item.observations[0].posted_at}</time> : "미확인"}</td><td>{item.observations.length.toLocaleString("ko-KR")}건</td></tr>
      {selected === item.alias && <tr className="residual-detail-row"><td colSpan={4} className="residual-detail-cell"><article ref={detailRef} id="person-observation-detail" aria-labelledby="person-observation-detail-title" tabIndex={-1} className="residual-detail person-observation-detail"><button className="residual-close" onClick={closeDetail} aria-label="상세 닫기">×</button><p className="eyebrow">공개 관측 상세</p><h3 id="person-observation-detail-title">{item.alias}</h3><dl className="person-observation-meta"><div><dt>관측 건수</dt><dd>{item.count.toLocaleString("ko-KR")}건</dd></div><div><dt>관측 범위</dt><dd>{item.observations.length ? <><time dateTime={item.observations[item.observations.length - 1].posted_at}>{item.observations[item.observations.length - 1].posted_at}</time> ~ <time dateTime={item.observations[0].posted_at}>{item.observations[0].posted_at}</time></> : "미확인"}</dd></div></dl><p>아래에는 관측일·게시물 제목만 표시합니다. 별칭에서 신원이나 소속을 추론하지 않습니다.</p><p className="residual-source-note">출처 링크는 개별 게시물 원문이 아닌 신보의 <b>사규 제개정 예고 목록 페이지</b>입니다. 같은 제목은 순번으로 구분합니다.</p><div className="evidence-links">{mentionSourceLinks(item.observations.map(row => row.source_location), item.observations).map(link => <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer">{link.label} ↗</a>)}</div><h4>관측 게시물 ({item.observations.length.toLocaleString("ko-KR")}건)</h4><ul className="residual-notices">{item.observations.map((row, index) => <li key={`${row.posted_at}-${row.title}-${index}`}><time dateTime={row.posted_at}>{row.posted_at}</time><span>{row.title}</span><span className="inference-badge">관측</span></li>)}</ul></article></td></tr>}
    </Fragment>)}</tbody></table></div>
    <nav className="residual-pagination" aria-label="사람형 표기 목록 페이지"><span>{page} / {pageCount}페이지 · 페이지당 {RESIDUAL_PAGE_SIZE}개 별칭</span><div><button disabled={page === 1} onClick={() => changePage(page - 1)}>이전</button>{visiblePages.map(number => <button key={number} aria-current={page === number ? "page" : undefined} aria-label={`${number}페이지`} onClick={() => changePage(number)}>{number}</button>)}<button disabled={page === pageCount} onClick={() => changePage(page + 1)}>다음</button></div></nav>
  </section>;
}
