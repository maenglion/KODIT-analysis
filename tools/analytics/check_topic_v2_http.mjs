import assert from "node:assert/strict";
import fs from "node:fs";

const envPath="apps/public-site/.env.local";
const localEnv=fs.existsSync(envPath)?Object.fromEntries(fs.readFileSync(envPath,"utf8").split(/\r?\n/).filter((x)=>x&&!x.startsWith("#")&&x.includes("=")).map((x)=>{const i=x.indexOf("=");return [x.slice(0,i),x.slice(i+1).replace(/^["']|["']$/g,"")];})):{};
const url=(process.env.NEXT_PUBLIC_SUPABASE_URL??localEnv.NEXT_PUBLIC_SUPABASE_URL??"").replace(/\/$/,"");
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??localEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??"";
assert.ok(url&&key,"public Supabase environment is required");
const headers={apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json","Content-Profile":"publish","Accept-Profile":"publish"};
async function rpc(name,body={}){const r=await fetch(`${url}/rest/v1/rpc/${name}`,{method:"POST",headers,body:JSON.stringify(body)});assert.equal(r.status,200,`${name} HTTP ${r.status}`);return r.json();}

const summary=await rpc("public_topic_summary_v2");
const byTopic=Object.fromEntries(summary.map((x)=>[x.topic_code,x]));
assert.equal(Number(byTopic.LITIGATION.notice_count),21);
assert.equal(byTopic.LITIGATION.membership_contract,"topic-v1");
assert.equal(Number(byTopic.INVESTMENT_GUARANTEE.notice_count),62);
assert.equal(byTopic.INVESTMENT_GUARANTEE.membership_contract,"topic-membership-v2");
const [litigation,investment,invalid]=await Promise.all([
  rpc("public_topic_notice_rows_v2",{p_topic_code:"LITIGATION"}),
  rpc("public_topic_notice_rows_v2",{p_topic_code:"INVESTMENT_GUARANTEE"}),
  rpc("public_topic_notice_rows_v2",{p_topic_code:"NOT_A_TOPIC"})
]);
assert.equal(litigation.length,21); assert.equal(investment.length,62); assert.equal(invalid.length,0);
assert.equal(new Set(investment.map((x)=>x.notice_id)).size,62);
assert.ok(investment.every((x)=>x.child_families.length>0&&x.evidence_basis.length>0));
const directCore=await fetch(`${url}/rest/v1/topic_families_v2?select=family_id&limit=1`,{headers:{apikey:key,Authorization:`Bearer ${key}`,"Accept-Profile":"core"}});
assert.notEqual(directCore.status,200,"anon must not read the v2 core ledger directly");
console.log(JSON.stringify({http:200,litigation_rows:21,investment_guarantee_v2_rows:62,invalid_topic_rows:0,direct_core_status:directCore.status},null,2));
