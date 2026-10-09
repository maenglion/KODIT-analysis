"use client";

import { useRef, useState, type MouseEvent } from "react";
import type {
  PublicWorkTraceBranch,
  PublicWorkTraceEvidence,
  PublicWorkTraceRunComparison,
  PublicWorkTraceSnapshot,
} from "@kodit/common/regulations/work-trace-contract";
import { BACKLOG_NOTE } from "@/lib/work-trace-csv";
import type { WorkTraceBacklogSection } from "@/lib/work-trace-backlog-view";
import {
  TRACE_BACKLOG_SIZE, TRACE_BRANCH_SIZE, TRACE_LIST_SIZE,
  entryKey, officialSourceUrl, outcomeText, traceHref,
  type WorkTraceAxis, type WorkTraceAxisViewRow,
} from "@/lib/work-trace-view";
import { WorkTraceTerm } from "./WorkTraceTerm";

type BranchChoice = {
  key: string;
  noticeTitle: string;
  postedAt: string;
  regulationTitle: string | null;
  outcome: string;
  endpointCount: number;
};

type Props = {
  summary: PublicWorkTraceSnapshot["summary"];
  dataLiteracy: PublicWorkTraceSnapshot["data_literacy"];
  axis: WorkTraceAxis;
  query: string;
  rows: WorkTraceAxisViewRow[];
  rowCount: number;
  rowPage: number;
  entry: WorkTraceAxisViewRow | null;
  branchChoices: BranchChoice[];
  branchCount: number;
  branchPage: number;
  branch: PublicWorkTraceBranch | null;
  evidence: PublicWorkTraceEvidence[];
  backlogSections: WorkTraceBacklogSection[];
  comparisons: PublicWorkTraceRunComparison[];
  parentRunKey: string | null;
};

type EvidenceSelection = {
  no: string;
  observed?: string | null;
  matched?: string | null;
  context?: string;
};

const axisNames: Record<WorkTraceAxis, string> = {
  notices: "사규예고에서 보기",
  regulations: "규정에서 보기",
  current_organizations: "현재 부서에서 보기",
};
const changeLabels: Record<string, string> = {
  EXTENDED: "연장된 분기", COMPLETED: "새로 완료된 분기", OUTCOME_CHANGED: "종결값 변경",
  SHORTENED_CORRECTION: "정정으로 짧아진 분기", UNCHANGED: "변화 없는 분기",
};

export function WorkTraceExplorer(props: Props) {
  const {
    summary, dataLiteracy, axis, query, rows, rowCount, rowPage, entry, branchChoices,
    branchCount, branchPage, branch, evidence, backlogSections, comparisons, parentRunKey,
  } = props;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [selection, setSelection] = useState<EvidenceSelection | null>(null);
  const evidenceByNo = new Map(evidence.map((item) => [item.evidence_no, item]));
  const activeEvidence = selection ? evidenceByNo.get(selection.no) : null;
  const entryRef = entry ? entryKey(entry) : undefined;
  const base = { axis, q: query, entry: entryRef };
  const relationBacklogPage = backlogSections.find((section) => section.kind === "RELATION_EVIDENCE_GAP")?.page ?? 1;
  const functionBacklogPage = backlogSections.find((section) => section.kind === "FUNCTION_CORRESPONDENCE_UNCONFIRMED")?.page ?? 1;
  const backlogCount = backlogSections.reduce((count, section) => count + section.count, 0);
  const affectedBranchCount = summary.terminal_outcomes.RELATION_EVIDENCE_GAP + summary.terminal_outcomes.FUNCTION_CORRESPONDENCE_UNCONFIRMED;
  const term = (key: string, label: string, short: string) =>
    <WorkTraceTerm label={label} explanation={dataLiteracy[key] ?? ""} short={short} />;

  function openEvidence(no: string, event: MouseEvent<HTMLButtonElement>, context: Omit<EvidenceSelection, "no"> = {}) {
    if (!evidenceByNo.has(no)) return;
    triggerRef.current = event.currentTarget;
    setSelection({ no, ...context });
    dialogRef.current?.showModal();
  }
  function evidenceControls(numbers: string[], context: Omit<EvidenceSelection, "no"> = {}) {
    return <span className="work-trace-evidence-controls">
      {numbers.map((no) => evidenceByNo.has(no)
        ? <button type="button" key={no} onClick={(event) => openEvidence(no, event, context)} aria-label={`${no} 근거 상세 열기`}>[{no}]</button>
        : <span key={no} className="work-trace-evidence-unavailable">[{no}] 근거 상세 미제공</span>)}
    </span>;
  }
  function href(values: Record<string, string | number | undefined>) {
    return traceHref({ ...base, page: rowPage, branchPage: 1, relationPage: relationBacklogPage, needPage: functionBacklogPage, ...values });
  }
  function csvHref(kind: "branches" | "endpoints" | "backlog") {
    const params = new URLSearchParams({ type: kind, axis, q: query });
    if (entryRef && kind !== "backlog") params.set("entry", entryRef);
    return `/work-traces/export?${params.toString()}`;
  }

  return <div className="shell" id="work-trace-top">
    <section className="work-trace-insight" aria-labelledby="work-trace-insight-title">
      <div className="work-trace-insight-head">
        <div><p className="eyebrow">근거 확인 범위</p>
          <h2 id="work-trace-insight-title">{term("evidence_chain", "증거사슬", "공식 자료로 확인된 단계만 잇습니다")}: 어디까지 확인했나</h2>
          <p>사규예고 {summary.notice_count.toLocaleString("ko-KR")}건에서 시작한 {term("trace_branch", "추적 분기", "사규예고에서 업무 대응까지 조사한 단위")} <strong>{summary.branch_count.toLocaleString("ko-KR")}건</strong>입니다. 관련 규정은 {summary.regulation_count.toLocaleString("ko-KR")}개, 현행 업무분장에 나타난 조직은 {summary.current_organization_count.toLocaleString("ko-KR")}개입니다. 규정 전체·조직도 전체의 개수가 아닙니다.</p></div>
        <a href="#work-trace-explore" className="work-trace-jump">근거 따라 보기 <span aria-hidden="true">→</span></a>
      </div>
      <dl className="work-trace-insight-metrics">
        <div><dt>{term("current_function_assignment", "현행 업무분장", "지금 공식 문서에 적힌 업무와 조직")}까지 직접 확인</dt><dd>{summary.terminal_outcomes.COMPLETE.toLocaleString("ko-KR")}<span>건</span></dd></div>
        <div><dt>{term("multiple_correspondence", "복수 대응", "후보를 대표 조직 하나로 고르지 않음")}</dt><dd>{summary.terminal_outcomes.FUNCTION_MULTIPLE_CANDIDATES.toLocaleString("ko-KR")}<span>건</span></dd></div>
        <div><dt>{term("function_unconfirmed", "대응 미확인", "규정 확인 후 현행 직접 대응 미확인")}</dt><dd>{summary.terminal_outcomes.FUNCTION_CORRESPONDENCE_UNCONFIRMED.toLocaleString("ko-KR")}<span>건</span></dd></div>
        <div><dt>{term("relation_evidence_gap", "연결 근거 부재", "사규예고와 규정 간 직접 근거 미확인")}</dt><dd>{summary.terminal_outcomes.RELATION_EVIDENCE_GAP.toLocaleString("ko-KR")}<span>건</span></dd></div>
      </dl>
      <p className="work-trace-guard">현재 업무분장에서 같은 업무가 확인된다는 사실과, 과거 조직에서 현재 조직으로 {term("official_transfer_path", "공식 이관 경로", "중간 변경·이관 문서가 확인된 경로")}가 확인됐다는 사실은 다릅니다. 공식 변경 문서가 없는 구간은 연결하지 않습니다. {term("phrase_comparison", "업무 문구 대조", "공식 이관이 아닌 조사 후보")}는 확정 조직이 아닙니다. 이 숫자는 해결률이나 조직 추론 정확도가 아닙니다.</p>
      <p className="work-trace-unobserved">{term("source_document_gap", "자료 부재", "현재 확보 범위에서 다음 자료를 확인하지 못함")}는 이 공개본에 {summary.terminal_outcomes.SOURCE_DOCUMENT_GAP.toLocaleString("ko-KR")}건입니다. 0건이어도 자료가 전부 확보됐다는 뜻은 아닙니다.</p>
    </section>

    <section className="work-trace-panel" id="work-trace-explore" aria-labelledby="work-trace-explore-title">
      <div className="work-trace-panel-head"><div><p className="eyebrow">A / B / C · 동일한 추적 원장</p><h2 id="work-trace-explore-title">추적 분기</h2></div></div>
      <nav className="work-trace-axes" aria-label="업무 추적 탐색 방향">
        {(Object.keys(axisNames) as WorkTraceAxis[]).map((key, index) => <a key={key} className={axis === key ? "active" : undefined}
          aria-current={axis === key ? "page" : undefined} href={traceHref({ axis: key })}><span>{String.fromCharCode(65 + index)}</span>{axisNames[key]}</a>)}
      </nav>
      <form method="get" action="/work-traces" role="search" className="work-trace-search">
        <input type="hidden" name="axis" value={axis} />
        <label htmlFor="work-trace-query">{axis === "current_organizations" ? "현행 조직명" : axis === "regulations" ? "규정명" : "사규예고 제목·게시일"} 검색</label>
        <input id="work-trace-query" name="q" type="search" maxLength={80} defaultValue={query} placeholder="공개 자료에서 찾기" />
        <button type="submit">검색</button>
        {query && <a href={traceHref({ axis })}>검색 해제</a>}
      </form>
      <div className="work-trace-list-head"><p role="status">{axisNames[axis]} · {rowCount.toLocaleString("ko-KR")}개 항목 중 {rows.length ? `${(rowPage - 1) * TRACE_LIST_SIZE + 1}–${(rowPage - 1) * TRACE_LIST_SIZE + rows.length}` : "표시할 항목 없음"}</p>
        <div><a href={csvHref("branches")} className="work-trace-csv">추적 분기 CSV</a><a href={csvHref("endpoints")} className="work-trace-csv">현행 대응 CSV</a></div></div>
      <p className="work-trace-csv-scope">추적 분기 CSV는 현재 검색·선택 항목의 전체 분기를 담습니다. {axis === "current_organizations" ? "현행 대응 CSV는 검색·선택한 조직의 대응 행만 내보냅니다. 분기 상세에는 다른 조직의 대응도 맥락으로 표시됩니다." : "현행 대응 CSV는 그 분기에 나타난 모든 조직의 직접 근거와 문구 후보를 별도 행으로 내보냅니다."}</p>
      <div className="table-scroll"><table className="work-trace-table"><thead><tr>
        <th scope="col">{axis === "notices" ? "사규예고" : axis === "regulations" ? "관련 규정" : "현행 조직"}</th>
        <th scope="col">{axis === "current_organizations" ? "관련 사규예고 / 규정" : "사규예고·분기"}</th>
        <th scope="col">현행 대응 범위</th><th scope="col">추적</th>
      </tr></thead><tbody>
        {rows.map((row) => {
          const key = entryKey(row);
          const name = "current_org_name" in row ? row.current_org_name : row.title;
          const branchCount = row.branch_count;
          return <tr key={key} className={entryRef === key ? "selected" : undefined}>
            <th scope="row"><a href={href({ entry: key, branchPage: 1, branch: undefined })} aria-current={entryRef === key ? "true" : undefined}>{name}</a>{"posted_at" in row && <small>게시일 {row.posted_at}</small>}</th>
            <td>{"notice_count" in row ? `${row.notice_count.toLocaleString("ko-KR")}건 사규예고` : `${branchCount.toLocaleString("ko-KR")}건 사규예고`}<small>{"regulation_count" in row ? `관련 규정 ${row.regulation_count.toLocaleString("ko-KR")}개` : `추적 분기 ${branchCount.toLocaleString("ko-KR")}건`}</small></td>
            <td>{"direct_branch_count" in row ? <>직접 {row.direct_branch_count.toLocaleString("ko-KR")}건<small>문구 후보 {row.candidate_branch_count.toLocaleString("ko-KR")}건 · 합산해 확정하지 않음</small></>
              : "direct_current_org_count" in row ? <>직접 {row.direct_current_org_count.toLocaleString("ko-KR")}개<small>문구 후보 {row.candidate_current_org_count.toLocaleString("ko-KR")}개</small></>
              : <>현행 대응 조직 {row.current_org_count.toLocaleString("ko-KR")}개<small>직접 확인과 후보를 함께 센 범위</small></>}</td>
            <td><a className="work-trace-row-action" href={href({ entry: key, branchPage: 1, branch: undefined })}>근거 보기 <span aria-hidden="true">→</span></a></td>
          </tr>;
        })}
        {!rows.length && <tr><td colSpan={4} className="work-trace-empty">검색 조건에 맞는 공개 항목이 없습니다. 검색어를 바꾸거나 해제해 주세요.</td></tr>}
      </tbody></table></div>
      <Pagination page={rowPage} count={rowCount} size={TRACE_LIST_SIZE} hrefFor={(page) => href({ page, entry: undefined, branch: undefined, branchPage: undefined })} label="탐색 목록" />
    </section>

    {entry && <section className="work-trace-panel work-trace-entry" aria-labelledby="work-trace-entry-title">
      <div className="work-trace-panel-head"><div><p className="eyebrow">선택한 항목의 추적 분기</p><h2 id="work-trace-entry-title">{"current_org_name" in entry ? entry.current_org_name : entry.title}</h2></div><strong>{branchCount.toLocaleString("ko-KR")}건</strong></div>
      {axis === "current_organizations" && <p className="work-trace-scope-note">여기에 나타난 현행 조직은 직접 확인된 업무 또는 문구 대조 후보의 대응 지점입니다. 과거 게시부서나 조직 승계 확정값이 아닙니다. 분기 상세에는 관련된 다른 조직도 문맥으로 표시하지만, 현행 대응 CSV는 선택한 조직 행으로 한정합니다.</p>}
      {"current_org_name" in entry && entry.current_org_name === "혁신금융부" && <p className="work-trace-temporal-note">현행 조직자료에서 같은 명칭이 확인되지만, 조직의 유효 시작일이 확인되지 않아 게시 시점의 조직 존재를 입증하는 근거로 사용하지 않았습니다.</p>}
      <div className="work-trace-branch-list">{branchChoices.map((item) => <a key={item.key} className={branch?.public_branch_key === item.key ? "active" : undefined}
        href={href({ entry: entryRef, branch: item.key, branchPage })} aria-current={branch?.public_branch_key === item.key ? "true" : undefined}>
        <span>{item.postedAt} · {item.outcome}</span><strong>{item.noticeTitle}</strong><small>{item.regulationTitle ? `관련 규정: ${item.regulationTitle}` : "개정 대상 규정 직접 근거 미확인"} · 현행 대응 조직 {item.endpointCount}개</small>
      </a>)}</div>
      <Pagination page={branchPage} count={branchCount} size={TRACE_BRANCH_SIZE} hrefFor={(page) => href({ branchPage: page, branch: undefined })} label="선택 항목의 추적 분기" />
      {!branch && <p className="work-trace-select-note">사규예고를 선택해 확인된 단계와 중단 지점을 살펴보세요.</p>}
      {branch && <article className="work-trace-detail" aria-labelledby="work-trace-detail-title">
        <header><p className="eyebrow">한 사규예고 · 한 추적 분기</p><h3 id="work-trace-detail-title">{branch.notice.title}</h3>
          <p>게시일 {branch.notice.posted_at} · 종결값 <b>{outcomeText(branch)}</b>{branch.last_verified_date && <> · 마지막 확인 근거일 {branch.last_verified_date}</>}</p>
          <p>{branch.public_summary}</p>
          {officialSourceUrl(branch.notice.source_url) && <a className="work-trace-source" href={officialSourceUrl(branch.notice.source_url)!} target="_blank" rel="noopener noreferrer">신보 사규예고 공식 목록 보기 ↗</a>}
          {branch.regulation && <p className="work-trace-regulation-ref">개정 대상 규정: <b>{branch.regulation.title}</b>{officialSourceUrl(branch.regulation.source_url) && <a href={officialSourceUrl(branch.regulation.source_url)!} target="_blank" rel="noopener noreferrer">공식 자료 ↗</a>}</p>}
        </header>
        <div className="work-trace-detail-grid">
          <div><h4>공식 근거로 확인한 단계</h4><ol className="work-trace-chain">
            {branch.steps.filter((step) => step.step_basis !== "TEXT_COMPARISON").map((step) => <li key={step.step_order} className="work-trace-verified-step">
              <span className="work-trace-step-index">{step.step_order}</span><div><span className="work-trace-step-basis">{step.step_basis === "EXISTING_ASSERTION" ? "공식 근거에서 확인된 관계" : "공식 자료 관측"}</span>
                <p>{step.public_description}</p>{step.current_org_name && <b>{step.current_org_name} · 현행 관측</b>}
                <small>{step.observed_at ? `관측일 ${step.observed_at}` : step.effective_at ? `시행일 ${step.effective_at}` : "관측/시행일 미제공"}</small>
                {evidenceControls(step.evidence_numbers, { observed: step.observed_phrase, matched: step.matched_phrase, context: "선택한 추적 단계" })}</div>
            </li>)}
          </ol>
          {branch.break && <div className="work-trace-break"><b>근거사슬 단절 · {outcomeText(branch)}</b><p>{branch.break.public_explanation}</p><dl>
            <div><dt>다음 확인 근거</dt><dd>{branch.break.required_evidence_description}</dd></div>
            <div><dt>마지막 확인 지점</dt><dd>{branch.break.gap_from ?? "기록 없음"}</dd></div>
          </dl><small>단절 뒤의 현행 관측까지 이어진 관계선은 없습니다.</small></div>}
          {branch.terminal_outcome === "COMPLETE" && <p className="work-trace-complete">확인 범위: <b>{branch.completion_scope_label}</b>. 현재 업무 관측만으로 공식 이관 경로 전체를 주장하지 않습니다.</p>}
          </div>
          <div><h4>별도 현행 관측·대응 문구</h4>
            {branch.current_endpoints.length ? <><p className="work-trace-scope-note">{branch.terminal_outcome === "FUNCTION_MULTIPLE_CANDIDATES" ? "둘 이상의 현행 업무분장 문구가 조사 후보로 확인됨. 대표 조직은 선택하지 않습니다." : "현행 업무분장 직접 확인과 문구 대조 후보는 다른 근거 수준입니다."}</p>
              <ul className="work-trace-endpoints">{branch.current_endpoints.map((endpoint) => <li key={`${endpoint.current_org_key}-${endpoint.correspondence_basis}`} className={`${endpoint.correspondence_basis === "FUNCTION_DIRECT" ? "direct" : "candidate"}${axis === "current_organizations" && endpoint.current_org_key === entryRef ? " selected-organization" : ""}`}>
                <span className="work-trace-endpoint-kind">{endpoint.correspondence_basis_label}</span><h5>{endpoint.current_org_name}{axis === "current_organizations" && endpoint.current_org_key === entryRef && <small className="work-trace-selected-org"> · 선택한 조직</small>}</h5>
                <dl><div><dt>관측 문구</dt><dd>{endpoint.observed_phrase}</dd></div><div><dt>현행 업무분장 문구</dt><dd className="work-trace-phrase">{endpoint.matched_phrase}</dd></div></dl>
                {evidenceControls(endpoint.evidence_numbers, { observed: endpoint.observed_phrase, matched: endpoint.matched_phrase, context: "현행 업무분장 대조" })}
              </li>)}</ul></> : <p className="work-trace-empty-block">이번 분기에서 확인된 현행 대응 조직이 없습니다. 조직이나 규정이 존재하지 않는다는 뜻은 아닙니다.</p>}
            {branch.steps.filter((step) => step.step_basis === "TEXT_COMPARISON").length > 0 && <details className="work-trace-candidate-steps"><summary>별도 문구 대조 단계 보기</summary><ul>{branch.steps.filter((step) => step.step_basis === "TEXT_COMPARISON").map((step) => <li key={step.step_order}><b>{step.current_org_name ?? "현행 업무분장"}</b><p>{step.public_description}</p>{evidenceControls(step.evidence_numbers, { observed: step.observed_phrase, matched: step.matched_phrase, context: "별도 현행 관측" })}</li>)}</ul><p>이 단계들은 과거 체인의 연속선 밖에 있습니다. 공식 이관 경로가 아닙니다.</p></details>}
          </div>
        </div>
        {branch.corrected_by_later_run && <p className="work-trace-correction">후속 실행에서 정정됨. 기존 결과를 삭제하지 않으며, 후속 실행 상세가 공개되면 함께 확인할 수 있습니다.</p>}
      </article>}
    </section>}

    <section className="work-trace-panel" id="work-trace-backlog" aria-labelledby="work-trace-backlog-title">
      <div className="work-trace-panel-head"><div><p className="eyebrow">다음 조사자료</p><h2 id="work-trace-backlog-title">추적 종료 근거</h2></div>
        <a className="work-trace-csv" href={csvHref("backlog")}>조사자료 CSV</a></div>
      <p className="work-trace-backlog-summary"><b>중복을 묶은 조사 대상 {backlogCount.toLocaleString("ko-KR")}개</b>입니다. 사규예고와 규정의 직접 연결 근거를 확인해야 하는 사규예고 {backlogSections.find((section) => section.kind === "RELATION_EVIDENCE_GAP")?.count.toLocaleString("ko-KR")}개와, 현행 업무분장의 직접 대응 근거를 확인해야 하는 규정 {backlogSections.find((section) => section.kind === "FUNCTION_CORRESPONDENCE_UNCONFIRMED")?.count.toLocaleString("ko-KR")}개로 구성됩니다. 이 조사 대상들은 현재 <b>{affectedBranchCount.toLocaleString("ko-KR")}개 추적 분기</b>에 영향을 줍니다. 조사 묶음의 개수와 영향을 받은 분기의 개수는 다른 단위입니다.</p>
      <p className="work-trace-backlog-scope">복수 대응과 확인 완료는 이 목록에 넣지 않습니다. {term("current_impact", "추가 전 영향 분기", "자료 확보 후 해결될 건수의 예측이 아님")}는 조사 우선순위의 참고값입니다.</p>
      {backlogSections.map((section) => {
        const isRelation = section.kind === "RELATION_EVIDENCE_GAP";
        const heading = isRelation ? "사규예고→규정 연결 근거 조사" : "규정→현행 업무분장 대응 조사";
        const impact = isRelation ? summary.terminal_outcomes.RELATION_EVIDENCE_GAP : summary.terminal_outcomes.FUNCTION_CORRESPONDENCE_UNCONFIRMED;
        return <section key={section.kind} className="work-trace-backlog-group" aria-labelledby={`work-trace-backlog-${section.kind}`}>
          <header><h3 id={`work-trace-backlog-${section.kind}`}>{heading} <small>{section.count.toLocaleString("ko-KR")}개 조사 대상</small></h3>
            <p>{isRelation ? "공식 사규예고와 개정 대상 규정을 직접 연결하는 자료를 확인해야 합니다." : "규정과 현행 업무분장의 직접 대응을 확인하는 자료를 조사해야 합니다."} 현재 영향을 받는 분기는 {impact.toLocaleString("ko-KR")}건입니다.</p></header>
          <div className="table-scroll"><table className="work-trace-table work-trace-backlog-table"><thead><tr><th scope="col">{isRelation ? "사규예고 제목" : "규정명"}</th><th scope="col">대상 기간</th><th scope="col">영향 추적 분기</th><th scope="col">관련 예고 / 규정</th><th scope="col">마지막 확인 근거</th></tr></thead>
            <tbody>{section.rows.map((item) => <tr key={item.public_need_key}><th scope="row">{item.targetTitle}</th>
              <td>{item.period_from ?? "시작일 미기록"} ~ {item.period_to ?? "종료일 미기록"}</td><td>{item.current_affected_branch_count.toLocaleString("ko-KR")}건</td>
              <td>{item.affected_notice_count.toLocaleString("ko-KR")}건 / {item.affected_regulation_count.toLocaleString("ko-KR")}개</td>
              <td>{item.last_evidence_numbers.length ? evidenceControls(item.last_evidence_numbers, { context: "이 조사 항목의 마지막 확인 근거" }) : "번호 미제공"}</td>
            </tr>)}</tbody></table></div>
          <Pagination page={section.page} count={section.count} size={TRACE_BACKLOG_SIZE}
            hrefFor={(page) => `${href({ [isRelation ? "relationPage" : "needPage"]: page, branch: branch?.public_branch_key, branchPage })}#work-trace-backlog`}
            label={heading} />
        </section>;
      })}
      <p className="work-trace-backlog-note">{BACKLOG_NOTE} 일반적으로 한 분기가 여러 조사 항목에 포함될 수 있으므로 행별 영향 수를 더해 해결 예정 건수를 만들지 않습니다. 위 {affectedBranchCount.toLocaleString("ko-KR")}건은 이번 승인 공개본의 서로 다른 종결값 분기 {summary.terminal_outcomes.RELATION_EVIDENCE_GAP.toLocaleString("ko-KR")}건과 {summary.terminal_outcomes.FUNCTION_CORRESPONDENCE_UNCONFIRMED.toLocaleString("ko-KR")}건을 구분해 센 값입니다.</p>
    </section>

    <section className="work-trace-panel work-trace-run" aria-label="추적 실행 간 변화">
      <h2>{term("run_change", "실행 간 변화", "동일 조사 계약 실행의 근거 범위 변화")}</h2>
      {!comparisons.length ? <p className="work-trace-empty-block">비교할 이전 검증 실행이 없습니다. 현재 공개본만으로 변화량이나 자료 추가 후 실제 연장 건수를 만들지 않습니다.</p>
        : comparisons.map((comparison) => <div key={`${comparison.previous_public_run_key}-${comparison.current_public_run_key}`}>
          {!comparison.comparable_contract ? <p>조사 계약이 달라 자료 확충 효과로 비교하지 않습니다.</p> : <><p>같은 조사 계약으로 검증한 두 실행의 분기 변화입니다. 모델 정확도가 아닙니다.</p>
            <dl className="work-trace-change-counts">{Object.entries(comparison.primary_change_counts).map(([code, count]) => <div key={code}><dt>{changeLabels[code] ?? "공개 변화"}</dt><dd>{count.toLocaleString("ko-KR")}건</dd></div>)}</dl><p>근거 추가 {comparison.evidence_added_branch_count}건 · 복수 대응 전환 {comparison.multiple_correspondence_transition_count}건 · 공식 이관 경로 추가 {comparison.official_path_added_count}건은 위 배타적 변화 분류와 별도이며 합산하지 않습니다.</p></>}
        </div>)}
      {parentRunKey && <p className="work-trace-scope-note">이전 실행 참조가 있습니다. 같은 계약인지 검증된 비교행이 제공되지 않으면 차이를 계산하지 않습니다.</p>}
      <p>{term("corrected_run", "정정된 과거 실행", "이전 기록을 삭제하지 않고 후속 정정을 표시")}: 후속 공개본에 정정 기록이 있을 때 원 결과와 수정 근거를 함께 보여 줍니다.</p>
    </section>

    <dialog ref={dialogRef} className="work-trace-evidence-dialog" aria-labelledby="work-trace-evidence-title"
      onClose={() => { triggerRef.current?.focus(); setSelection(null); }}
      onClick={(event) => { if (event.target === dialogRef.current) dialogRef.current?.close(); }}>
      {selection && activeEvidence && <div className="work-trace-evidence-inner">
        <header><div><p className="eyebrow">공개 근거 · [{selection.no}]</p><h2 id="work-trace-evidence-title">{activeEvidence.title}</h2></div>
          <button type="button" aria-label="근거 상세 닫기" onClick={() => dialogRef.current?.close()}>×</button></header>
        <dl><div><dt>자료 종류</dt><dd>{evidenceKind(activeEvidence.reference_kind)}</dd></div><div><dt>자료일</dt><dd>{activeEvidence.source_date ?? "기록 없음"}</dd></div><div><dt>시행일</dt><dd>{activeEvidence.effective_date ?? "기록 없음"}</dd></div></dl>
        {selection.context && <p className="work-trace-citation-context">{selection.context}에 연결된 근거입니다. 아래 문구는 공개된 조사 단계의 대조 문구이며 문서 전체 인용이 아닙니다.</p>}
        {(selection.observed || selection.matched) && <div className="work-trace-citation-phrases">
          {selection.observed && <p><b>관측 문구</b><span>{selection.observed}</span></p>}
          {selection.matched && <p><b>업무분장 대조 문구</b><span>{selection.matched}</span></p>}
        </div>}
        {officialSourceUrl(activeEvidence.source_url) ? <a href={officialSourceUrl(activeEvidence.source_url)!} target="_blank" rel="noopener noreferrer">{activeEvidence.reference_kind === "NOTICE" ? "신보 공식 목록 페이지 보기" : "공식 자료 보기"} ↗</a>
          : <p className="work-trace-no-url">이 근거에 공개 가능한 공식 URL이 제공되지 않았습니다.</p>}
        <p className="work-trace-evidence-note">[{selection.no}]은 이 공개 snapshot 안에서 근거를 찾는 번호입니다. 법령번호나 기관 문서관리번호가 아닙니다.</p>
        <button type="button" className="work-trace-close" onClick={() => dialogRef.current?.close()}>닫기</button>
      </div>}
    </dialog>
  </div>;
}

function evidenceKind(value: string): string {
  return ({ NOTICE: "사규예고", REGULATION: "규정", FUNCTION_ASSIGNMENT: "공식 업무분장", ORGANIZATION_CHANGE: "조직변경 근거" } as Record<string, string>)[value] ?? "공식 자료";
}

function Pagination({ page, count, size, hrefFor, label }: {
  page: number; count: number; size: number; hrefFor: (page: number) => string; label: string;
}) {
  const pages = Math.max(1, Math.ceil(count / size));
  if (pages <= 1) return null;
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const visible = Array.from({ length: Math.min(5, pages) }, (_, offset) => start + offset);
  return <nav className="work-trace-pagination" aria-label={`${label} 페이지 이동`}>
    <span>{page} / {pages}페이지</span><div>
      {page > 1 ? <a href={hrefFor(page - 1)}>이전</a> : <span aria-disabled="true">이전</span>}
      {visible.map((number) => <a key={number} href={hrefFor(number)} aria-current={number === page ? "page" : undefined} aria-label={`${label} ${number}페이지`}>{number}</a>)}
      {page < pages ? <a href={hrefFor(page + 1)}>다음</a> : <span aria-disabled="true">다음</span>}
    </div>
  </nav>;
}
