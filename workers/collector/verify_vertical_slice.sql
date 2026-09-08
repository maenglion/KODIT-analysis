with target as (
  select 'd4a734b94bfdafec03e267a3ef592dbc02c923eb98a43f0737d455298dd38804'::char(64) sha
), target_regulation as (
  select regulation_id from core.regulations where canonical_name='투자옵션부보증 운용기준'
), target_version as (
  select rv.regulation_version_id from core.regulation_versions rv join target_regulation r using(regulation_id)
  where rv.revision_date=date '2024-02-23' and rv.version_label='2024.02.23 개정본'
), target_claims as (
  select c.claim_id from core.claims c join target_version v on c.subject_id=v.regulation_version_id::text
)
select jsonb_build_object(
  'sources', (select count(*) from core.sources where source_code='kodit-official-regulation-download'),
  'crawl_runs', (select count(*) from core.crawl_runs cr join core.sources s using(source_id) where s.source_code='kodit-official-regulation-download'),
  'source_records', (select count(*) from core.source_records sr join core.sources s using(source_id) where s.source_code='kodit-official-regulation-download'),
  'documents', (select count(*) from core.documents d join target t on d.sha256=t.sha),
  'document_urls', (select count(*) from core.document_urls du join core.source_records sr using(source_record_id) join core.sources s using(source_id) where s.source_code='kodit-official-regulation-download'),
  'observations', (select count(*) from core.document_url_observations o join target t on o.document_sha256=t.sha),
  'regulations', (select count(*) from target_regulation),
  'regulation_versions', (select count(*) from target_version),
  'regulation_documents', (select count(*) from core.regulation_documents rd join target_version v using(regulation_version_id) join target t on rd.document_sha256=t.sha),
  'claims', (select count(*) from core.claims c join target_version v on c.subject_id=v.regulation_version_id::text),
  'criteria', (select count(*) from core.criteria where methodology_version='kodit-v0.4' and criterion_code in ('official_source','sha256_match','pdf_integrity','title_revision','provisions_attachments')),
  'claim_checks', (select count(*) from core.claim_checks cc join target_claims c using(claim_id)),
  'status_assignments', (select count(*) from core.status_assignments sa where (sa.entity_type='document' and sa.entity_id=(select sha from target)) or (sa.entity_type='regulation_version' and sa.entity_id=(select regulation_version_id::text from target_version))),
  'document_duplicate_count', greatest((select count(*) from core.documents d join target t on d.sha256=t.sha)-1,0),
  'relationship_complete', exists(
    select 1 from core.regulation_documents rd
    join target_version v using(regulation_version_id)
    join core.documents d on d.sha256=rd.document_sha256
    join core.document_url_observations o on o.document_sha256=d.sha256
    join core.document_urls du using(document_url_id)
    join core.source_records sr using(source_record_id)
    join core.sources s using(source_id)
  )
) as verification;
