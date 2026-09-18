import assert from "node:assert/strict";
import fs from "node:fs";
const sql=fs.readFileSync("supabase/migrations/20260918000300_department_residual_analysis_read_model.sql","utf8");
for(const name of ["public_department_residual_analysis_rows","public_department_residual_label_rows"]){assert.match(sql,new RegExp(`create function publish\\.${name}\\(\\)`,"i"));}
for(const value of ["PERSON_EVIDENCE","ORG_CURRENT","ORG_HISTORICAL","UNTYPED","AMBIGUOUS","security definer","set search_path = ''"]){assert.ok(sql.toLowerCase().includes(value.toLowerCase()));}
for(const forbidden of ["BELONGS_TO","PROPOSES_CHANGE_TO","risk_score","people_found"]){assert.ok(!sql.includes(forbidden));}
console.log("department residual analysis contract: PASS");
