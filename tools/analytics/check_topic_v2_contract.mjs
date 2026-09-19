import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const migration=readFileSync("supabase/migrations/20260919000200_topic_membership_v2.sql","utf8");
const referenceMigration=readFileSync("supabase/migrations/20260919000210_topic_family_official_references_v2.sql","utf8");
const config=JSON.parse(readFileSync("config/topic-membership-v2.json","utf8"));

assert.equal(config.contract_version,"topic-membership-v2");
assert.equal(config.parent_membership,"UNION_OF_APPROVED_CHILD_FAMILY_MEMBERSHIPS");
assert.equal(config.families.filter((x)=>x.status==="APPROVED_CHILD_FAMILY").length,9);
assert.equal(config.families.find((x)=>x.family_code==="FIRST_PENGUIN_RELATED").status,"RELATED_BUT_OUT_OF_SCOPE");
assert.equal(config.families.find((x)=>x.family_code==="MNA_GUARANTEE_RELATED").status,"APPROVED_CHILD_FAMILY");

for(const object of [
  "topic_families_v2","topic_family_regulations_v2","topic_family_terms_v2",
  "topic_notice_family_memberships_v2","topic_family_membership_evidence_v2",
  "topic_family_membership_v2","topic_parent_membership_v2",
  "public_topic_summary_v2","public_topic_notice_rows_v2"
]) assert.ok(migration.includes(object),`missing ${object}`);

for(const basis of config.allowed_evidence) assert.ok(migration.includes(basis),`missing evidence ${basis}`);
assert.match(migration,/family_status='APPROVED_CHILD_FAMILY'/);
assert.match(migration,/select distinct fm\.release_id,fm\.notice_id/);
assert.match(migration,/security_invoker=true/g);
assert.match(migration,/topic-v1'::text membership_contract/);
assert.doesNotMatch(migration,/org_work_attribution|functional_attribution|MENTIONS_PERSON|MENTIONS_EMAIL|notice_department/i);
assert.doesNotMatch(migration,/strpos\([^\n]*,'보증'\)|strpos\([^\n]*,'투자'\)/);
assert.match(referenceMigration,/topic_family_official_references_v2/);
assert.match(referenceMigration,/CANONICAL_OFFICIAL_PRODUCT_PAGE/);
for(const family of config.families.filter((x)=>x.official_reference_url)) assert.ok(referenceMigration.includes(family.official_reference_url),`missing official reference ${family.family_code}`);
console.log("topic-membership-v2 static contract PASS");
