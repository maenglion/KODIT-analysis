"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { filterRegulations, rowsToCsv, statusOrder, type RegulationFilters, type RegulationRow } from "./index";

type Props = {
  rows: RegulationRow[];
  manifest: {
    asOf: string; dataStatus: string; releaseId: string; lastAutomaticCheck: string; lastSuccessfulAt: string;
    approvedAt: string | null; snapshotRowCount: number | null; csvSha256Prefix: string | null;
    recentResult: string; nextDueAt: string; automationStatus: string; humanReviewPendingCount: number;
  };
};

const statusClass: Record<string, string> = {
  FULLTEXT_PUBLIC: "is-public", EXTRACTION_PENDING: "is-pending", NOTICE_ONLY: "is-notice", SOURCE_UNKNOWN: "is-unknown",
};
const lifecycleLabels: Record<string, string> = { current: "현행 확인", past: "과거", abolished: "폐지", merged: "통합", unknown: "미확인" };
const confidencePresets = [
  ["전체 선택", [5, 4, 3, 2, 1]], ["유력 이상 3~5", [5, 4, 3]], ["검증 이상 4~5", [5, 4]], ["확정만 5", [5]],
] as const;
const initialFilters: RegulationFilters = { query: "", statuses: [], confidence: [], lifecycle: "", verification: "", human: "all" };

function downloadCsv(name: string, rows: RegulationRow[]) {
  const blob = new Blob([rowsToCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
  URL.revokeObjectURL(url);
}

export function RegulationExplorer({ rows, manifest }: Props) {
  const router = useRouter();
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ kind: "status" | "confidence" | "stage" | "pending"; row: RegulationRow } | null>(null);
  const filtered = useMemo(() => filterRegulations(rows, filters), [rows, filters]);
  const verificationOptions = useMemo(() => [...new Set(rows.map((row) => row.document_verification_code))].sort(), [rows]);
  const lifecycleOptions = useMemo(() => [...new Set(rows.map((row) => row.lifecycle_code))].sort(), [rows]);
  const pageSize = 50; const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const shown = filtered.slice((Math.min(page, pageCount) - 1) * pageSize, Math.min(page, pageCount) * pageSize);
  const update = (next: Partial<RegulationFilters>) => { setFilters((old) => ({ ...old, ...next })); setPage(1); };
  const toggle = <T,>(items: T[], item: T) => items.includes(item) ? items.filter((x) => x !== item) : [...items, item];
  const exceptionRows = rows.filter((row) => ["NONPUBLIC", "SOURCE_UNKNOWN", "NONPUBLIC_CANDIDATE"].includes(row.public_status_code));
  const externalRows = rows.filter((row) => row.confidence_level >= 4);
  const counts = {
    fulltext: rows.filter((row) => row.public_status_code === "FULLTEXT_PUBLIC").length,
    pending: rows.filter((row) => row.public_status_code === "EXTRACTION_PENDING").length,
    notice: rows.filter((row) => row.public_status_code === "NOTICE_ONLY").length,
    unknown: rows.filter((row) => row.public_status_code === "SOURCE_UNKNOWN").length,
  };
  const approved = manifest.dataStatus === "승인본";

  const openDetail = (row: RegulationRow) => {
    if (row.regulation_name === "투자옵션부보증 운용기준") router.push("/regulations/investment-option-guarantee");
  };
  const rowKey = (row: RegulationRow) => `${row.regulation_code}:${row.regulation_name}`;

  return <>
    <section className="review-hero shell">
      <div><p className="eyebrow">규정·법령 / 전체 공개현황</p><div className="title-line"><h1>신용보증기금 규정 공개현황</h1><span className="review-badge">{manifest.dataStatus}</span></div>
        <p className="review-warning">{approved ? "명시적 승인을 거친 최신 공개 release입니다." : "현재 자료는 DB 공개 승인 전 번들 검토본입니다."}</p></div>
      <div className="metric-grid">
        {[['전체 규정', rows.length], ['전문 공개', counts.fulltext], ['판정대기', counts.pending], ['사전예고만', counts.notice], ['출처불명', counts.unknown]].map(([label, value]) =>
          <div key={label}><span>{label}</span><strong>{Number(value).toLocaleString("ko-KR")}</strong></div>)}
      </div>
      <dl className="update-grid">
        <div><dt>현재 화면 데이터 기준일</dt><dd>{manifest.asOf}</dd></div><div><dt>현재 데이터 상태</dt><dd>{manifest.dataStatus}</dd></div>
        <div><dt>Release ID</dt><dd>{manifest.releaseId}</dd></div>
        {approved && <><div><dt>승인일</dt><dd>{manifest.approvedAt}</dd></div><div><dt>스냅샷 행 수</dt><dd>{manifest.snapshotRowCount?.toLocaleString("ko-KR")}건</dd></div><div><dt>CSV SHA-256</dt><dd>{manifest.csvSha256Prefix}</dd></div></>}
        <div><dt>마지막 자동 점검일</dt><dd>{manifest.lastAutomaticCheck}</dd></div><div><dt>마지막 성공 수집일</dt><dd>{manifest.lastSuccessfulAt}</dd></div>
        <div><dt>최근 실행 결과</dt><dd>{manifest.recentResult}</dd></div><div><dt>다음 전체 수집 예정일</dt><dd>{manifest.nextDueAt}</dd></div>
        <div><dt>자동수집 상태</dt><dd>{manifest.automationStatus}</dd></div><div><dt>인간 검토 대기 건수</dt><dd>{manifest.humanReviewPendingCount.toLocaleString("ko-KR")}건</dd></div>
      </dl>
    </section>

    <main className="regulations-shell shell">
      <aside className="filter-panel" aria-label="규정 필터">
        <div className="filter-head"><div><p className="eyebrow">Filter</p><h2>조건 선택</h2></div><button onClick={() => update(initialFilters)}>초기화</button></div>
        <label className="search-field"><span>규정명 검색</span><input value={filters.query} onChange={(e) => update({ query: e.target.value })} placeholder="규정명을 입력하세요" /></label>
        <fieldset><legend>공개상태</legend>{statusOrder.map((code) => { const sample = rows.find((row) => row.public_status_code === code); if (!sample) return null; return <label key={code}><input type="checkbox" checked={filters.statuses.includes(code)} onChange={() => update({ statuses: toggle(filters.statuses, code) })} />{sample.public_status_label}</label>; })}</fieldset>
        <fieldset><legend>신뢰도</legend><div className="preset-row">{confidencePresets.map(([label, values]) => <button key={label} onClick={() => update({ confidence: [...values] })}>{label}</button>)}</div>
          <div className="checkbox-row">{[5,4,3,2,1].map((level) => <label key={level}><input type="checkbox" checked={filters.confidence.includes(level)} onChange={() => update({ confidence: toggle(filters.confidence, level) })} />{level}</label>)}</div></fieldset>
        <label><span>현행 여부</span><select value={filters.lifecycle} onChange={(e) => update({ lifecycle: e.target.value })}><option value="">전체</option>{lifecycleOptions.map((v) => <option key={v} value={v}>{lifecycleLabels[v] ?? v}</option>)}</select></label>
        <label><span>문서검증 상태</span><select value={filters.verification} onChange={(e) => update({ verification: e.target.value })}><option value="">전체</option>{verificationOptions.map((v) => <option key={v}>{v}</option>)}</select></label>
        <label><span>인간확정 여부</span><select value={filters.human} onChange={(e) => update({ human: e.target.value as RegulationFilters["human"] })}><option value="all">전체</option><option value="yes">확정</option><option value="no">미확정</option></select></label>
      </aside>

      <section className="table-panel">
        <div className="table-toolbar"><div><p>현재 필터 결과</p><strong>{filtered.length.toLocaleString("ko-KR")}건</strong></div>
          <div className="download-menu"><button onClick={() => downloadCsv("kodit_regulations_filtered.csv", filtered)}>현재 필터 CSV <small>{filtered.length}</small></button>
            <button onClick={() => downloadCsv(approved ? "kodit_regulations_approved_all.csv" : "kodit_regulations_review_all.csv", rows)}>전체 {approved ? "승인본" : "검토본"} CSV <small>{rows.length}</small></button>
            <button onClick={() => downloadCsv("kodit_regulations_unpublished_unknown.csv", exceptionRows)}>미공개·출처불명 CSV <small>{exceptionRows.length}</small></button>
            <button onClick={() => downloadCsv("kodit_regulations_external_confidence_4plus.csv", externalRows)}>외부전달용 CSV <small>{externalRows.length}</small></button></div>
        </div>
        <div className="table-scroll"><table className="regulations-table"><thead><tr>{["규정명","공개상태","신뢰도","현행 여부","문서검증 상태","미공개 검증단계","공식출처 수","엔진 검증 수","인간확정 여부","최근 수집일","최근 검증일"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{shown.map((row) => <tr key={rowKey(row)} onClick={() => openDetail(row)} className={`${row.regulation_name === "투자옵션부보증 운용기준" ? "has-detail" : ""} ${expandedRow === rowKey(row) ? "is-expanded" : ""}`}>
            <td data-label="규정명"><button className="name-button" onClick={(e) => { e.stopPropagation(); openDetail(row); }}>{row.regulation_name}</button>{row.regulation_name === "투자옵션부보증 운용기준" && <small className="detail-ready">상세 보기 ↗</small>}<button className="mobile-expand" aria-expanded={expandedRow === rowKey(row)} onClick={(e) => { e.stopPropagation(); setExpandedRow((current) => current === rowKey(row) ? null : rowKey(row)); }}>{expandedRow === rowKey(row) ? "접기" : "나머지 보기"}</button></td>
            <td data-label="공개상태"><button className={`status-flag ${statusClass[row.public_status_code] ?? ""}`} onClick={(e) => { e.stopPropagation(); setSelected({ kind: row.public_status_code === "EXTRACTION_PENDING" ? "pending" : "status", row }); }}>{row.public_status_label}</button></td>
            <td data-label="신뢰도"><button className="confidence-flag" onClick={(e) => { e.stopPropagation(); setSelected({ kind: "confidence", row }); }}>{row.confidence_level}</button></td>
            <td data-label="현행 여부">{lifecycleLabels[row.lifecycle_code] ?? row.lifecycle_code}</td><td data-label="문서검증 상태"><code>{row.document_verification_code}</code></td>
            <td data-label="미공개 검증단계"><button className="stage-button" onClick={(e) => { e.stopPropagation(); setSelected({ kind: "stage", row }); }}>{row.nonpublic_stage ? `${row.nonpublic_stage}단계` : "해당 없음"}</button></td>
            <td data-label="공식출처 수">{row.official_source_count}</td><td data-label="엔진 검증 수">{row.search_verification_count}</td><td data-label="인간확정 여부">{row.human_confirmed ? "예" : "아니오"}</td>
            <td data-label="최근 수집일">{row.last_collected_at.slice(0,10)}</td><td data-label="최근 검증일">{row.last_verified_at.slice(0,10)}</td>
          </tr>)}</tbody></table></div>
        <div className="pagination"><button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>이전</button><span>{Math.min(page,pageCount)} / {pageCount}</span><button disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>다음</button></div>
      </section>
    </main>

    {selected && <div className="dialog-backdrop" role="presentation" onMouseDown={() => setSelected(null)}><section className="decision-dialog" role="dialog" aria-modal="true" aria-labelledby="decision-title" onMouseDown={(e) => e.stopPropagation()}>
      <button className="dialog-close" onClick={() => setSelected(null)} aria-label="닫기">×</button><p className="eyebrow">v0.4 판정 상세</p><h2 id="decision-title">{selected.row.regulation_name}</h2>
      {selected.kind === "status" && <><h3>{selected.row.public_status_label}</h3><p>{selected.row.decision_reason}</p><code>{selected.row.decision_reason_code}</code></>}
      {selected.kind === "pending" && <><h3>판정대기 사유</h3><p>{selected.row.decision_reason}</p><code>{selected.row.decision_reason_code}</code><p className="dialog-note">추출 또는 접근 확인이 끝나기 전에는 미공개 검증단계를 올리지 않습니다.</p></>}
      {selected.kind === "confidence" && <><h3>신뢰도 {selected.row.confidence_level}</h3><ol className="gate-list">{["규정 식별", "공식 발견경로", "원문 접근", "본문 앵커 검증", "사람의 최종확정"].map((gate, i) => <li key={gate} className={i < selected.row.confidence_level ? "pass" : "fail"}><b>{i < selected.row.confidence_level ? "✓" : "✗"}</b>{i+1}. {gate}</li>)}</ol></>}
      {selected.kind === "stage" && <><h3>미공개 검증 {selected.row.nonpublic_stage || 0}단계</h3><ol className="gate-list">{["공식출처 이상 탐지", "Grok 재현", "Gemini 재현", "DeepSeek 재현 + 사람 확인"].map((gate, i) => <li key={gate} className={i < selected.row.nonpublic_stage ? "pass" : "fail"}><b>{i < selected.row.nonpublic_stage ? "✓" : "·"}</b>{i+1}. {gate}</li>)}</ol><p className="dialog-note">엔진 검증 수: {selected.row.search_verification_count} · 인간확정: {selected.row.human_confirmed ? "예" : "아니오"}</p></>}
    </section></div>}
  </>;
}
