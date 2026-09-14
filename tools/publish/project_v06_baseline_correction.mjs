#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const NAMESPACE = "71e07e7a-8e4e-569c-86cf-38cde51739a7";
const BASELINE_RELEASE_ID = "9a87d0c2-2901-5fc8-bceb-f068f02b697a";
const BASELINE_CYCLE_ID = "3773771c-af63-570a-ad4d-1fae255da383";
const CORRECTION_NAME = "kodit:v0.6:baseline-correction:2026-09-14";
const CORRECTION_RELEASE_ID = "47c5562f-b3be-5105-8e4f-dca2f56574f6";
const GENERATED_AT = "2026-09-14T23:50:00+09:00";
const RELEASE_EVIDENCE_AS_OF = "2026-09-13";
const NOTICE_EVIDENCE_AS_OF = "2026-08-31";
const EXPECTED_POPULATION = 1041;
const EXPECTED_NOTICES = 2089;

const args = parseArgs(process.argv.slice(2));
if (!args["evidence-root"]) throw new Error("--evidence-root is required");
const evidenceRoot = path.resolve(args["evidence-root"]);
const outputDir = path.resolve(args["output-dir"] ?? path.join(ROOT, "reports/projections/2026-09-14-v06-baseline-correction"));
const inputs = {
  baselineManifest: repo("reports/projections/2026-09-14-v06-baseline/manifest.json"),
  regulationsCsv: repo("apps/public-site/data/review-20260913-reconstructed/regulations.csv"),
  identityResolution: repo("reports/projections/2026-09-14-v06-baseline-correction/identity-resolution.json"),
  priorNotices: evidence("howareyou-sinbo-site/kodit_preannouncements.json"),
  correctedNotices: evidence(".verify/preannouncement_rule_match_20260831/data/current_preannouncements_2089.json"),
  noticeAnalysis: evidence(".verify/preannouncement_rule_match_20260831/data/analysis_result.json"),
  noticeScrapeManifest: evidence(".verify/preannouncement_rule_match_20260831/source_snapshot/scrape_manifest.json"),
  ruleMentions: evidence("outputs/019fa475-b3fc-7522-934f-878c4256772a/06_게시물별_규정명_언급행_전체.csv"),
  alioRules: evidence("howareyou-sinbo-site/alio_internal_rules.json"),
  extractionManifest: evidence("outputs/019fa475-b3fc-7522-934f-878c4256772a/07_첨부_SHA256_매니페스트.csv"),
};

assert.equal(uuidV5(NAMESPACE, CORRECTION_NAME), CORRECTION_RELEASE_ID, "correction UUID contract changed");
const texts = Object.fromEntries(await Promise.all(Object.entries(inputs).map(async ([name, file]) => [name, await fs.readFile(file, "utf8")])));
const sourceFiles = await Promise.all(Object.entries(inputs).map(async ([name, file]) => ({ name, path: logicalPath(file), sha256: sha256(await fs.readFile(file)) })));
sourceFiles.sort((a, b) => a.name.localeCompare(b.name));

const baselineManifest = JSON.parse(texts.baselineManifest);
const priorNotices = JSON.parse(texts.priorNotices);
const correctedNotices = JSON.parse(texts.correctedNotices);
const noticeAnalysis = JSON.parse(texts.noticeAnalysis);
const scrapeManifest = JSON.parse(texts.noticeScrapeManifest);
const identityResolution = JSON.parse(texts.identityResolution);
const regulationsCsv = parseCsv(texts.regulationsCsv);
const mentions = parseCsv(texts.ruleMentions);
const alioRules = JSON.parse(texts.alioRules);
const extractionRows = parseCsv(texts.extractionManifest);

assert.equal(baselineManifest.baseline_release_id, BASELINE_RELEASE_ID);
assert.equal(baselineManifest.baseline_collection_cycle_id, BASELINE_CYCLE_ID);
assert.equal(baselineManifest.coverage.regulations, EXPECTED_POPULATION);
assert.equal(priorNotices.length, 2072);
assert.equal(correctedNotices.length, EXPECTED_NOTICES);
assert.equal(new Set(priorNotices.map((row) => String(row.number))).size, priorNotices.length);
assert.equal(new Set(correctedNotices.map((row) => String(row.number))).size, correctedNotices.length);
assert.equal(noticeAnalysis.as_of_date, NOTICE_EVIDENCE_AS_OF);
assert.equal(noticeAnalysis.source_counts.preannouncement_posts, EXPECTED_NOTICES);
assert.equal(scrapeManifest.sources.kodit.record_count, EXPECTED_NOTICES);
assert.ok(String(scrapeManifest.collected_at).startsWith("2026-09-01T"));

const priorNumbers = new Set(priorNotices.map((row) => String(row.number)));
const omitted = correctedNotices.filter((row) => !priorNumbers.has(String(row.number)));
assert.equal(omitted.length, 17);
assert.deepEqual(omitted.map((row) => Number(row.number)).sort((a, b) => a - b), Array.from({ length: 17 }, (_, index) => 2073 + index));
assert.ok(omitted.every((row) => normalizeDate(row.posted_date) <= "2026-09-14"));
assert.ok(NOTICE_EVIDENCE_AS_OF <= "2026-09-14");

const sourceRows = regulationsCsv.map((row) => ({ row, regulationVersionId: uuidV5(NAMESPACE, `regulation-version:${hashCanonical(row)}`) }));
assert.equal(sourceRows.length, EXPECTED_POPULATION);
const versionsByName = new Map();
for (const item of sourceRows) {
  if (!versionsByName.has(item.row.normalized_name)) versionsByName.set(item.row.normalized_name, []);
  versionsByName.get(item.row.normalized_name).push(item.regulationVersionId);
}
const linkedByNotice = new Map();
for (const mention of mentions) {
  for (const versionId of versionsByName.get(mention.normalized_rule_name) ?? []) {
    if (!linkedByNotice.has(String(mention.post_number))) linkedByNotice.set(String(mention.post_number), new Set());
    linkedByNotice.get(String(mention.post_number)).add(versionId);
  }
}

const alioByRule = new Map(alioRules.map((row) => [String(row.rule_id), row]));
const extractionByUrl = new Map(extractionRows.map((row) => [row.download_url, row]));
assert.equal(identityResolution.items.length, 2);
for (const item of identityResolution.items) {
  const sourceRow = sourceRows.find((row) => row.row.regulation_code === item.regulation_code);
  assert.ok(sourceRow, `missing regulation ${item.regulation_code}`);
  assert.equal(sourceRow.regulationVersionId, item.regulation_version_id);
  assert.equal(sourceRow.row.regulation_name, item.registered_name);
  assert.equal(normalizeDate(sourceRow.row.revision_date), item.revision_date_metadata);
  const alio = alioByRule.get(item.alio_rule_id);
  assert.equal(alio.title, item.alio_title);
  assert.equal(normalizeDate(alio.enacted_or_revised_date), item.revision_date_metadata);
  const attachment = alio.attachments.find((row) => String(row.file_no) === item.alio_attachment_file_no);
  assert.equal(attachment.filename, item.attachment_filename);
  assert.equal(extractionByUrl.get(attachment.download_url).sha256, item.document_sha256);
  assert.equal(item.revision_date_body, item.revision_date_metadata);
  assert.equal(item.availability, "FULLTEXT_PUBLIC");
  assert.ok(item.body_structure.length >= 3);
  for (const number of item.rule_mentions) assert.ok(mentions.some((row) => String(row.post_number) === number && row.normalized_rule_name === sourceRow.row.normalized_name));
}

const notices = correctedNotices.map((notice) => ({
  release_id: CORRECTION_RELEASE_ID,
  notice_id: uuidV5(NAMESPACE, `notice:${notice.number}`),
  notice_number: String(notice.number),
  title: notice.title,
  notice_department: notice.department,
  posted_date: normalizeDate(notice.posted_date),
  source_location: requireHttpUrl(notice.source_page_url, `notice ${notice.number}`),
  linked_regulation_version_ids: [...(linkedByNotice.get(String(notice.number)) ?? [])].sort(),
})).sort((a, b) => Number(a.notice_number) - Number(b.notice_number));

const sourceSnapshotHash = hashCanonical(sourceFiles);
const releaseWithoutProjectionHash = {
  release_id: CORRECTION_RELEASE_ID, collection_cycle_id: BASELINE_CYCLE_ID,
  release_type: "baseline_correction", schema_version: "v0.6",
  evidence_as_of: RELEASE_EVIDENCE_AS_OF, generated_at: GENERATED_AT,
  source_snapshot_hash: sourceSnapshotHash, population: EXPECTED_POPULATION,
  status: "approved", approved_at: GENERATED_AT,
  approved_by: "projection:project_v06_baseline_correction",
};
const projectionHash = hashCanonical({ baseline_release_id: BASELINE_RELEASE_ID, baseline_projection_hash: baselineManifest.projection_hash, release: releaseWithoutProjectionHash, notices, identity_resolution: identityResolution });
const release = { ...releaseWithoutProjectionHash, projection_hash: projectionHash };
const dates = omitted.map((row) => normalizeDate(row.posted_date)).sort();
const manifest = {
  artifact_type: "KODIT_V06_BASELINE_CORRECTION_PROJECTION",
  projection_implementation: "tools/publish/project_v06_baseline_correction.mjs",
  canonical_name: CORRECTION_NAME, correction_release_id: CORRECTION_RELEASE_ID,
  baseline_release_id: BASELINE_RELEASE_ID, collection_cycle_id: BASELINE_CYCLE_ID,
  notice_evidence_as_of: NOTICE_EVIDENCE_AS_OF,
  notice_scrape_collected_at: scrapeManifest.collected_at,
  notice_posted_date_range: [dates[0], dates.at(-1)],
  source_snapshot_hash: sourceSnapshotHash, projection_hash: projectionHash,
  input_artifacts: sourceFiles,
  corrections: { notices_added_to_snapshot: 17, omitted_post_numbers: omitted.map((row) => String(row.number)).sort((a, b) => Number(a) - Number(b)), identity_resolved: identityResolution.items.map((row) => row.regulation_code) },
  expected: { regulations: EXPECTED_POPULATION, notices: EXPECTED_NOTICES, sources: 1035, changes: 0, is_new_or_updated: 0, availability: { FULLTEXT_PUBLIC: 205, NOTICE_ONLY: 831, SOURCE_UNKNOWN: 5, NULL: 0 } },
};
await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

if (args.apply) {
  await runSql(buildSetupSql(release), "correction-setup");
  for (const [index, rows] of chunks(notices, 200).entries()) await runSql(buildNoticeSql(rows), `correction-notices-${index + 1}`);
  await runSql(buildFinalizeSql(release), "correction-finalize");
}
console.log(JSON.stringify({ correction_release_id: CORRECTION_RELEASE_ID, collection_cycle_id: BASELINE_CYCLE_ID, source_snapshot_hash: sourceSnapshotHash, projection_hash: projectionHash, notices: notices.length, omitted_post_numbers: omitted.map((row) => row.number), applied: Boolean(args.apply) }, null, 2));

function buildSetupSql(value) {
  return `begin;
${payloadSql({ release: value })}
do $projection$
declare r jsonb := (select data->'release' from _kodit_v06_payload);
declare v_release_id uuid := (r->>'release_id')::uuid;
begin
  if not exists (select 1 from publish.releases where release_id='${BASELINE_RELEASE_ID}' and status='approved' and collection_cycle_id='${BASELINE_CYCLE_ID}') then raise exception 'approved baseline release is missing' using errcode='23514'; end if;
  if exists (select 1 from publish.releases where release_id=v_release_id) then
    if not exists (select 1 from publish.releases x where x.release_id=v_release_id and x.collection_cycle_id=(r->>'collection_cycle_id')::uuid and x.release_type=r->>'release_type' and x.schema_version=r->>'schema_version' and x.evidence_as_of=(r->>'evidence_as_of')::date and x.generated_at=(r->>'generated_at')::timestamptz and x.source_snapshot_hash=r->>'source_snapshot_hash' and x.projection_hash=r->>'projection_hash' and x.population=(r->>'population')::integer and x.status in ('candidate','approved')) then raise exception 'existing correction release differs' using errcode='23514'; end if;
  else
    insert into publish.releases(release_id,collection_cycle_id,release_type,schema_version,evidence_as_of,generated_at,source_snapshot_hash,projection_hash,population,status)
    values(v_release_id,(r->>'collection_cycle_id')::uuid,r->>'release_type',r->>'schema_version',(r->>'evidence_as_of')::date,(r->>'generated_at')::timestamptz,r->>'source_snapshot_hash',r->>'projection_hash',(r->>'population')::integer,'candidate');
  end if;
  if exists (select 1 from publish.releases where release_id=v_release_id and status='candidate') then
    insert into publish.regulations(release_id,regulation_id,regulation_version_id,regulation_code,display_name,normalized_name,availability,currentness,revision_date,notice_department,source_location,partial_alio,partial_kodit_page,partial_attachment,first_seen_cycle_id,last_changed_cycle_id,is_new,is_updated)
    select v_release_id,b.regulation_id,b.regulation_version_id,b.regulation_code,b.display_name,b.normalized_name,case when b.regulation_code in ('0b2d33b4c927be01','1310b99c022cc337') then 'FULLTEXT_PUBLIC' else b.availability end,b.currentness,b.revision_date,b.notice_department,b.source_location,b.partial_alio,b.partial_kodit_page,b.partial_attachment,b.first_seen_cycle_id,b.last_changed_cycle_id,false,false from publish.regulations b where b.release_id='${BASELINE_RELEASE_ID}' on conflict do nothing;
    insert into publish.regulation_sources(source_id,release_id,regulation_version_id,regulation_code,source_kind,evidence_role,source_location,attachment_name,document_sha256,representation_format,is_primary,fulltext_verified,drm_classification)
    select md5(v_release_id::text||':'||b.source_id::text)::uuid,v_release_id,b.regulation_version_id,b.regulation_code,b.source_kind,case when b.regulation_code in ('0b2d33b4c927be01','1310b99c022cc337') then 'FULLTEXT_REPRESENTATION' else b.evidence_role end,b.source_location,b.attachment_name,b.document_sha256,b.representation_format,b.is_primary,case when b.regulation_code in ('0b2d33b4c927be01','1310b99c022cc337') then true else b.fulltext_verified end,b.drm_classification from publish.regulation_sources b where b.release_id='${BASELINE_RELEASE_ID}' on conflict do nothing;
  end if;
  if (select count(*) from publish.regulations where release_id=v_release_id)<>1041 then raise exception 'correction regulation count mismatch' using errcode='23514'; end if;
  if (select count(*) from publish.regulation_sources where release_id=v_release_id)<>1035 then raise exception 'correction source count mismatch' using errcode='23514'; end if;
  if (select count(*) from publish.regulations where release_id=v_release_id and regulation_code in ('0b2d33b4c927be01','1310b99c022cc337') and availability='FULLTEXT_PUBLIC')<>2 then raise exception 'identity correction mismatch' using errcode='23514'; end if;
  if (select count(*) from publish.regulation_sources where release_id=v_release_id and regulation_code in ('0b2d33b4c927be01','1310b99c022cc337') and evidence_role='FULLTEXT_REPRESENTATION' and fulltext_verified)<>2 then raise exception 'identity source correction mismatch' using errcode='23514'; end if;
end;
$projection$;
commit;`;
}

function buildNoticeSql(rows) {
  return `begin;
${payloadSql({ rows })}
do $projection$
declare p jsonb := (select data from _kodit_v06_payload);
begin
  if exists (select 1 from publish.releases where release_id='${CORRECTION_RELEASE_ID}' and status='candidate') then
    insert into publish.notices(release_id,notice_id,notice_number,title,notice_department,posted_date,source_location,linked_regulation_version_ids)
    select x.release_id,x.notice_id,x.notice_number,x.title,x.notice_department,x.posted_date,x.source_location,array(select jsonb_array_elements_text(x.linked_regulation_version_ids))::uuid[] from jsonb_to_recordset(p->'rows') as x(release_id uuid,notice_id uuid,notice_number text,title text,notice_department text,posted_date date,source_location text,linked_regulation_version_ids jsonb) on conflict do nothing;
  end if;
  if exists (select 1 from jsonb_array_elements(p->'rows') e left join publish.notices a on a.release_id=(e->>'release_id')::uuid and a.notice_id=(e->>'notice_id')::uuid where a.notice_id is null or to_jsonb(a)<>e) then raise exception 'existing correction notice differs' using errcode='23514'; end if;
end;
$projection$;
commit;`;
}

function buildFinalizeSql(value) {
  return `begin;
select pg_advisory_xact_lock(hashtextextended('kodit:publish:current_release',0));
${payloadSql({ release: value })}
do $projection$
declare r jsonb := (select data->'release' from _kodit_v06_payload);
begin
  if (select count(*) from publish.notices where release_id='${CORRECTION_RELEASE_ID}')<>2089 then raise exception 'correction notice count mismatch' using errcode='23514'; end if;
  if (select count(*) from publish.notices where release_id='${CORRECTION_RELEASE_ID}' and notice_number::integer between 2073 and 2089)<>17 then raise exception '17 corrected notices incomplete' using errcode='23514'; end if;
  if exists (select 1 from publish.regulations where release_id='${CORRECTION_RELEASE_ID}' and (is_new or is_updated)) then raise exception 'baseline correction cannot set NEW/UPDATED' using errcode='23514'; end if;
  if exists (select 1 from publish.regulation_changes where release_id='${CORRECTION_RELEASE_ID}') then raise exception 'baseline correction cannot add changes' using errcode='23514'; end if;
  if exists (select 1 from publish.regulations where release_id='${CORRECTION_RELEASE_ID}' and availability is null) then raise exception 'correction retains NULL availability' using errcode='23514'; end if;
  update publish.releases set status='approved',approved_at=(r->>'approved_at')::timestamptz,approved_by=r->>'approved_by' where release_id='${CORRECTION_RELEASE_ID}' and status='candidate';
  if not exists (select 1 from publish.releases where release_id='${CORRECTION_RELEASE_ID}' and status='approved') then raise exception 'correction release not approved' using errcode='23514'; end if;
  if exists (select 1 from publish.current_release where release_id not in ('${BASELINE_RELEASE_ID}','${CORRECTION_RELEASE_ID}')) then raise exception 'unexpected current release' using errcode='55000'; end if;
  update publish.current_release set release_id='${CORRECTION_RELEASE_ID}',changed_at=(r->>'approved_at')::timestamptz,changed_by=r->>'approved_by' where singleton_key and release_id='${BASELINE_RELEASE_ID}';
  if not exists (select 1 from publish.current_release where singleton_key and release_id='${CORRECTION_RELEASE_ID}') then raise exception 'current pointer correction failed' using errcode='23514'; end if;
end;
$projection$;
commit;`;
}

function payloadSql(value) { return `create temp table _kodit_v06_payload(data jsonb not null) on commit drop;\ninsert into _kodit_v06_payload values(convert_from(decode('${Buffer.from(JSON.stringify(value), "utf8").toString("base64")}', 'base64'),'UTF8')::jsonb);`; }
async function runSql(sql,label){const file=path.join(os.tmpdir(),`kodit-v06-${label}-${process.pid}.sql`);try{await fs.writeFile(file,sql,{flag:"wx"});const command=process.platform==="win32"?(process.env.ComSpec??"cmd.exe"):"npx";const commandArgs=process.platform==="win32"?["/d","/s","/c","npx.cmd","--yes","supabase@latest","db","query","--linked","--file",file]:["--yes","supabase@latest","db","query","--linked","--file",file];execFileSync(command,commandArgs,{cwd:ROOT,stdio:"inherit"});}finally{await fs.rm(file,{force:true});}}
function chunks(values,size){const result=[];for(let index=0;index<values.length;index+=size)result.push(values.slice(index,index+size));return result;}
function parseArgs(argv){const result={};for(let index=0;index<argv.length;index++){const arg=argv[index];if(arg==="--apply")result.apply=true;else if(arg.startsWith("--")){const value=argv[++index];if(!value||value.startsWith("--"))throw new Error(`missing value for ${arg}`);result[arg.slice(2)]=value;}else throw new Error(`unexpected argument: ${arg}`);}return result;}
function repo(relative){return path.join(ROOT,...relative.split("/"));} function evidence(relative){return path.join(evidenceRoot,...relative.split("/"));}
function logicalPath(file){const relative=path.relative(ROOT,file);return !relative.startsWith("..")&&!path.isAbsolute(relative)?`repo:${relative.replaceAll("\\","/")}`:`evidence-root:${path.relative(evidenceRoot,file).replaceAll("\\","/")}`;}
function sha256(value){return crypto.createHash("sha256").update(value).digest("hex");} function hashCanonical(value){return sha256(Buffer.from(stableStringify(value),"utf8"));}
function stableStringify(value){if(Array.isArray(value))return`[${value.map(stableStringify).join(",")}]`;if(value&&typeof value==="object")return`{${Object.keys(value).sort().map((key)=>`${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;return JSON.stringify(value);}
function uuidV5(namespace,name){const bytes=crypto.createHash("sha1").update(Buffer.concat([Buffer.from(namespace.replaceAll("-",""),"hex"),Buffer.from(name,"utf8")])).digest().subarray(0,16);bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;const hex=bytes.toString("hex");return`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;}
function normalizeDate(value){const match=String(value??"").trim().match(/^(\d{4})[.-](\d{2})[.-](\d{2})\.?$/);if(!match)throw new Error(`invalid date: ${value}`);return`${match[1]}-${match[2]}-${match[3]}`;}
function requireHttpUrl(value,label){try{const url=new URL(value);if(!["http:","https:"].includes(url.protocol))throw new Error();return value;}catch{throw new Error(`invalid URL for ${label}`);}}
function parseCsv(text){const records=[];let record=[],cell="",quoted=false;const input=text.replace(/^\uFEFF/,"");for(let index=0;index<input.length;index++){const char=input[index];if(quoted&&char==='"'&&input[index+1]==='"'){cell+='"';index++;}else if(char==='"')quoted=!quoted;else if(char===","&&!quoted){record.push(cell);cell="";}else if((char==="\n"||char==="\r")&&!quoted){if(char==="\r"&&input[index+1]==="\n")index++;record.push(cell);cell="";if(record.some((value)=>value!==""))records.push(record);record=[];}else cell+=char;}if(cell||record.length){record.push(cell);records.push(record);}assert.equal(quoted,false);const[headers,...rows]=records;return rows.map((values)=>Object.fromEntries(headers.map((header,index)=>[header,values[index]??""])));}
