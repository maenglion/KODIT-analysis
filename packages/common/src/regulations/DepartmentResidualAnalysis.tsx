"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  publicResidualLabel,
  residualLabelsToCsv,
  residualOccurrencesToCsv,
  validPublicUrl,
  type DepartmentAttributionExplanationRow,
  type DepartmentResidualLabelRow,
  type DepartmentResidualOccurrenceRow,
  type ResidualResolutionClass,
} from "./index";
import {
  RESIDUAL_PAGE_SIZE,
  mentionSourceLinks,
  residualOccurrencesForLabels,
  selectResidualLabels,
  type PersonNoticeBasisLabel,
  type ResidualSort,
} from "./residual-ui";

const labels:Record<ResidualResolutionClass,string>={PERSON_EVIDENCE:"인물형 근거 있음",ORG_CURRENT:"현재 조직 확인",ORG_HISTORICAL:"과거 조직 확인",UNTYPED:"미분류 표기",AMBIGUOUS:"모호한 표기"};
const order:ResidualResolutionClass[]=["PERSON_EVIDENCE","ORG_CURRENT","ORG_HISTORICAL","UNTYPED","AMBIGUOUS"];
const criteria:Record<ResidualResolutionClass,string> = {
  PERSON_EVIDENCE: "동일한 담당 표기가 다른 문서 본문에서도 인물형 문맥으로 관측됐습니다. 신원·역할·소속을 확정하지 않습니다.",
  ORG_CURRENT: "현행 공식 조직자료에서 해당 조직 노드가 정확히 확인됐습니다(CURRENT_EXACT).",
  ORG_HISTORICAL: "과거 공식 조직 노드가 확인됐으나 현행 조직명과는 정확히 일치하지 않습니다(CONFIRMED_NODE).",
  UNTYPED: "현재 본문 관측 근거로 표기의 유형을 확정하지 못했습니다.",
  AMBIGUOUS: "여러 유형의 본문 관측 근거가 공존하여 단일 유형으로 정하지 않았습니다.",
};
const publicRubric = [
  ["인물형 관측", "동일한 담당 표기가 다른 문서 본문에서 인물형 문맥으로 관측됐습니다. 실제 인물의 신원·역할·소속은 판정하지 않습니다."],
  ["추정(업무 유사)", "게시물의 업무 문맥과 비교 가능한 사규예고 후보에서 업무 범위가 겹치는 단서가 있습니다. 사람 또는 담당 조직의 확정값이 아닙니다."],
  ["추정(시맨틱 후보)", "유사한 사규예고 후보는 있지만 업무 범위 겹침은 확인되지 않았습니다. 후보 순위만으로 귀속을 확정하지 않습니다."],
  ["복수 후보", "후보 원장에 모호함으로 기록된 경우입니다. 일반 후보가 여러 개 있다는 이유만으로 이 라벨을 붙이지 않습니다."],
  ["근거 부족", "확인 가능한 후보나 공식 경로가 충분하지 않아 귀속을 판정하지 않습니다."],
  ["유력(공식 업무귀속)", "공식 업무 귀속 근거가 있지만 특정 시점의 조직 이동 전체가 확인된 것은 아닙니다."],
  ["확실(직접 관측)", "사규예고 당시 조직을 공식 시점 자료에서 직접 확인했습니다."],
  ["확실(조직개편)", "공식 조직변경 근거로 필요한 이동 경로를 확인했습니다."],
  ["확실(조직개편·업무귀속)", "공식 조직변경 경로와 해당 기능의 귀속 근거를 각각 확인했습니다."],
] as const;

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
  attributions:DepartmentAttributionExplanationRow[];
  personNoticeBasis:PersonNoticeBasis[];
};

export type PersonNoticeBasis={residual_id:string;label:PersonNoticeBasisLabel};

export function DepartmentResidualAnalysis({occurrences,summary,attributions,personNoticeBasis}:Props) {
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
  const personBasisByResidual=useMemo(()=>new Map(personNoticeBasis.map(row=>[row.residual_id,row.label])),[personNoticeBasis]);
  const activeAttribution=selectedResidual?attributionByResidual.get(selectedResidual)??null:null;
  const selectedOccurrence=detailOccurrences.find(row=>row.residual_id===selectedResidual);
  const selectedPersonBasis=selectedResidual?personBasisByResidual.get(selectedResidual):undefined;
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
      <div><p className="eyebrow">관측 기반 분석</p><h2 id="residual-title">담당 표기 잔차</h2><p>사규예고의 담당 표기가 해당 release의 기준 조직명과 직접 일치하지 않은 관측 건입니다. 인물명, 과거 조직명, 기타 미분류 문자열이 포함됩니다.</p></div>
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
      <p>분류는 승인된 원장의 관측·유형 근거·공식 조직 확인 결과를 표시합니다. 인물형 관측을 신원 확정으로, 조직 후보를 현행 조직 확정으로 자동 승격하지 않습니다.</p>
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
    <p className="residual-alias-note" id="residual-alias-note">개인정보 보호와 희귀 성씨·이름 조합에 의한 재식별 위험을 줄이기 위해 사람 이름은 초성과 결정적 공개용 별칭 번호로 표시합니다. 괄호 안 번호는 사번이나 인사번호가 아닙니다. 가나다 정렬은 원래 이름이 아닌 <b>공개 표기</b> 기준입니다. CSV에는 현재 선택한 분류의 전체 결과가 담깁니다.</p>
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
            {row.resolution_class==="PERSON_EVIDENCE"&&<section>
              <h4>본문 관측 근거</h4>
              <p>담당 표기와 동일한 문자열이 문서 본문에서 인물형 문맥으로도 관측된 경우입니다. 실제 인물 신원, 역할 또는 소속을 확정한 결과가 아닙니다.</p>
              <p className="residual-mention-count">본문 인물형 언급 {Number(row.mention_occurrence_count).toLocaleString("ko-KR")}건</p>
              <p className="residual-mention-note">본문 언급(mention)은 담당 칸과 별도로 추출한 문서 본문에서 동일 문자열이 인물형 문맥으로 탐지된 <b>위치 수</b>입니다. 한 문서의 서로 다른 위치에서 반복되면 각각 세고, 동일한 추출 문서의 같은 위치·유형은 한 번만 셉니다. 이 값은 서로 다른 문서 수가 아닙니다. 공개 요약만으로는 위 {row.notice_count}개 사규예고 각각에서 몇 번 언급됐는지 알 수 없습니다.</p>
              <ul>{Object.entries(row.extractor_rule_distribution).map(([rule,count])=><li key={rule}><code>{rule}</code><span>{count}건</span></li>)}</ul>
              <p className="residual-source-note">공개된 근거 링크는 신보의 사규 제개정 예고 <b>목록 페이지</b>입니다. 개별 문서 원문으로 오인하지 않도록 공식 페이지 제목으로 표기하고, 같은 제목은 순번으로 구별합니다.</p>
              <div className="evidence-links">{mentionSourceLinks(row.mention_source_locations,detailOccurrences).map(link=><a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer">{link.label} ↗</a>)}</div>
            </section>}
            {(row.resolution_class==="ORG_CURRENT"||row.resolution_class==="ORG_HISTORICAL")&&<section><h4>조직 판정</h4><p><b>{row.org_official_name}</b> · {row.resolution_class==="ORG_CURRENT"?"현재 공식 조직자료에서 확인":"관측 시점의 공식·보존 근거에서 확인"}</p><p>유효기간: {row.org_valid_from??"시작일 미확인"} ~ {row.org_valid_to??"종료일 미확인"}</p>{validPublicUrl(row.official_evidence_url)&&<a href={row.official_evidence_url!} target="_blank" rel="noopener noreferrer">공식 조직 근거 보기 ↗</a>}{row.lineage_edges.map((edge,index)=><div className="lineage-text" key={`${edge.relation_type}-${edge.effective_date}-${index}`}><b>{edge.from_name}</b><span> — {edge.edge_scope} 이관 → </span><b>{edge.to_name}</b><small>{edge.effective_date}</small>{validPublicUrl(edge.evidence_url)&&<a href={edge.evidence_url} target="_blank" rel="noopener noreferrer">근거 ↗</a>}</div>)}{row.lineage_edges.length>0&&<p className="lineage-warning">이 관계는 확인된 특정 기능의 이관이며 조직 전체의 명칭변경·승계를 뜻하지 않습니다.</p>}</section>}
            <details className="residual-rubric"><summary>관측·추정 판정 기준 보기</summary><p>아래는 공개 라벨의 읽는 법입니다. 이 표기에 모두 적용됐다는 뜻이 아닙니다. 인물형 관측과 게시물 업무 후보는 서로 다른 판단이며, 공식 근거로 확인된 상태가 후보보다 우선합니다.</p><dl>{publicRubric.map(([label,meaning])=><div key={label}><dt>{label}</dt><dd>{meaning}</dd></div>)}</dl><pre aria-label="판정 개념 요약"><code>{`동일 표기의 다른 문서 인물형 문맥 → 인물형 관측
유사 사규예고 후보 + 업무 문맥 겹침 → 업무 유사 추정
유사 사규예고 후보만 확인 → 시맨틱 후보 추정
공식 시점별 조직·기능 근거가 없으면 → 귀속 미확정`}</code></pre><small>개념 요약이며 내부 판정 코드·가중치·개별 인물 또는 조직의 소속 정보는 포함하지 않습니다.</small></details>
            <section><h4>{row.resolution_class==="PERSON_EVIDENCE"?"담당 표기 관측 게시물":"근거 게시물과 이동 설명"} ({detailOccurrences.length.toLocaleString("ko-KR")}건)</h4><p id={row.resolution_class==="PERSON_EVIDENCE"?"residual-person-meaning":undefined}>{row.resolution_class==="PERSON_EVIDENCE"?"인물형 관측은 표기 분류, 옆 라벨은 해당 게시물의 업무 후보·근거 상태입니다. 사람의 신원·소속이나 조직 이동을 추론하지 않습니다.":"게시물을 선택할 시 상태 판정에 대한 추론 근거를 확인하실 수 있습니다."}</p><ul className="residual-notices attribution-notices">{detailOccurrences.map(item=>{const attribution=attributionByResidual.get(item.residual_id);const personBasis=personBasisByResidual.get(item.residual_id);return <li key={item.residual_id}><time dateTime={item.posted_at}>{item.posted_at}</time><button onClick={()=>setSelectedResidual(selectedResidual===item.residual_id?null:item.residual_id)} aria-expanded={selectedResidual===item.residual_id} aria-controls={selectedResidual===item.residual_id?`residual-explanation-${item.residual_id}`:undefined} aria-describedby={row.resolution_class==="PERSON_EVIDENCE"?"residual-person-meaning":undefined}>{item.title}</button><span className="residual-status-pair"><span className="inference-badge">{row.resolution_class==="PERSON_EVIDENCE"?"인물형 관측":attribution?.inference_basis_label??"근거 부족"}</span>{row.resolution_class==="PERSON_EVIDENCE"&&personBasis&&<span className={`inference-badge work-hypothesis-badge${personBasis==="근거 부족"?" is-insufficient":""}`} aria-label={`게시물 업무 판정: ${personBasis}. 사람 소속 판정 아님`} title="게시물 업무 문맥의 후보·근거 상태이며 사람의 소속을 뜻하지 않습니다.">{personBasis}</span>}</span></li>;})}</ul></section>
            {row.resolution_class==="PERSON_EVIDENCE"&&selectedOccurrence&&<section id={`residual-explanation-${selectedOccurrence.residual_id}`} className="attribution-explanation person-observation" aria-label="인물형 관측의 공개 범위"><header><div><p className="eyebrow">인물형 관측</p><h4>선택한 게시물의 공개 범위</h4></div><span className="residual-status-pair"><span className="inference-badge">인물형 관측</span>{selectedPersonBasis&&<span className={`inference-badge work-hypothesis-badge${selectedPersonBasis==="근거 부족"?" is-insufficient":""}`} aria-label={`게시물 업무 판정: ${selectedPersonBasis}. 사람 소속 판정 아님`}>{selectedPersonBasis}</span>}</span></header><p><b>{selectedOccurrence.title}</b>의 담당 표기는 공개 별칭 {publicResidualLabel(row.raw_label,row.label_type)}으로만 표시합니다. 인물형 근거는 동일 문자열의 <b>다른 문서 본문 관측</b>을 뜻합니다. 이 게시물의 담당자 신원·역할·소속 또는 조직 이동을 연결하거나 확정하지 않습니다.</p>{selectedPersonBasis&&<p className="residual-hypothesis-note">{selectedPersonBasis==="근거 부족"?"게시물의 업무 후보·공식 경로 근거가 충분하지 않습니다.":`${selectedPersonBasis}은 이 사규예고의 업무 문맥을 비교한 후보 신호입니다.`} 공개 별칭의 실제 사람이나 담당 조직과 연결한 결과가 아닙니다.</p>}</section>}
            {row.resolution_class!=="PERSON_EVIDENCE"&&activeAttribution&&<div id={`residual-explanation-${selectedResidual}`}><AttributionExplanation detail={activeAttribution}/></div>}
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

function AttributionExplanation({detail}:{detail:DepartmentAttributionExplanationRow}) {
  const confirmed=detail.current_functional_equivalent;
  return <section className="attribution-explanation" aria-label="조직 이동 추론 근거">
    <header><div><p className="eyebrow">추론 근거</p><h4>선택한 게시물의 판정 과정</h4></div><span className="inference-badge">{detail.inference_basis_label}</span></header>
    <div className="attribution-result-grid"><div><span>담당 표기 관측</span><b>{publicResidualLabel(detail.masked_label,detail.label_type)}</b><small>{detail.posted_at}</small></div><div><span>당시 확인 조직</span><b>{detail.responsible_org_as_of_notice??"확인되지 않음"}</b></div><div className={confirmed?"confirmed":"candidate"}><span>{confirmed?"현 부서 매칭":"현재 부서 후보"}</span><b>{confirmed??detail.current_org_candidate??"근거 부족"}</b><small>{confirmed?"공식 근거로 확인":"확정값이 아닌 후보"}</small></div></div>
    {detail.work_context.length>0&&<div className="work-context"><b>관측된 업무 문맥</b><p>{detail.work_context.join(" · ")}</p></div>}
    <div className="evidence-flow"><div className="flow-node observation"><span>관측</span><b>{publicResidualLabel(detail.masked_label,detail.label_type)}</b><small>{detail.title}</small></div>{detail.path_steps.map(step=>{const evidenceUrl=validPublicUrl(step.evidence_url);return <div className="flow-segment" key={`${step.step_order}-${step.from_name}-${step.to_name}`}><div className="flow-arrow"><span>{relationLabel(step.relation_type)}</span><small>{step.effective_date??"일자 미확인"}</small></div><div className="flow-node organization"><span>{step.from_name} →</span><b>{step.to_name}</b><small>{step.work_scope_match===true?"업무 범위 일치 확인":"공식 조직변경 근거"}</small></div>{evidenceUrl&&<a href={evidenceUrl} target="_blank" rel="noopener noreferrer">{step.evidence_title} ↗</a>}</div>})}{detail.path_steps.length===0&&<div className="flow-empty">공식 조직개편 이동 경로가 확인되지 않았습니다. 후보 유사도만으로 현재 부서를 확정하지 않습니다.</div>}</div>
    {detail.reasoning_steps.length>0&&<details className="reasoning-log"><summary>판정 과정 보기 ({detail.reasoning_steps.length})</summary><ol>{detail.reasoning_steps.map(step=><li key={`${step.step_order}-${step.step_type}`}><b>{stepTypeLabel(step.step_type)}</b><p>{step.result_description}</p></li>)}</ol></details>}
    {detail.official_evidence.length>0&&<div className="official-evidence-list"><h5>공식 근거</h5>{detail.official_evidence.map((evidence,index)=><p key={`${evidence.evidence_kind}-${index}`}><span>{evidence.evidence_date??"일자 미확인"}</span>{validPublicUrl(evidence.source_url)?<a href={evidence.source_url!} target="_blank" rel="noopener noreferrer">{evidence.document_title??"공식 근거문서"} ↗</a>:<b>{evidence.document_title??"공식 근거 관측"}</b>}</p>)}</div>}
  </section>;
}

function relationLabel(value:string){return ({RENAMED:"명칭 변경",MERGED:"통합",SPLIT:"분리",CREATED:"신설",ABOLISHED:"폐지",FUNCTION_TRANSFER:"업무 이관",OTHER_DIRECT_ORG_CHANGE:"조직 변경"} as Record<string,string>)[value]??value;}
function stepTypeLabel(value:string){return ({CURRENT_SEARCH:"현재 조직 탐색",HISTORICAL_EPOCH_SEARCH:"당시 조직 탐색",CANDIDATE_REJECTED:"후보 기각",HISTORICAL_ANCHOR_SELECTED:"과거 근거 선택",ORG_CHANGE_EVENT_FOLLOWED:"조직개편 경로 확인",FUNCTION_ASSIGNMENT_CONFIRMED:"공식 업무귀속 확인",FINAL_RESOLUTION:"최종 판단"} as Record<string,string>)[value]??value;}
