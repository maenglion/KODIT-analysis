"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CollectionStatus } from "@/components/CollectionStatus";
import snapshot from "@/data/topic-public-v2.json";
import { filterTopicNotices, topicEvidenceUrl, topicNoticesToCsv } from "@/lib/topic-notice-filter";
import { availabilityLabels, type Availability } from "@kodit/common/regulations";

type TopicNotice = (typeof snapshot.notices)[number];
type TopicView = "summary" | "yearly" | "evidence";
const familyNames = new Map(snapshot.families.map((family) => [family.code, family.name]));

function saveCsv(rows: TopicNotice[]) {
  const csv = topicNoticesToCsv(rows, familyNames);
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "kodit_investment_guarantee_topic_v2.csv";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type RegulationAvailabilityByName = Partial<Record<string, Availability>>;
type TopicDashboardProps = { initialFamily?: string; initialYear?: string } & (
  | { view?: "summary"; regulationAvailabilityByName: RegulationAvailabilityByName; regulationEvidenceAsOf: string }
  | { view: "yearly" | "evidence"; regulationAvailabilityByName?: never; regulationEvidenceAsOf?: never }
);
const availabilityOrder: Availability[] = ["FULLTEXT_PUBLIC", "PARTIAL_PUBLIC", "NOTICE_ONLY", "SOURCE_UNKNOWN"];

function RankedList({ title, description, items, availabilityByName }: { title: string; description: string; items: { name: string; count: number }[]; availabilityByName: RegulationAvailabilityByName }) {
  const max = items[0]?.count ?? 1;
  return <section className="topic-panel">
    <div className="topic-panel-head"><h2>{title}</h2><p>{description}</p></div>
    <div className="topic-rank-columns" aria-hidden="true"><span>규정</span><span>공개 범위</span><span>게시물</span></div>
    <ol className="topic-rank-list">{items.map((item, index) => {
      const availability = availabilityByName[item.name];
      return <li key={item.name}>
      <span className="topic-rank-number">{String(index + 1).padStart(2, "0")}</span>
      <div><Link href={`/regulations?q=${encodeURIComponent(item.name)}`}>{item.name}</Link><div className="topic-rank-track" aria-hidden="true"><span style={{ width: `${Math.max(12, item.count / max * 100)}%` }} /></div></div>
      {availability
        ? <span className={`topic-rank-availability status-flag status-${availability.toLowerCase()}`}><span className="sr-only">공개 범위: </span>{availabilityLabels[availability]}</span>
        : <span className="topic-rank-availability topic-rank-unmatched"><span className="sr-only">공개 범위: </span>대조 미확인</span>}
      <strong><span className="sr-only">게시물 </span>{item.count}건</strong>
    </li>})}</ol>
  </section>;
}

const titles: Record<TopicView, string> = {
  summary: "투자·보증 주제 분석",
  yearly: "연도별 사규예고",
  evidence: "근거 사규예고",
};
const descriptions: Record<TopicView, string> = {
  summary: "투자·자본성 금융과 직접 연결된 보증·투자제도 9개 하위군을 요약합니다. 일반 보증 전체의 통계가 아닙니다.",
  yearly: "승인된 투자·보증 주제 사규예고의 게시일 연도별 분포를 살펴봅니다. 과거 공개본과 비교한 증감률이 아닙니다.",
  evidence: "승인된 62건의 사규예고를 하위군과 게시일로 좁혀 공식 게시판 근거를 확인합니다.",
};

export function TopicDashboard({ view = "summary", initialFamily = "ALL", initialYear, regulationAvailabilityByName = {}, regulationEvidenceAsOf }: TopicDashboardProps) {
  const safeFamily = familyNames.has(initialFamily) ? initialFamily : "ALL";
  const safeYear = initialYear && Object.hasOwn(snapshot.yearly, initialYear) ? initialYear : "";
  const [family, setFamily] = useState(safeFamily);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const filtered = useMemo(() => filterTopicNotices(snapshot.notices, { family, year: safeYear, query }, familyNames), [family, query, safeYear]);
  const shown = showAll ? filtered : filtered.slice(0, 10);
  const years = Object.entries(snapshot.yearly).sort(([a], [b]) => a.localeCompare(b));
  const maxYearCount = Math.max(...years.map(([, count]) => count));
  const rankedNames = [...new Set([...snapshot.mostMentioned, ...snapshot.mostProposed].map((item) => item.name))];
  const rankedStatusCounts = availabilityOrder.map((status) => ({
    status,
    count: rankedNames.filter((name) => regulationAvailabilityByName[name] === status).length,
  })).filter(({ count }) => count > 0);
  const unmatchedCount = rankedNames.filter((name) => !regulationAvailabilityByName[name]).length;
  function changeFamily(next: string) {
    setFamily(next);
    setShowAll(false);
    window.history.replaceState(null, "", topicEvidenceUrl({ family: next, year: safeYear }));
  }

  return <>
    <section className="public-page-intro topic-intro"><div className="shell intro-inner intro-inner-with-status"><div className="intro-copy">
      <p className="breadcrumb"><Link href="/regulations">규정·법령</Link> &gt; <Link href="/investment-statistics">사업별 통계</Link> &gt; <b>{view === "summary" ? "요약" : titles[view]}</b></p>
      <h1>{titles[view]}</h1><p>{descriptions[view]}</p>
    </div><CollectionStatus evidenceAsOf={snapshot.measuredAt} basisLabel="주제 분류" /></div></section>
    <main className="shell topic-page">
      <div className="topic-boundary" role="note"><strong>집계 기준 구분</strong><span>이 주제 분류는 {snapshot.measuredAt} 기준입니다. 규정 목록의 2026-09-13 집계와 합산하지 않습니다.</span></div>
      {view === "summary" && <>
        <div className="topic-overview" aria-label="주제 통계 요약">
          <div className="topic-lead-stat"><span>승인된 주제 사규예고</span><strong>{snapshot.noticeCount}<small>건</small></strong><p>중복 제거된 게시물 수<br />{snapshot.period.start} — {snapshot.period.end}</p></div>
          <div><span>승인 하위군</span><strong>{snapshot.families.length}<small>개</small></strong><p>하위군별 건수는 중복될 수 있습니다.</p></div>
          <div><span>언급 규정</span><strong>{snapshot.regulationCount}<small>개</small></strong><p>게시물 수와 다른 집계 단위입니다.</p></div>
        </div>
        <section className="topic-section" id="families"><div className="topic-heading"><div><p className="eyebrow">APPROVED FAMILIES</p><h2>분석에 포함된 9개 하위군</h2></div><p>한 게시물이 복수 하위군에 속할 수 있어 합계는 62건과 다릅니다.</p></div>
          <div className="topic-family-grid">{snapshot.families.map((item) => <Link href={topicEvidenceUrl({ family: item.code })} key={item.code} className="topic-family-card">
            <span>{item.name}</span><strong>{item.noticeCount}<small>건</small></strong><span className="topic-family-action">해당 사규예고 보기 <span aria-hidden="true">→</span></span>
          </Link>)}</div>
          <p className="topic-exclusion">분류 범위: {snapshot.scope}. 퍼스트펭귄 창업기업 보증지원은 투자·자본성 금융과의 직접 관계가 확인되지 않아 이 통계에 포함되지 않습니다.</p>
        </section>
        <section className="topic-publication-guide" aria-labelledby="topic-publication-guide-title">
          <div className="topic-publication-lead">
            <div><h2 id="topic-publication-guide-title">순위표의 공개 범위</h2><p>승인 규정 버전 · {regulationEvidenceAsOf} 기준</p></div>
            <p className="topic-publication-count"><strong>서로 다른 규정 {rankedNames.length}개</strong><span aria-hidden="true"> · </span>{rankedStatusCounts.map(({ status, count }) => <span key={status}>{availabilityLabels[status]} {count}개</span>)}{unmatchedCount > 0 && <span>대조 미확인 {unmatchedCount}개</span>}</p>
          </div>
          <p className="topic-publication-caution"><strong>사전예고만</strong>은 비공개 확정이 아니라, 사규예고는 확인됐지만 반영된 최종 전문이나 일부 본문을 승인 근거에서 확인하지 못한 상태입니다.</p>
          <details className="topic-publication-definitions"><summary>네 가지 공개 범위와 대조 기준 보기</summary><dl>
            <div><dt>전문 공개</dt><dd>공식 경로에서 해당 규정 버전의 전문을 확인했습니다.</dd></div>
            <div><dt>일부 공개</dt><dd>공식 경로에서 일부 내용만 확인했습니다.</dd></div>
            <div><dt>사전예고만</dt><dd>사규예고는 확인됐지만 반영된 최종 본문은 미확인입니다.</dd></div>
            <div><dt>출처불명</dt><dd>현재 보유 근거에서 공식 출처를 결정하지 못했습니다.</dd></div>
            <div><dt>대조 미확인</dt><dd>규정명을 정확히 비교해 단일 공개 범위로 정리하지 못했습니다. 자료 부재 확정은 아닙니다.</dd></div>
          </dl></details>
        </section>
        <div className="topic-rank-grid">
          <RankedList title="많이 언급된 규정" description="규정 언급이 확인된 서로 다른 게시물 수" items={snapshot.mostMentioned} availabilityByName={regulationAvailabilityByName} />
          <RankedList title="개정 제안 대상 규정" description="개정 제안 관계가 확인된 서로 다른 게시물 수" items={snapshot.mostProposed} availabilityByName={regulationAvailabilityByName} />
        </div>
      </>}
      {view === "yearly" && <section className="topic-section topic-first-section"><div className="topic-heading"><div><p className="eyebrow">ANNUAL DISTRIBUTION</p><h2>연도별 사규예고</h2></div><p>승인된 {snapshot.noticeCount}건의 게시일 연도별 분포 · 과거 승인본 간 증감률이 아닙니다.</p></div>
        <ol className="topic-year-chart">{years.map(([year, count]) => <li key={year}><Link href={topicEvidenceUrl({ year })} className="topic-year-link" aria-label={`${year}년 근거 사규예고 ${count}건 보기`}>{year}</Link><div className="topic-year-track"><span style={{ height: `${Math.max(7, count / maxYearCount * 100)}%` }} /></div><strong>{count}건</strong></li>)}</ol>
        <p className="topic-year-guide">연도를 선택하면 해당 연도의 승인 근거 사규예고 목록으로 이동합니다. 여러 하위군에 포함된 게시물도 이 그래프에서는 한 번만 셉니다.</p>
      </section>}
      {view === "evidence" && <section className="topic-section topic-first-section topic-notices-section" id="topic-notices"><div className="topic-heading"><div><p className="eyebrow">EVIDENCE LIST</p><h2>근거 사규예고</h2></div><p>승인된 주제 회원만 표시합니다. 제목 검색은 새 주제 분류를 만들지 않습니다.</p></div>
        <div className="topic-list-tools"><label><span className="sr-only">주제 사규예고 검색</span><input type="search" placeholder="사규예고 제목 또는 하위군 검색" value={query} onChange={(event) => { setQuery(event.target.value); setShowAll(false); }} /></label><select aria-label="하위군 선택" value={family} onChange={(event) => changeFamily(event.target.value)}><option value="ALL">전체 하위군</option>{snapshot.families.map((item) => <option value={item.code} key={item.code}>{item.name}</option>)}</select><button className="csv-button" type="button" onClick={() => saveCsv(filtered)}>현재 목록 CSV ↓</button></div>
        <div className="topic-list-count">검색 결과 <strong>{filtered.length}건</strong>{safeYear && <span className="topic-year-filter">{safeYear}년 <Link href={topicEvidenceUrl({ family })}>연도 해제 ×</Link></span>}{family !== "ALL" && <button type="button" onClick={() => changeFamily("ALL")}>분류 해제 ×</button>}</div>
        <div className="topic-table-scroll"><table className="topic-table"><thead><tr><th scope="col">게시일</th><th scope="col">사규예고</th><th scope="col">승인된 하위군</th><th scope="col">공식 출처</th></tr></thead><tbody>{shown.map((notice) => <tr key={notice.number}><td>{notice.date}</td><td><strong>{notice.title}</strong><small>사규예고 번호 {notice.number}</small></td><td>{notice.families.map((code) => <span className="topic-tag" key={code}>{familyNames.get(code)}</span>)}</td><td>{notice.sourceUrl ? <a href={notice.sourceUrl} target="_blank" rel="noopener noreferrer">공식 게시판 ↗</a> : "확인 가능한 URL 없음"}</td></tr>)}{filtered.length === 0 && <tr><td className="topic-empty" colSpan={4}>일치하는 승인 사규예고가 없습니다. 검색어나 하위군을 바꿔 주세요.</td></tr>}</tbody></table></div>
        {!showAll && filtered.length > 10 && <button className="topic-more" type="button" onClick={() => setShowAll(true)}>나머지 {filtered.length - 10}건 더 보기 <span aria-hidden="true">↓</span></button>}
      </section>}
      <p className="topic-source-note">수치와 분류: <code>topic-membership-v2</code> 검증 결과(2026.09.19). 링크된 규정 검색 결과는 별도의 2026.09.13 승인본이며 주제 판정을 대신하지 않습니다.</p>
    </main>
  </>;
}
