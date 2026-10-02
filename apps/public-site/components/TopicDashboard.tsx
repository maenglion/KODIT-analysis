"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import snapshot from "@/data/topic-public-v2.json";

type TopicNotice = (typeof snapshot.notices)[number];
const familyNames = new Map(snapshot.families.map((family) => [family.code, family.name]));

function saveCsv(rows: TopicNotice[]) {
  const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  const columns = ["게시번호", "제목", "게시일", "승인된 하위군", "분류 근거", "공식 게시판 URL"];
  const body = rows.map((row) => [row.number, row.title, row.date, row.families.map((code) => familyNames.get(code) ?? code).join("; "), row.evidence.join("; "), row.sourceUrl ?? ""]);
  const csv = `\uFEFF${[columns, ...body].map((record) => record.map(quote).join(",")).join("\r\n")}\r\n`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "kodit_investment_guarantee_topic_v2.csv";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function RankedList({ title, description, items }: { title: string; description: string; items: { name: string; count: number }[] }) {
  const max = items[0]?.count ?? 1;
  return <section className="topic-panel">
    <div className="topic-panel-head"><h2>{title}</h2><p>{description}</p></div>
    <ol className="topic-rank-list">{items.map((item, index) => <li key={item.name}>
      <span className="topic-rank-number">{String(index + 1).padStart(2, "0")}</span>
      <div><Link href={`/regulations?q=${encodeURIComponent(item.name)}`}>{item.name}</Link><div className="topic-rank-track" aria-hidden="true"><span style={{ width: `${Math.max(12, item.count / max * 100)}%` }} /></div></div>
      <strong>{item.count}건</strong>
    </li>)}</ol>
  </section>;
}

export function TopicDashboard() {
  const [family, setFamily] = useState("ALL");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("ko-KR");
    return snapshot.notices.filter((notice) => {
      const matchesFamily = family === "ALL" || notice.families.includes(family);
      const searchText = `${notice.title} ${notice.families.map((code) => familyNames.get(code) ?? "").join(" ")}`.toLocaleLowerCase("ko-KR");
      return matchesFamily && (!term || searchText.includes(term));
    });
  }, [family, query]);
  const shown = showAll ? filtered : filtered.slice(0, 10);
  const years = Object.entries(snapshot.yearly).sort(([a], [b]) => a.localeCompare(b));
  const maxYearCount = Math.max(...years.map(([, count]) => count));

  return <>
    <section className="public-page-intro topic-intro"><div className="shell intro-inner"><div className="intro-copy">
      <p className="breadcrumb">HOME &gt; <b>사업별 통계</b></p>
      <h1>투자·보증 주제 분석</h1>
      <p>투자·자본성 금융과 직접 연결된 보증·투자제도 9개 하위군의 사규예고를 살펴봅니다. 일반 보증 전체의 통계가 아닙니다.</p>
    </div><span className="topic-date-pill">정적 검증본 · 2026.09.19</span></div></section>
    <main className="shell topic-page">
      <div className="topic-boundary" role="note"><strong>기준이 다른 두 공개본</strong><span>아래 62건은 2026.09.19 주제 분류 결과입니다. 규정 목록은 2026.09.13 기준 별도 승인본이므로 숫자를 합산하거나 같은 시점의 값으로 해석하지 마세요. 화면 표시에는 실시간 RPC를 사용하지 않습니다.</span></div>
      <div className="topic-overview" aria-label="주제 통계 요약">
        <div className="topic-lead-stat"><span>승인된 주제 사규예고</span><strong>{snapshot.noticeCount}<small>건</small></strong><p>중복 제거된 게시물 수<br />{snapshot.period.start} — {snapshot.period.end}</p></div>
        <div><span>승인 하위군</span><strong>{snapshot.families.length}<small>개</small></strong><p>하위군별 건수는 중복될 수 있습니다.</p></div>
        <div><span>언급 규정</span><strong>{snapshot.regulationCount}<small>개</small></strong><p>게시물 수와 다른 집계 단위입니다.</p></div>
      </div>
      <section className="topic-section" id="families"><div className="topic-heading"><div><p className="eyebrow">APPROVED FAMILIES</p><h2>분석에 포함된 9개 하위군</h2></div><p>한 게시물이 복수 하위군에 속할 수 있어 합계는 62건과 다릅니다.</p></div>
        <div className="topic-family-grid">{snapshot.families.map((item) => <button type="button" key={item.code} className={`topic-family-card ${family === item.code ? "active" : ""}`} aria-pressed={family === item.code} onClick={() => { setFamily(family === item.code ? "ALL" : item.code); setShowAll(false); document.getElementById("topic-notices")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
          <span>{item.name}</span><strong>{item.noticeCount}<small>건</small></strong><span className="topic-family-action">해당 사규예고 보기 <span aria-hidden="true">→</span></span>
        </button>)}</div>
        <p className="topic-exclusion">분류 범위: {snapshot.scope}. 퍼스트펭귄 창업기업 보증지원은 투자·자본성 금융과의 직접 관계가 확인되지 않아 이 통계에 포함되지 않습니다.</p>
      </section>
      <section className="topic-section"><div className="topic-heading"><div><p className="eyebrow">ANNUAL DISTRIBUTION</p><h2>연도별 사규예고</h2></div><p>승인된 62건의 게시일 연도별 분포 · 과거 승인본 간 증감률이 아닙니다.</p></div>
        <ol className="topic-year-chart">{years.map(([year, count]) => <li key={year}><span>{year}</span><div className="topic-year-track"><span style={{ height: `${Math.max(7, count / maxYearCount * 100)}%` }} /></div><strong>{count}건</strong></li>)}</ol>
      </section>
      <div className="topic-rank-grid">
        <RankedList title="많이 언급된 규정" description="규정 언급이 확인된 서로 다른 게시물 수" items={snapshot.mostMentioned} />
        <RankedList title="개정 제안 대상 규정" description="개정 제안 관계가 확인된 서로 다른 게시물 수" items={snapshot.mostProposed} />
      </div>
      <section className="topic-section topic-notices-section" id="topic-notices"><div className="topic-heading"><div><p className="eyebrow">EVIDENCE LIST</p><h2>근거 사규예고</h2></div><p>승인된 주제 회원만 표시합니다. 제목 검색은 새 주제 분류를 만들지 않습니다.</p></div>
        <div className="topic-list-tools"><label><span className="sr-only">주제 사규예고 검색</span><input type="search" placeholder="사규예고 제목 또는 하위군 검색" value={query} onChange={(event) => { setQuery(event.target.value); setShowAll(false); }} /></label><select aria-label="하위군 선택" value={family} onChange={(event) => { setFamily(event.target.value); setShowAll(false); }}><option value="ALL">전체 하위군</option>{snapshot.families.map((item) => <option value={item.code} key={item.code}>{item.name}</option>)}</select><button className="csv-button" type="button" onClick={() => saveCsv(filtered)}>현재 목록 CSV ↓</button></div>
        <div className="topic-list-count">검색 결과 <strong>{filtered.length}건</strong>{family !== "ALL" && <button type="button" onClick={() => setFamily("ALL")}>분류 해제 ×</button>}</div>
        <div className="topic-table-scroll"><table className="topic-table"><thead><tr><th scope="col">게시일</th><th scope="col">사규예고</th><th scope="col">승인된 하위군</th><th scope="col">공식 출처</th></tr></thead><tbody>{shown.map((notice) => <tr key={notice.number}><td>{notice.date}</td><td><strong>{notice.title}</strong><small>사규예고 번호 {notice.number}</small></td><td>{notice.families.map((code) => <span className="topic-tag" key={code}>{familyNames.get(code)}</span>)}</td><td>{notice.sourceUrl ? <a href={notice.sourceUrl} target="_blank" rel="noopener noreferrer">공식 게시판 ↗</a> : "확인 가능한 URL 없음"}</td></tr>)}{filtered.length === 0 && <tr><td className="topic-empty" colSpan={4}>일치하는 승인 사규예고가 없습니다. 검색어나 하위군을 바꿔 주세요.</td></tr>}</tbody></table></div>
        {!showAll && filtered.length > 10 && <button className="topic-more" type="button" onClick={() => setShowAll(true)}>나머지 {filtered.length - 10}건 더 보기 <span aria-hidden="true">↓</span></button>}
      </section>
      <p className="topic-source-note">수치와 분류: <code>topic-membership-v2</code> 검증 결과(2026.09.19). 링크된 규정 검색 결과는 별도의 2026.09.13 승인본이며 주제 판정을 대신하지 않습니다.</p>
    </main>
  </>;
}
