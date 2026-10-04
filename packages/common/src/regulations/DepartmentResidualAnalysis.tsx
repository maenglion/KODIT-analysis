"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  publicResidualLabel,
  residualLabelsToCsv,
  residualOccurrencesToCsv,
  validPublicUrl,
  type OrganizationAttributionExplanationRow,
  type DepartmentResidualLabelRow,
  type DepartmentResidualOccurrenceRow,
  type ResidualResolutionClass,
} from "./index";
import {
  RESIDUAL_PAGE_SIZE,
  residualOccurrencesForLabels,
  selectResidualLabels,
  type ResidualSort,
} from "./residual-ui";

const labels:Record<ResidualResolutionClass,string>={PERSON_EVIDENCE:"인물형 근거 있음",ORG_CURRENT:"현재 조직 확인",ORG_HISTORICAL:"과거 조직 확인",UNTYPED:"미분류 표기",AMBIGUOUS:"모호한 표기"};
const order:ResidualResolutionClass[]=["ORG_CURRENT","ORG_HISTORICAL","UNTYPED","AMBIGUOUS"];
const criteria:Record<ResidualResolutionClass,string> = {
  PERSON_EVIDENCE: "동일한 담당 표기가 다른 문서 본문에서도 인물형 문맥으로 관측됐습니다. 신원·역할·소속을 확정하지 않습니다.",
  ORG_CURRENT: "현행 공식 조직자료에서 해당 조직 노드가 정확히 확인됐습니다(CURRENT_EXACT).",
  ORG_HISTORICAL: "과거 공식 조직 노드가 확인됐으나 현행 조직명과는 정확히 일치하지 않습니다(CONFIRMED_NODE).",
  UNTYPED: "현재 본문 관측 근거로 표기의 유형을 확정하지 못했습니다.",
  AMBIGUOUS: "여러 유형의 본문 관측 근거가 공존하여 단일 유형으로 정하지 않았습니다.",
};
const organizationRubric = [
  ["업무 유사", "게시물의 업무 문맥과 비교 가능한 사규예고 후보에서 업무 범위가 겹치는 단서가 있습니다. 사람 또는 담당 조직의 확정값이 아닙니다."],
  ["시맨틱 후보", "유사한 사규예고 후보는 있지만 업무 범위 겹침은 확인되지 않았습니다. 후보 순위만으로 귀속을 확정하지 않습니다."],
  ["복수 후보", "후보 원장에 모호함으로 기록된 경우입니다. 일반 후보가 여러 개 있다는 이유만으로 이 라벨을 붙이지 않습니다."],
  ["근거 부족", "확인 가능한 후보나 공식 경로가 충분하지 않아 귀속을 판정하지 않습니다."],
  ["유력(공식 업무귀속)", "공식 업무 귀속 근거가 있지만 특정 시점의 조직 이동 전체가 확인된 것은 아닙니다."],
  ["확실(직접 관측)", "사규예고 당시 조직을 공식 시점 자료에서 직접 확인했습니다."],
  ["확실(조직개편)", "공식 조직변경 근거로 필요한 이동 경로를 확인했습니다."],
  ["확실(조직개편·업무귀속)", "공식 조직변경 경로와 해당 기능의 귀속 근거를 각각 확인했습니다."],
] as const;

function publicInferenceLabel(value: string): string {
  if (value === "추정(업무 유사)" || value === "추정(업무유사)") return "업무 유사";
  if (value === "추정(시맨틱 후보)") return "시맨틱 후보";
  return value;
}

function download(name:string,body:string) {
  const url=URL.createObjectURL(new Blob([body],{type:"text/csv;charset=utf-8"}));
  const anchor=document.createElement("a");
  anchor.href=url;
  anchor.download=name;
  anchor.click();
  URL.revokeObjectURL(url);
}

type Props={
  occurrences:DepartmentResidualOccurrenceRow[];
  summary:DepartmentResidualLabelRow[];
  attributions:OrganizationAttributionExplanationRow[];
};

export function DepartmentResidualAnalysis({occurrences,summary,attributions}:Props) {
  const [selectedClasses,setSelectedClasses]=useState<ResidualResolutionClass[]>([...order]);
  const [sort,setSort]=useState<ResidualSort>("OCCURRENCE_DESC");
  const [page,setPage]=useState(1);
  const [selected,setSelected]=useState<string|null>(null);
  const [selectedResidual,setSelectedResidual]=useState<string|null>(null);
  const detailRef=useRef<HTMLElement>(null);
  const filterDialogRef=useRef<HTMLDialogElement>(null);

  const categories=useMemo(()=>new Map(order.map(key=>[key,{
    labels:summary.filter(row=>row.resolution_class===key).length,
    occurrences:summary.filter(row=>row.resolution_class===key).reduce((sum,row)=>sum+Number(row.residual_occurrence_count),0),
  }])),[summary]);
  const rows=useMemo(()=>selectResidualLabels(summary,selectedClasses,sort),[summary,selectedClasses,sort]);
  const pageCount=Math.max(1,Math.ceil(rows.length/RESIDUAL_PAGE_SIZE));
  const pageRows=rows.slice((page-1)*RESIDUAL_PAGE_SIZE,page*RESIDUAL_PAGE_SIZE);
  const pagesStart=Math.max(1,Math.min(page-2,pageCount-4));
  const visiblePages=Array.from({length:Math.min(5,pageCount)},(_,index)=>pagesStart+index);
  const detail=pageRows.find(row=>row.label_id===selected)??null;
  const detailOccurrences=detail?occurrences.filter(row=>row.label_id===detail.label_id):[];
  const attributionByResidual=useMemo(()=>new Map(attributions.map(row=>[row.residual_id,row])),[attributions]);
  const filteredOccurrences=useMemo(()=>residualOccurrencesForLabels(occurrences,rows),[occurrences,rows]);

  useEffect(()=>{
    if(!detail||!detailRef.current)return;
    detailRef.current.focus({preventScroll:true});
    detailRef.current.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"nearest"});
  },[detail?.label_id]);

  function resetSelection(){setSelected(null);setSelectedResidual(null);}
  function changeClasses(next:ResidualResolutionClass[]){setSelectedClasses(next);setPage(1);resetSelection();}
  function changeSort(next:ResidualSort){setSort(next);setPage(1);resetSelection();}
  function changePage(next:number){setPage(next);resetSelection();}
  function closeDetail(){
    const previous=selected;
    resetSelection();
    if(previous)requestAnimationFrame(()=>document.getElementById(`residual-label-${previous}`)?.focus());
  }
  const oneCategory=selectedClasses.length===1?selectedClasses[0]:null;

  return <section className="residual-analysis" aria-labelledby="residual-title">
    <div className="residual-title">
      <div><p className="eyebrow">관측 기반 분석</p><h2 id="residual-title">비인물 담당 표기 잔차</h2><p>사규예고의 담당 표기가 해당 release의 기준 조직명과 직접 일치하지 않은 비인물 관측 건입니다. 과거 조직명과 기타 미분류 문자열이 포함됩니다. 인물형 관측은 별도의 최소 공개계약으로 분리해 표시합니다.</p></div>
      <dl><div><dt>잔차 관측</dt><dd>{occurrences.length.toLocaleString("ko-KR")}건</dd></div><div><dt>서로 다른 표기</dt><dd>{summary.length.toLocaleString("ko-KR")}개</dd></div></dl>
    </div>
    <div className="residual-cards" aria-label="관측 분류별 요약">
      {order.map(key=>{
        const value=categories.get(key)!;
        const active=oneCategory===key;
        return <button key={key} className={active?"active":undefined} aria-pressed={active} title="한 분류만 표시합니다. 다시 누르면 전체를 표시합니다." onClick={()=>changeClasses(active?[...order]:[key])}>
          <span>{labels[key]}</span><strong>{value.labels.toLocaleString("ko-KR")}개</strong><small>{value.occurrences.toLocaleString("ko-KR")}건 관측</small>
        </button>;
      })}
    </div>
    <details className="residual-policy">
      <summary>관측 분류 처리 기준 보기</summary>
      <dl>{order.map(key=><div key={key}><dt>{labels[key]}</dt><dd>{criteria[key]}</dd></div>)}</dl>
      <p>분류는 승인된 원장의 관측·유형 근거·공식 조직 확인 결과를 표시합니다. 조직 후보를 현행 조직 확정으로 자동 승격하지 않습니다.</p>
    </details>
    <div className="residual-controls">
      <label className="residual-sort-control">공개 표기 정렬 <select aria-label="담당 표기 정렬" value={sort} onChange={event=>changeSort(event.target.value as ResidualSort)}>
        <option value="OCCURRENCE_DESC">관측 건수 많은 순</option>
        <option value="LABEL_ASC">공개 표기 가나다순</option>
        <option value="LABEL_DESC">공개 표기 역순</option>
        <option value="NOTICE_DESC">관련 게시물 많은 순</option>
        <option value="RECENT_DESC">최근 관측일 순</option>
      </select></label>
      <button onClick={()=>download("department-residual-occurrences.csv",residualOccurrencesToCsv(filteredOccurrences))}>잔차 관측 CSV<span className="sr-only"> (현재 분류 필터 전체 {filteredOccurrences.length}건)</span></button>
      <button onClick={()=>download("department-residual-labels.csv",residualLabelsToCsv(rows))}>표기 요약 CSV<span className="sr-only"> (현재 분류 필터 전체 {rows.length}개)</span></button>
    </div>
    <p className="residual-alias-note" id="residual-alias-note">이 표는 인물형 관측을 포함하지 않습니다. 정렬은 원장의 <b>공개 표기</b> 기준이며, CSV에는 현재 선택한 분류의 전체 결과가 담깁니다.</p>
    <p className="residual-count" id="residual-result-count" role="status">전체 {summary.length.toLocaleString("ko-KR")}개 중 필터 결과 <strong>{rows.length.toLocaleString("ko-KR")}개</strong> · {rows.length?`${(page-1)*RESIDUAL_PAGE_SIZE+1}–${Math.min(page*RESIDUAL_PAGE_SIZE,rows.length)}개 표시`:"표시할 표기 없음"}</p>
    <div className="table-scroll">
      <table className="regulations-table residual-table" aria-describedby="residual-alias-note residual-result-count">
        <thead><tr>
          <th scope="col">공개 표기</th>
          <th scope="col"><button className="residual-filter-trigger" aria-haspopup="dialog" aria-label="관측 분류 체크박스 필터 열기" onClick={()=>filterDialogRef.current?.showModal()}>관측 분류 <span aria-hidden="true">▾</span>{selectedClasses.length<order.length&&<span className="residual-filter-count">{selectedClasses.length}</span>}</button></th>
          <th scope="col">관측 건수</th><th scope="col">최초 관측일</th><th scope="col">최근 관측일</th><th scope="col">관련 게시물</th>
        </tr></thead>
        <tbody>{pageRows.length? pageRows.map(row=><Fragment key={row.label_id}>
          <tr className={selected===row.label_id?"is-selected":undefined}>
            <td><button id={`residual-label-${row.label_id}`} className="department-link" aria-expanded={selected===row.label_id} aria-controls={selected===row.label_id?"residual-selected-detail":undefined} onClick={()=>{setSelected(selected===row.label_id?null:row.label_id);setSelectedResidual(null);}}>{publicResidualLabel(row.raw_label,row.label_type)}</button></td>
            <td>{labels[row.resolution_class]}</td><td>{Number(row.residual_occurrence_count).toLocaleString("ko-KR")}</td><td>{row.first_seen_at??"미확인"}</td><td>{row.last_seen_at??"미확인"}</td><td>{Number(row.notice_count).toLocaleString("ko-KR")}</td>
          </tr>
          {selected===row.label_id&&<tr className="residual-detail-row"><td colSpan={6} className="residual-detail-cell"><article ref={detailRef} id="residual-selected-detail" aria-labelledby="residual-detail-title" tabIndex={-1} className="residual-detail">
            <button className="residual-close" aria-label="상세 닫기" onClick={closeDetail}>×</button><p className="eyebrow">표기 상세</p><h3 id="residual-detail-title">{publicResidualLabel(row.raw_label,row.label_type)}</h3>
            <dl className="residual-meta"><div><dt>관측 분류</dt><dd>{labels[row.resolution_class]}</dd></div><div><dt>관측 범위</dt><dd>{row.first_seen_at??"미확인"} ~ {row.last_seen_at??"미확인"}</dd></div><div><dt>담당 표기 관측 / 사규예고</dt><dd>{row.residual_occurrence_count}건 / {row.notice_count}건</dd></div></dl>
            <p className="residual-grain-note"><b>집계 단위</b> · 담당 표기 관측은 사규예고 담당 칸이 기준 조직명과 일치하지 않아 남은 원장 행 수입니다. 사규예고는 이 표기가 연결된 서로 다른 게시물 수입니다. 현재 승인본은 게시물당 담당 표기 잔차가 최대 한 건이므로 두 수가 같습니다.</p>
            <details className="residual-policy residual-detail-rubric"><summary>라벨 분류 근거</summary><p>이 표는 담당 표기에 붙은 관측 분류와 별도 조직 귀속 근거를 구별합니다. ‘업무 유사’와 ‘시맨틱 후보’는 추정 등급이며 공식 조직 확정값이 아닙니다. 인물형 별칭과 조직을 연결하지 않으며, 내부 점수·가중치·임계값은 이 공개본으로 재현하지 않습니다.</p><dl>{organizationRubric.map(([name,meaning])=><div key={name}><dt>{name}</dt><dd>{meaning}</dd></div>)}</dl><p>공식 확인 근거는 후보보다 우선하며, 복수 후보는 명시적으로 모호하다고 기록된 경우에만 사용합니다.</p></details>
            {(row.resolution_class==="ORG_CURRENT"||row.resolution_class==="ORG_HISTORICAL")&&<section><h4>조직 변경 추적</h4><p><b>{row.org_official_name}</b> · {row.resolution_class==="ORG_CURRENT"?"현재 공식 조직자료에서 확인":"관측 시점의 공식·보존 근거에서 확인"}</p><p>유효기간: {row.org_valid_from??"시작일 미확인"} ~ {row.org_valid_to??"종료일 미확인"}</p>{row.org_official_name==="혁신금융부"&&!row.org_valid_from&&<p className="residual-temporal-note">현행 조직자료에서 같은 명칭이 확인되지만, 조직의 유효 시작일이 확인되지 않아 게시 시점의 조직 존재를 입증하는 근거로 사용하지 않았습니다.</p>}{validPublicUrl(row.official_evidence_url)&&<a href={row.official_evidence_url!} target="_blank" rel="noopener noreferrer">공식 조직 근거 보기 ↗</a>}{row.lineage_edges.map((edge,index)=><div className="lineage-text" key={`${edge.relation_type}-${edge.effective_date}-${index}`}><b>{edge.from_name}</b><span> — {edge.edge_scope} 이관 → </span><b>{edge.to_name}</b><small>{edge.effective_date}</small>{validPublicUrl(edge.evidence_url)&&<a href={edge.evidence_url} target="_blank" rel="noopener noreferrer">근거 ↗</a>}</div>)}{row.lineage_edges.length>0?<p className="lineage-warning">이 관계는 확인된 특정 기능의 이관이며 조직 전체의 명칭변경·승계를 뜻하지 않습니다.</p>:<p className="lineage-warning">이 표기의 조직 확인과 조직 변경 경로 확인은 별개입니다. 공개된 이동 근거가 없어 경로를 연결하지 않습니다.</p>}</section>}
            <section><h4>근거 게시물과 이동 설명 ({detailOccurrences.length.toLocaleString("ko-KR")}건)</h4><p>게시물을 선택하면 해당 행의 공개 근거를 바로 아래에서 확인할 수 있습니다. 조직 귀속 근거가 없는 행에는 확인 가능한 관측·분류 범위만 표시합니다.</p>
              <ul className={`residual-notices attribution-notices${selectedResidual?" is-expanded":""}`}>{detailOccurrences.map(item=>{
                const attribution=attributionByResidual.get(item.residual_id);
                const expanded=selectedResidual===item.residual_id;
                return <li key={item.residual_id}><time dateTime={item.posted_at}>{item.posted_at}</time>
                  <button onClick={()=>setSelectedResidual(expanded?null:item.residual_id)} aria-expanded={expanded} aria-controls={expanded?`organization-explanation-${item.residual_id}`:undefined}>{item.title}</button>
                  <span className="inference-badge">{attribution?publicInferenceLabel(attribution.inference_basis_label):"유형 미확정"}</span>
                  {expanded&&<div className="residual-inline-evidence" id={`organization-explanation-${item.residual_id}`}>
                    {attribution?<AttributionExplanation detail={attribution}/>:<ObservationClassificationEvidence occurrence={item}/>}
                  </div>}
                </li>;
              })}</ul>
            </section>
          </article></td></tr>}
        </Fragment>):<tr className="residual-empty-row"><td colSpan={6}>선택한 관측 분류에 공개된 표기가 없습니다. 관측 분류 필터에서 다시 선택해 주세요.</td></tr>}</tbody>
      </table>
    </div>
    <nav className="residual-pagination" aria-label="담당 표기 목록 페이지">
      <span>{page} / {pageCount}페이지 · 페이지당 {RESIDUAL_PAGE_SIZE}개</span>
      <div><button disabled={page===1} onClick={()=>changePage(page-1)}>이전</button>{visiblePages.map(number=><button key={number} aria-current={page===number?"page":undefined} aria-label={`${number}페이지`} onClick={()=>changePage(number)}>{number}</button>)}<button disabled={page===pageCount} onClick={()=>changePage(page+1)}>다음</button></div>
    </nav>
    <dialog ref={filterDialogRef} className="residual-filter-dialog" aria-label="관측 분류 체크박스 필터">
      <div className="residual-filter-dialog-title"><div><p className="eyebrow">COLUMN FILTER</p><h3>관측 분류</h3></div><button onClick={()=>filterDialogRef.current?.close()} aria-label="필터 닫기">×</button></div>
      <p>복수 선택할 수 있습니다. 선택 결과는 표와 두 CSV에 함께 적용됩니다.</p>
      <div role="group" aria-label="관측 분류 선택">{order.map(key=><label key={key}><input type="checkbox" checked={selectedClasses.includes(key)} onChange={()=>changeClasses(selectedClasses.includes(key)?selectedClasses.filter(value=>value!==key):order.filter(value=>selectedClasses.includes(value)||value===key))}/><span>{labels[key]}</span><small>{categories.get(key)!.labels}개</small></label>)}</div>
      <div className="residual-filter-actions"><button type="button" onClick={()=>changeClasses([...order])}>전체 선택</button><button type="button" onClick={()=>filterDialogRef.current?.close()}>결과 보기</button></div>
    </dialog>
  </section>;
}

function ObservationClassificationEvidence({occurrence}:{occurrence:DepartmentResidualOccurrenceRow}) {
  const source=validPublicUrl(occurrence.source_location);
  return <section className="attribution-explanation residual-observation-evidence" aria-label="선택한 사규예고의 관측·분류 근거">
    <header><div><p className="eyebrow">공개 관측 근거 · 조직 귀속 설명 없음</p><h4>{occurrence.title}</h4></div><span className="inference-badge">{labels[occurrence.resolution_class]}</span></header>
    <dl className="residual-observation-facts"><div><dt>게시일</dt><dd>{occurrence.posted_at}</dd></div><div><dt>공개 관측 분류</dt><dd>{labels[occurrence.resolution_class]}</dd></div></dl>
    <p>{criteria[occurrence.resolution_class]}</p>
    <p>이 게시물에 연결된 개별 조직 귀속 설명은 승인 공개본에 없습니다. 확인되지 않은 조직·담당자·업무 이동 경로를 만들지 않습니다.</p>
    {source&&<p><a href={source} target="_blank" rel="noopener noreferrer">사규예고 공식 출처 목록 보기 ↗</a> <small>목록 URL이며 개별 게시물 원문 링크로 단정하지 않습니다.</small></p>}
  </section>;
}

function AttributionExplanation({detail}:{detail:OrganizationAttributionExplanationRow}) {
  const confirmed=detail.current_functional_equivalent;
  return <section className="attribution-explanation" aria-label="조직 변경 추적 근거">
    <header><div><p className="eyebrow">공개 조직 귀속 근거</p><h4>{detail.title}</h4></div><span className="inference-badge">{publicInferenceLabel(detail.inference_basis_label)}</span></header>
    <p className="residual-work-trace-note"><a href={`/work-traces?axis=notices&q=${encodeURIComponent(detail.title.slice(0,80))}`}>이 사규예고로 업무 추적 검색 ↗</a> · 별도 근거 공개본의 사규예고 제목 검색이며, 이 담당 표기를 현행 조직에 재배정한 결과가 아닙니다.</p>
    <div className="attribution-result-grid"><div><span>담당 표기 관측</span><b>{detail.display_label}</b><small>{detail.posted_at}</small></div><div><span>당시 확인 조직</span><b>{detail.responsible_org_as_of_notice??"확인되지 않음"}</b></div><div className={confirmed?"confirmed":"candidate"}><span>{confirmed?"현 부서 매칭":"현재 부서 후보"}</span><b>{confirmed??detail.current_org_candidate??"근거 부족"}</b><small>{confirmed?"공식 근거로 확인":"확정값이 아닌 후보"}</small></div></div>
    {detail.work_context.length>0&&<div className="work-context"><b>관측된 업무 문맥</b><p>{detail.work_context.join(" · ")}</p></div>}
    <div className="evidence-flow"><div className="flow-node observation"><span>관측</span><b>{detail.display_label}</b><small>{detail.title}</small></div>{detail.path_steps.map(step=>{const evidenceUrl=validPublicUrl(step.evidence_url);return <div className="flow-segment" key={`${step.step_order}-${step.from_name}-${step.to_name}`}><div className="flow-arrow"><span>{relationLabel(step.relation_type)}</span><small>{step.effective_date??"일자 미확인"}</small></div><div className="flow-node organization"><span>{step.from_name} →</span><b>{step.to_name}</b><small>{step.work_scope_match===true?"업무 범위 일치 확인":"공식 조직변경 근거"}</small></div>{evidenceUrl&&<a href={evidenceUrl} target="_blank" rel="noopener noreferrer">{step.evidence_title} ↗</a>}</div>})}{detail.path_steps.length===0&&<div className="flow-empty">공식 조직개편 이동 경로가 확인되지 않았습니다. 후보 유사도만으로 현재 부서를 확정하지 않습니다.</div>}</div>
    {detail.reasoning_steps.length>0&&<details className="reasoning-log"><summary>판정 과정 보기 ({detail.reasoning_steps.length})</summary><ol>{detail.reasoning_steps.map(step=><li key={`${step.step_order}-${step.step_type}`}><b>{stepTypeLabel(step.step_type)}</b><p>{step.result_description}</p></li>)}</ol></details>}
    {detail.official_evidence.length>0&&<div className="official-evidence-list"><h5>공식 근거</h5>{detail.official_evidence.map((evidence,index)=><p key={`${evidence.evidence_kind}-${index}`}><span>{evidence.evidence_date??"일자 미확인"}</span>{validPublicUrl(evidence.source_url)?<a href={evidence.source_url!} target="_blank" rel="noopener noreferrer">{evidence.document_title??"공식 근거문서"} ↗</a>:<b>{evidence.document_title??"공식 근거 관측"}</b>}</p>)}</div>}
  </section>;
}

function relationLabel(value:string){return ({RENAMED:"명칭 변경",MERGED:"통합",SPLIT:"분리",CREATED:"신설",ABOLISHED:"폐지",FUNCTION_TRANSFER:"업무 이관",OTHER_DIRECT_ORG_CHANGE:"조직 변경"} as Record<string,string>)[value]??value;}
function stepTypeLabel(value:string){return ({CURRENT_SEARCH:"현재 조직 탐색",HISTORICAL_EPOCH_SEARCH:"당시 조직 탐색",CANDIDATE_REJECTED:"후보 기각",HISTORICAL_ANCHOR_SELECTED:"과거 근거 선택",ORG_CHANGE_EVENT_FOLLOWED:"조직개편 경로 확인",FUNCTION_ASSIGNMENT_CONFIRMED:"공식 업무귀속 확인",FINAL_RESOLUTION:"최종 판단"} as Record<string,string>)[value]??value;}
