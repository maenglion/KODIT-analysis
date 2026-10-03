"use client";

import { useMemo, useState } from "react";
import { personResidualObservationsToCsv, validPublicUrl, type PublicPersonResidualObservationRow } from "./index";

function download(body:string) {
  const url=URL.createObjectURL(new Blob([body],{type:"text/csv;charset=utf-8"}));
  const anchor=document.createElement("a");
  anchor.href=url;
  anchor.download="person-residual-observations.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function PersonResidualObservations({rows}:{rows:PublicPersonResidualObservationRow[]}) {
  const [query,setQuery]=useState("");
  const [selected,setSelected]=useState<string|null>(null);
  const groups=useMemo(()=>{
    const map=new Map<string,PublicPersonResidualObservationRow[]>();
    for(const row of rows){const values=map.get(row.public_alias)??[];values.push(row);map.set(row.public_alias,values);}
    return [...map].map(([alias,observations])=>({alias,observations:observations.sort((a,b)=>b.posted_at.localeCompare(a.posted_at)),count:observations.reduce((sum,row)=>sum+Number(row.observation_count),0)})).filter(item=>item.alias.includes(query.trim())).sort((a,b)=>b.count-a.count||a.alias.localeCompare(b.alias,"ko"));
  },[rows,query]);
  const detail=groups.find(item=>item.alias===selected);
  return <section className="residual-section person-observation-section" aria-labelledby="person-observation-title">
    <header className="residual-section-header"><div><p className="eyebrow">PERSON OBSERVATION</p><h2 id="person-observation-title">사람형 표기 관측</h2><p>희귀 성씨를 포함한 신원 재식별 위험을 줄이기 위해 초성과 공개 번호만 표시합니다. 조직·부서·직무·후보·이동 경로·추론 정보는 이 공개 계약에 포함하지 않습니다.</p></div><button onClick={()=>download(personResidualObservationsToCsv(rows))}>관측 CSV</button></header>
    <div className="person-observation-toolbar"><label>공개 별칭 검색<input value={query} onChange={event=>setQuery(event.target.value)} placeholder="예: ㅁㄴㅇ(1525)"/></label><p><b>{groups.length.toLocaleString("ko-KR")}</b>개 별칭 · <b>{rows.length.toLocaleString("ko-KR")}</b>건 관측</p></div>
    <div className="table-scroll"><table className="regulations-table residual-table person-observation-table"><thead><tr><th>공개 별칭</th><th>관측 건수</th><th>최근 관측일</th><th>관측 게시물</th></tr></thead><tbody>{groups.map(item=><tr key={item.alias} className={selected===item.alias?"is-selected":undefined}><td><button className="department-link" onClick={()=>setSelected(selected===item.alias?null:item.alias)} aria-expanded={selected===item.alias}>{item.alias}</button></td><td>{item.count.toLocaleString("ko-KR")}</td><td>{item.observations[0]?.posted_at??"미확인"}</td><td>{item.observations.length.toLocaleString("ko-KR")}건</td></tr>)}</tbody></table></div>
    {detail&&<article className="residual-detail person-observation-detail"><button className="residual-close" onClick={()=>setSelected(null)} aria-label="상세 닫기">×</button><p className="eyebrow">공개 관측 상세</p><h3>{detail.alias}</h3><p>아래에는 관측일, 게시물 제목, 공식 출처만 표시합니다. 이 표기를 조직이나 직무와 연결하지 않습니다.</p><ul className="residual-notices">{detail.observations.map((row,index)=><li key={`${row.posted_at}-${row.source_location}-${index}`}><time dateTime={row.posted_at}>{row.posted_at}</time>{validPublicUrl(row.source_location)?<a href={row.source_location} target="_blank" rel="noopener noreferrer">{row.title} ↗</a>:<span>{row.title}</span>}</li>)}</ul></article>}
  </section>;
}
