"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { organizationSnapshot, validPublicUrl } from "./index";

type OfficialDocument = { id: string; title: string; date: string | null; url: string };
type EnactedDocument = OfficialDocument & { series: string; dateBasis: string; revisionDate: string; archiveBundle: boolean };
type PublicEvent = { id: string; date: string; from: string; to: string; scope: string; url: string; relation: string };
export type OrganizationPublicHistory = {
  contract: string;
  noticeEvidenceAsOf: string;
  enactedEvidenceAsOf: string;
  eventMeaning: string;
  events: PublicEvent[];
  notices: OfficialDocument[];
  published: (OfficialDocument & { availability: string })[];
  enacted: EnactedDocument[];
  confirmedCreations: Array<{ name: string; year: string; purpose: string; sourceUrl: string; legalGround: string }>;
};

export function OrganizationHistory({ history }: { history: OrganizationPublicHistory }) {
  const [step, setStep] = useState(0);
  const [tab, setTab] = useState<"changes" | "created">("changes");
  const [source, setSource] = useState<"notice" | "published">("notice");
  const [year, setYear] = useState("ALL");
  const [showAll, setShowAll] = useState(false);
  const events = history.events;
  const names = [events[0]?.from, ...events.map((event) => event.to)].filter(Boolean);
  const years = useMemo(() => Array.from(new Set([
    ...history.notices.map((document) => document.date?.slice(0, 4)),
    ...history.published.map((document) => document.date?.slice(0, 4)),
    ...history.enacted.map((document) => document.date?.slice(0, 4)),
  ].filter((item): item is string => Boolean(item)))).sort((a, b) => b.localeCompare(a)), [history]);
  const publishedDocuments = [...history.published.map((document) => ({ ...document, basis: "현재 공개 규정" })),
    ...history.enacted.map((document) => ({ ...document, basis: document.archiveBundle ? `공식 보존 ZIP · ${document.dateBasis}` : `공식 시행본 · ${document.dateBasis}` }))];
  const documents = (source === "notice" ? history.notices.map((document) => ({ ...document, basis: "사규예고 (시행 확정 아님)" })) : publishedDocuments)
    .filter((document) => year === "ALL" || document.date?.startsWith(year))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const active = events[step - 1];
  const chooseYear = (index: number) => { setStep(index); setYear(events[index - 1]?.date.slice(0, 4) ?? "ALL"); setShowAll(false); };

  return <section className="org-history" id="organization-history" aria-labelledby="org-history-title">
    <header className="org-history-header"><div><p className="eyebrow">공식 근거로 확인한 경로만</p><h2 id="org-history-title">조직 히스토리</h2><p>연도를 누르면 당시 <b>개인정보보호 책임·담당 기능</b>이 옮겨간 경로를 순서대로 보여줍니다. 조직 전체 명칭변경·승계·신설로 해석하지 않습니다.</p></div><a href={organizationSnapshot.sourceUrl} target="_blank" rel="noopener noreferrer">현행 조직 안내 ↗</a></header>
    <div className="org-journey" aria-label="연도별 개인정보보호 담당 기능 이관 경로">
      <div className="org-journey-controls"><span>연도 선택</span><button type="button" className={step === 0 ? "active" : ""} aria-pressed={step === 0} onClick={() => chooseYear(0)}>시작</button>{events.map((event, index) => <button key={event.id} type="button" className={step === index + 1 ? "active" : ""} aria-pressed={step === index + 1} onClick={() => chooseYear(index + 1)}>{event.date.slice(0, 4)}</button>)}</div>
      <div className="org-journey-track" style={{ "--progress": `${events.length ? 100 * step / events.length : 0}%` } as CSSProperties}>
        <div className="org-journey-rail"><span className="org-journey-progress"/><span className="org-journey-traveler" aria-hidden="true">개인정보보호 기능</span></div>
        <div className="org-journey-stops">{names.map((name, index) => <div key={`${name}-${index}`} className={`org-journey-stop ${index === step ? "current" : index < step ? "passed" : "upcoming"}`}><span className="org-journey-dot"/><b>{name}</b><small>{index === 0 ? "기준 관측 조직" : `${events[index - 1].date.slice(0, 4)}년부터 확인`}</small></div>)}</div>
      </div>
      <div className="org-journey-detail" key={active?.id ?? "start"} aria-live="polite">{active ? <><b>{active.date} · 특정 기능 이관</b><p><strong>{active.from}</strong> → <strong>{active.to}</strong> · {active.scope}</p><a href={active.url} target="_blank" rel="noopener noreferrer">신용보증기금 개인정보 처리방침 변경이력에서 확인 ↗</a></> : <><b>출발점 · 리스크관리실</b><p>표시 경로는 조직 전체의 변천사가 아니라 확인된 개인정보보호 업무 담당 경로입니다. 연도를 클릭해 다음 단계를 보세요.</p></>}</div>
    </div>
    <p className="org-history-caution">{history.eventMeaning} 2015~2025 사규예고는 <b>변경 제안</b>이며, 시행본과 비교하지 않고 특정 조직이 신설됐다고 단정하지 않습니다.</p>

    <div className="org-history-tabs" role="tablist" aria-label="조직 이력 분류"><button type="button" role="tab" aria-selected={tab === "changes"} id="org-tab-changes" aria-controls="org-panel-changes" onClick={() => setTab("changes")}>조직 변경 관련 자료</button><button type="button" role="tab" aria-selected={tab === "created"} id="org-tab-created" aria-controls="org-panel-created" onClick={() => setTab("created")}>신설 조직</button></div>
    {tab === "changes" ? <div className="org-history-panel" role="tabpanel" id="org-panel-changes" aria-labelledby="org-tab-changes"><h3>공식 사규예고와 공개 문서</h3><p>관련 자료를 출처 유형별로 찾아볼 수 있습니다. 문서의 존재 자체가 해당 연도 조직 변경의 확정이나 전체 승계를 의미하지 않습니다.</p>
      <div className="org-source-controls"><div className="org-source-buttons" role="group" aria-label="조직 관련 자료 분류"><button type="button" className={source === "notice" ? "active" : ""} aria-pressed={source === "notice"} onClick={() => { setSource("notice"); setShowAll(false); }}>사규예고 · {history.notices.length}</button><button type="button" className={source === "published" ? "active" : ""} aria-pressed={source === "published"} onClick={() => { setSource("published"); setShowAll(false); }}>공개·시행 문서 · {history.published.length + history.enacted.length}</button></div><label>자료 연도<select value={year} onChange={(event) => { setYear(event.target.value); setShowAll(false); }}><option value="ALL">전체 연도</option>{years.map((item) => <option key={item} value={item}>{item}년</option>)}</select></label></div>
      <p className="org-result-count">{year === "ALL" ? "전체 연도" : `${year}년`} · {documents.length}개 문서</p><ul className="org-document-list">{documents.slice(0, showAll ? undefined : 10).map((document) => <li key={`${source}-${document.id}`}><time dateTime={document.date ?? undefined}>{document.date ?? "날짜 미확인"}</time><div><a href={document.url} target="_blank" rel="noopener noreferrer">{document.title} ↗</a><small>{document.basis}</small></div></li>)}</ul>{documents.length === 0 && <p className="org-empty">해당 연도와 출처 유형에 연결된 공개 문서가 없습니다.</p>}{documents.length > 10 && <button className="org-show-more" type="button" onClick={() => setShowAll(!showAll)}>{showAll ? "목록 접기" : `나머지 ${documents.length - 10}개 문서 보기`}</button>}</div>
    : <div className="org-history-panel" role="tabpanel" id="org-panel-created" aria-labelledby="org-tab-created"><h3>연도별 신설 조직과 설치 목적</h3>{history.confirmedCreations.length ? <ul className="org-created-list">{history.confirmedCreations.map((item) => <li key={`${item.year}-${item.name}`}><b>{item.year} · {item.name}</b><p>{item.purpose}</p><p>관련 규정: {item.legalGround}</p>{validPublicUrl(item.sourceUrl) && <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">공식 신설 근거 ↗</a>}</li>)}</ul> : <div className="org-empty org-created-empty"><b>공식 ‘신설’ 관계로 확정된 공개 데이터가 없습니다.</b><p>현재 원장에 공식 변경 이벤트는 개인정보보호 기능 이관 2건뿐입니다. 기존 자료에 부서명이 등장하거나 2026년 조직도에 보인다는 이유만으로 그 해의 신설 조직으로 분류하지 않습니다.</p><p>신용보증기금법·공공기관의 운영에 관한 법률·개인정보 보호법 조항과 설치 목적은 <b>해당 시행 직제의 신설 문구 및 조항이 연결되면</b> 연도별로 추가합니다.</p></div>}</div>}
    <details className="org-current-snapshot"><summary>현재 조직도 기준 · {organizationSnapshot.snapshotDate}</summary><div className="org-hierarchy">{organizationSnapshot.hierarchy.map((item) => <p key={item.division}><b>{item.division}</b><span>{item.units.join(" · ")}</span></p>)}</div></details>
  </section>;
}
