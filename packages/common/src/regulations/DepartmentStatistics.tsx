"use client";

import { useMemo, useState } from "react";
import { availabilityLabels, canonicalDepartment, organizationSnapshot, validPublicUrl, type PublishNoticeRow, type PublishRegulationRow } from "./index";

type Sort = "NONPUBLIC_RATE" | "NONPUBLIC_COUNT" | "NOTICE_COUNT" | "FULLTEXT_RATE";
type Props = { rows: PublishRegulationRow[]; notices: PublishNoticeRow[] };

export function DepartmentStatistics({ rows, notices }: Props) {
  const [sort, setSort] = useState<Sort>("NONPUBLIC_RATE"); const [selected, setSelected] = useState<string | null>(null);
  const calculation = useMemo(() => {
    const regulations = new Map(rows.map((row) => [row.regulation_version_id, row]));
    const groups = new Map<string, { notices: number; regulations: Set<string>; fulltext: Set<string> }>(); const unmapped = new Map<string, number>(); let linked = 0;
    for (const notice of notices) {
      const department = canonicalDepartment(notice.notice_department);
      if (!department) { const label = notice.notice_department?.trim() || "미기재"; unmapped.set(label, (unmapped.get(label) ?? 0) + 1); continue; }
      const value = groups.get(department) ?? { notices: 0, regulations: new Set<string>(), fulltext: new Set<string>() }; value.notices += 1;
      for (const id of notice.linked_regulation_version_ids) { linked += 1; value.regulations.add(id); if (regulations.get(id)?.availability === "FULLTEXT_PUBLIC") value.fulltext.add(id); }
      groups.set(department, value);
    }
    const result = [...groups.entries()].map(([department, value]) => { const total = value.regulations.size; const fulltext = value.fulltext.size; return { department, notices: value.notices, total, fulltext, nonpublic: total - fulltext, nonpublicRate: total ? (total - fulltext) / total : null }; });
    result.sort((a, b) => sort === "NONPUBLIC_COUNT" ? b.nonpublic - a.nonpublic || b.total - a.total : sort === "NOTICE_COUNT" ? b.notices - a.notices : sort === "FULLTEXT_RATE" ? (b.total ? b.fulltext / b.total : -1) - (a.total ? a.fulltext / a.total : -1) : (b.nonpublicRate ?? -1) - (a.nonpublicRate ?? -1) || b.total - a.total);
    return { result, unmapped: [...unmapped.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko")), linked, regulations };
  }, [rows, notices, sort]);
  const selectedRows = selected ? rows.filter((row) => notices.some((notice) => canonicalDepartment(notice.notice_department) === selected && notice.linked_regulation_version_ids.includes(row.regulation_version_id))) : [];
  return <main className="shell statistics-page"><p className="eyebrow">부서별 통계</p><h1>사규예고 담당부서 현황</h1><p className="statistics-note">공식 조직도 명칭과 정확히 일치하는 사규예고 담당부서만 집계합니다. 전문 미공개율은 연결 규정 중 전문공개가 아닌 규정의 비율입니다.</p>
    <section className="org-snapshot"><div><b>조직도 기준일</b><span>{organizationSnapshot.snapshotDate}</span><a href={organizationSnapshot.sourceUrl} target="_blank" rel="noopener noreferrer">{organizationSnapshot.sourceName} ↗</a></div><div className="org-hierarchy">{organizationSnapshot.hierarchy.map((item) => <p key={item.division}><b>{item.division}</b><span>{item.units.join(" · ")}</span></p>)}</div></section>
    <dl className="statistics-summary"><div><dt>전체 사규예고</dt><dd>{notices.length.toLocaleString("ko-KR")}건</dd></div><div><dt>정확 매핑 부서</dt><dd>{calculation.result.length.toLocaleString("ko-KR")}개</dd></div><div><dt>연결 관계</dt><dd>{calculation.linked.toLocaleString("ko-KR")}건</dd></div><div><dt>개인·미매핑 표기</dt><dd>{calculation.unmapped.reduce((sum, [, count]) => sum + count, 0).toLocaleString("ko-KR")}건</dd></div></dl>
    <div className="statistics-controls"><label>정렬 <select value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="NONPUBLIC_RATE">전문 미공개율 높은 순</option><option value="NONPUBLIC_COUNT">전문 미공개 건수 높은 순</option><option value="NOTICE_COUNT">사규예고 많은 순</option><option value="FULLTEXT_RATE">전문공개율 높은 순</option></select></label></div>
    <section className="table-panel"><div className="table-scroll"><table className="regulations-table department-table"><thead><tr><th>사규예고 담당부서</th><th>연결 규정</th><th>전문공개</th><th>전문 미공개</th><th>전문 미공개율</th><th>사규예고</th></tr></thead><tbody>{calculation.result.map((row) => <tr key={row.department}><td><button className="department-link" onClick={() => setSelected(selected === row.department ? null : row.department)}>{row.department}</button></td><td>{row.total}</td><td>{row.fulltext}</td><td>{row.nonpublic}</td><td>{row.nonpublicRate === null ? "측정 불가" : `${(row.nonpublicRate * 100).toFixed(1)}%`}</td><td>{row.notices}</td></tr>)}</tbody></table></div></section>
    {selected && <section className="department-drilldown"><h2>{selected} 연결 규정</h2><ul>{selectedRows.map((row) => <li key={row.regulation_version_id}>{validPublicUrl(row.source_location) ? <a href={row.source_location!} target="_blank" rel="noopener noreferrer">{row.display_name}</a> : row.display_name}<span>{availabilityLabels[row.availability]}</span></li>)}</ul></section>}
    <details className="unmapped-list"><summary><span>개인·미매핑 표기</span><small>{calculation.unmapped.reduce((sum, [, count]) => sum + count, 0).toLocaleString("ko-KR")}건 · 펼쳐보기</small></summary><div className="unmapped-content"><p>공식 조직도와 정확히 일치하지 않는 값은 부서를 추정하지 않았습니다.</p><ul>{calculation.unmapped.map(([label, count]) => <li key={label}><span>{label}</span><b>{count.toLocaleString("ko-KR")}건</b></li>)}</ul></div></details>
  </main>;
}
