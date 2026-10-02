"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { DepartmentResidualAnalysis } from "./DepartmentResidualAnalysis";
import { availabilityLabels, canonicalDepartment, organizationSnapshot, validPublicUrl, type DepartmentAttributionExplanationRow, type DepartmentResidualLabelRow, type DepartmentResidualOccurrenceRow, type PublishNoticeRow, type PublishRegulationRow } from "./index";

type Sort = "NONPUBLIC_RATE" | "NONPUBLIC_COUNT" | "NOTICE_COUNT" | "FULLTEXT_RATE";
type Props = { rows: PublishRegulationRow[]; notices: PublishNoticeRow[]; residuals:DepartmentResidualOccurrenceRow[]; residualLabels:DepartmentResidualLabelRow[]; attributionExplanations:DepartmentAttributionExplanationRow[] };

export function DepartmentStatistics({ rows, notices, residuals, residualLabels, attributionExplanations }: Props) {
  const [sort, setSort] = useState<Sort>("NONPUBLIC_RATE"); const [selected, setSelected] = useState<string | null>(null);
  const calculation = useMemo(() => {
    const regulations = new Map(rows.map((row) => [row.regulation_version_id, row]));
    const groups = new Map<string, { notices: number; regulations: Set<string>; fulltext: Set<string> }>(); let linked = 0;
    for (const notice of notices) {
      const department = canonicalDepartment(notice.notice_department);
      if (!department) continue;
      const value = groups.get(department) ?? { notices: 0, regulations: new Set<string>(), fulltext: new Set<string>() }; value.notices += 1;
      for (const id of notice.linked_regulation_version_ids) { linked += 1; value.regulations.add(id); if (regulations.get(id)?.availability === "FULLTEXT_PUBLIC") value.fulltext.add(id); }
      groups.set(department, value);
    }
    const result = [...groups.entries()].map(([department, value]) => { const total = value.regulations.size; const fulltext = value.fulltext.size; return { department, notices: value.notices, total, fulltext, nonpublic: total - fulltext, nonpublicRate: total ? (total - fulltext) / total : null }; });
    result.sort((a, b) => sort === "NONPUBLIC_COUNT" ? b.nonpublic - a.nonpublic || b.total - a.total : sort === "NOTICE_COUNT" ? b.notices - a.notices : sort === "FULLTEXT_RATE" ? (b.total ? b.fulltext / b.total : -1) - (a.total ? a.fulltext / a.total : -1) : (b.nonpublicRate ?? -1) - (a.nonpublicRate ?? -1) || b.total - a.total);
    return { result, linked, regulations };
  }, [rows, notices, sort]);
  const activeDepartment = selected ?? calculation.result[0]?.department ?? null;
  const activeSummary = calculation.result.find((row) => row.department === activeDepartment) ?? null;
  const selectedRows = activeDepartment ? rows.filter((row) => notices.some((notice) => canonicalDepartment(notice.notice_department) === activeDepartment && notice.linked_regulation_version_ids.includes(row.regulation_version_id))) : [];
  const fulltextRate = activeSummary?.total ? activeSummary.fulltext / activeSummary.total : 0;
  const downloadSummary = () => {
    const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const header = ["사규예고 담당부서", "연결 규정", "전문공개", "전문 미공개", "전문 미공개율", "사규예고"];
    const lines = calculation.result.map((row) => [row.department, row.total, row.fulltext, row.nonpublic, row.nonpublicRate === null ? "측정 불가" : `${(row.nonpublicRate * 100).toFixed(1)}%`, row.notices]);
    const csv = `\uFEFF${[header, ...lines].map((line) => line.map(quote).join(",")).join("\r\n")}\r\n`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "kodit_department_public_summary.csv"; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <>
    <section className="public-page-intro department-intro"><div className="shell intro-inner"><div className="intro-copy"><p className="breadcrumb">HOME &gt; 부서별 통계 &gt; <b>요약</b></p><h1>사규예고 및 공개</h1><p>공식 조직도 명칭과 정확히 일치하는 담당부서를 기준으로 사규예고와 연결 규정의 공개 현황을 집계합니다.</p></div><div className="database-state"><img src="/figma-icons/database.svg" alt=""/><b>승인된 정적 공개본</b><span>조직도 기준 : {organizationSnapshot.snapshotDate}</span></div></div></section>
    <main className="department-page" id="summary"><div className="shell">
      <aside className="public-notice"><img src="/figma-icons/info.svg" alt=""/><div><b>공개 데이터 이용 안내</b><p>담당 표기의 개인명·과거 조직명은 별도 잔차 원장에서 관리하며, 확인되지 않은 관계를 현재 조직으로 추정하지 않습니다.</p></div></aside>
      <div className="department-actions"><button className="csv-button" type="button" onClick={downloadSummary}><img src="/figma-icons/download.svg" alt=""/>현재 목록 CSV</button><div><label><span className="sr-only">담당부서 정렬 기준</span><select value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="NONPUBLIC_RATE">전문 미공개율 높은 순</option><option value="NONPUBLIC_COUNT">전문 미공개 건수 높은 순</option><option value="NOTICE_COUNT">사규예고 많은 순</option><option value="FULLTEXT_RATE">전문공개율 높은 순</option></select></label></div></div>
      {activeSummary && <section className="department-summary-card"><header><h2>{activeSummary.department}</h2><div><span>연결 규정({activeSummary.total})</span><span>전문 미공개({activeSummary.nonpublic})</span><span>사규예고({activeSummary.notices})</span></div></header><div className="department-summary-body"><div className="ratio-chart" style={{"--ratio": `${fulltextRate * 360}deg`} as CSSProperties}><div><strong>{(fulltextRate * 100).toFixed(1)}%</strong><span>전문확보율</span></div></div><div className="department-main-metrics"><h3>주요 현황</h3><dl><div><dt>사규예고</dt><dd>{activeSummary.notices}</dd></div><div><dt>연결 규정</dt><dd>{activeSummary.total}</dd></div><div><dt>전문 확보</dt><dd>{activeSummary.fulltext}</dd></div><div><dt>전문 미공개</dt><dd>{activeSummary.nonpublic}</dd></div></dl></div></div>
        <details open><summary>연결 규정({selectedRows.length})</summary><ul className="department-regulation-list">{selectedRows.map((row) => <li key={row.regulation_version_id}>{validPublicUrl(row.source_location) ? <a href={row.source_location!} target="_blank" rel="noopener noreferrer">{row.display_name}</a> : row.display_name}<span className={`status-flag status-${row.availability.toLowerCase()}`}>{availabilityLabels[row.availability]}</span></li>)}</ul></details>
      </section>}
      <section className="department-index"><h2>담당부서 목록</h2><div className="table-scroll"><table className="regulations-table department-table"><thead><tr><th>사규예고 담당부서</th><th>연결 규정</th><th>전문공개</th><th>전문 미공개</th><th>전문 미공개율</th><th>사규예고</th></tr></thead><tbody>{calculation.result.map((row) => <tr className={activeDepartment === row.department ? "selected" : ""} key={row.department}><td><button className="department-link" onClick={() => setSelected(row.department)}>{row.department}</button></td><td>{row.total}</td><td>{row.fulltext}</td><td>{row.nonpublic}</td><td>{row.nonpublicRate === null ? "측정 불가" : `${(row.nonpublicRate * 100).toFixed(1)}%`}</td><td>{row.notices}</td></tr>)}</tbody></table></div></section>
      <section id="residual-analysis"><DepartmentResidualAnalysis occurrences={residuals} summary={residualLabels} attributions={attributionExplanations}/></section>
      <section className="org-snapshot" id="organization-history"><div><b>조직도 기준일</b><span>{organizationSnapshot.snapshotDate}</span><a href={organizationSnapshot.sourceUrl} target="_blank" rel="noopener noreferrer">{organizationSnapshot.sourceName} ↗</a></div><div className="org-hierarchy">{organizationSnapshot.hierarchy.map((item) => <p key={item.division}><b>{item.division}</b><span>{item.units.join(" · ")}</span></p>)}</div></section>
    </div></main>
  </>;
}
