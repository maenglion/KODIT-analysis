import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260918000100_lexical_label_ledger.sql"),
  "utf8",
);
const backfill = fs.readFileSync(
  path.join(root, "tools/labels/backfill_lexical_labels.py"),
  "utf8",
);

const required = [
  "create table core.labels",
  "create table core.extraction_mention_labels",
  "create table core.notice_department_residual_labels",
  "create view core.label_type_evidence",
  "create view core.label_raw_variants",
  "create view core.label_metrics",
  "core.normalize_label_v1",
  "core.lexical_label_id",
  "AMBIGUOUS",
  "UNTYPED",
  "security_invoker = true",
  "force row level security",
];
for (const needle of required) {
  if (!migration.includes(needle)) throw new Error(`missing T04 contract: ${needle}`);
}

for (const forbidden of ["ORG_NODE", "SUCCEEDED_BY", "MENTIONS_PERSON", "people_found"]) {
  if (migration.includes(forbidden)) throw new Error(`forbidden T05/public construct: ${forbidden}`);
}

if (!backfill.includes('LABEL_CONTRACT_VERSION = "label-v1"')) {
  throw new Error("backfill does not pin label-v1");
}
if (!backfill.includes("unicodedata.normalize(\"NFC\"")) {
  throw new Error("backfill does not enforce Unicode NFC");
}

console.log("lexical label contract: PASS");
