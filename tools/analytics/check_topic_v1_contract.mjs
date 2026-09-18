import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const sql=readFileSync("supabase/migrations/20260919000100_topic_analysis_data_layer.sql","utf8");
const config=JSON.parse(readFileSync("config/topic-membership-v1.json","utf8"));
assert.equal(config.contract_version,"topic-v1");
assert.deepEqual(config.topics.map(x=>x.topic_code),["LITIGATION","INVESTMENT_GUARANTEE"]);
for(const required of ["count(distinct notice_id)","MENTIONS_RULE","PROPOSES_CHANGE_TO","MENTIONS_WORK","MENTION_ORG_AS_OF"]){
  if(required==="MENTION_ORG_AS_OF") assert.match(sql,/mention_type='ORG'/);
  else assert.ok(sql.toLowerCase().includes(required.toLowerCase()),`missing ${required}`);
}
assert.match(sql,/public_topic_summary_v1/);
assert.match(sql,/public_topic_notice_rows_v1/);
assert.match(sql,/security_invoker=true/g);
assert.doesNotMatch(sql,/org_work_attribution|functional_attribution|MENTIONS_PERSON|MENTIONS_EMAIL/);
assert.match(sql,/evidence_basis='MENTIONS_RULE'/);
assert.match(sql,/evidence_basis='PROPOSES_CHANGE_TO'/);
console.log("topic-v1 static contract PASS");
