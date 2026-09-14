#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const PUBLISH_NAMESPACE = "71e07e7a-8e4e-569c-86cf-38cde51739a7";
const BASELINE_NAME = "kodit:v0.6:baseline:2026-09-14";
const BASELINE_RELEASE_ID = "9a87d0c2-2901-5fc8-bceb-f068f02b697a";
const BASELINE_CYCLE_NAME = "kodit:v0.6:baseline-cycle:2026-09-14";
const BASELINE_CYCLE_ID = "3773771c-af63-570a-ad4d-1fae255da383";
const EXPECTED_POPULATION = 1041;
const GENERATED_AT = "2026-09-14T21:00:00+09:00";
const EVIDENCE_AS_OF = "2026-09-13";

const args = parseArgs(process.argv.slice(2));
if (!args["evidence-root"]) throw new Error("--evidence-root is required; no machine-specific evidence path is inferred");
const evidenceRoot = path.resolve(args["evidence-root"]);
const outputDir = path.resolve(args["output-dir"] ?? path.join(ROOT, "reports/projections/2026-09-14-v06-baseline"));

const inputs = {
  regulationsCsv: repo("apps/public-site/data/review-20260913-reconstructed/regulations.csv"),
  reconstructedManifest: repo("apps/public-site/data/review-20260913-reconstructed/manifest.json"),
  hwpMeasurements: repo("reports/measurements/2026-09-13-runtime-v1-reproduction/hwp/batch-run.json"),
  hwpxMeasurements: repo("reports/measurements/2026-09-13-runtime-v1-reproduction/hwpx/batch-run.json"),
  pdfMeasurements: repo("reports/measurements/2026-09-13-pdf-full-corpus/batch-run.json"),
  drmMeasurements: repo("reports/measurements/2026-09-13-other-corpus/classification.json"),
  ruleMentions: evidence("outputs/019fa475-b3fc-7522-934f-878c4256772a/06_게시물별_규정명_언급행_전체.csv"),
  extractionManifest: evidence("outputs/019fa475-b3fc-7522-934f-878c4256772a/07_첨부_SHA256_매니페스트.csv"),
  preannouncements: evidence("howareyou-sinbo-site/kodit_preannouncements.json"),
  alioRules: evidence("howareyou-sinbo-site/alio_internal_rules.json"),
};

assert.equal(uuidV5(PUBLISH_NAMESPACE, BASELINE_NAME), BASELINE_RELEASE_ID, "baseline release UUID contract changed");
assert.equal(uuidV5(PUBLISH_NAMESPACE, BASELINE_CYCLE_NAME), BASELINE_CYCLE_ID, "baseline cycle UUID contract changed");

const sourceFiles = await Promise.all(Object.entries(inputs).map(async ([name, file]) => ({
  name, path: logicalPath(file), sha256: sha256(await fs.readFile(file)),
})));
sourceFiles.sort((a, b) => a.name.localeCompare(b.name));
const sourceSnapshotHash = hashCanonical(sourceFiles);
const specRegistry = [
  {
    spec_code: "publish-schema",
    spec_version: "v0.6.0",
    artifact_path: "supabase/migrations/20260914000100_publish_read_model.sql",
    artifact_sha256: sha256(await fs.readFile(repo("supabase/migrations/20260914000100_publish_read_model.sql"))),
    effective_at: GENERATED_AT,
  },
  {
    spec_code: "baseline-projection",
    spec_version: "v0.6.0",
    artifact_path: "tools/publish/project_v06_baseline.mjs",
    artifact_sha256: sha256(await fs.readFile(new URL(import.meta.url))),
    effective_at: GENERATED_AT,
  },
];

const [regulationText, mentionText, extractionText, noticeText, alioText, hwpText, hwpxText, pdfText, drmText] = await Promise.all([
  fs.readFile(inputs.regulationsCsv, "utf8"), fs.readFile(inputs.ruleMentions, "utf8"),
  fs.readFile(inputs.extractionManifest, "utf8"), fs.readFile(inputs.preannouncements, "utf8"),
  fs.readFile(inputs.alioRules, "utf8"), fs.readFile(inputs.hwpMeasurements, "utf8"),
  fs.readFile(inputs.hwpxMeasurements, "utf8"), fs.readFile(inputs.pdfMeasurements, "utf8"),
  fs.readFile(inputs.drmMeasurements, "utf8"),
]);

const legacyRows = parseCsv(regulationText);
const mentions = parseCsv(mentionText);
const extractionRows = parseCsv(extractionText).filter((row) => row.status === "downloaded" && /^[0-9a-f]{64}$/.test(row.sha256));
const noticeInventory = JSON.parse(noticeText);
const alioInventory = JSON.parse(alioText);
const parserBatches = { HWP: JSON.parse(hwpText), HWPX: JSON.parse(hwpxText), PDF: JSON.parse(pdfText) };
const drmInventory = JSON.parse(drmText);

assert.equal(legacyRows.length, EXPECTED_POPULATION, "baseline population is not 1,041");
const sourceRows = legacyRows.map((row) => ({
  row,
  regulationId: uuidV5(PUBLISH_NAMESPACE, `regulation:${row.regulation_code}`),
  regulationVersionId: uuidV5(PUBLISH_NAMESPACE, `regulation-version:${hashCanonical(row)}`),
}));
assert.equal(new Set(sourceRows.map((item) => item.regulationVersionId)).size, EXPECTED_POPULATION, "regulation-version identity is not unique");

const parserFormatBySha = new Map();
for (const [format, batch] of Object.entries(parserBatches)) {
  for (const item of batch.results) setConsistent(parserFormatBySha, item.baseline_sha256, format, "parser format");
}
const drmBySha = new Map();
for (const item of drmInventory.results) {
  if (["DRMONE_CONTAINER", "FASOO_SECURE_CONTAINER"].includes(item.classification)) {
    setConsistent(drmBySha, item.baseline_sha256, item.classification, "DRM classification");
  }
}

const extractionByUrl = new Map();
for (const row of extractionRows) {
  const prior = extractionByUrl.get(row.download_url);
  if (prior && (prior.sha256 !== row.sha256 || prior.filename !== row.filename)) {
    throw new Error(`conflicting extraction observations for ${row.download_url}`);
  }
  extractionByUrl.set(row.download_url, row);
}

const alioByAttachmentUrl = new Map();
for (const rule of alioInventory) {
  for (const attachment of rule.attachments ?? []) {
    setConsistent(alioByAttachmentUrl, attachment.download_url, {
      title: rule.title, revisionDate: normalizeDate(rule.enacted_or_revised_date),
    }, "ALIO attachment", (a, b) => a.title === b.title && a.revisionDate === b.revisionDate);
  }
}

const noticeByNumber = new Map(noticeInventory.map((notice) => [String(notice.number), notice]));
assert.equal(noticeByNumber.size, noticeInventory.length, "notice number is not unique");
const versionsByNormalizedName = new Map();
for (const item of sourceRows) {
  if (!versionsByNormalizedName.has(item.row.normalized_name)) versionsByNormalizedName.set(item.row.normalized_name, []);
  versionsByNormalizedName.get(item.row.normalized_name).push(item);
}
const noticeNumbersByVersion = new Map();
for (const mention of mentions) {
  const versions = versionsByNormalizedName.get(mention.normalized_rule_name);
  if (!versions || !noticeByNumber.has(String(mention.post_number))) continue;
  for (const item of versions) {
    if (!noticeNumbersByVersion.has(item.regulationVersionId)) noticeNumbersByVersion.set(item.regulationVersionId, new Set());
    noticeNumbersByVersion.get(item.regulationVersionId).add(String(mention.post_number));
  }
}
assert.equal(noticeNumbersByVersion.size, 982, "notice-to-regulation exact linkage coverage changed");

const latestNoticeByVersion = new Map();
for (const [versionId, numbers] of noticeNumbersByVersion) {
  const linked = [...numbers].map((number) => noticeByNumber.get(number)).sort(compareNoticeDescending);
  const latest = linked[0];
  const sameRank = linked.filter((item) => normalizeDate(item.posted_date) === normalizeDate(latest.posted_date) && numericText(item.number) === numericText(latest.number));
  assert.equal(new Set(sameRank.map((item) => item.department)).size, 1, `ambiguous latest notice department for ${versionId}`);
  latestNoticeByVersion.set(versionId, latest);
}

const regulationVersionsByNotice = new Map();
for (const [versionId, numbers] of noticeNumbersByVersion) {
  for (const number of numbers) {
    if (!regulationVersionsByNotice.has(number)) regulationVersionsByNotice.set(number, []);
    regulationVersionsByNotice.get(number).push(versionId);
  }
}

const regulations = [];
const sources = [];
for (const item of sourceRows) {
  const { row, regulationId, regulationVersionId } = item;
  const sourceLocation = validHttpUrl(row.official_url) ? row.official_url : null;
  const extraction = sourceLocation ? extractionByUrl.get(sourceLocation) : null;
  const availability = ["FULLTEXT_PUBLIC", "PARTIAL_PUBLIC", "NOTICE_ONLY", "SOURCE_UNKNOWN"].includes(row.public_status_code) ? row.public_status_code : null;
  const partial = availability === "PARTIAL_PUBLIC";
  const sourceKind = sourceLocation ? classifySource(sourceLocation) : null;
  const latestNotice = latestNoticeByVersion.get(regulationVersionId);
  const revisionDate = normalizeDate(row.revision_date);

  if (sourceKind === "ALIO" && sourceLocation) {
    const alio = alioByAttachmentUrl.get(sourceLocation);
    if (alio && revisionDate && alio.revisionDate && revisionDate !== alio.revisionDate) throw new Error(`ALIO revision date conflict for ${row.regulation_code}`);
  }

  regulations.push({
    release_id: BASELINE_RELEASE_ID,
    regulation_id: regulationId,
    regulation_version_id: regulationVersionId,
    regulation_code: row.regulation_code,
    display_name: row.regulation_name,
    normalized_name: row.normalized_name,
    availability,
    currentness: row.lifecycle_code === "unknown" ? null : normalizeCurrentness(row.lifecycle_code),
    revision_date: revisionDate,
    notice_department: latestNotice?.department ?? null,
    source_location: sourceLocation,
    partial_alio: partial && sourceKind === "ALIO",
    partial_kodit_page: false,
    partial_attachment: partial && sourceKind === "KODIT_ATTACHMENT",
    first_seen_cycle_id: null,
    last_changed_cycle_id: null,
    is_new: false,
    is_updated: false,
  });

  if (sourceLocation) {
    const documentSha = extraction?.sha256 ?? null;
    const format = documentSha ? parserFormatBySha.get(documentSha) ?? formatFromFilename(extraction?.filename) : null;
    const fulltextVerified = availability === "FULLTEXT_PUBLIC" && row.document_sha256 === documentSha;
    sources.push({
      source_id: uuidV5(PUBLISH_NAMESPACE, `source:${regulationVersionId}:${sourceLocation}`),
      release_id: BASELINE_RELEASE_ID,
      regulation_version_id: regulationVersionId,
      regulation_code: row.regulation_code,
      source_kind: sourceKind,
      evidence_role: fulltextVerified ? "FULLTEXT_REPRESENTATION" : availability === "PARTIAL_PUBLIC" ? "PARTIAL_EVIDENCE" : sourceKind === "KODIT_ATTACHMENT" ? "NOTICE_EVIDENCE" : "OTHER_EVIDENCE",
      source_location: sourceLocation,
      attachment_name: extraction?.filename || null,
      document_sha256: documentSha,
      representation_format: format,
      is_primary: true,
      fulltext_verified: fulltextVerified,
      drm_classification: documentSha ? drmBySha.get(documentSha) ?? null : null,
    });
  }
}

const notices = noticeInventory.map((notice) => ({
  release_id: BASELINE_RELEASE_ID,
  notice_id: uuidV5(PUBLISH_NAMESPACE, `notice:${notice.number}`),
  notice_number: String(notice.number),
  title: notice.title,
  notice_department: notice.department,
  posted_date: normalizeDate(notice.posted_date),
  source_location: requireHttpUrl(notice.source_page_url, `notice ${notice.number}`),
  linked_regulation_version_ids: [...(regulationVersionsByNotice.get(String(notice.number)) ?? [])].sort(),
})).sort((a, b) => numericText(a.notice_number) - numericText(b.notice_number));

regulations.sort((a, b) => a.regulation_code.localeCompare(b.regulation_code));
sources.sort((a, b) => a.source_id.localeCompare(b.source_id));
const changes = [];
const payloadWithoutHash = {
  contract: {
    namespace: PUBLISH_NAMESPACE, baseline_name: BASELINE_NAME, baseline_release_id: BASELINE_RELEASE_ID,
    baseline_cycle_name: BASELINE_CYCLE_NAME, baseline_cycle_id: BASELINE_CYCLE_ID, expected_population: EXPECTED_POPULATION,
  },
  release: {
    release_id: BASELINE_RELEASE_ID, collection_cycle_id: BASELINE_CYCLE_ID, release_type: "baseline",
    schema_version: "v0.6", evidence_as_of: EVIDENCE_AS_OF, generated_at: GENERATED_AT,
    source_snapshot_hash: sourceSnapshotHash, population: EXPECTED_POPULATION, status: "approved",
    approved_at: GENERATED_AT, approved_by: "projection:project_v06_baseline",
  },
  current_release: {
    singleton_key: true, release_id: BASELINE_RELEASE_ID, changed_at: GENERATED_AT,
    changed_by: "projection:project_v06_baseline",
  },
  regulations, regulation_sources: sources, notices, regulation_changes: changes, spec_registry: specRegistry,
};
const projectionHash = hashCanonical(payloadWithoutHash);
const payload = { ...payloadWithoutHash, release: { ...payloadWithoutHash.release, projection_hash: projectionHash } };

const coverage = {
  regulations: regulations.length,
  source_location_non_null: regulations.filter((row) => row.source_location).length,
  source_location_null: regulations.filter((row) => !row.source_location).length,
  notice_department_non_null: regulations.filter((row) => row.notice_department).length,
  revision_date_non_null: regulations.filter((row) => row.revision_date).length,
  document_source_linkage: sources.filter((row) => row.document_sha256).length,
  fulltext_source_linkage: sources.filter((row) => row.fulltext_verified).length,
  alio_inventory_linkage: sources.filter((row) => row.source_kind === "ALIO" && alioByAttachmentUrl.has(row.source_location)).length,
  notice_inventory: notices.length,
  notice_rows_with_regulation_links: notices.filter((row) => row.linked_regulation_version_ids.length > 0).length,
  regulation_changes: changes.length,
  partial_alio: regulations.filter((row) => row.partial_alio).length,
  partial_kodit_page: regulations.filter((row) => row.partial_kodit_page).length,
  partial_attachment: regulations.filter((row) => row.partial_attachment).length,
  availability: countBy(regulations, (row) => row.availability ?? "NULL"),
};
assert.deepEqual({ nonNull: coverage.source_location_non_null, null: coverage.source_location_null }, { nonNull: 1035, null: 6 }, "source-location coverage changed");
assert.equal(coverage.notice_department_non_null, 982, "notice-department coverage changed");
assert.equal(coverage.revision_date_non_null, 205, "revision-date coverage changed");
assert.equal(coverage.document_source_linkage, 1015, "document/source linkage coverage changed");
assert.ok(regulations.every((row) => !row.is_new && !row.is_updated), "baseline rows must not be NEW or UPDATED");

const manifest = {
  artifact_type: "KODIT_V06_BASELINE_PROJECTION",
  projection_implementation: "tools/publish/project_v06_baseline.mjs",
  namespace: PUBLISH_NAMESPACE,
  canonical_name: BASELINE_NAME,
  baseline_release_id: BASELINE_RELEASE_ID,
  baseline_collection_cycle_id: BASELINE_CYCLE_ID,
  schema_version: "v0.6",
  evidence_as_of: EVIDENCE_AS_OF,
  generated_at: GENERATED_AT,
  source_snapshot_hash: sourceSnapshotHash,
  projection_hash: projectionHash,
  input_artifacts: sourceFiles,
  spec_registry: specRegistry,
  deterministic_joins: [
    "regulation.normalized_name -> rule_mentions.normalized_rule_name -> post_number -> preannouncement.number",
    "regulation.official_url -> extraction_manifest.download_url -> sha256/filename/source kind",
    "extraction_manifest.sha256 -> parser measurement baseline_sha256 -> representation format",
    "extraction_manifest.sha256 -> DRM measurement baseline_sha256 -> DRM classification",
  ],
  source_exception_policy: "retain regulation row with source_location NULL; never infer SOURCE_UNKNOWN from the missing link",
  coverage,
};

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

if (args.apply) {
  await runSql(buildSetupSql(payload), "setup");
  for (const [index, rows] of chunks(regulations, 200).entries()) await runSql(buildRegulationBatchSql(rows), `regulations-${index + 1}`);
  for (const [index, rows] of chunks(sources, 200).entries()) await runSql(buildSourceBatchSql(rows), `sources-${index + 1}`);
  for (const [index, rows] of chunks(notices, 200).entries()) await runSql(buildNoticeBatchSql(rows), `notices-${index + 1}`);
  await runSql(buildFinalizeSql(payload), "finalize");
}

console.log(JSON.stringify({ baseline_release_id: BASELINE_RELEASE_ID, projection_hash: projectionHash, source_snapshot_hash: sourceSnapshotHash, coverage, applied: Boolean(args.apply) }, null, 2));

function payloadSql(value) {
  const encoded = Buffer.from(JSON.stringify(value), "utf8").toString("base64");
  return `create temp table _kodit_v06_payload (data jsonb not null) on commit drop;
insert into _kodit_v06_payload(data) values (convert_from(decode('${encoded}', 'base64'), 'UTF8')::jsonb);`;
}

function buildSetupSql(value) {
  return `begin;
${payloadSql({ release: value.release, spec_registry: value.spec_registry })}
do $projection$
declare p jsonb := (select data from _kodit_v06_payload);
declare r jsonb := p->'release';
declare v_release_id uuid := (r->>'release_id')::uuid;
begin
  insert into publish.spec_registry(spec_code, spec_version, artifact_path, artifact_sha256, effective_at)
  select x.spec_code, x.spec_version, x.artifact_path, x.artifact_sha256, x.effective_at
  from jsonb_to_recordset(p->'spec_registry') as x(spec_code text, spec_version text, artifact_path text, artifact_sha256 text, effective_at timestamptz)
  on conflict (spec_code, spec_version) do nothing;
  if exists (
    select 1 from jsonb_to_recordset(p->'spec_registry') as x(spec_code text, spec_version text, artifact_path text, artifact_sha256 text, effective_at timestamptz)
    left join publish.spec_registry s using (spec_code, spec_version)
    where s.spec_code is null or s.artifact_path <> x.artifact_path or s.artifact_sha256 <> x.artifact_sha256 or s.effective_at <> x.effective_at
  ) then raise exception 'existing spec registry differs from deterministic projection' using errcode = '23514'; end if;

  if exists (select 1 from publish.releases where release_id = v_release_id) then
    if not exists (
      select 1 from publish.releases x where x.release_id = v_release_id
        and x.collection_cycle_id = (r->>'collection_cycle_id')::uuid and x.release_type = r->>'release_type'
        and x.schema_version = r->>'schema_version' and x.evidence_as_of = (r->>'evidence_as_of')::date
        and x.generated_at = (r->>'generated_at')::timestamptz and x.source_snapshot_hash = r->>'source_snapshot_hash'
        and x.projection_hash = r->>'projection_hash' and x.population = (r->>'population')::integer
        and x.status in ('candidate', 'approved')
    ) then raise exception 'existing baseline release metadata differs from deterministic projection' using errcode = '23514'; end if;
  else
    insert into publish.releases (release_id, collection_cycle_id, release_type, schema_version, evidence_as_of, generated_at, source_snapshot_hash, projection_hash, population, status)
    values (v_release_id, (r->>'collection_cycle_id')::uuid, r->>'release_type', r->>'schema_version', (r->>'evidence_as_of')::date,
      (r->>'generated_at')::timestamptz, r->>'source_snapshot_hash', r->>'projection_hash', (r->>'population')::integer, 'candidate');
  end if;
end;
$projection$;
commit;
`;
}

function buildRegulationBatchSql(rows) {
  return `begin;
${payloadSql({ rows })}
do $projection$
declare p jsonb := (select data from _kodit_v06_payload);
declare v_release_id uuid := '${BASELINE_RELEASE_ID}';
begin
  if exists (select 1 from publish.releases where release_id = v_release_id and status = 'candidate') then
    insert into publish.regulations (release_id, regulation_id, regulation_version_id, regulation_code, display_name, normalized_name, availability, currentness, revision_date, notice_department, source_location, partial_alio, partial_kodit_page, partial_attachment, first_seen_cycle_id, last_changed_cycle_id, is_new, is_updated)
    select x.release_id, x.regulation_id, x.regulation_version_id, x.regulation_code, x.display_name, x.normalized_name, x.availability, x.currentness, x.revision_date, x.notice_department, x.source_location, x.partial_alio, x.partial_kodit_page, x.partial_attachment, x.first_seen_cycle_id, x.last_changed_cycle_id, x.is_new, x.is_updated
    from jsonb_to_recordset(p->'rows') as x(release_id uuid, regulation_id uuid, regulation_version_id uuid, regulation_code text, display_name text, normalized_name text, availability text, currentness text, revision_date date, notice_department text, source_location text, partial_alio boolean, partial_kodit_page boolean, partial_attachment boolean, first_seen_cycle_id uuid, last_changed_cycle_id uuid, is_new boolean, is_updated boolean)
    on conflict (release_id, regulation_version_id) do nothing;
  end if;
  if exists (
    select 1 from jsonb_array_elements(p->'rows') expected
    left join publish.regulations actual on actual.release_id = (expected->>'release_id')::uuid and actual.regulation_version_id = (expected->>'regulation_version_id')::uuid
    where actual.regulation_version_id is null or (to_jsonb(actual) - 'official_source_available') <> expected
  ) then raise exception 'existing regulation batch differs from deterministic projection' using errcode = '23514'; end if;
end;
$projection$;
commit;
`;
}

function buildSourceBatchSql(rows) {
  return `begin;
${payloadSql({ rows })}
do $projection$
declare p jsonb := (select data from _kodit_v06_payload);
declare v_release_id uuid := '${BASELINE_RELEASE_ID}';
begin
  if exists (select 1 from publish.releases where release_id = v_release_id and status = 'candidate') then
    insert into publish.regulation_sources (source_id, release_id, regulation_version_id, regulation_code, source_kind, evidence_role, source_location, attachment_name, document_sha256, representation_format, is_primary, fulltext_verified, drm_classification)
    select x.source_id, x.release_id, x.regulation_version_id, x.regulation_code, x.source_kind, x.evidence_role, x.source_location, x.attachment_name, x.document_sha256, x.representation_format, x.is_primary, x.fulltext_verified, x.drm_classification
    from jsonb_to_recordset(p->'rows') as x(source_id uuid, release_id uuid, regulation_version_id uuid, regulation_code text, source_kind text, evidence_role text, source_location text, attachment_name text, document_sha256 text, representation_format text, is_primary boolean, fulltext_verified boolean, drm_classification text)
    on conflict (source_id) do nothing;
  end if;
  if exists (
    select 1 from jsonb_array_elements(p->'rows') expected
    left join publish.regulation_sources actual on actual.source_id = (expected->>'source_id')::uuid
    where actual.source_id is null or to_jsonb(actual) <> expected
  ) then raise exception 'existing source batch differs from deterministic projection' using errcode = '23514'; end if;
end;
$projection$;
commit;
`;
}

function buildNoticeBatchSql(rows) {
  return `begin;
${payloadSql({ rows })}
do $projection$
declare p jsonb := (select data from _kodit_v06_payload);
declare v_release_id uuid := '${BASELINE_RELEASE_ID}';
begin
  if exists (select 1 from publish.releases where release_id = v_release_id and status = 'candidate') then
    insert into publish.notices (release_id, notice_id, notice_number, title, notice_department, posted_date, source_location, linked_regulation_version_ids)
    select x.release_id, x.notice_id, x.notice_number, x.title, x.notice_department, x.posted_date, x.source_location, array(select jsonb_array_elements_text(x.linked_regulation_version_ids))::uuid[]
    from jsonb_to_recordset(p->'rows') as x(release_id uuid, notice_id uuid, notice_number text, title text, notice_department text, posted_date date, source_location text, linked_regulation_version_ids jsonb)
    on conflict (release_id, notice_id) do nothing;
  end if;
  if exists (
    select 1 from jsonb_array_elements(p->'rows') expected
    left join publish.notices actual on actual.release_id = (expected->>'release_id')::uuid and actual.notice_id = (expected->>'notice_id')::uuid
    where actual.notice_id is null or to_jsonb(actual) <> expected
  ) then raise exception 'existing notice batch differs from deterministic projection' using errcode = '23514'; end if;
end;
$projection$;
commit;
`;
}

function buildFinalizeSql(value) {
  return `begin;
select pg_advisory_xact_lock(hashtextextended('kodit:publish:current_release', 0));
${payloadSql({ release: value.release, current_release: value.current_release, counts: { regulations: value.regulations.length, sources: value.regulation_sources.length, notices: value.notices.length } })}
do $projection$
declare p jsonb := (select data from _kodit_v06_payload);
declare r jsonb := p->'release';
declare v_release_id uuid := (r->>'release_id')::uuid;
declare v_count bigint;
begin
  select count(*) into v_count from publish.regulations where release_id = v_release_id;
  if v_count <> (p->'counts'->>'regulations')::integer then raise exception 'baseline regulation population mismatch: %', v_count using errcode = '23514'; end if;
  select count(*) into v_count from publish.regulation_sources where release_id = v_release_id;
  if v_count <> (p->'counts'->>'sources')::integer then raise exception 'baseline source linkage count mismatch: %', v_count using errcode = '23514'; end if;
  select count(*) into v_count from publish.notices where release_id = v_release_id;
  if v_count <> (p->'counts'->>'notices')::integer then raise exception 'baseline notice count mismatch: %', v_count using errcode = '23514'; end if;
  select count(*) into v_count from publish.regulation_changes where release_id = v_release_id;
  if v_count <> 0 then raise exception 'baseline must not contain NEW/UPDATED changes' using errcode = '23514'; end if;
  update publish.releases set status = 'approved', approved_at = (r->>'approved_at')::timestamptz, approved_by = r->>'approved_by'
  where release_id = v_release_id and status = 'candidate';
  if not exists (select 1 from publish.releases where release_id = v_release_id and status = 'approved') then raise exception 'baseline release is not approved' using errcode = '23514'; end if;
  if not exists (select 1 from publish.current_release) then
    insert into publish.current_release(singleton_key, release_id, changed_at, changed_by)
    values (true, v_release_id, (p->'current_release'->>'changed_at')::timestamptz, p->'current_release'->>'changed_by');
  elsif not exists (select 1 from publish.current_release where singleton_key and release_id = v_release_id) then
    raise exception 'current release already points to a different approved release' using errcode = '55000';
  end if;
end;
$projection$;
commit;
`;
}

async function runSql(sql, label) {
  const tempFile = path.join(os.tmpdir(), `kodit-v06-${label}-${process.pid}.sql`);
  try {
    await fs.writeFile(tempFile, sql, { flag: "wx" });
    const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npx";
    const commandArgs = process.platform === "win32"
      ? ["/d", "/s", "/c", "npx.cmd", "--yes", "supabase@latest", "db", "query", "--linked", "--file", tempFile]
      : ["--yes", "supabase@latest", "db", "query", "--linked", "--file", tempFile];
    execFileSync(command, commandArgs, { cwd: ROOT, stdio: "inherit" });
  } finally {
    await fs.rm(tempFile, { force: true });
  }
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--apply") result.apply = true;
    else if (arg.startsWith("--")) {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`missing value for ${arg}`);
      result[arg.slice(2)] = value;
    } else throw new Error(`unexpected argument: ${arg}`);
  }
  return result;
}
function repo(relative) { return path.join(ROOT, ...relative.split("/")); }
function evidence(relative) { return path.join(evidenceRoot, ...relative.split("/")); }
function logicalPath(file) {
  const relativeRepo = path.relative(ROOT, file);
  if (!relativeRepo.startsWith("..") && !path.isAbsolute(relativeRepo)) return `repo:${relativeRepo.replaceAll("\\", "/")}`;
  return `evidence-root:${path.relative(evidenceRoot, file).replaceAll("\\", "/")}`;
}
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function hashCanonical(value) { return sha256(Buffer.from(stableStringify(value), "utf8")); }
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function uuidV5(namespace, name) {
  const bytes = crypto.createHash("sha1").update(Buffer.concat([Buffer.from(namespace.replaceAll("-", ""), "hex"), Buffer.from(name, "utf8")])).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function parseCsv(text) {
  const records = []; let record = [], cell = "", quoted = false; const input = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (quoted && char === '"' && input[index + 1] === '"') { cell += '"'; index++; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { record.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[index + 1] === "\n") index++;
      record.push(cell); cell = ""; if (record.some((value) => value !== "")) records.push(record); record = [];
    } else cell += char;
  }
  if (cell || record.length) { record.push(cell); records.push(record); }
  assert.equal(quoted, false, "unterminated CSV quote");
  const [headers, ...rows] = records;
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}
function setConsistent(map, key, value, label, equals = (a, b) => a === b) {
  const prior = map.get(key); if (prior !== undefined && !equals(prior, value)) throw new Error(`conflicting ${label} for ${key}`); map.set(key, value);
}
function normalizeDate(value) {
  if (!value) return null; const match = String(value).trim().match(/^(\d{4})[.-](\d{2})[.-](\d{2})\.?$/);
  if (!match) throw new Error(`invalid date: ${value}`); return `${match[1]}-${match[2]}-${match[3]}`;
}
function normalizeCurrentness(value) {
  const map = { current: "current_confirmed", past: "past_version", abolished: "abolished", merged: "merged", unverified: "currentness_unverified", unresolved: "currentness_unresolved" };
  if (!map[value]) throw new Error(`unsupported currentness value: ${value}`); return map[value];
}
function validHttpUrl(value) { if (!value) return false; try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; } }
function requireHttpUrl(value, label) { if (!validHttpUrl(value)) throw new Error(`invalid source URL for ${label}`); return value; }
function classifySource(url) {
  const host = new URL(url).hostname.toLowerCase();
  if (host === "alio.go.kr" || host.endsWith(".alio.go.kr")) return "ALIO";
  if (host === "kodit.or.kr" || host.endsWith(".kodit.or.kr")) return url.includes("nttFileDownload") ? "KODIT_ATTACHMENT" : "KODIT_PAGE";
  return "OFFICIAL_OTHER";
}
function formatFromFilename(filename) {
  const extension = path.extname(filename ?? "").toLowerCase();
  return ({ ".pdf": "PDF", ".hwp": "HWP", ".hwpx": "HWPX", ".html": "HTML", ".htm": "HTML", ".zip": "ZIP" })[extension] ?? "OTHER";
}
function numericText(value) { const number = Number(value); return Number.isFinite(number) ? number : -1; }
function compareNoticeDescending(a, b) { return normalizeDate(b.posted_date).localeCompare(normalizeDate(a.posted_date)) || numericText(b.number) - numericText(a.number); }
function countBy(rows, selector) {
  const result = {}; for (const row of rows) { const key = selector(row); result[key] = (result[key] ?? 0) + 1; }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}
