import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration=readFileSync("supabase/migrations/20260918000400_topic_analysis_contract_hardening.sql","utf8");
const metrics=JSON.parse(readFileSync("config/topic-analysis-metrics-v1.json","utf8"));
const predicates=JSON.parse(readFileSync("config/analysis-predicates-v1.json","utf8"));
const runtime=JSON.parse(readFileSync("config/analysis-contract-runtime-v1.json","utf8"));
const ui=readFileSync("packages/common/src/regulations/DepartmentResidualAnalysis.tsx","utf8");

for(const view of ["label_channel_evidence","mention_notice_resolution","rule_label_resolution","notice_rule_change_assertions"]){
  assert.match(migration,new RegExp(`create view analytics\\.${view}`));
}
for(const term of ["security_invoker=true","KODIT_SOURCE_RECORD_EXTERNAL_KEY","CANONICAL_NAME_EXACT","TITLE_DIRECT","change-assertion-v1"]){
  assert.ok(migration.includes(term),`missing ${term}`);
}
assert.ok(!migration.includes("target_regulation_version_id::uuid"));
assert.equal(metrics.contract_version,"topic-metrics-v1");
assert.equal(metrics.notice_denominator,2089);
assert.equal(metrics.metrics.length,7);
for(const metric of metrics.metrics){
  for(const key of ["subject_grain","numerator_grain","denominator_grain","date_field","release_scope","predicate_source"]){
    assert.ok(metric[key],`${metric.metric_code} missing ${key}`);
  }
  assert.equal(metric.date_field,"publish.notices.posted_date");
  assert.equal(metric.release_scope,"CURRENT_APPROVED_RELEASE");
}
const predicateMap=new Map(predicates.predicates.map((row)=>[row.predicate_code,row]));
for(const code of ["MENTIONS_RULE","LINKED_TO_RULE","PROPOSES_CHANGE_TO","FUNCTION_TRANSFERRED_TO"]){
  assert.ok(predicateMap.has(code));
}
assert.equal(predicateMap.get("FUNCTION_TRANSFERRED_TO").eligible_for_org_successor_rollup,false);
assert.equal(runtime.contracts.find((row)=>row.contract_code==="label-v1").normalization_form,"NFC_OUTER_TRIM_INTERNAL_WHITESPACE");
assert.equal(runtime.contracts.find((row)=>row.contract_code==="label-v1").unicode_data_version,"15.1.0");
assert.deepEqual(runtime.contracts.find((row)=>row.contract_code==="mention-v1").identity_components,["extraction_id","mention_contract_version","mention_type","span_start","span_end"]);
assert.ok(ui.includes('PERSON_EVIDENCE:"인물형 근거 있음"'));
assert.ok(ui.includes("실제 인물 신원, 역할 또는 소속을 확정한 결과가 아닙니다"));
console.log("T06.5 static contract passed: 4 views, 7 metrics, 4 predicates, 3 runtime contracts");
