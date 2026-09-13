"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { filterRegulations, isLegacyRegulationRow, processingStatusLabel, publicAvailabilityLabel, rowsToCsv, statusOrder, validOfficialUrl, type RegulationFilters, type RegulationRow } from "./index";

type Props = {
  rows: RegulationRow[];
  manifest: {
    asOf: string; dataStatus: string; releaseId: string; lastAutomaticCheck: string; lastSuccessfulAt: string;
    approvedAt: string | null; snapshotRowCount: number | null; csvSha256Prefix: string | null;
    recentResult: string; nextDueAt: string; automationStatus: string; humanReviewPendingCount: number | null;
  };
};

const statusClass: Record<string, string> = {
  FULLTEXT_PUBLIC: "is-public", EXTRACTION_PENDING: "is-pending", NOTICE_ONLY: "is-notice", SOURCE_UNKNOWN: "is-unknown",
};
const lifecycleLabels: Record<string, string> = { current: "현행 확인", past: "과거", abolished: "폐지", merged: "통합", unknown: "미확인" };
const initialFilters: RegulationFilters = { query: "", statuses: [], lifecycle: "", verification: "" };

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
  const [selected, setSelected] = useState<{ kind: "status" | "stage" | "pending"; row: RegulationRow } | null>(null);
  const filtered = useMemo(() => filterRegulations(rows, filters), [rows, filters]);
  const verificationOptions = useMemo(() => [...new Set(rows.map((row) => row.document_verification_code))].sort(), [rows]);
  const lifecycleOptions = useMemo(() => [...new Set(rows.map((row) => row.lifecycle_code))].sort(), [rows]);
  const pageSize = 50; const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const shown = filtered.slice((Math.min(page, pageCount) - 1) * pageSize, Math.min(page, pageCount) * pageSize);
  const update = (next: Partial<RegulationFilters>) => { setFilters((old) => ({ ...old, ...next })); setPage(1); };
  const toggle = <T,>(items: T[], item: T) => items.includes(item) ? items.filter((x) => x !== item) : [...items, item];
  const exceptionRows = rows.filter((row) => ["NONPUBLIC", "SOURCE_UNKNOWN", "NONPUBLIC_CANDIDATE"].includes(row.public_status_code));
  const counts = {
    fulltext: rows.filter((row) => row.public_status_code === "FULLTEXT_PUBLIC").length,
    pending: rows.filter((row) => row.public_status_code === "EXTRACTION_PENDING").length,
    notice: rows.filter((row) => row.public_status_code === "NOTICE_ONLY").length,
    unknown: rows.filter((row) => row.public_status_code === "SOURCE_UNKNOWN").length,
  };
  const legacyCount = rows.filter(isLegacyRegulationRow).length;
  const allLegacy = legacyCount === rows.length;
  const workQueues = {
    automatic: rows.filter((row) => ["EXTRACTION_PENDING", "NOTICE_ONLY", "SOURCE_UNKNOWN"].includes(row.public_status_code)).length,
    document: counts.pending,
    nonpublic: counts.notice,
    source: counts.unknown,
  };
  const approved = manifest.dataStatus === "승인본";

  const openDetail = (row: RegulationRow) => {
    if (row.regulation_name === "투자옵션부보증 운용기준") router.push("/regulations/investment-option-guarantee");
  };
  const rowKey = (row: RegulationRow) => `${row.regulation_code}:${row.regulation_name}`;

  return <>
    <section className="review-hero shell">
      <div><p className="eyebrow">규정·법령 / 전체 공개현황</p><div className="title-line"><h1>신용보증기금 규정 공개현황</h1><span className="review-badge">{manifest.dataStatus}{allLegacy ? " · v0.4 기록" : ""}</span></div>
        <p className="review-warning">{allLegacy ? `${manifest.asOf} · v0.4 이전 판정 기록입니다. 최신 parser 측정은 아직 regulation_version 재평가에 반영되지 않았습니다.` : approved ? "명시적 승인을 거친 최신 공개 release입니다." : "현재 자료는 DB 공개 승인 전 번들 검토본입니다."}</p></div>
      <div className="metric-grid">
        {[['전체 규정', rows.length], ['v0.5 재평가 대기', legacyCount], ['이전 전문공개', counts.fulltext], ['이전 판정대기', counts.pending], ['이전 사전예고·출처불명', counts.notice + counts.unknown]].map(([label, value]) =>
          <div key={label}><span>{label}</span><strong>{Number(value).toLocaleString("ko-KR")}</strong></div>)}
      </div>
      <dl className="update-grid">
        <div><dt>현재 화면 데이터 기준일</dt><dd>{manifest.asOf}</dd></div><div><dt>현재 데이터 상태</dt><dd>{manifest.dataStatus}{allLegacy ? " · v0.4 이전 판정" : ""}</dd></div>
        <div><dt>Release ID</dt><dd>{manifest.releaseId}</dd></div>
        {approved && <><div><dt>승인일</dt><dd>{manifest.approvedAt}</dd></div><div><dt>스냅샷 행 수</dt><dd>{manifest.snapshotRowCount?.toLocaleString("ko-KR")}건</dd></div><div><dt>CSV SHA-256</dt><dd>{manifest.csvSha256Prefix}</dd></div></>}
        <div><dt>마지막 자동 점검일</dt><dd>{manifest.lastAutomaticCheck}</dd></div><div><dt>마지막 성공 수집일</dt><dd>{manifest.lastSuccessfulAt}</dd></div>
        <div><dt>최근 실행 결과</dt><dd>{manifest.recentResult}</dd></div><div><dt>다음 전체 수집 예정일</dt><dd>{manifest.nextDueAt}</dd></div>
        <div><dt>자동수집 상태</dt><dd>{manifest.automationStatus}</dd></div>
        <div><dt>현재 처리상태</dt><dd>{allLegacy ? `v0.5 재평가 대기 ${legacyCount.toLocaleString("ko-KR")}건` : "평가 결과 혼재"}</dd></div>
        <div><dt>이전 기록상 자동·엔진 검증 대상</dt><dd>{workQueues.automatic.toLocaleString("ko-KR")}건</dd></div>
        <div><dt>이전 문서처리 판정대기</dt><dd>{workQueues.document.toLocaleString("ko-KR")}건</dd></div>
        <div><dt>이전 사전예고만</dt><dd>{workQueues.nonpublic.toLocaleString("ko-KR")}건</dd></div>
        <div><dt>이전 원출처 불명</dt><dd>{workQueues.source.toLocaleString("ko-KR")}건</dd></div>
        <div><dt>인간 검토 필요</dt><dd>{manifest.humanReviewPendingCount === null ? "미산정 · v0.5 trigger 필요" : `${manifest.humanReviewPendingCount.toLocaleString("ko-KR")}건`}</dd></div>
      </dl>
    </section>

    <main className="regulations-shell shell">
      <aside className="filter-panel" aria-label="규정 필터">
        <div className="filter-head"><div><p className="eyebrow">Filter</p><h2>조건 선택</h2></div><button onClick={() => update(initialFilters)}>초기화</button></div>
        <label className="search-field"><span>규정명 검색</span><input value={filters.query} onChange={(e) => update({ query: e.target.value })} placeholder="규정명을 입력하세요" /></label>
        <fieldset><legend>이전 판정 상태 · v0.4</legend>{statusOrder.map((code) => { const sample = rows.find((row) => row.public_status_code === code); if (!sample) return null; return <label key={code}><input type="checkbox" checked={filters.statuses.includes(code)} onChange={() => update({ statuses: toggle(filters.statuses, code) })} />{sample.public_status_label}</label>; })}</fieldset>
        <label><span>이전 현행성 기록</span><select value={filters.lifecycle} onChange={(e) => update({ lifecycle: e.target.value })}><option value="">전체</option>{lifecycleOptions.map((v) => <option key={v} value={v}>{lifecycleLabels[v] ?? v}</option>)}</select></label>
        <label><span>이전 문서검증 기록</span><select value={filters.verification} onChange={(e) => update({ verification: e.target.value })}><option value="">전체</option>{verificationOptions.map((v) => <option key={v}>{v}</option>)}</select></label>
      </aside>

      <section className="table-panel">
        <div className="table-toolbar"><div><p>현재 필터 결과</p><strong>{filtered.length.toLocaleString("ko-KR")}건</strong></div>
          <div className="download-menu"><button onClick={() => downloadCsv("kodit_regulations_filtered.csv", filtered)}>현재 필터 CSV <small>{filtered.length}</small></button>
            <button onClick={() => downloadCsv(approved ? "kodit_regulations_approved_all.csv" : "kodit_regulations_review_all.csv", rows)}>전체 {approved ? "승인본" : "검토본"} CSV <small>{rows.length}</small></button>
            <button onClick={() => downloadCsv("kodit_regulations_unpublished_unknown.csv", exceptionRows)}>미공개·출처불명 CSV <small>{exceptionRows.length}</small></button></div>
        </div>
        <div className="table-scroll"><table className="regulations-table"><thead><tr>{["규정명","공개상태","처리상태","문서검증","이전 현행성","이전 미공개 검증단계","공식출처 수","엔진 검증 수","최근 수집일","최근 검증일"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{shown.map((row) => <tr key={rowKey(row)} onClick={() => openDetail(row)} className={`${row.regulation_name === "투자옵션부보증 운용기준" ? "has-detail" : ""} ${expandedRow === rowKey(row) ? "is-expanded" : ""}`}>
            <td data-label="규정명">{validOfficialUrl(row.official_url) ? <a className="name-link" href={validOfficialUrl(row.official_url)!} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{row.regulation_name}</a> : <span className="name-text">{row.regulation_name}</span>}{row.regulation_name === "투자옵션부보증 운용기준" && <button className="detail-ready" onClick={(e) => { e.stopPropagation(); openDetail(row); }}>상세 보기 →</button>}<button className="mobile-expand" aria-expanded={expandedRow === rowKey(row)} onClick={(e) => { e.stopPropagation(); setExpandedRow((current) => current === rowKey(row) ? null : rowKey(row)); }}>{expandedRow === rowKey(row) ? "접기" : "나머지 보기"}</button></td>
            <td data-label="공개상태"><button className={`status-flag ${statusClass[row.public_status_code] ?? ""}`} onClick={(e) => { e.stopPropagation(); setSelected({ kind: row.public_status_code === "EXTRACTION_PENDING" ? "pending" : "status", row }); }}>{publicAvailabilityLabel(row)}</button></td>
            <td data-label="처리상태"><span className="processing-flag">{processingStatusLabel(row)}</span></td>
            <td data-label="문서검증"><code>{isLegacyRegulationRow(row) ? `이전 기록 · ${row.document_verification_code}` : row.document_verification_code}</code></td>
            <td data-label="이전 현행성">{lifecycleLabels[row.lifecycle_code] ?? row.lifecycle_code}</td>
            <td data-label="이전 미공개 검증단계"><button className="stage-button" onClick={(e) => { e.stopPropagation(); setSelected({ kind: "stage", row }); }}>{row.nonpublic_stage ? `${row.nonpublic_stage}단계` : "해당 없음"}</button></td>
            <td data-label="공식출처 수">{row.official_source_count}</td><td data-label="엔진 검증 수">{row.search_verification_count}</td>
            <td data-label="최근 수집일">{row.last_collected_at.slice(0,10)}</td><td data-label="최근 검증일">{row.last_verified_at.slice(0,10)}</td>
          </tr>)}</tbody></table></div>
        <div className="pagination"><button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>이전</button><span>{Math.min(page,pageCount)} / {pageCount}</span><button disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>다음</button></div>
      </section>
    </main>

    {selected && <div className="dialog-backdrop" role="presentation" onMouseDown={() => setSelected(null)}><section className="decision-dialog" role="dialog" aria-modal="true" aria-labelledby="decision-title" onMouseDown={(e) => e.stopPropagation()}>
      <button className="dialog-close" onClick={() => setSelected(null)} aria-label="닫기">×</button><p className="eyebrow">이전 판정 기록</p><p className="record-meta">{manifest.asOf} · {selected.row.methodology_version}</p><h2 id="decision-title">{selected.row.regulation_name}</h2>
      {selected.kind === "status" && <><h3>이전 상태: {selected.row.public_status_label}</h3><p><b>이전 사유:</b> {selected.row.decision_reason}</p><code>{selected.row.decision_reason_code}</code><p className="dialog-note">현재 처리상태: {processingStatusLabel(selected.row)}</p></>}
      {selected.kind === "pending" && <><h3>이전 상태: 판정대기</h3><p><b>이전 사유:</b> {selected.row.decision_reason}</p><code>{selected.row.decision_reason_code}</code><p className="dialog-note">현재 처리상태: v0.5 재평가 대기<br />최신 parser 측정만으로 공개상태를 자동 변경하지 않습니다.</p></>}
      {selected.kind === "stage" && <><h3>이전 미공개 검증 기록: {selected.row.nonpublic_stage || 0}단계</h3><ol className="gate-list">{["공식출처 이상 탐지", "Grok 재현", "Gemini 재현", "DeepSeek 재현"].map((gate, i) => <li key={gate} className={i < selected.row.nonpublic_stage ? "pass" : "fail"}><b>{i < selected.row.nonpublic_stage ? "✓" : "·"}</b>{i+1}. {gate}</li>)}</ol><p className="dialog-note">이전 엔진 검증 수: {selected.row.search_verification_count}<br />현재 처리상태: {processingStatusLabel(selected.row)}</p></>}
    </section></div>}
  </>;
}
