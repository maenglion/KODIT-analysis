-- KODIT v0.4 secure physical schema draft. Review before remote application.
begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create schema if not exists core;
create schema if not exists "case";
create schema if not exists api;

-- public is platform-managed and intentionally has no application objects.
revoke create on schema public from public;
revoke all on schema public from anon, authenticated;
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

revoke all on schema core, "case", api from public, anon, authenticated;
grant usage on schema api to anon, authenticated;
grant usage on schema core, "case", api to service_role;

alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
alter default privileges for role postgres in schema core revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema core revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema core revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema "case" revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema "case" revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema "case" revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema api revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema api revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema api revoke execute on functions from public, anon, authenticated;

create table core.user_access_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_level text not null check (access_level in ('public', 'office', 'internal')),
  active boolean not null default true,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (access_level = 'public' or approved_at is not null)
);

create table core.sources (
  source_id uuid primary key default gen_random_uuid(),
  source_code text unique not null,
  name text not null,
  source_type text not null,
  base_url text,
  is_official boolean not null default false,
  required_for_nonpublic boolean not null default false,
  active boolean not null default true
);

create table core.crawl_runs (
  crawl_run_id uuid primary key default gen_random_uuid(),
  source_id uuid not null references core.sources(source_id),
  collector_version text not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  status text not null check (status in ('running', 'succeeded', 'partial', 'failed')),
  fetched_count integer not null default 0 check (fetched_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  log_summary jsonb not null default '{}'::jsonb
);

create table core.source_records (
  source_record_id uuid primary key default gen_random_uuid(),
  source_id uuid not null references core.sources(source_id),
  external_key text,
  title text,
  published_at date,
  department text,
  page_url text,
  raw_metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(source_id, external_key),
  check (last_seen_at >= first_seen_at)
);

create table core.documents (
  sha256 char(64) primary key check (sha256 ~ '^[0-9a-f]{64}$'),
  file_name text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  mime_type text,
  detected_format text not null default 'unknown' check (
    detected_format in ('pdf', 'hwpx', 'hwp5', 'hwp3', 'html', 'docx', 'xlsx', 'other', 'unknown')
  ),
  magic_verified boolean not null default false,
  extracted_text text,
  extraction_result text not null default 'pending' check (
    extraction_result in (
      'pending', 'not_applicable', 'success', 'unsupported_format', 'drm', 'failed', 'skipped_twin_pdf'
    )
  ),
  twin_pdf_sha256 char(64) references core.documents(sha256),
  storage_path text,
  fulltext_publication_status text not null default 'pending' check (
    fulltext_publication_status in ('pending', 'metadata_only', 'public', 'rejected')
  ),
  publication_reason_code text not null default 'EXTRACTION_PENDING',
  verified_regulation_name text,
  verified_revision_date date,
  verified_provision_count integer check (verified_provision_count is null or verified_provision_count >= 0),
  fulltext_verification_method text check (fulltext_verification_method in ('extracted', 'human')),
  fulltext_human_confirmed boolean not null default false,
  fulltext_verified_at timestamptz,
  fulltext_verified_by text,
  first_seen_at timestamptz not null default now(),
  constraint hwp_pending_until_extracted check (
    detected_format not in ('hwpx', 'hwp5', 'hwp3')
    or extraction_result = 'success'
    or fulltext_human_confirmed
    or extraction_result = 'skipped_twin_pdf'
    or (fulltext_publication_status = 'pending' and publication_reason_code = 'EXTRACTION_PENDING')
  ),
  constraint hwp_fulltext_publication_gate check (
    fulltext_publication_status <> 'public'
    or detected_format not in ('hwpx', 'hwp5', 'hwp3')
    or (
      nullif(btrim(verified_regulation_name), '') is not null
      and verified_revision_date is not null
      and verified_provision_count > 0
      and fulltext_verified_at is not null
      and fulltext_verified_by is not null
      and (
        (extraction_result = 'success'
          and nullif(btrim(extracted_text), '') is not null
          and fulltext_verification_method = 'extracted')
        or (fulltext_human_confirmed and fulltext_verification_method = 'human')
      )
    )
  ),
  constraint skipped_hwp_requires_twin_pdf check (
    extraction_result <> 'skipped_twin_pdf'
    or (
      detected_format in ('hwpx', 'hwp5', 'hwp3')
      and twin_pdf_sha256 is not null
      and fulltext_publication_status <> 'public'
    )
  ),
  constraint non_hwp_extraction_result check (
    detected_format in ('hwpx', 'hwp5', 'hwp3')
    or extraction_result in ('pending', 'not_applicable', 'success')
  )
);

create table core.document_urls (
  document_url_id uuid primary key default gen_random_uuid(),
  source_record_id uuid references core.source_records(source_record_id),
  discovered_url text not null,
  normalized_url text not null,
  final_url text,
  discovery_method text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  check (last_seen_at >= first_seen_at)
);

create index document_urls_normalized_url_idx on core.document_urls(normalized_url);

-- Append-only URL fetches preserve changes at the same normalized URL.
create table core.document_url_observations (
  document_url_observation_id uuid primary key default gen_random_uuid(),
  document_url_id uuid not null references core.document_urls(document_url_id),
  document_sha256 char(64) references core.documents(sha256),
  observed_at timestamptz not null default now(),
  http_status integer check (http_status is null or http_status between 100 and 599),
  etag text,
  last_modified text,
  content_length bigint check (content_length is null or content_length >= 0),
  previous_observation_id uuid references core.document_url_observations(document_url_observation_id),
  content_changed boolean not null default false,
  change_reason text,
  unique(document_url_id, observed_at),
  check (not content_changed or previous_observation_id is not null)
);

create table core.regulations (
  regulation_id uuid primary key default gen_random_uuid(),
  canonical_name text unique not null,
  regulation_type text,
  owning_department text,
  lifecycle_status text not null default 'unknown',
  visibility text not null default 'public' check (visibility in ('public', 'office', 'internal'))
);

create table core.regulation_aliases (
  alias_id uuid primary key default gen_random_uuid(),
  regulation_id uuid not null references core.regulations(regulation_id),
  alias_name text not null,
  alias_type text not null,
  valid_from date,
  valid_to date,
  unique(regulation_id, alias_name),
  check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

create table core.regulation_versions (
  regulation_version_id uuid primary key default gen_random_uuid(),
  regulation_id uuid not null references core.regulations(regulation_id),
  revision_date date,
  effective_date date,
  version_label text,
  currency_status text not null default 'unknown',
  supersedes_id uuid references core.regulation_versions(regulation_version_id),
  unique(regulation_id, revision_date, version_label)
);

create table core.regulation_documents (
  regulation_version_id uuid not null references core.regulation_versions(regulation_version_id),
  document_sha256 char(64) not null references core.documents(sha256),
  document_role text not null check (
    document_role in ('fulltext', 'summary', 'preannouncement', 'same_post_attachment', 'evidence', 'other')
  ),
  match_confidence text not null,
  primary key(regulation_version_id, document_sha256, document_role)
);

create table core.status_definitions (
  status_definition_id uuid primary key default gen_random_uuid(),
  status_code text not null,
  axis text not null,
  label text not null,
  short_definition text not null,
  criteria_markdown text not null,
  methodology_version text not null,
  valid_from date not null,
  valid_to date,
  color text,
  unique(methodology_version, status_code),
  check (valid_to is null or valid_to >= valid_from)
);

create table core.publication_decision_rules (
  publication_decision_rule_id uuid primary key default gen_random_uuid(),
  methodology_version text not null,
  rule_code text not null,
  evaluation_order integer not null check (evaluation_order > 0),
  condition_json jsonb not null,
  resulting_status_code text not null,
  reason_code text not null,
  valid_from date not null,
  valid_to date,
  unique(methodology_version, rule_code),
  unique(methodology_version, evaluation_order),
  foreign key(methodology_version, resulting_status_code)
    references core.status_definitions(methodology_version, status_code),
  check (valid_to is null or valid_to >= valid_from),
  check (jsonb_typeof(condition_json) = 'object')
);

create table core.claims (
  claim_id uuid primary key default gen_random_uuid(),
  subject_type text not null check (
    subject_type in ('regulation', 'regulation_version', 'document', 'fact', 'event', 'article', 'external_discovery')
  ),
  subject_id text not null,
  claim_text text not null,
  claim_type text not null,
  is_primary boolean not null default false,
  confidence_level smallint not null default 1 check (confidence_level between 1 and 5),
  confidence_gate_passed boolean not null default false,
  visibility text not null default 'internal' check (visibility in ('public', 'office', 'internal')),
  created_at timestamptz not null default now(),
  constraint claim_visibility_confidence_gate check (
    visibility = 'internal' or (confidence_level >= 4 and confidence_gate_passed)
  )
);

create table core.criteria (
  criterion_id uuid primary key default gen_random_uuid(),
  criterion_code text not null,
  methodology_version text not null,
  scale text not null check (scale in ('confidence', 'nonpublic_stage', 'availability')),
  level smallint check (level between 1 and 5),
  classification_value text,
  required boolean not null default true,
  description text not null,
  alt_group text,
  display_order integer not null,
  valid_from date not null,
  valid_to date,
  unique(methodology_version, scale, criterion_code),
  check (valid_to is null or valid_to >= valid_from)
);

create table core.claim_checks (
  claim_check_id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references core.claims(claim_id),
  criterion_id uuid not null references core.criteria(criterion_id),
  check_result text not null check (check_result in ('pass', 'fail', 'na', 'pending')),
  evidence_document_sha256 char(64) references core.documents(sha256),
  evidence_ref text,
  checked_at timestamptz not null default now(),
  checked_by text not null
);

create table core.status_assignments (
  status_assignment_id uuid primary key default gen_random_uuid(),
  entity_type text not null check (
    entity_type in ('regulation', 'regulation_version', 'document', 'fact', 'event', 'article', 'external_discovery', 'claim')
  ),
  entity_id text not null,
  methodology_version text not null,
  status_code text not null,
  status_level smallint check (status_level between 1 and 5),
  search_verification_count smallint not null default 0 check (search_verification_count between 0 and 3),
  official_source_count integer not null default 0 check (official_source_count >= 0),
  reason_code text,
  reason_text text not null,
  assigned_at timestamptz not null default now(),
  assigned_by text not null,
  human_confirmed boolean not null default false,
  supersedes_assignment_id uuid references core.status_assignments(status_assignment_id),
  foreign key(methodology_version, status_code)
    references core.status_definitions(methodology_version, status_code)
);

create table core.verification_cycles (
  verification_cycle_id uuid primary key default gen_random_uuid(),
  cycle_date date not null,
  methodology_version text not null,
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  unique(cycle_date, methodology_version)
);

create table core.verification_runs (
  verification_run_id uuid primary key default gen_random_uuid(),
  verification_cycle_id uuid not null references core.verification_cycles(verification_cycle_id),
  entity_type text not null,
  entity_id text not null,
  sequence_no smallint not null check (sequence_no > 0),
  engine_name text not null,
  prompt_version text not null,
  query_text text not null,
  raw_response text not null,
  parsed_urls jsonb not null default '[]'::jsonb,
  result text not null,
  performed_at timestamptz not null default now(),
  operator text not null,
  attempt_no smallint not null default 1 check (attempt_no > 0)
);

create table core.metrics (
  metric_id uuid primary key default gen_random_uuid(),
  metric_code text unique not null,
  name text not null,
  definition text not null,
  default_unit text not null
);

create table core.facts (
  fact_id uuid primary key default gen_random_uuid(),
  metric_id uuid not null references core.metrics(metric_id),
  period_start date,
  period_end date,
  dimensions jsonb not null default '{}'::jsonb,
  numeric_value numeric,
  text_value text,
  unit text not null,
  source_type text not null,
  verification_status text not null default 'unverified',
  visibility text not null default 'internal' check (visibility in ('public', 'office', 'internal')),
  check (numeric_value is not null or text_value is not null),
  check (period_end is null or period_start is null or period_end >= period_start)
);

create table core.fact_sources (
  fact_id uuid not null references core.facts(fact_id),
  document_sha256 char(64) not null references core.documents(sha256),
  page_locator text,
  table_locator text,
  source_type text not null,
  source_role text not null default 'primary',
  citation_verified boolean not null default false,
  primary key(fact_id, document_sha256)
);

create table core.events (
  event_id uuid primary key default gen_random_uuid(),
  event_date date not null,
  event_type text not null,
  title text not null,
  summary text not null,
  visibility text not null default 'internal' check (visibility in ('public', 'office', 'internal'))
);

create table core.event_sources (
  event_id uuid not null references core.events(event_id),
  document_sha256 char(64) not null references core.documents(sha256),
  page_locator text,
  primary key(event_id, document_sha256)
);

create table core.external_discoveries (
  discovery_id uuid primary key default gen_random_uuid(),
  title text not null,
  discovered_by text not null,
  candidate_url text,
  document_sha256 char(64) references core.documents(sha256),
  workflow_status text not null default 'candidate',
  related_domains text[] not null default '{}',
  promoted_locations text[] not null default '{}',
  visibility text not null default 'internal' check (visibility in ('public', 'office', 'internal')),
  discovered_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table core.topics (
  topic_id uuid primary key default gen_random_uuid(),
  topic_code text unique not null,
  name text not null
);

create table core.topic_terms (
  topic_term_id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references core.topics(topic_id),
  term text not null,
  term_type text not null,
  weight numeric not null default 1,
  unique(topic_id, term, term_type)
);

create table core.articles (
  article_id uuid primary key default gen_random_uuid(),
  title text not null,
  publisher text,
  published_at timestamptz,
  canonical_url text unique not null,
  source_url text not null,
  snippet text,
  collection_method text not null,
  search_rule_version text,
  matched_terms jsonb not null default '[]'::jsonb,
  classification_method text not null default 'rule',
  classifier_version text,
  human_reviewed boolean not null default false,
  review_status text not null default 'candidate',
  visibility text not null default 'internal' check (visibility in ('public', 'office', 'internal'))
);

create table core.disclosure_requests (
  disclosure_request_id uuid primary key default gen_random_uuid(),
  receipt_no text unique not null,
  title text not null,
  agency_name text not null,
  submitted_at date not null,
  response_due_at date,
  request_document_sha256 char(64) references core.documents(sha256),
  visibility text not null default 'internal' check (visibility in ('public', 'office', 'internal'))
);

create table core.disclosure_items (
  disclosure_item_id uuid primary key default gen_random_uuid(),
  disclosure_request_id uuid not null references core.disclosure_requests(disclosure_request_id),
  item_no text not null,
  parent_item_no text,
  request_text text not null,
  non_disclosure_basis text,
  partial_disclosure_scope text,
  linked_metric_id uuid references core.metrics(metric_id),
  unique(disclosure_request_id, item_no)
);

create table core.disclosure_responses (
  disclosure_response_id uuid primary key default gen_random_uuid(),
  disclosure_item_id uuid not null references core.disclosure_items(disclosure_item_id),
  responded_at date not null,
  result text not null,
  response_summary text,
  response_document_sha256 char(64) references core.documents(sha256),
  verification_effect text,
  created_at timestamptz not null default now()
);

create table core.releases (
  release_id uuid primary key default gen_random_uuid(),
  release_no text unique not null,
  as_of_date date not null,
  file_name text not null,
  file_sha256 char(64) not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  schema_version text not null,
  collector_version text not null,
  methodology_version text not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'published', 'withdrawn')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  changed_record_count integer not null default 0 check (changed_record_count >= 0),
  is_latest boolean not null default false,
  published_at timestamptz,
  withdrawn_at timestamptz,
  withdrawal_reason text,
  check (status not in ('approved', 'published') or (approved_by is not null and approved_at is not null)),
  check (status <> 'published' or published_at is not null),
  check (status <> 'withdrawn' or (withdrawn_at is not null and nullif(btrim(withdrawal_reason), '') is not null))
);

create unique index releases_single_latest_idx on core.releases(is_latest) where is_latest;

create table core.notices (
  notice_id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  body_markdown text not null,
  methodology_version text,
  effective_at timestamptz,
  published_at timestamptz,
  pinned boolean not null default false,
  visibility text not null default 'public' check (visibility in ('public', 'office', 'internal'))
);

create table "case".cases (
  case_id uuid primary key default gen_random_uuid(),
  internal_case_code text unique not null,
  title text not null,
  status text not null,
  created_at timestamptz not null default now()
);

create table "case".case_parties (
  case_party_id uuid primary key default gen_random_uuid(),
  case_id uuid not null references "case".cases(case_id),
  party_role text not null,
  display_name text not null,
  identifier_ciphertext bytea,
  unique(case_id, party_role, display_name)
);

create table "case".guarantees (
  case_guarantee_id uuid primary key default gen_random_uuid(),
  case_id uuid not null references "case".cases(case_id),
  guarantee_no_ciphertext bytea not null,
  guarantee_no_fingerprint char(64) not null check (guarantee_no_fingerprint ~ '^[0-9a-f]{64}$'),
  guarantee_date date,
  guarantee_amount numeric,
  note text,
  unique(case_id, guarantee_no_fingerprint)
);

create table "case".documents (
  sha256 char(64) primary key check (sha256 ~ '^[0-9a-f]{64}$'),
  file_name text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  mime_type text,
  extracted_text text,
  storage_path text not null,
  contains_personal_data boolean not null default true,
  first_seen_at timestamptz not null default now()
);

create table "case".case_documents (
  case_id uuid not null references "case".cases(case_id),
  case_document_sha256 char(64) not null references "case".documents(sha256),
  public_document_sha256 char(64) references core.documents(sha256),
  document_role text not null,
  public_derivative_approved boolean not null default false,
  primary key(case_id, case_document_sha256, document_role)
);

create table "case".document_requests (
  case_document_request_id uuid primary key default gen_random_uuid(),
  case_id uuid not null references "case".cases(case_id),
  item_no text not null,
  request_text text not null,
  target_party text,
  request_status text not null default 'draft',
  due_date date,
  unique(case_id, item_no)
);

create table "case".disclosure_requests (
  case_disclosure_request_id uuid primary key default gen_random_uuid(),
  case_id uuid not null references "case".cases(case_id),
  receipt_no_ciphertext bytea not null,
  receipt_no_fingerprint char(64) not null check (receipt_no_fingerprint ~ '^[0-9a-f]{64}$'),
  title text not null,
  agency_name text not null,
  submitted_at date not null,
  response_due_at date,
  request_document_sha256 char(64) references "case".documents(sha256),
  created_at timestamptz not null default now(),
  unique(case_id, receipt_no_fingerprint)
);

create table "case".disclosure_items (
  case_disclosure_item_id uuid primary key default gen_random_uuid(),
  case_disclosure_request_id uuid not null references "case".disclosure_requests(case_disclosure_request_id),
  item_no text not null,
  parent_item_no text,
  request_text text not null,
  non_disclosure_basis text,
  partial_disclosure_scope text,
  unique(case_disclosure_request_id, item_no)
);

create table "case".disclosure_responses (
  case_disclosure_response_id uuid primary key default gen_random_uuid(),
  case_disclosure_item_id uuid not null references "case".disclosure_items(case_disclosure_item_id),
  responded_at date not null,
  result text not null,
  response_summary text,
  response_document_sha256 char(64) references "case".documents(sha256),
  created_at timestamptz not null default now()
);

create function core.reject_history_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception '% is append-only', tg_table_schema || '.' || tg_table_name using errcode = '55000';
end;
$$;

create function core.validate_hwp_twin_pdf()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.extraction_result = 'skipped_twin_pdf' then
    if not exists (
      select 1 from core.documents twin where twin.sha256 = new.twin_pdf_sha256 and twin.detected_format = 'pdf'
    ) then
      raise exception 'skipped_twin_pdf requires a PDF twin' using errcode = '23514';
    end if;
    if not exists (
      select 1
      from core.document_url_observations hwp_observation
      join core.document_urls hwp_url on hwp_url.document_url_id = hwp_observation.document_url_id
      join core.document_urls pdf_url on pdf_url.source_record_id = hwp_url.source_record_id
      join core.document_url_observations pdf_observation on pdf_observation.document_url_id = pdf_url.document_url_id
      where hwp_observation.document_sha256 = new.sha256
        and pdf_observation.document_sha256 = new.twin_pdf_sha256
        and hwp_url.source_record_id is not null
    ) then
      raise exception 'HWP and twin PDF must be attachments of the same source record' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create function core.validate_status_assignment_gate()
returns trigger language plpgsql set search_path = '' as $$
declare
  pending_document boolean;
  status_axis text;
begin
  if new.entity_type <> 'document' then return new; end if;
  select d.fulltext_publication_status = 'pending' and d.publication_reason_code = 'EXTRACTION_PENDING'
    into pending_document from core.documents d where d.sha256 = new.entity_id;
  select s.axis into status_axis from core.status_definitions s
    where s.methodology_version = new.methodology_version and s.status_code = new.status_code;
  if coalesce(pending_document, false) and status_axis = 'nonpublic_stage' and coalesce(new.status_level, 0) > 1 then
    raise exception 'EXTRACTION_PENDING document cannot advance nonpublic verification stage' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger document_url_observations_append_only before update or delete on core.document_url_observations
for each row execute function core.reject_history_mutation();
create trigger claim_checks_append_only before update or delete on core.claim_checks
for each row execute function core.reject_history_mutation();
create trigger status_assignments_append_only before update or delete on core.status_assignments
for each row execute function core.reject_history_mutation();
create trigger verification_runs_append_only before update or delete on core.verification_runs
for each row execute function core.reject_history_mutation();
create trigger documents_validate_hwp_twin_pdf before insert or update of extraction_result, twin_pdf_sha256
on core.documents for each row execute function core.validate_hwp_twin_pdf();
create trigger status_assignments_validate_gate before insert on core.status_assignments
for each row execute function core.validate_status_assignment_gate();

do $$
declare relation record;
begin
  for relation in select schemaname, tablename from pg_tables where schemaname in ('core', 'case') loop
    execute format('alter table %I.%I enable row level security', relation.schemaname, relation.tablename);
    execute format('alter table %I.%I force row level security', relation.schemaname, relation.tablename);
  end loop;
end;
$$;

revoke all on all tables in schema core, "case" from public, anon, authenticated;
revoke all on all sequences in schema core, "case" from public, anon, authenticated;
revoke all on all functions in schema core, "case" from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema core, "case" to service_role;
grant usage, select, update on all sequences in schema core, "case" to service_role;
grant execute on all functions in schema core, "case" to service_role;
alter default privileges for role postgres in schema core, "case" grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema core, "case" grant usage, select, update on sequences to service_role;
alter default privileges for role postgres in schema core, "case" grant execute on functions to service_role;

create function api.current_access_level()
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select p.access_level from core.user_access_profiles p
    where p.user_id = auth.uid() and p.active and (p.expires_at is null or p.expires_at > now())), 'public');
$$;

create function api.has_access(required_level text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if required_level is null or required_level not in ('public', 'office', 'internal') then
    raise exception 'invalid required access level' using errcode = '22023';
  end if;
  return case api.current_access_level()
    when 'internal' then true
    when 'office' then required_level in ('public', 'office')
    else required_level = 'public'
  end;
end;
$$;

create function api.public_regulation_rows()
returns table (regulation_id uuid, canonical_name text, regulation_type text, owning_department text, lifecycle_status text)
language sql stable security definer set search_path = '' as $$
  select r.regulation_id, r.canonical_name, r.regulation_type, r.owning_department, r.lifecycle_status
  from core.regulations r where r.visibility = 'public';
$$;

create function api.public_fact_rows()
returns table (fact_id uuid, metric_code text, metric_name text, period_start date, period_end date,
  dimensions jsonb, numeric_value numeric, text_value text, unit text, verification_status text)
language sql stable security definer set search_path = '' as $$
  select f.fact_id, m.metric_code, m.name, f.period_start, f.period_end, f.dimensions,
    f.numeric_value, f.text_value, f.unit, f.verification_status
  from core.facts f join core.metrics m on m.metric_id = f.metric_id
  where f.visibility = 'public' and f.verification_status = 'verified';
$$;

create function api.public_event_rows()
returns table (event_id uuid, event_date date, event_type text, title text, summary text)
language sql stable security definer set search_path = '' as $$
  select e.event_id, e.event_date, e.event_type, e.title, e.summary from core.events e where e.visibility = 'public';
$$;

create function api.public_notice_rows()
returns table (notice_id uuid, title text, category text, body_markdown text, methodology_version text,
  effective_at timestamptz, published_at timestamptz, pinned boolean)
language sql stable security definer set search_path = '' as $$
  select n.notice_id, n.title, n.category, n.body_markdown, n.methodology_version,
    n.effective_at, n.published_at, n.pinned from core.notices n
  where n.visibility = 'public' and n.published_at is not null and n.published_at <= now();
$$;

create function api.public_claim_rows()
returns table (claim_id uuid, subject_type text, subject_id text, claim_text text, claim_type text,
  is_primary boolean, confidence_level smallint, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.claim_id, c.subject_type, c.subject_id, c.claim_text, c.claim_type, c.is_primary,
    c.confidence_level, c.created_at
  from core.claims c where c.visibility = 'public' and c.confidence_gate_passed and c.confidence_level >= 4;
$$;

create function api.public_release_rows()
returns table (release_id uuid, release_no text, as_of_date date, file_name text, file_sha256 char(64),
  schema_version text, collector_version text, methodology_version text, published_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.release_id, r.release_no, r.as_of_date, r.file_name, r.file_sha256,
    r.schema_version, r.collector_version, r.methodology_version, r.published_at
  from core.releases r where r.status = 'published' and r.published_at is not null and r.published_at <= now();
$$;

create function api.office_claim_rows()
returns table (claim_id uuid, subject_type text, subject_id text, claim_text text, claim_type text,
  is_primary boolean, confidence_level smallint, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not api.has_access('office') then
    raise exception 'office access required' using errcode = '42501';
  end if;
  return query
    select c.claim_id, c.subject_type, c.subject_id, c.claim_text, c.claim_type, c.is_primary,
      c.confidence_level, c.created_at
    from core.claims c where c.visibility in ('public', 'office')
      and c.confidence_gate_passed and c.confidence_level >= 4;
end;
$$;

create function api.internal_verification_queue_rows()
returns table (claim_id uuid, subject_type text, subject_id text, claim_text text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not api.has_access('internal') then
    raise exception 'internal access required' using errcode = '42501';
  end if;
  return query
    select c.claim_id, c.subject_type, c.subject_id, c.claim_text, c.created_at from core.claims c;
end;
$$;

-- SECURITY DEFINER ownership is explicit: postgres intentionally bypasses raw-table RLS.
-- The only protection boundary for these functions is therefore their fixed search_path,
-- zero/untrusted-input surface, access checks and allowlist WHERE clauses below.
alter function api.current_access_level() owner to postgres;
alter function api.has_access(text) owner to postgres;
alter function api.public_regulation_rows() owner to postgres;
alter function api.public_fact_rows() owner to postgres;
alter function api.public_event_rows() owner to postgres;
alter function api.public_notice_rows() owner to postgres;
alter function api.public_claim_rows() owner to postgres;
alter function api.public_release_rows() owner to postgres;
alter function api.office_claim_rows() owner to postgres;
alter function api.internal_verification_queue_rows() owner to postgres;

-- PostgreSQL grants EXECUTE to PUBLIC when a function is created. Remove it before
-- granting the exact caller allowlist. service_role does not participate in access assertions.
revoke all on all functions in schema api from public, anon, authenticated, service_role;
grant execute on function api.current_access_level() to authenticated;
grant execute on function api.has_access(text) to authenticated;
grant execute on function api.public_regulation_rows(), api.public_fact_rows(), api.public_event_rows(),
  api.public_notice_rows(), api.public_release_rows(), api.public_claim_rows()
  to anon, authenticated;
grant execute on function api.office_claim_rows(), api.internal_verification_queue_rows() to authenticated;

-- Invoker views depend only on explicitly granted, filtered definer functions.
create view api.public_regulations with (security_invoker = true) as select * from api.public_regulation_rows();
create view api.public_facts with (security_invoker = true) as select * from api.public_fact_rows();
create view api.public_events with (security_invoker = true) as select * from api.public_event_rows();
create view api.public_notices with (security_invoker = true) as select * from api.public_notice_rows();
create view api.public_releases with (security_invoker = true) as select * from api.public_release_rows();
create view api.public_claims with (security_invoker = true) as select * from api.public_claim_rows();
create view api.office_claims with (security_invoker = true) as select * from api.office_claim_rows();
create view api.internal_verification_queue with (security_invoker = true) as select * from api.internal_verification_queue_rows();

revoke all on all tables in schema api from public, anon, authenticated;
grant select on api.public_regulations, api.public_facts, api.public_events, api.public_notices,
  api.public_releases, api.public_claims
  to anon, authenticated;
grant select on api.office_claims, api.internal_verification_queue to authenticated;

commit;
