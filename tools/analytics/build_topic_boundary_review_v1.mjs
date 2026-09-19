import assert from "node:assert/strict";
import fs from "node:fs";

const outDir = "reports/measurements/2026-09-19-topic-boundary-audit-v1";
const envPath = "apps/public-site/.env.local";
const localEnv = fs.existsSync(envPath)
  ? Object.fromEntries(fs.readFileSync(envPath, "utf8").split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => { const i=line.indexOf("="); return [line.slice(0,i),line.slice(i+1).replace(/^["']|["']$/g,"")]; }))
  : {};
const url=(process.env.NEXT_PUBLIC_SUPABASE_URL??localEnv.NEXT_PUBLIC_SUPABASE_URL??"").replace(/\/$/,"");
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??localEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??"";
assert.ok(url && key,"public Supabase environment is required");
const headers={apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json","Content-Profile":"publish","Accept-Profile":"publish"};
async function rpc(name,body={}){const r=await fetch(`${url}/rest/v1/rpc/${name}`,{method:"POST",headers,body:JSON.stringify(body)});assert.equal(r.status,200,`${name} HTTP ${r.status}`);return r.json();}

const medium = [
  ["40a500cb-dd08-55f3-9f1c-c3197056b77d","2026-01-02","「투자업무 운용요령」 개정 사전예고",["투자업무"],["투자업무운용요령"]],
  ["200e8324-9a7b-5612-9f9f-ac8447e1520e","2025-07-03","「투자업무 운용요령」 등 개정 사전예고",["투자업무"],["투자기업","투자업무운용요령","투자업무처리기준"]],
  ["6bc0b000-382f-511f-92e8-aa0843b3fbb5","2024-12-31","「M&A보증 운용기준」 개정 사전예고",["M&A보증"],["M&A보증운용기준"]],
  ["a8a133ee-6fa7-5b38-84b0-20960f24ce2d","2024-12-05","「투자업무 처리기준」 개정 사전예고",["투자업무"],["투자업무처리기준"]],
  ["fdbe64c8-3e69-596b-ba30-7590d419038f","2024-12-05","「투자업무 운용요령」 개정 사전예고",["투자업무"],["투자업무운용요령"]],
  ["39ee912a-83b2-5b53-99f3-5c5a06a25570","2024-05-14","「 투자업무 운용요령」 등 개정 사전예고",["투자업무"],["투자업무운용요령","투자업무처리기준"]],
  ["ea6be746-48bb-5bd1-b3a7-6a6c249b376a","2022-04-21","'투자업무 운용요령' 개정",["투자업무"],["투자업무운용요령"]],
  ["c581608f-2385-5729-b18e-9afe327c48bd","2022-04-06","'투자업무 처리기준' 개정 사전예고",["투자업무"],["투자업무처리기준"]],
  ["081e3766-7f92-53a7-99cb-39ec351948b2","2022-03-21","「투자규정」 개정 사전예고",["투자규정"],[]],
  ["d1e96a14-de0d-57b9-b444-04f6e7398159","2021-04-07","「투자업무 운용요령」, 「투자업무 처리기준」,「투자기업 사후관리 운용기준」 개정 사전예고",["투자업무"],["투자기업","투자업무운용요령","투자업무처리기준"]],
  ["1c653faf-d1cc-5c68-9fac-926e8c853947","2021-01-07","「투자업무 운용요령, 투자업무 처리기준」개정 사전예고",["투자업무"],["투자업무운용요령","투자업무처리기준"]],
  ["e993263a-d72d-548e-bab7-5e00481d7ee3","2020-03-05","「M&A보증 운용기준」 개정 사전예고",["M&A보증"],["M&A보증운용기준"]],
  ["9aa530d5-f758-51af-8f64-7674f73bcc0f","2019-08-21","투자업무 운용요령 등 개정 사전예고",["투자업무"],["투자업무운용요령"]],
  ["fed8ad68-ce31-5e6c-9dd2-c5918fbcacd5","2019-07-22","M&A보증 운용기준 개정 사전예고",["M&A보증"],["M&A보증운용기준"]],
  ["bf2a3a17-3448-5eb2-bdc8-418a9c4be19b","2019-03-08","투자업무 운용요령 및 투자업무 처리기준 개정 사전예고",["투자업무"],["투자업무운용요령","투자업무처리기준"]],
  ["016d11e6-966c-5d04-8be1-7d4dbe358084","2018-07-20","M&A보증 운용기준 개정 사전예고",["M&A보증"],[]],
  ["4c3df4f2-0546-5d01-9936-55a82d8b35e7","2017-11-06","M&A보증 운영기준 개정 사전예고",["M&A보증"],["M&A보증운용기준"]],
  ["5651f7d8-64d6-50fb-b0e3-a631f1bd40e9","2017-05-23","투자업무 운용요령 개정 사전예고",["투자업무"],["투자업무운용요령"]],
  ["a49e0518-90da-5da4-a01a-b8718ffe9fe8","2017-01-17","투자업무 운용요령 외 4개 규정 개정 사전예고",["투자업무"],["M&A보증운용기준","투자업무운용요령","투자업무처리기준"]],
  ["b26e1d6b-513e-5a98-bded-09558cb6a922","2016-11-28","투자업무 운용요령, 투자업무 처리기준, 투자계약서 개정 사전예고",["투자업무"],["투자업무운용요령","투자업무처리기준"]],
  ["8fb12243-512d-5a33-9eee-1d0ba156c842","2016-09-12","M&A보증 운용기준(가칭) 개정 사전예고",["M&A보증"],["M&A보증운용기준"]],
  ["dcdababa-ba77-5b60-990a-3c0835d23983","2016-06-07","투자규정, 투자업무 운용요령, 투자업무 처리기준 개정 사전예고",["투자규정","투자업무"],["투자업무운용요령","투자업무처리기준"]],
  ["5df85254-3281-5bce-9c2d-7d46367ad1b6","2015-12-07","투자업무 처리기준 개정에 따른 규정 개정 사전예고",["투자업무"],["투자업무처리기준"]],
  ["dfece6e2-0be3-5e5a-b1f3-0d0d4a19286b","2014-04-07","투자규정등 제.개정 사전예고",["투자규정"],[]]
];
const weak = [
  ["33275128-e021-5a5d-90a5-782b3e496e0b","2026-06-02","「보증사업심사위원회 운영요령」 등 제규정 개정 사전예고","INVESTMENT_GUARANTEE",["M&A보증운용기준"]],
  ["c7e569d5-a9c8-5825-a433-5b5136342531","2026-02-23","「지역산업 지원프로그램 운용기준」 개정 사전예고","INVESTMENT_GUARANTEE",["투자기업"]],
  ["5198f861-a582-5a7e-a305-46e9bcd84c28","2024-12-05","「투자기업 사후관리 운용기준」 개정 사전예고","INVESTMENT_GUARANTEE",["투자기업"]],
  ["7527bfdb-5f72-523f-ac10-c4a479bfd298","2024-07-18","「투자기업 사후관리 운용기준」개정 사전예고","INVESTMENT_GUARANTEE",["투자기업"]],
  ["447521fd-290f-5bb6-bb2b-0f0fadc48308","2024-05-28","「Start-up 신속투자 프로그램 운용기준」 등 개정 사전예고","INVESTMENT_GUARANTEE",["투자업무운용요령","투자업무처리기준"]],
  ["fdade53a-2dc6-5718-8963-e2a4755fc556","2023-10-10","'출자전환증권 관리업무처리기준' 등 개정 사전 예고","INVESTMENT_GUARANTEE",["투자업무처리기준"]],
  ["0b04a9a8-79a1-5564-abdc-1aee2d238051","2022-09-21","제규정 제개정 사전예고","INVESTMENT_GUARANTEE",["투자기업","투자업무처리기준"]],
  ["4798a605-0728-5d9a-a13c-6ee7c2a3f05f","2017-04-25","유동화회사보증 관리요령 외 3개 규정 개정 사전예고","INVESTMENT_GUARANTEE",["투자업무처리기준"]],
  ["ea4df6c9-9ea2-55c7-a02a-120f27f9b00b","2025-02-20","「유동화회사보증 관리요령」 등 개정 사전예고","LITIGATION",["소송위임"]],
  ["181479f6-a894-5a7e-8874-28ae805bf849","2022-10-31","「보험금지급 업무기준」 개정 사전예고","LITIGATION",["소송위임"]],
  ["721002bd-f6a5-5bea-8ebb-ae8f6a446b99","2016-09-29","재도전지원 프로그램 운영기준 개정 사전 예고","LITIGATION",["소송위임"]]
];

const candidates = [
  ...medium.map(([notice_id,posted_date,title,titlePhrases,bodyPhrases])=>({notice_id,posted_date,title,candidate_topic:"INVESTMENT_GUARANTEE",candidate_basis:["HIGHLY_RECURRENT_TITLE_PHRASE",...(bodyPhrases.length?["MEMBER_DERIVED_BODY_PHRASE"]:[])],matching_regulation_ids:[],matching_work_labels:[],matching_phrases:[...titlePhrases,...bodyPhrases],candidate_strength_class:"MEDIUM",current_membership:false})),
  ...weak.map(([notice_id,posted_date,title,candidate_topic,bodyPhrases])=>({notice_id,posted_date,title,candidate_topic,candidate_basis:["MEMBER_DERIVED_BODY_PHRASE"],matching_regulation_ids:[],matching_work_labels:[],matching_phrases:bodyPhrases,candidate_strength_class:"WEAK",current_membership:false}))
].sort((a,b)=>a.candidate_topic.localeCompare(b.candidate_topic)||({STRONG:0,MEDIUM:1,WEAK:2}[a.candidate_strength_class]-{STRONG:0,MEDIUM:1,WEAK:2}[b.candidate_strength_class])||b.posted_date.localeCompare(a.posted_date)||a.notice_id.localeCompare(b.notice_id));

const [litigation,investment]=await Promise.all([
  rpc("public_topic_notice_rows_v1",{p_topic_code:"LITIGATION"}),
  rpc("public_topic_notice_rows_v1",{p_topic_code:"INVESTMENT_GUARANTEE"})
]);
assert.equal(litigation.length,21); assert.equal(investment.length,18);
const members=[...litigation,...investment].map((r)=>({notice_id:r.notice_id,posted_date:r.posted_date,title:r.title,candidate_topic:r.topic_code,candidate_basis:r.evidence_basis,matching_regulation_ids:[],matching_work_labels:r.work_keywords,matching_phrases:[],candidate_strength_class:"CURRENT_MEMBER",current_membership:true}));
const review=[...members,...candidates].sort((a,b)=>a.candidate_topic.localeCompare(b.candidate_topic)||(Number(b.current_membership)-Number(a.current_membership))||b.posted_date.localeCompare(a.posted_date)||a.notice_id.localeCompare(b.notice_id));
const csvEscape=(v)=>{const s=Array.isArray(v)?v.join(" | "):String(v??"");return /[",\r\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s;};
const fields=["notice_id","posted_date","title","candidate_topic","candidate_basis","matching_regulation_ids","matching_work_labels","matching_phrases","candidate_strength_class","current_membership"];
const toCsv=(rows)=>[fields.join(","),...rows.map((r)=>fields.map((f)=>csvEscape(r[f])).join(","))].join("\r\n")+"\r\n";
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(`${outDir}/candidate-notices.json`,JSON.stringify(candidates,null,2)+"\n");
fs.writeFileSync(`${outDir}/candidate-notices.csv`,toCsv(candidates));
fs.writeFileSync(`${outDir}/review-sample.csv`,toCsv(review));
console.log(JSON.stringify({members:members.length,candidates:candidates.length,review:review.length,medium:candidates.filter(x=>x.candidate_strength_class==='MEDIUM').length,weak:candidates.filter(x=>x.candidate_strength_class==='WEAK').length},null,2));
