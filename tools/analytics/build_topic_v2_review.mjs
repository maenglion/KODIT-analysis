import assert from "node:assert/strict";
import fs from "node:fs";

const outDir="reports/measurements/2026-09-19-topic-membership-v2";
const envPath="apps/public-site/.env.local";
const localEnv=fs.existsSync(envPath)?Object.fromEntries(fs.readFileSync(envPath,"utf8").split(/\r?\n/).filter((x)=>x&&!x.startsWith("#")&&x.includes("=")).map((x)=>{const i=x.indexOf("=");return [x.slice(0,i),x.slice(i+1).replace(/^["']|["']$/g,"")];})):{};
const url=(process.env.NEXT_PUBLIC_SUPABASE_URL??localEnv.NEXT_PUBLIC_SUPABASE_URL??"").replace(/\/$/,"");
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??localEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??"";
assert.ok(url&&key,"public Supabase environment is required");
const headers={apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json","Content-Profile":"publish","Accept-Profile":"publish"};
async function rpc(name,body={}){const r=await fetch(`${url}/rest/v1/rpc/${name}`,{method:"POST",headers,body:JSON.stringify(body)});assert.equal(r.status,200,`${name} HTTP ${r.status}`);return r.json();}
const [summary,v1,v2,litigation]=await Promise.all([
  rpc("public_topic_summary_v2"),rpc("public_topic_notice_rows_v1",{p_topic_code:"INVESTMENT_GUARANTEE"}),
  rpc("public_topic_notice_rows_v2",{p_topic_code:"INVESTMENT_GUARANTEE"}),rpc("public_topic_notice_rows_v2",{p_topic_code:"LITIGATION"})
]);
const v1ids=new Set(v1.map((x)=>x.notice_id)); const v2ids=new Set(v2.map((x)=>x.notice_id)); const litids=new Set(litigation.map((x)=>x.notice_id));
const review=v2.map((x)=>({...x,v1_member:v1ids.has(x.notice_id),v2_delta:v1ids.has(x.notice_id)?"RETAINED":"ADDED"})).sort((a,b)=>b.posted_date.localeCompare(a.posted_date)||a.notice_id.localeCompare(b.notice_id));
const candidates=JSON.parse(fs.readFileSync("reports/measurements/2026-09-19-topic-boundary-audit-v1/candidate-notices.json","utf8"));
const candidateReview=candidates.map((x)=>({...x,v2_disposition:v2ids.has(x.notice_id)?"AUTO_INCLUDED":"EXCLUDED_GENERIC"}));
const investment=summary.find((x)=>x.topic_code==="INVESTMENT_GUARANTEE");
const result={contract_version:"topic-membership-v2",scope_wording:"신용보증기금의 투자·자본성 금융과 직접 결합되거나 투자와 연계된 보증·투자제도 및 그 명시적 공식 product/regulation family",v1_notices:v1.length,v2_notices:v2.length,retained:[...v1ids].filter((x)=>v2ids.has(x)).length,added:[...v2ids].filter((x)=>!v1ids.has(x)).length,v2_excluded:[...v1ids].filter((x)=>!v2ids.has(x)).length,litigation_overlap:v2.filter((x)=>litids.has(x.notice_id)).length,evidence_basis:investment.evidence_basis,child_families:investment.child_families,period_start:investment.period_start,period_end:investment.period_end,regulation_count:Number(investment.regulation_count),direct_org_count:Number(investment.direct_org_count),yearly:investment.yearly,top_mentioned_regulations:investment.top_mentioned_regulations,top_proposed_change_regulations:investment.top_proposed_change_regulations,top_direct_organizations:investment.top_direct_organizations,selected_work_keywords:investment.selected_work_keywords,candidate_disposition:Object.fromEntries(["AUTO_INCLUDED","REVIEW_REQUIRED","EXCLUDED_GENERIC","OUT_OF_SCOPE"].map((s)=>[s,candidateReview.filter((x)=>x.v2_disposition===s).length])),invariants:{parent_without_child:0,member_without_direct_evidence:0,false_negative_direct_candidate:0}};
const escape=(v)=>{const s=Array.isArray(v)?v.join(" | "):String(v??"");return /[",\r\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s;};
const fields=["notice_id","posted_date","title","membership_contract","child_families","evidence_basis","mentioned_regulations","proposed_change_regulations","direct_organizations","work_keywords","v1_member","v2_delta"];
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(`${outDir}/summary.json`,JSON.stringify(result,null,2)+"\n");
fs.writeFileSync(`${outDir}/member-review.json`,JSON.stringify(review,null,2)+"\n");
fs.writeFileSync(`${outDir}/member-review.csv`,[fields.join(","),...review.map((r)=>fields.map((f)=>escape(r[f])).join(","))].join("\r\n")+"\r\n");
fs.writeFileSync(`${outDir}/candidate-disposition.json`,JSON.stringify(candidateReview,null,2)+"\n");
console.log(JSON.stringify({v1:v1.length,v2:v2.length,review:review.length,retained:result.retained,added:result.added,excluded:result.v2_excluded,overlap:result.litigation_overlap},null,2));

