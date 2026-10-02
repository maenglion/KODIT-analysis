"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { DepartmentSelectorDialog } from "./DepartmentSelectorDialog";
import { MetricHelp } from "./MetricHelp";
import { availabilityLabels, canonicalDepartment, organizationSnapshot, validPublicUrl, type Availability, type PublicRegulationSourceRow, type PublishNoticeRow, type PublishRegulationRow } from "./index";

type Sort = "NONPUBLIC_RATE" | "NONPUBLIC_COUNT" | "NOTICE_COUNT" | "FULLTEXT_RATE";
type DepartmentSummary = { department: string; notices: number; total: number; fulltext: number; partial: number; noticeOnly: number; sourceUnknown: number; nonpublic: number; nonpublicRate: number | null };
type Props = {
  rows: PublishRegulationRow[];
  notices: PublishNoticeRow[];
  sources: PublicRegulationSourceRow[];
};

function availabilityCounts(rows: PublishRegulationRow[]): Record<Availability, number> {
  const counts = { FULLTEXT_PUBLIC: 0, PARTIAL_PUBLIC: 0, NOTICE_ONLY: 0, SOURCE_UNKNOWN: 0 };
  for (const row of rows) counts[row.availability] += 1;
  return counts;
}

export function DepartmentStatistics({ rows, notices, sources }: Props) {
  const [sort, setSort] = useState<Sort>("NONPUBLIC_RATE");
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<"regulations" | "validation" | "changes">("regulations");
  const calculation = useMemo(() => {
    const regulations = new Map(rows.map((row) => [row.regulation_version_id, row]));
    const groups = new Map<string, { notices: number; regulationIds: Set<string> }>();
    for (const notice of notices) {
      const department = canonicalDepartment(notice.notice_department);
      if (!department) continue;
      const group = groups.get(department) ?? { notices: 0, regulationIds: new Set<string>() };
      group.notices += 1;
      for (const id of notice.linked_regulation_version_ids) group.regulationIds.add(id);
      groups.set(department, group);
    }
    const result: DepartmentSummary[] = [...groups.entries()].map(([department, group]) => {
      const linked = [...group.regulationIds].map((id) => regulations.get(id)).filter((row): row is PublishRegulationRow => !!row);
      const count = availabilityCounts(linked);
      const total = group.regulationIds.size;
      const nonpublic = total - count.FULLTEXT_PUBLIC;
      return { department, notices: group.notices, total, fulltext: count.FULLTEXT_PUBLIC, partial: count.PARTIAL_PUBLIC, noticeOnly: count.NOTICE_ONLY, sourceUnknown: count.SOURCE_UNKNOWN, nonpublic, nonpublicRate: total ? nonpublic / total : null };
    });
    result.sort((a, b) => sort === "NONPUBLIC_COUNT" ? b.nonpublic - a.nonpublic || b.total - a.total : sort === "NOTICE_COUNT" ? b.notices - a.notices : sort === "FULLTEXT_RATE" ? (b.total ? b.fulltext / b.total : -1) - (a.total ? a.fulltext / a.total : -1) : (b.nonpublicRate ?? -1) - (a.nonpublicRate ?? -1) || b.total - a.total || a.department.localeCompare(b.department, "ko"));
    return { result, regulations };
  }, [rows, notices, sort]);
  const department = selected ?? calculation.result[0]?.department ?? null;
  const active = calculation.result.find((row) => row.department === department) ?? null;
  const selectedRows = useMemo(() => {
    const ids = new Set(notices.filter((notice) => canonicalDepartment(notice.notice_department) === department).flatMap((notice) => notice.linked_regulation_version_ids));
    return [...ids].map((id) => calculation.regulations.get(id)).filter((row): row is PublishRegulationRow => !!row).sort((a, b) => a.display_name.localeCompare(b.display_name, "ko"));
  }, [department, notices, calculation.regulations]);
  const count = availabilityCounts(selectedRows);
  const sourceKinds = new Map<string, Set<string>>();
  for (const source of sources) {
    const kinds = sourceKinds.get(source.regulation_version_id) ?? new Set<string>();
    kinds.add(source.source_kind);
    sourceKinds.set(source.regulation_version_id, kinds);
  }
  const alioCount = selectedRows.filter((row) => sourceKinds.get(row.regulation_version_id)?.has("ALIO")).length;
  const siteCount = selectedRows.filter((row) => ["KODIT_PAGE", "KODIT_ATTACHMENT"].some((kind) => sourceKinds.get(row.regulation_version_id)?.has(kind))).length;
  const rate = active?.total ? active.fulltext / active.total : 0;
  const downloadSummary = () => {
    const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const header = ["사규예고 담당부서", "연결 규정 버전", "전문 공개", "일부 공개", "사전예고만", "출처불명", "전문 미확보 비율", "사규예고"];
    const values = calculation.result.map((row) => [row.department, row.total, row.fulltext, row.partial, row.noticeOnly, row.sourceUnknown, row.nonpublicRate === null ? "측정 불가" : `${(row.nonpublicRate * 100).toFixed(1)}%`, row.notices]);
    const csv = `\uFEFF${[header, ...values].map((line) => line.map(quote).join(",")).join("\r\n")}\r\n`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "kodit_department_public_summary.csv"; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <>
    <section className="public-page-intro department-intro"><div className="shell intro-inner"><div className="intro-copy"><p className="breadcrumb"><a href="/regulations">규정·법령</a> &gt; 부서별 통계 &gt; <b>요약</b></p><h1>사규예고 및 공개</h1><p>공식 조직도와 정확히 일치하는 담당부서를 기준으로 사규예고와 연결 규정의 공개 현황을 보여줍니다.</p></div><div className="database-state"><img src="/figma-icons/database.svg" alt=""/><b>승인된 정적 공개본</b><span>조직도 기준: {organizationSnapshot.snapshotDate}</span></div></div></section>
    <main className="department-page" id="summary"><div className="shell">
      <aside className="public-notice"><img src="/figma-icons/info.svg" alt=""/><div><b>공개 데이터 이용 안내</b><p>담당 표기의 개인명·과거 조직명은 별도 잔차 원장으로 분리합니다. 확인되지 않은 관계나 규정 전문을 임의로 확정하지 않습니다.</p></div></aside>
      <div className="department-actions"><button className="csv-button" type="button" onClick={downloadSummary}><img src="/figma-icons/download.svg" alt=""/>다운로드(CSV)</button><div><DepartmentSelectorDialog departments={calculation.result.map((row) => row.department)} selected={department} onSelect={(name) => setSelected(name)} /><label><span className="sr-only">담당부서 정렬 기준</span><select value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="NONPUBLIC_RATE">전문 미확보율 높은 순</option><option value="NONPUBLIC_COUNT">전문 미확보 건수 높은 순</option><option value="NOTICE_COUNT">사규예고 많은 순</option><option value="FULLTEXT_RATE">전문공개율 높은 순</option></select></label></div></div>
      {active && <section className="department-summary-card" aria-label={`${active.department} 공개 현황`}>
        <header><h2>{active.department}</h2><div className="department-summary-tabs" role="tablist" aria-label="부서 공개 현황 탭">
          <button role="tab" id="dept-tab-regulations" aria-controls="dept-panel-regulations" aria-selected={tab === "regulations"} onClick={() => setTab("regulations")}>연결 규정({active.total})</button>
          <span className="department-tab-with-help"><button role="tab" id="dept-tab-validation" aria-controls="dept-panel-validation" aria-selected={tab === "validation"} onClick={() => setTab("validation")}>검증 중단·불가</button><MetricHelp title="검증 상태 자료">현재 승인 공개본에는 검증 중단과 검증 불가를 구별하는 상태 필드가 없습니다. 사전예고만/출처불명을 두 상태로 바꿔 계산하지 않습니다.</MetricHelp></span>
          <button role="tab" id="dept-tab-changes" aria-controls="dept-panel-changes" aria-selected={tab === "changes"} onClick={() => setTab("changes")}>분석 데이터 변경이력</button>
        </div></header>
        <div className="department-summary-body"><div className="ratio-chart" style={{ "--ratio": `${rate * 360}deg` } as CSSProperties}><div><strong>{(rate * 100).toFixed(1)}%</strong><span>전문 확보율 <MetricHelp title="전문 확보율 기준">이 부서 사규예고에 연결된 서로 다른 규정 버전 중 FULLTEXT_PUBLIC로 승인된 버전의 비율입니다. 공식 PDF·HWP·HWPX·HTML 중 하나의 검증된 전문이면 통과합니다. 파일 파싱 성공만으로 공개/현행이 확정되지 않습니다.</MetricHelp></span></div></div><div className="department-main-metrics"><h3>주요 현황 · {active.department}</h3><dl>
          <div><dt>사규예고</dt><dd>{active.notices}</dd></div><div><dt>연결 규정</dt><dd>{active.total}</dd></div><div><dt>ALIO 공개 <MetricHelp title="ALIO 출처">해당 규정 버전에 공식 ALIO 근거 링크가 연결된 건수입니다. 전문 여부는 아래 공개 플래그로 별도 판단합니다.</MetricHelp></dt><dd>{alioCount}</dd></div><div><dt>사이트 공개 <MetricHelp title="KODIT 사이트 출처">공식 KODIT 페이지 또는 첨부 링크가 연결된 규정 버전 수입니다. 링크가 있다고 해서 전문 확보로 자동 판단하지 않습니다.</MetricHelp></dt><dd>{siteCount}</dd></div>
          <div><dt>전문 확보 <MetricHelp title="전문 확보 기준">규정 버전마다 검증된 공식 표현물 하나 이상이 전체 본문을 제공하여 FULLTEXT_PUBLIC로 승인된 경우입니다.</MetricHelp></dt><dd>{count.FULLTEXT_PUBLIC}</dd></div><div><dt>부분 확보</dt><dd>{count.PARTIAL_PUBLIC}</dd></div><div><dt>검증 중단 <MetricHelp title="검증 중단 · 용어 설명">향후 계약에서 검증 절차가 시작된 뒤 운영·정책 판단으로 완료 전 중단된 경우를 뜻할 수 있습니다. 아직 규정 버전의 확정 판정/공개 필드가 없으며 사전예고만으로 역산하지 않습니다.</MetricHelp></dt><dd aria-label="집계 미제공">—</dd></div><div><dt>검증 불가 <MetricHelp title="검증 불가 · 용어 설명">향후 계약에서 공식 자료 확인 후 암호화·DRM·손상·지원되지 않는 형식 때문에 승인된 기술 환경으로 원문 검증을 마칠 수 없을 때 사용될 수 있습니다. 아직 확정 상태가 아니며 출처불명과 같지 않습니다.</MetricHelp></dt><dd aria-label="집계 미제공">—</dd></div>
        </dl><p className="department-metric-note">—는 0건이 아니라 <b>현재 공개본에 집계가 없는 상태</b>입니다. ALIO/사이트 링크 건수와 전문 여부는 독립된 지표입니다.</p></div></div>
        {tab === "regulations" && <div className="department-summary-panel" role="tabpanel" id="dept-panel-regulations" aria-labelledby="dept-tab-regulations"><div className="department-panel-head"><h3>연결 규정 {selectedRows.length}건</h3><span>전문 공개 {count.FULLTEXT_PUBLIC} · 일부 공개 {count.PARTIAL_PUBLIC} · 사전예고만 {count.NOTICE_ONLY} · 출처불명 {count.SOURCE_UNKNOWN}</span></div><ul className="department-regulation-list">{selectedRows.map((row) => <li key={row.regulation_version_id}>{validPublicUrl(row.source_location) ? <a href={row.source_location!} target="_blank" rel="noopener noreferrer">{row.display_name} ↗</a> : row.display_name}<span className={`status-flag status-${row.availability.toLowerCase()}`}>{availabilityLabels[row.availability]}</span></li>)}</ul></div>}
        {tab === "validation" && <div className="department-summary-panel department-unavailable-panel" role="tabpanel" id="dept-panel-validation" aria-labelledby="dept-tab-validation"><h3>검증 중단·불가 집계는 아직 공개되지 않았습니다</h3><p>현재 규정 버전의 공개 플래그는 전문 공개·일부 공개·사전예고만·출처불명 네 가지입니다. 검증 작업의 중단과 불가 여부는 이 네 가지에서 자동으로 산출할 수 없습니다.</p><p>상태 정의와 안전한 공개 필드가 확인되면 같은 자리에 검증 단계별 수치와 공식 근거 링크를 표시합니다.</p></div>}
        {tab === "changes" && <div className="department-summary-panel department-unavailable-panel" role="tabpanel" id="dept-panel-changes" aria-labelledby="dept-tab-changes"><h3>승인된 공개본 간 변경이력은 후속 공개 범위입니다</h3><p>현재 분석 변경이력의 공개 RPC와 스냅샷 필드가 없어, 크론 실행별 변경 여부를 이 화면에서 보여주지 않습니다. 공개본에 기록된 변경행이 없다는 사실만으로 ‘기간 내 변경 없음’이라고 해석하지 않습니다.</p><small>향후 수집 주기 완료 → 후보/이전 승인본 비교 → 규정 버전별 변경 기록 → 새 공개본 승인 → 공개용 투영이 준비되면 이 탭에 근거 링크와 함께 표시합니다.</small></div>}
      </section>}
      <section className="department-index" id="department-index"><h2>담당부서별 목록</h2><p>표는 정렬 기준대로 표시합니다. 상단의 ‘부서 목록’은 가나다순 검색 모달입니다.</p><div className="table-scroll"><table className="regulations-table department-table"><thead><tr><th>사규예고 담당부서</th><th>연결 규정</th><th>전문 공개</th><th>일부 공개</th><th>사전예고만</th><th>출처불명</th><th>사규예고</th></tr></thead><tbody>{calculation.result.map((row) => <tr className={department === row.department ? "selected" : ""} key={row.department}><td><button type="button" className="department-link" onClick={() => { setSelected(row.department); document.querySelector(".department-summary-card")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{row.department}</button></td><td>{row.total}</td><td>{row.fulltext}</td><td>{row.partial}</td><td>{row.noticeOnly}</td><td>{row.sourceUnknown}</td><td>{row.notices}</td></tr>)}</tbody></table></div></section>
    </div></main>
  </>;
}
