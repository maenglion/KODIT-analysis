import fs from "node:fs";
import assert from "node:assert/strict";

const envPath="apps/public-site/.env.local";
const local=fs.existsSync(envPath)?Object.fromEntries(fs.readFileSync(envPath,"utf8").split(/\r?\n/).filter(x=>x&&!x.startsWith("#")&&x.includes("=")).map(x=>{const i=x.indexOf("=");return [x.slice(0,i),x.slice(i+1).replace(/^['"]|['"]$/g,"")]})):{};
const url=(process.env.NEXT_PUBLIC_SUPABASE_URL||local.NEXT_PUBLIC_SUPABASE_URL||"").replace(/\/$/,"");
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||local.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||"";
assert.ok(url&&key,"public Supabase environment is required");
async function rpc(name){const all=[];for(let offset=0;offset<5000;offset+=1000){const response=await fetch(`${url}/rest/v1/rpc/${name}?limit=1000&offset=${offset}`,{method:"POST",headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json","Content-Profile":"publish","Accept-Profile":"publish"},body:"{}"});assert.equal(response.status,200,`${name} HTTP ${response.status}`);const rows=await response.json();all.push(...rows);if(rows.length<1000)return all;}throw new Error(`${name} pagination overflow`)}
const [occurrences,labels]=await Promise.all([rpc("public_department_residual_analysis_rows"),rpc("public_department_residual_label_rows")]);
assert.equal(occurrences.length,1272);assert.equal(labels.length,355);
const byClass=Object.fromEntries(["PERSON_EVIDENCE","ORG_CURRENT","ORG_HISTORICAL","UNTYPED","AMBIGUOUS"].map(k=>[k,{labels:labels.filter(x=>x.resolution_class===k).length,occurrences:labels.filter(x=>x.resolution_class===k).reduce((n,x)=>n+Number(x.residual_occurrence_count),0)}]));
assert.deepEqual(byClass,{PERSON_EVIDENCE:{labels:317,occurrences:1113},ORG_CURRENT:{labels:3,occurrences:30},ORG_HISTORICAL:{labels:2,occurrences:15},UNTYPED:{labels:33,occurrences:114},AMBIGUOUS:{labels:0,occurrences:0}});
assert.equal(new Set(occurrences.map(x=>x.residual_id)).size,1272);assert.equal(new Set(labels.map(x=>x.label_id)).size,355);assert.equal(labels.reduce((n,x)=>n+Number(x.residual_occurrence_count),0),1272);
console.log(JSON.stringify({occurrences:occurrences.length,labels:labels.length,categories:byClass,http:200},null,2));
