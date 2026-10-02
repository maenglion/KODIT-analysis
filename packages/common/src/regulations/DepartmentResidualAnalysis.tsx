"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { publicResidualLabel,residualLabelsToCsv,residualOccurrencesToCsv,validPublicUrl,type DepartmentAttributionExplanationRow,type DepartmentResidualLabelRow,type DepartmentResidualOccurrenceRow,type ResidualResolutionClass } from "./index";

const labels:Record<ResidualResolutionClass,string>={PERSON_EVIDENCE:"인물형 근거 있음",ORG_CURRENT:"현재 조직 확인",ORG_HISTORICAL:"과거 조직 확인",UNTYPED:"미분류 표기",AMBIGUOUS:"모호한 표기"};
const order:ResidualResolutionClass[]=["PERSON_EVIDENCE","ORG_CURRENT","ORG_HISTORICAL","UNTYPED","AMBIGUOUS"];
function download(name:string,body:string){const url=URL.createObjectURL(new Blob([body],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}

export function DepartmentResidualAnalysis({occurrences,summary,attributions}:{occurrences:DepartmentResidualOccurrenceRow[];summary:DepartmentResidualLabelRow[];attributions:DepartmentAttributionExplanationRow[]}){
  const [filter,setFilter]=useState<ResidualResolutionClass|"ALL">("ALL");const [query,setQuery]=useState("");const [selected,setSelected]=useState<string|null>(null);const [selectedResidual,setSelectedResidual]=useState<string|null>(null);
  const detailRef=useRef<HTMLElement>(null);
  const categories=useMemo(()=>new Map(order.map(key=>[key,{labels:summary.filter(x=>x.resolution_class===key).length,occurrences:summary.filter(x=>x.resolution_class===key).reduce((n,x)=>n+Number(x.residual_occurrence_count),0)}])),[summary]);
  const rows=useMemo(()=>summary.filter(row=>(filter==="ALL"||row.resolution_class===filter)&&(!query.trim()||publicResidualLabel(row.raw_label,row.label_type).toLocaleLowerCase("ko-KR").includes(query.trim().toLocaleLowerCase("ko-KR")))).sort((a,b)=>Number(b.residual_occurrence_count)-Number(a.residual_occurrence_count)||a.normalized_label.localeCompare(b.normalized_label,"ko")),[summary,filter,query]);
  const detail=summary.find(row=>row.label_id===selected);const detailOccurrences=detail?occurrences.filter(row=>row.label_id===detail.label_id):[];
  const attributionByResidual=useMemo(()=>new Map(attributions.map(row=>[row.residual_id,row])),[attributions]);
  const activeAttribution=selectedResidual?attributionByResidual.get(selectedResidual)??null:null;
  useEffect(()=>{
    if(!selected||!detailRef.current)return;
    detailRef.current.focus({preventScroll:true});
    detailRef.current.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"});
  },[selected]);
  useEffect(()=>{
    if(selected&&!rows.some(row=>row.label_id===selected)){
      setSelected(null);
      setSelectedResidual(null);
    }
  },[rows,selected]);
  return <section className="residual-analysis" aria-labelledby="residual-title">
    <div className="residual-title"><div><p className="eyebrow">관측 기반 분석</p><h2 id="residual-title">담당 표기 잔차</h2><p>사규예고의 담당 표기가 해당 release의 기준 조직명과 직접 일치하지 않은 관측 건입니다. 인물명, 과거 조직명, 기타 미분류 문자열이 포함됩니다.</p></div><dl><div><dt>잔차 관측</dt><dd>{occurrences.length.toLocaleString("ko-KR")}건</dd></div><div><dt>서로 다른 표기</dt><dd>{summary.length.toLocaleString("ko-KR")}개</dd></div></dl></div>
    <div className="residual-cards">{order.map(key=>{const value=categories.get(key)!;return <button key={key} className={filter===key?"active":""} onClick={()=>setFilter(filter===key?"ALL":key)}><span>{labels[key]}</span><strong>{value.labels.toLocaleString("ko-KR")}개</strong><small>{value.occurrences.toLocaleString("ko-KR")}건 관측</small></button>})}</div>
    <div className="residual-controls"><input aria-label="담당 표기 검색" value={query} onChange={e=>setQuery(e.target.value)} placeholder="공개 표기 검색"/><select aria-label="관측 분류" value={filter} onChange={e=>setFilter(e.target.value as ResidualResolutionClass|"ALL")}><option value="ALL">전체</option>{order.map(key=><option key={key} value={key}>{labels[key]}</option>)}</select><button onClick={()=>download("department-residual-occurrences.csv",residualOccurrencesToCsv(occurrences))}>잔차 관측 CSV</button><button onClick={()=>download("department-residual-labels.csv",residualLabelsToCsv(summary))}>표기 요약 CSV</button></div>
    {detail&&<article ref={detailRef} id="residual-selected-detail" aria-labelledby="residual-detail-title" tabIndex={-1} className="residual-detail"><button className="residual-close" aria-label="상세 닫기" onClick={()=>{setSelected(null);setSelectedResidual(null);}}>×</button><p className="eyebrow">표기 상세</p><h3 id="residual-detail-title">{publicResidualLabel(detail.raw_label,detail.label_type)}</h3><dl className="residual-meta"><div><dt>관측 분류</dt><dd>{labels[detail.resolution_class]}</dd></div><div><dt>관측 범위</dt><dd>{detail.first_seen_at??"미확인"} ~ {detail.last_seen_at??"미확인"}</dd></div><div><dt>관측 / 게시물</dt><dd>{detail.residual_occurrence_count} / {detail.notice_count}</dd></div></dl>
      {detail.resolution_class==="PERSON_EVIDENCE"&&<section><h4>본문 관측 근거</h4><p>담당 표기와 동일한 문자열이 문서 본문에서 인물형 문맥으로도 관측된 경우입니다. 실제 인물 신원, 역할 또는 소속을 확정한 결과가 아닙니다.</p><p>mention 관측 {Number(detail.mention_occurrence_count).toLocaleString("ko-KR")}건</p><ul>{Object.entries(detail.extractor_rule_distribution).map(([rule,count])=><li key={rule}><code>{rule}</code><span>{count}건</span></li>)}</ul><div className="evidence-links">{detail.mention_source_locations.filter(validPublicUrl).map(url=><a key={url} href={url} target="_blank" rel="noopener noreferrer">본문 근거 원문 ↗</a>)}</div></section>}
      {(detail.resolution_class==="ORG_CURRENT"||detail.resolution_class==="ORG_HISTORICAL")&&<section><h4>조직 판정</h4><p><b>{detail.org_official_name}</b> · {detail.resolution_class==="ORG_CURRENT"?"현재 공식 조직자료에서 확인":"관측 시점의 공식·보존 근거에서 확인"}</p><p>유효기간: {detail.org_valid_from??"시작일 미확인"} ~ {detail.org_valid_to??"종료일 미확인"}</p>{validPublicUrl(detail.official_evidence_url)&&<a href={detail.official_evidence_url!} target="_blank" rel="noopener noreferrer">공식 조직 근거 보기 ↗</a>}{detail.lineage_edges.map((edge,index)=><div className="lineage-text" key={`${edge.relation_type}-${edge.effective_date}-${index}`}><b>{edge.from_name}</b><span> — {edge.edge_scope} 이관 → </span><b>{edge.to_name}</b><small>{edge.effective_date}</small>{validPublicUrl(edge.evidence_url)&&<a href={edge.evidence_url} target="_blank" rel="noopener noreferrer">근거 ↗</a>}</div>)}{detail.lineage_edges.length>0&&<p className="lineage-warning">이 관계는 확인된 특정 기능의 이관이며 조직 전체의 명칭변경·승계를 뜻하지 않습니다.</p>}</section>}
      <section><h4>근거 게시물과 이동 설명</h4><p>게시물을 선택하면 해당 관측이 어떤 공식 근거를 거쳐 현재 조직 또는 후보 조직에 연결됐는지 확인할 수 있습니다.</p><ul className="residual-notices attribution-notices">{detailOccurrences.map(item=>{const attribution=attributionByResidual.get(item.residual_id);return <li key={item.residual_id}><span>{item.posted_at}</span><button onClick={()=>setSelectedResidual(selectedResidual===item.residual_id?null:item.residual_id)} aria-expanded={selectedResidual===item.residual_id}>{item.title}</button><small>{attribution?.inference_basis_label??"근거 부족"}</small></li>;})}</ul></section>
      {activeAttribution&&<AttributionExplanation detail={activeAttribution}/>}
    </article>}
    <div className="table-scroll"><table className="regulations-table residual-table"><thead><tr><th>공개 표기</th><th>관측 분류</th><th>관측 건수</th><th>최초 관측일</th><th>최근 관측일</th><th>관련 게시물</th></tr></thead><tbody>{rows.map(row=><tr key={row.label_id} className={selected===row.label_id?"is-selected":undefined}><td><button className="department-link" aria-expanded={selected===row.label_id} aria-controls={selected===row.label_id?"residual-selected-detail":undefined} onClick={()=>{setSelected(selected===row.label_id?null:row.label_id);setSelectedResidual(null);}}>{publicResidualLabel(row.raw_label,row.label_type)}</button></td><td>{labels[row.resolution_class]}</td><td>{Number(row.residual_occurrence_count).toLocaleString("ko-KR")}</td><td>{row.first_seen_at??"미확인"}</td><td>{row.last_seen_at??"미확인"}</td><td>{Number(row.notice_count).toLocaleString("ko-KR")}</td></tr>)}</tbody></table></div>
  </section>;
}

function AttributionExplanation({detail}:{detail:DepartmentAttributionExplanationRow}){
  const confirmed=detail.current_functional_equivalent;
  return <section className="attribution-explanation" aria-label="조직 이동 추론 근거">
    <header><div><p className="eyebrow">추론 근거</p><h4>{detail.inference_basis_label}</h4></div><span className={`inference-badge inference-${detail.inference_basis_code.toLowerCase()}`}>{detail.inference_basis_label}</span></header>
    <div className="attribution-result-grid">
      <div><span>담당 표기 관측</span><b>{detail.masked_label}</b><small>{detail.posted_at}</small></div>
      <div><span>당시 확인 조직</span><b>{detail.responsible_org_as_of_notice??"확인되지 않음"}</b></div>
      <div className={confirmed?"confirmed":"candidate"}><span>{confirmed?"현 부서 매칭":"현재 부서 후보"}</span><b>{confirmed??detail.current_org_candidate??"근거 부족"}</b><small>{confirmed?"공식 근거로 확인":"확정값이 아닌 후보"}</small></div>
    </div>
    {detail.work_context.length>0&&<div className="work-context"><b>관측된 업무 문맥</b><p>{detail.work_context.join(" · ")}</p></div>}
    <div className="evidence-flow">
      <div className="flow-node observation"><span>관측</span><b>{detail.masked_label}</b><small>{detail.title}</small></div>
      {detail.path_steps.map(step=><div className="flow-segment" key={`${step.step_order}-${step.from_name}-${step.to_name}`}><div className="flow-arrow"><span>{relationLabel(step.relation_type)}</span><small>{step.effective_date??"일자 미확인"}</small></div><div className="flow-node organization"><span>{step.from_name} →</span><b>{step.to_name}</b><small>{step.work_scope_match===true?"업무 범위 일치 확인":"공식 조직변경 근거"}</small></div><a href={step.evidence_url} target="_blank" rel="noopener noreferrer">{step.evidence_title} ↗</a></div>)}
      {detail.path_steps.length===0&&<div className="flow-empty">공식 조직개편 이동 경로가 확인되지 않았습니다. 후보 유사도만으로 현재 부서를 확정하지 않습니다.</div>}
    </div>
    {detail.reasoning_steps.length>0&&<details className="reasoning-log"><summary>판정 과정 보기 ({detail.reasoning_steps.length})</summary><ol>{detail.reasoning_steps.map(step=><li key={`${step.step_order}-${step.step_type}`}><b>{stepTypeLabel(step.step_type)}</b><p>{step.result_description}</p></li>)}</ol></details>}
    {detail.official_evidence.length>0&&<div className="official-evidence-list"><h5>공식 근거</h5>{detail.official_evidence.map((evidence,index)=><p key={`${evidence.evidence_kind}-${index}`}><span>{evidence.evidence_date??"일자 미확인"}</span>{validPublicUrl(evidence.source_url)?<a href={evidence.source_url!} target="_blank" rel="noopener noreferrer">{evidence.document_title??"공식 근거문서"} ↗</a>:<b>{evidence.document_title??"공식 근거 관측"}</b>}</p>)}</div>}
  </section>;
}

function relationLabel(value:string){return ({RENAMED:"명칭 변경",MERGED:"통합",SPLIT:"분리",CREATED:"신설",ABOLISHED:"폐지",FUNCTION_TRANSFER:"업무 이관",OTHER_DIRECT_ORG_CHANGE:"조직 변경"} as Record<string,string>)[value]??value;}
function stepTypeLabel(value:string){return ({CURRENT_SEARCH:"현재 조직 탐색",HISTORICAL_EPOCH_SEARCH:"당시 조직 탐색",CANDIDATE_REJECTED:"후보 기각",HISTORICAL_ANCHOR_SELECTED:"과거 근거 선택",ORG_CHANGE_EVENT_FOLLOWED:"조직개편 경로 확인",FUNCTION_ASSIGNMENT_CONFIRMED:"공식 업무귀속 확인",FINAL_RESOLUTION:"최종 판단"} as Record<string,string>)[value]??value;}
