"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { filterRegulations, isLegacyRegulationRow, processingStatusLabel, publicAvailabilityLabel, rowsToCsv, statusOrder, validOfficialUrl, type RegulationFilters, type RegulationRow } from "./index";

type Props = { rows: RegulationRow[]; manifest: { asOf: string; dataStatus: string; releaseId: string; lastAutomaticCheck: string; lastSuccessfulAt: string; approvedAt: string | null; snapshotRowCount: number | null; csvSha256Prefix: string | null; recentResult: string; nextDueAt: string; automationStatus: string; humanReviewPendingCount: number | null } };
type EvidenceRef = { evidence_type?: string; batch_run_id?: string; parser_run_id?: string; document_sha256?: string; format?: string; url?: string };
type Representation = { format?: string; extraction_outcome?: string; parser_name?: string; parser_version?: string; runtime_version?: string; environment_fingerprint?: string; parser_run_id?: string; extract_hash?: string; identity_result?: string; evidence_as_of?: string };

const statusClass: Record<string, string> = { FULLTEXT_PUBLIC: "is-public", REEVALUATION_PENDING: "is-pending", NOTICE_ONLY: "is-notice", SOURCE_UNKNOWN: "is-unknown" };
const lifecycleLabels: Record<string, string> = { current: "현행 확인", past: "과거", abolished: "폐지", merged: "통합", unknown: "미확인" };
const initialFilters: RegulationFilters = { query: "", statuses: [], lifecycle: "" };

function parseArray<T>(value?: string): T[] { if (!value) return []; try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed as T[] : []; } catch { return []; } }
function shortHash(value?: string) { return value ? `${value.slice(0, 12)}…` : "자료 없음"; }
function dateOnly(value?: string) { return value ? value.slice(0, 10) : "자료 없음"; }
function downloadCsv(name: string, rows: RegulationRow[]) { const blob = new Blob([rowsToCsv(rows)], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url); }

export function RegulationExplorer({ rows, manifest }: Props) {
  const router = useRouter();
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [selected, setSelected] = useState<RegulationRow | null>(null);
  const filtered = useMemo(() => filterRegulations(rows, filters), [rows, filters]);
  const lifecycleOptions = useMemo(() => [...new Set(rows.map((row) => row.lifecycle_code))].sort(), [rows]);
  const pageSize = 50; const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const shown = filtered.slice((Math.min(page, pageCount) - 1) * pageSize, Math.min(page, pageCount) * pageSize);
  const update = (next: Partial<RegulationFilters>) => { setFilters((old) => ({ ...old, ...next })); setPage(1); };
  const toggle = <T,>(items: T[], item: T) => items.includes(item) ? items.filter((value) => value !== item) : [...items, item];
  const exceptionRows = rows.filter((row) => ["NONPUBLIC", "SOURCE_UNKNOWN", "NONPUBLIC_CANDIDATE"].includes(row.public_status_code));
  const counts = Object.fromEntries(statusOrder.map((code) => [code, rows.filter((row) => row.public_status_code === code).length]));
  const legacyCount = rows.filter(isLegacyRegulationRow).length;
  const pendingCount = rows.filter((row) => processingStatusLabel(row).includes("대기")).length;
  const approved = manifest.dataStatus === "승인본";
  const openDetail = (row: RegulationRow) => row.regulation_name === "투자옵션부보증 운용기준" && router.push("/regulations/investment-option-guarantee");
  const rowKey = (row: RegulationRow) => `${row.regulation_code}:${row.regulation_name}`;

  return <>
    <section className="review-hero shell">
      <div><p className="eyebrow">규정·법령 / 전체 공개현황</p><div className="title-line"><h1>신용보증기금 규정 공개현황</h1><span className="review-badge">{manifest.dataStatus}</span></div><p className="review-warning">{legacyCount ? "재구성 평가가 없는 행은 이전 판정을 현재값으로 표시하지 않습니다." : approved ? "명시적 승인을 거친 최신 공개 release입니다." : "2026-09-13 최신 보존 증거로 재구성한 v0.5 검토본이며 DB 공개 승인 전입니다."}</p></div>
      <div className="metric-grid">{[["전체 규정", rows.length], ["전문 공개", counts.FULLTEXT_PUBLIC], ["사전예고만", counts.NOTICE_ONLY], ["출처불명", counts.SOURCE_UNKNOWN], ["재평가 대기", counts.REEVALUATION_PENDING]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{Number(value).toLocaleString("ko-KR")}</strong></div>)}</div>
      <dl className="update-grid compact-update-grid">
        <div><dt>현재 화면 데이터 기준일</dt><dd>{manifest.asOf}</dd></div><div><dt>데이터 유형</dt><dd>{manifest.dataStatus}</dd></div><div><dt>방법론</dt><dd>{legacyCount ? "v0.4 이전 기록 포함" : "v0.5 · 재구성 평가"}</dd></div>
        <div><dt>마지막 자동 점검일</dt><dd>{manifest.lastAutomaticCheck}</dd></div><div><dt>마지막 성공 수집일</dt><dd>{manifest.lastSuccessfulAt}</dd></div><div><dt>다음 전체 수집 예정일</dt><dd>{manifest.nextDueAt}</dd></div><div><dt>자동수집 상태</dt><dd>{manifest.automationStatus}</dd></div><div><dt>재평가 대기</dt><dd>{pendingCount.toLocaleString("ko-KR")}건</dd></div>
        {approved && <><div><dt>Release ID</dt><dd>{manifest.releaseId}</dd></div><div><dt>승인일</dt><dd>{manifest.approvedAt}</dd></div><div><dt>CSV SHA-256</dt><dd>{manifest.csvSha256Prefix}</dd></div></>}
      </dl>
    </section>

    <main className="regulations-shell shell">
      <aside className="filter-panel" aria-label="규정 필터"><div className="filter-head"><div><p className="eyebrow">Filter</p><h2>조건 선택</h2></div><button onClick={() => update(initialFilters)}>초기화</button></div>
        <label className="search-field"><span>규정명 검색</span><input value={filters.query} onChange={(event) => update({ query: event.target.value })} placeholder="규정명을 입력하세요" /></label>
        <fieldset><legend>현재 판정상태</legend>{statusOrder.map((code) => { const sample = rows.find((row) => row.public_status_code === code); return sample ? <label key={code}><input type="checkbox" checked={filters.statuses.includes(code)} onChange={() => update({ statuses: toggle(filters.statuses, code) })} />{sample.public_status_label}</label> : null; })}</fieldset>
        <label><span>현행상태</span><select value={filters.lifecycle} onChange={(event) => update({ lifecycle: event.target.value })}><option value="">전체</option>{lifecycleOptions.map((value) => <option key={value} value={value}>{lifecycleLabels[value] ?? value}</option>)}</select></label>
      </aside>

      <section className="table-panel"><div className="table-toolbar"><div><p>현재 필터 결과</p><strong>{filtered.length.toLocaleString("ko-KR")}건</strong></div><div className="download-menu"><button onClick={() => downloadCsv("kodit_regulations_filtered.csv", filtered)}>현재 필터 CSV <small>{filtered.length}</small></button><button onClick={() => downloadCsv(approved ? "kodit_regulations_approved_all.csv" : "kodit_regulations_reconstructed_review.csv", rows)}>전체 {approved ? "승인본" : "검토본"} CSV <small>{rows.length}</small></button><button onClick={() => downloadCsv("kodit_regulations_source_unknown.csv", exceptionRows)}>출처불명 CSV <small>{exceptionRows.length}</small></button></div></div>
        <div className="table-scroll"><table className="regulations-table"><colgroup><col className="col-name"/><col className="col-status"/><col className="col-lifecycle"/><col className="col-evidence"/><col className="col-date"/></colgroup><thead><tr>{["규정명", "현재 판정상태", "현행상태", "근거요약", "기준일 / 최근검증일"].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead>
          <tbody>{shown.map((row) => <tr key={rowKey(row)} className={`${row.regulation_name === "투자옵션부보증 운용기준" ? "has-detail" : ""} ${expandedRow === rowKey(row) ? "is-expanded" : ""}`}>
            <td data-label="규정명"><div className="regulation-name-cell">{validOfficialUrl(row.official_url) ? <a className="name-link" href={validOfficialUrl(row.official_url)!} target="_blank" rel="noopener noreferrer">{row.regulation_name}</a> : <span className="name-text">{row.regulation_name}</span>}{row.regulation_name === "투자옵션부보증 운용기준" && <button className="detail-ready" onClick={() => openDetail(row)}>상세 보기 →</button>}</div><button className="mobile-expand" aria-expanded={expandedRow === rowKey(row)} onClick={() => setExpandedRow((current) => current === rowKey(row) ? null : rowKey(row))}>{expandedRow === rowKey(row) ? "접기" : "근거 보기"}</button></td>
            <td data-label="현재 판정상태"><button className={`status-flag ${statusClass[row.public_status_code] ?? ""}`} onClick={() => setSelected(row)}>{publicAvailabilityLabel(row)}</button></td>
            <td data-label="현행상태">{lifecycleLabels[row.lifecycle_code] ?? row.lifecycle_code}</td>
            <td data-label="근거요약"><button className="evidence-summary" onClick={() => setSelected(row)}>{row.evidence_summary || (isLegacyRegulationRow(row) ? "최신 재평가 대기" : "자료 없음")}</button></td>
            <td data-label="기준일 / 최근검증일"><span className="date-stack"><b>{dateOnly(row.evidence_as_of)}</b><small>{dateOnly(row.last_verified_at)}</small></span></td>
          </tr>)}</tbody></table></div>
        <div className="pagination"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>이전</button><span>{Math.min(page, pageCount)} / {pageCount}</span><button disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>다음</button></div>
      </section>
    </main>
    {selected && <EvaluationDialog row={selected} onClose={() => setSelected(null)} />}
  </>;
}

function EvaluationDialog({ row, onClose }: { row: RegulationRow; onClose: () => void }) {
  const evidence = parseArray<EvidenceRef>(row.evidence_refs_json); const representations = parseArray<Representation>(row.representations_json); const officialUrl = validOfficialUrl(row.official_url); const legacy = isLegacyRegulationRow(row);
  return <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}><section className="decision-dialog evidence-dialog" role="dialog" aria-modal="true" aria-labelledby="decision-title" onMouseDown={(event) => event.stopPropagation()}>
    <button className="dialog-close" onClick={onClose} aria-label="닫기">×</button><p className="eyebrow">평가 근거 원장</p><h2 id="decision-title">{row.regulation_name}</h2>
    <div className="evidence-section"><h3>현재 평가</h3><dl><div><dt>판정상태</dt><dd>{legacy ? "재평가 대기" : row.public_status_label}</dd></div><div><dt>방법론</dt><dd>{legacy ? "자료 없음" : row.methodology_version}</dd></div><div><dt>평가시각</dt><dd>{row.evaluated_at || "재평가 대기"}</dd></div><div><dt>근거 기준시각</dt><dd>{row.evidence_as_of || "자료 없음"}</dd></div></dl></div>
    <div className="evidence-section"><h3>판정 이유</h3><code>{legacy ? "REEVALUATION_PENDING" : row.decision_reason_code}</code><p>{legacy ? "최신 증거와의 재구성 평가가 아직 없습니다." : row.decision_reason}</p></div>
    <div className="evidence-section"><h3>공식 근거</h3>{officialUrl ? <p><a href={officialUrl} target="_blank" rel="noopener noreferrer">공식 게시물·원문 열기 ↗</a></p> : <p>공식 URL 자료 없음</p>}<dl><div><dt>문서 SHA-256</dt><dd className="mono">{row.document_sha256 || "자료 없음"}</dd></div><div><dt>개정일</dt><dd>{row.revision_date || "자료 없음"}</dd></div><div><dt>수집일</dt><dd>{row.last_collected_at || "자료 없음"}</dd></div><div><dt>근거 수</dt><dd>{evidence.length || "자료 없음"}</dd></div></dl></div>
    <div className="evidence-section"><h3>문서 처리</h3>{representations.length ? representations.map((item, index) => <article className="representation-card" key={`${item.parser_run_id}:${index}`}><b>{item.format || "UNKNOWN"}</b><span>추출: {item.extraction_outcome || "자료 없음"}</span><span>동일성: {item.identity_result || "자료 없음"}</span><span>파서: {item.parser_name || "자료 없음"} {item.parser_version}</span><span>런타임: {item.runtime_version || "자료 없음"}</span><span>Extract hash: {shortHash(item.extract_hash)}</span><span>Run ID: {item.parser_run_id || "자료 없음"}</span></article>) : <p>자료 없음</p>}</div>
    <div className="evidence-section"><h3>이전 평가</h3><dl><div><dt>기준</dt><dd>v0.4 · {row.previous_evaluation_date || "2026-09-08"}</dd></div><div><dt>이전 상태</dt><dd>{row.previous_public_status_label || row.public_status_label}</dd></div><div><dt>이전 사유</dt><dd>{row.previous_decision_reason || row.decision_reason || "자료 없음"}</dd></div></dl></div>
    {(row.unresolved_reason || legacy) && <div className="evidence-section unresolved-section"><h3>미해결 사항</h3><code>{row.unresolved_reason || "REEVALUATION_PENDING"}</code></div>}
  </section></div>;
}
