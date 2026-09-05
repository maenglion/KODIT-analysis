begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into core.documents (sha256, file_name, detected_format, magic_verified, extraction_result)
values (repeat('a', 64), 'downloaded.hwpx', 'hwpx', true, 'failed');
select is((select fulltext_publication_status from core.documents where sha256 = repeat('a', 64)),
  'pending', 'failed HWP extraction stays pending');
select is((select publication_reason_code from core.documents where sha256 = repeat('a', 64)),
  'EXTRACTION_PENDING', 'failed HWP extraction carries EXTRACTION_PENDING');
select throws_ok(
  $$update core.documents set fulltext_publication_status = 'public' where sha256 = repeat('a', 64)$$,
  '23514', null, 'download, magic and SHA alone cannot publish HWP full text');

update core.documents set
  extraction_result = 'success', extracted_text = '제1조 목적',
  verified_regulation_name = '검증용 규정', verified_revision_date = date '2026-09-05',
  verified_provision_count = 1, fulltext_verification_method = 'extracted',
  fulltext_verified_at = now(), fulltext_verified_by = 'pgtap',
  publication_reason_code = 'FULLTEXT_VERIFIED', fulltext_publication_status = 'public'
where sha256 = repeat('a', 64);
select is((select fulltext_publication_status from core.documents where sha256 = repeat('a', 64)),
  'public', 'successful extraction plus semantic verification may publish HWP');

insert into core.documents (sha256, file_name, detected_format, magic_verified, extraction_result)
values (repeat('d', 64), 'manual.hwp', 'hwp5', true, 'failed');
update core.documents set
  fulltext_human_confirmed = true, fulltext_verification_method = 'human',
  verified_regulation_name = '수동 확인 규정', verified_revision_date = date '2026-09-05',
  verified_provision_count = 2, fulltext_verified_at = now(), fulltext_verified_by = 'reviewer',
  publication_reason_code = 'HUMAN_FULLTEXT_VERIFIED', fulltext_publication_status = 'public'
where sha256 = repeat('d', 64);
select is((select fulltext_publication_status from core.documents where sha256 = repeat('d', 64)),
  'public', 'direct human semantic verification may publish after extraction failure');

insert into core.sources (source_id, source_code, name, source_type)
values ('10000000-0000-0000-0000-000000000001', 'TEST', 'Test source', 'test');
insert into core.source_records (source_record_id, source_id, external_key)
values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'row-1');
insert into core.documents (sha256, detected_format, extraction_result, fulltext_publication_status, publication_reason_code)
values
  (repeat('b', 64), 'pdf', 'success', 'metadata_only', 'METADATA_ONLY'),
  (repeat('c', 64), 'pdf', 'success', 'metadata_only', 'METADATA_ONLY'),
  (repeat('e', 64), 'hwpx', 'pending', 'pending', 'EXTRACTION_PENDING');

insert into core.document_urls (document_url_id, source_record_id, discovered_url, normalized_url, discovery_method)
values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
    'https://example.test/rule?download=1', 'https://example.test/rule', 'test'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001',
    'https://example.test/rule?download=2', 'https://example.test/rule', 'test'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001',
    'https://example.test/rule.hwpx', 'https://example.test/rule.hwpx', 'test');
select is((select count(*)::integer from core.document_urls where normalized_url = 'https://example.test/rule'),
  2, 'normalized URL is not unique');

insert into core.document_url_observations
  (document_url_observation_id, document_url_id, document_sha256, observed_at)
values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', repeat('b', 64), timestamptz '2026-09-05 00:00:00+00'),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', repeat('b', 64), timestamptz '2026-09-05 00:00:00+00'),
  ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000003', repeat('e', 64), timestamptz '2026-09-05 00:00:00+00');
insert into core.document_url_observations
  (document_url_observation_id, document_url_id, document_sha256, observed_at,
   previous_observation_id, content_changed, change_reason)
values
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', repeat('c', 64),
   timestamptz '2026-09-06 00:00:00+00', '40000000-0000-0000-0000-000000000001', true, 'sha256_changed');
select is((select count(*)::integer from core.document_url_observations
  where document_url_id = '30000000-0000-0000-0000-000000000001'), 2,
  'one URL retains multiple observations');
select is((select count(distinct document_sha256)::integer from core.document_url_observations
  where document_url_id = '30000000-0000-0000-0000-000000000001'), 2,
  'one URL retains multiple document hashes');
select is((select count(distinct document_url_id)::integer from core.document_url_observations
  where document_sha256 = repeat('b', 64)), 2, 'one SHA may be discovered at multiple URLs');
select throws_ok(
  $$delete from core.document_url_observations where document_url_observation_id = '40000000-0000-0000-0000-000000000001'$$,
  '55000', null, 'URL observations are append-only');

update core.documents set extraction_result = 'skipped_twin_pdf', twin_pdf_sha256 = repeat('b', 64),
  fulltext_publication_status = 'metadata_only', publication_reason_code = 'TWIN_PDF_USED'
where sha256 = repeat('e', 64);
select is((select extraction_result from core.documents where sha256 = repeat('e', 64)),
  'skipped_twin_pdf', 'same-post HWP may link to its PDF twin');

insert into core.documents (sha256, detected_format, extraction_result)
values (repeat('f', 64), 'hwp5', 'failed');

insert into core.status_definitions
  (status_code, axis, label, short_definition, criteria_markdown, methodology_version, valid_from)
values
  ('CONFIRMED', 'confidence', '확인', 'v1', 'v1 rule', 'v1', date '2026-01-01'),
  ('CONFIRMED', 'confidence', '확인', 'v2', 'v2 rule', 'v2', date '2026-09-01'),
  ('NONPUBLIC_STAGE', 'nonpublic_stage', '미공개 검증', 'stage', 'stage rule', 'v1', date '2026-01-01');
select is((select count(*)::integer from core.status_definitions where status_code = 'CONFIRMED'),
  2, 'status definitions coexist across methodology versions');

insert into core.claims
  (claim_id, subject_type, subject_id, claim_text, claim_type, confidence_level, confidence_gate_passed, visibility)
values ('50000000-0000-0000-0000-000000000001', 'fact', 'fact-1', 'versioned claim', 'test', 1, false, 'internal');
insert into core.status_assignments
  (status_assignment_id, entity_type, entity_id, methodology_version, status_code, status_level,
   reason_text, assigned_by, supersedes_assignment_id)
values
  ('60000000-0000-0000-0000-000000000001', 'claim', '50000000-0000-0000-0000-000000000001',
   'v1', 'CONFIRMED', 4, 'v1 decision', 'pgtap', null),
  ('60000000-0000-0000-0000-000000000002', 'claim', '50000000-0000-0000-0000-000000000001',
   'v2', 'CONFIRMED', 5, 'v2 decision', 'pgtap', '60000000-0000-0000-0000-000000000001');
select is((select count(*)::integer from core.status_assignments
  where entity_id = '50000000-0000-0000-0000-000000000001'), 2, 'past and current decisions coexist');
select is((select status_level from core.status_assignments
  where methodology_version = 'v1' and entity_id = '50000000-0000-0000-0000-000000000001'),
  4::smallint, 'past methodology decision remains reproducible');
select throws_ok(
  $$insert into core.status_assignments
    (entity_type, entity_id, methodology_version, status_code, status_level, reason_text, assigned_by)
    values ('document', repeat('f', 64), 'v1', 'NONPUBLIC_STAGE', 2, 'advance', 'pgtap')$$,
  '23514', null, 'EXTRACTION_PENDING document cannot advance nonpublic verification stage');

select throws_ok(
  $$insert into core.claims
    (subject_type, subject_id, claim_text, claim_type, confidence_level, confidence_gate_passed, visibility)
    values ('fact', 'low', 'low confidence', 'test', 3, true, 'public')$$,
  '23514', null, 'low-confidence claim cannot cross the public gate');
insert into core.claims
  (subject_type, subject_id, claim_text, claim_type, confidence_level, confidence_gate_passed, visibility)
values ('fact', 'high', 'high confidence', 'test', 4, true, 'public');
select is((select count(*)::integer from core.claims where subject_id = 'high' and visibility = 'public'),
  1, 'confidence level 4 plus passed gate may be public');

select * from finish();
rollback;
