"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { availabilityLabels, availabilityOrder, type PublicRegulationFilters } from "@kodit/common/regulations";
import {
  addDetailTerm, defaultDetailSettings, detailDateRange, settingsForScope,
  type DetailDateField, type DetailField, type DetailScope, type EvidenceGroup, type RegulationDetailSettings,
} from "./regulation-detail-ui";

type Availability = PublicRegulationFilters["availability"];
type Draft = { scope: DetailScope; availability: Availability; detail: RegulationDetailSettings };
type Props = {
  open: boolean;
  onClose: () => void;
  scope: DetailScope;
  initialScope: DetailScope;
  availability: Availability;
  appliedDetail: RegulationDetailSettings;
  officialDepartments: string[];
  availableEvidenceGroups: EvidenceGroup[];
  evidenceAsOf: string;
  query: string;
  onQueryChange: (value: string) => void;
  onApply: (draft: Draft, query: string) => void;
  onReset: () => void;
};

const fieldOptions: { value: DetailField; label: string; scopes: DetailScope[] }[] = [
  { value: "TITLE", label: "규정명·예고 제목", scopes: ["master", "notice", "all"] },
  { value: "DEPARTMENT", label: "담당 표기", scopes: ["master", "notice", "all"] },
  { value: "YEAR", label: "개정·게시 연도", scopes: ["master", "notice", "all"] },
  { value: "ATTACHMENT_NAME", label: "첨부파일명", scopes: ["master"] },
  { value: "LINKED_REGULATION_NAME", label: "연결된 규정명", scopes: ["notice"] },
];
const evidenceOptions: { value: EvidenceGroup; label: string }[] = [
  { value: "ALIO", label: "ALIO 공식 근거" },
  { value: "KODIT", label: "KODIT 공식 페이지·첨부" },
  { value: "OTHER", label: "기타 공식 출처" },
];

function DetailRow({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return <div className="detail-setting-row">
    <div className="detail-setting-label"><strong>{title}</strong></div>
    <div className="detail-setting-value">{children}{note && <p className="detail-setting-note">{note}</p>}</div>
  </div>;
}

function TermEditor({ kind, terms, pending, setPending, onAdd, onRemove }: {
  kind: string; terms: string[]; pending: string; setPending: (value: string) => void;
  onAdd: () => void; onRemove: (value: string) => void;
}) {
  return <div className="detail-terms">
    {terms.map(term => <span key={term} className="detail-term-chip">{term}<button type="button" aria-label={`${kind} ${term} 삭제`} onClick={() => onRemove(term)}>×</button></span>)}
    <input aria-label={`${kind} 입력, 최대 3개`} value={pending} onChange={event => setPending(event.target.value)}
      onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); onAdd(); } }}
      placeholder={terms.length ? "단어 추가" : "단어를 입력하고 Enter"} maxLength={80} disabled={terms.length >= 3} />
    <button type="button" onClick={onAdd} disabled={terms.length >= 3 || !pending.trim()}>추가</button>
  </div>;
}

export function RegulationAdvancedSearch({ open, onClose, scope, initialScope, availability, appliedDetail, officialDepartments, availableEvidenceGroups, evidenceAsOf, query, onQueryChange, onApply, onReset }: Props) {
  const panelRef = useRef<HTMLElement | null>(null);
  const [draft, setDraft] = useState<Draft>(() => ({ scope, availability, detail: appliedDetail }));
  const [pendingInclude, setPendingInclude] = useState("");
  const [pendingExclude, setPendingExclude] = useState("");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  useEffect(() => setDraft({ scope, availability, detail: appliedDetail }), [scope, availability, appliedDetail]);
  useEffect(() => { if (open) panelRef.current?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(""), 4000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const updateDetail = (next: Partial<RegulationDetailSettings>) => setDraft(old => ({ ...old, detail: { ...old.detail, ...next } }));
  const addTerm = (kind: "includes" | "excludes") => {
    const pending = kind === "includes" ? pendingInclude : pendingExclude;
    if (!pending.trim()) return;
    if (draft.detail[kind].length >= 3) { setError("포함·제외 단어는 각각 최대 3개입니다."); return; }
    updateDetail({ [kind]: addDetailTerm(draft.detail[kind], pending) });
    if (kind === "includes") setPendingInclude(""); else setPendingExclude("");
    setError("");
  };
  const toggleField = (field: DetailField) => {
    const fields = draft.detail.fields.includes(field) ? draft.detail.fields.filter(item => item !== field) : [...draft.detail.fields, field];
    if (!fields.length) { setError("검색 필드를 한 개 이상 선택해 주세요."); return; }
    updateDetail({ fields });
    setError("");
  };
  const apply = () => {
    if (pendingInclude.trim() && draft.detail.includes.length >= 3 || pendingExclude.trim() && draft.detail.excludes.length >= 3) {
      setError("포함·제외 단어는 각각 최대 3개입니다."); return;
    }
    const detail = {
      ...draft.detail,
      includes: addDetailTerm(draft.detail.includes, pendingInclude),
      excludes: addDetailTerm(draft.detail.excludes, pendingExclude),
    };
    if (detail.startDate && detail.endDate && detail.startDate > detail.endDate) {
      setError("시작일은 종료일보다 늦을 수 없습니다."); return;
    }
    if (!detail.fields.length) { setError("검색 필드를 한 개 이상 선택해 주세요."); return; }
    const next = { ...draft, detail: settingsForScope(detail, draft.scope) };
    setDraft(next);
    setPendingInclude(""); setPendingExclude(""); setError("");
    onApply(next, query.trim());
    setFeedback("설정이 적용되었습니다. 아래 결과와 전체 결과 CSV에 같은 조건이 반영됩니다.");
  };
  const reset = () => {
    setDraft({ scope: initialScope, availability: "ALL", detail: defaultDetailSettings(initialScope) });
    setPendingInclude(""); setPendingExclude(""); setError("");
    onQueryChange(""); onReset();
    setFeedback("검색 조건을 초기화했습니다.");
  };
  const dateOptions: { value: DetailDateField; label: string; enabled: boolean }[] = [
    { value: "REVISION", label: "개정일", enabled: draft.scope === "master" },
    { value: "LATEST_NOTICE", label: draft.scope === "all" ? "규정: 최근 연결 예고일 / 예고: 게시일" : "연결된 사규예고 중 최근 게시일", enabled: draft.scope !== "notice" },
    { value: "POSTED", label: "사규예고 게시일", enabled: draft.scope === "notice" },
  ];
  return <section ref={panelRef} id="advanced-search-panel" className="advanced-search-panel" aria-labelledby="advanced-search-title" tabIndex={-1} hidden={!open}>
    <div className="advanced-search-heading"><div><h2 id="advanced-search-title">상세 설정</h2><p>승인 공개본의 항목만 검색합니다. 설정을 적용하면 아래 결과와 필터 결과 전체 CSV가 함께 바뀝니다.</p></div><button type="button" className="advanced-search-close" onClick={onClose} aria-label="상세 설정 닫기">×</button></div>
    <div className="detail-setting-grid">
      <DetailRow title="검색 자료">
        <fieldset className="detail-choice-list"><legend className="sr-only">검색 자료</legend>
          {([ ["master", "내부규정"], ["notice", "사규예고"], ["all", "통합검색"] ] as const).map(([value, label]) => <label key={value}><input type="radio" name="detail-scope" checked={draft.scope === value} onChange={() => setDraft(old => ({ ...old, scope: value, detail: settingsForScope(old.detail, value) }))} />{label}</label>)}
        </fieldset>
      </DetailRow>
      <DetailRow title="검색 범위" note="확보문서·첨부의 본문 텍스트는 이 공개본에 없어 검색하지 않습니다. 첨부파일명과 사규예고에 연결된 규정명은 해당 자료에서만 검색됩니다.">
        <fieldset className="detail-choice-list"><legend className="sr-only">검색할 공개 필드</legend>
          {fieldOptions.map(({ value, label, scopes }) => <label key={value}><input type="checkbox" checked={draft.detail.fields.includes(value)} disabled={!scopes.includes(draft.scope)} onChange={() => toggleField(value)} />{label}</label>)}
        </fieldset>
      </DetailRow>
      <DetailRow title="포함 단어" note="최대 3개 · 각 단어가 선택한 공개 필드 가운데 적어도 한 곳에 있어야 합니다.">
        <TermEditor kind="포함 단어" terms={draft.detail.includes} pending={pendingInclude} setPending={setPendingInclude} onAdd={() => addTerm("includes")} onRemove={term => updateDetail({ includes: draft.detail.includes.filter(value => value !== term) })} />
      </DetailRow>
      <DetailRow title="제외 단어" note="최대 3개 · 어느 선택 필드에도 해당 단어가 없는 결과만 남깁니다.">
        <TermEditor kind="제외 단어" terms={draft.detail.excludes} pending={pendingExclude} setPending={setPendingExclude} onAdd={() => addTerm("excludes")} onRemove={term => updateDetail({ excludes: draft.detail.excludes.filter(value => value !== term) })} />
      </DetailRow>
      <DetailRow title="담당부서 및 조직" note="2026-09-15 공식 조직 목록 중 승인본의 담당 표기와 이름이 정확히 같은 항목만 선택합니다. 과거→현재 조직 자동 대응은 규정 검색 계약에 없습니다.">
        <fieldset className="detail-department-fieldset"><legend className="sr-only">공식 조직명 정확 일치</legend>
          <div className="detail-choice-list"><label><input type="radio" name="department-match" checked readOnly />담당 표기 정확 일치</label><label className="detail-disabled"><input type="radio" name="department-match" disabled />과거 부서 자동 매칭 (미제공)</label></div>
          <div className="detail-department-head"><strong>공개본에서 확인된 공식 조직명</strong><button type="button" onClick={() => updateDetail({ departments: [] })}>선택 해제</button></div>
          <div className="detail-department-grid">{officialDepartments.map(department => <label key={department}><input type="checkbox" checked={draft.detail.departments.includes(department)} onChange={() => updateDetail({ departments: draft.detail.departments.includes(department) ? draft.detail.departments.filter(value => value !== department) : [...draft.detail.departments, department] })} />{department}</label>)}</div>
        </fieldset>
      </DetailRow>
      <DetailRow title="공식 근거 경로" note="규정 단독 검색에만 적용하는 출처 종류 기준입니다. KODIT 첨부·예고 근거를 전문 확보로 해석하지 않습니다.">
        <fieldset className="detail-choice-list"><legend className="sr-only">공식 근거 출처 종류</legend>
          {evidenceOptions.map(({ value, label }) => <label key={value} className={draft.scope !== "master" || !availableEvidenceGroups.includes(value) ? "detail-disabled" : ""}><input type="checkbox" checked={draft.detail.evidenceGroups.includes(value)} disabled={draft.scope !== "master" || !availableEvidenceGroups.includes(value)} onChange={() => updateDetail({ evidenceGroups: draft.detail.evidenceGroups.includes(value) ? draft.detail.evidenceGroups.filter(item => item !== value) : [...draft.detail.evidenceGroups, value] })} />{label}{!availableEvidenceGroups.includes(value) && " (현재 0건)"}</label>)}
        </fieldset>
      </DetailRow>
      {draft.scope !== "notice" && <DetailRow title="공개결론"><label className="detail-select-label">공개 자료 상태<select value={draft.availability} onChange={event => setDraft(old => ({ ...old, availability: event.target.value as Availability }))}><option value="ALL">전체</option>{availabilityOrder.map(status => <option key={status} value={status}>{availabilityLabels[status]}</option>)}</select></label></DetailRow>}
      <DetailRow title="기간 설정" note={`기간 선택 시 날짜가 없는 결과는 제외됩니다. 빠른 기간은 오늘이 아닌 승인 공개본 기준일 ${evidenceAsOf}로 계산합니다.`}>
        <fieldset className="detail-period-fieldset"><legend className="sr-only">기간 검색 기준</legend>
          <div className="detail-choice-list">{dateOptions.map(({ value, label, enabled }) => <label key={value} className={!enabled ? "detail-disabled" : ""}><input type="radio" name="detail-date-field" disabled={!enabled} checked={draft.detail.dateField === value} onChange={() => updateDetail({ dateField: value })} />{label}</label>)}</div>
          <div className="detail-range-presets"><span>공개본 기준일로부터</span>{([1, 6, 12] as const).map(months => { const range = detailDateRange(evidenceAsOf, months); const active = draft.detail.startDate === range.startDate && draft.detail.endDate === range.endDate; return <button type="button" key={months} aria-pressed={active} onClick={() => updateDetail(range)}>{months === 12 ? "1년" : `${months}개월`}</button>; })}<button type="button" onClick={() => updateDetail({ startDate: "", endDate: "" })}>기간 해제</button></div>
          <div className="detail-date-inputs"><label>시작일<input type="date" value={draft.detail.startDate} onChange={event => updateDetail({ startDate: event.target.value })} /></label><label>종료일<input type="date" value={draft.detail.endDate} onChange={event => updateDetail({ endDate: event.target.value })} /></label></div>
        </fieldset>
      </DetailRow>
    </div>
    {error && <p className="detail-search-error" role="alert">{error}</p>}
    <div className="detail-search-actions"><button type="button" className="reset-button" onClick={reset}>초기화</button><button type="button" className="apply-button" onClick={apply}>현재 설정 적용</button></div>
    {feedback && <div className="detail-apply-feedback" role="status"><span>{feedback}</span><button type="button" onClick={() => setFeedback("")} aria-label="알림 닫기">×</button></div>}
  </section>;
}
