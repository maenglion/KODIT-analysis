import fs from "node:fs"; import path from "node:path";
const root=path.resolve(import.meta.dirname,"../..");
const m=fs.readFileSync(path.join(root,"supabase/migrations/20260918000200_organization_lineage_ledger.sql"),"utf8");
for(const x of ["core.organization_evidence","core.organization_nodes","core.organization_label_assessments","core.organization_label_node_relations","core.organization_lineage_edges","FUNCTION_TRANSFERRED_TO","force row level security"]){if(!m.includes(x))throw new Error(`missing ${x}`)}
for(const x of ["BELONGS_TO","MENTIONS_PERSON","PROPOSES_CHANGE_TO"]){if(m.includes(x))throw new Error(`forbidden ${x}`)}
console.log("organization lineage contract: PASS");
