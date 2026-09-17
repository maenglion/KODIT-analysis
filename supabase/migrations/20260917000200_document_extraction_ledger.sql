begin;

-- T02-B records source attachment identity, binary observations, immutable
-- extraction artifacts, and every parser execution separately. It does not
-- extract mentions or expose full text through PostgREST.
create table core.source_attachments (
  attachment_id uuid primary key default gen_random_uuid(),
  source_record_id uuid not null references core.source_records(source_record_id) on delete restrict,
  external_attachment_key text not null check (nullif(btrim(external_attachment_key), '') is not null),
  original_file_name text,
  created_at timestamptz not null default now(),
  unique (source_record_id, external_attachment_key)
);

comment on table core.source_attachments is
  'Stable logical attachment identity within one source record. It is not a notice, URL, or binary document identity.';
comment on column core.source_attachments.external_attachment_key is
  'Source-specific attachment key, such as KODIT evidence_file_key or ALIO file_no, interpreted only with source_record_id.';

create table core.source_attachment_observations (
  attachment_observation_id uuid primary key default gen_random_uuid(),
  attachment_id uuid not null references core.source_attachments(attachment_id) on delete restrict,
  document_url_observation_id uuid not null
    references core.document_url_observations(document_url_observation_id) on delete restrict,
  document_sha256 char(64) not null references core.documents(sha256) on delete restrict,
  created_at timestamptz not null default now(),
  unique (attachment_id, document_url_observation_id)
);

comment on table core.source_attachment_observations is
  'Append-only link from a logical source attachment to the exact URL observation and binary SHA seen at that time.';

create table core.document_extractions (
  extraction_id uuid primary key default gen_random_uuid(),
  document_sha256 char(64) not null references core.documents(sha256) on delete restrict,
  extract_hash char(64) not null check (extract_hash ~ '^[0-9a-f]{64}$'),
  extraction_contract_version text not null
    check (nullif(btrim(extraction_contract_version), '') is not null),
  extracted_text text not null check (char_length(extracted_text) > 0),
  extracted_char_count integer not null check (
    extracted_char_count > 0
    and extracted_char_count = char_length(extracted_text)
  ),
  created_at timestamptz not null default now(),
  unique (document_sha256, extract_hash, extraction_contract_version),
  unique (extraction_id, document_sha256),
  check (
    extract_hash = encode(
      extensions.digest(pg_catalog.convert_to(extracted_text, 'UTF8'), 'sha256'),
      'hex'
    )
  )
);

comment on table core.document_extractions is
  'Immutable derived full-text artifact. Identical binary/text/contract results are stored once and may be referenced by multiple parser runs.';

create table core.parser_runs (
  parser_run_id uuid primary key,
  attachment_observation_id uuid not null
    references core.source_attachment_observations(attachment_observation_id) on delete restrict,
  document_sha256 char(64) not null references core.documents(sha256) on delete restrict,
  extraction_id uuid,
  provenance text not null check (provenance in ('ACTUAL_EXECUTION', 'RECONSTRUCTED_EVALUATION')),
  evidence_as_of timestamptz not null,
  file_name text not null,
  detected_magic text not null check (nullif(btrim(detected_magic), '') is not null),
  parser_name text not null check (nullif(btrim(parser_name), '') is not null),
  parser_version text not null check (nullif(btrim(parser_version), '') is not null),
  parser_engine text not null check (nullif(btrim(parser_engine), '') is not null),
  parser_engine_version text not null check (nullif(btrim(parser_engine_version), '') is not null),
  code_commit_sha char(40) not null check (code_commit_sha ~ '^[0-9a-f]{40}$'),
  parser_code_dirty boolean not null,
  parser_source_sha256 char(64) not null check (parser_source_sha256 ~ '^[0-9a-f]{64}$'),
  runtime_version text not null,
  dependency_lock_hash char(64) not null check (dependency_lock_hash ~ '^[0-9a-f]{64}$'),
  runtime_manifest_sha256 char(64) not null check (runtime_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  environment_fingerprint char(64) not null check (environment_fingerprint ~ '^[0-9a-f]{64}$'),
  environment jsonb not null default '{}'::jsonb,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  parser_result text not null check (
    parser_result in ('SUCCESS', 'NO_EXTRACTABLE_TEXT', 'ENCRYPTED', 'EXTRACTION_FAILED', 'FAILED')
  ),
  identity_matched boolean,
  failure_domain text,
  failure_code text,
  error_class text,
  error_message text,
  full_stack_trace text,
  created_at timestamptz not null default now(),
  foreign key (extraction_id, document_sha256)
    references core.document_extractions(extraction_id, document_sha256) on delete restrict,
  check (finished_at >= started_at),
  check (
    (parser_result = 'SUCCESS' and extraction_id is not null)
    or (parser_result <> 'SUCCESS' and extraction_id is null)
  ),
  check (
    (failure_domain is null and failure_code is null)
    or (failure_domain is not null and failure_code is not null)
  ),
  check (
    parser_result in ('EXTRACTION_FAILED', 'FAILED')
    or (failure_domain is null and failure_code is null)
  )
);

comment on table core.parser_runs is
  'Append-only execution ledger. Parser outcomes are separate from extraction content and from downstream identity or availability decisions.';
comment on column core.parser_runs.identity_matched is
  'Optional representation-level identity observation. NULL for parsers such as PDF that do not perform identity matching.';

create function core.validate_source_attachment_observation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  observed_sha char(64);
begin
  select o.document_sha256
    into observed_sha
  from core.document_url_observations o
  where o.document_url_observation_id = new.document_url_observation_id;

  if observed_sha is null or observed_sha <> new.document_sha256 then
    raise exception 'attachment observation document SHA must match URL observation'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create function core.validate_parser_run_links()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  observed_sha char(64);
begin
  select o.document_sha256
    into observed_sha
  from core.source_attachment_observations o
  where o.attachment_observation_id = new.attachment_observation_id;

  if observed_sha is null or observed_sha <> new.document_sha256 then
    raise exception 'parser run document SHA must match attachment observation'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create function core.record_parser_execution(
  p_attachment_observation_id uuid,
  p_run jsonb,
  p_extraction jsonb default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_document_sha256 char(64);
  v_extraction_id uuid;
  v_runner_result text;
  v_parser_result text;
  v_identity_matched boolean;
begin
  if p_run is null or jsonb_typeof(p_run) <> 'object' then
    raise exception 'parser run payload must be a JSON object' using errcode = '22023';
  end if;

  select o.document_sha256
    into v_document_sha256
  from core.source_attachment_observations o
  where o.attachment_observation_id = p_attachment_observation_id;

  if v_document_sha256 is null then
    raise exception 'unknown attachment observation' using errcode = '23503';
  end if;
  if p_run->>'input_sha256' is distinct from btrim(v_document_sha256) then
    raise exception 'parser run input SHA does not match attachment observation'
      using errcode = '23514';
  end if;

  v_runner_result := p_run->>'result';
  v_identity_matched := case
    when p_run ? 'identity_matched' then (p_run->>'identity_matched')::boolean
    else null
  end;

  if p_extraction is not null then
    if jsonb_typeof(p_extraction) <> 'object' then
      raise exception 'extraction payload must be a JSON object' using errcode = '22023';
    end if;
    if v_runner_result not in ('SUCCESS', 'IDENTITY_NOT_FOUND') then
      raise exception 'only successful text extraction may carry an artifact'
        using errcode = '23514';
    end if;
    if p_extraction->>'parser_run_id' is distinct from p_run->>'parser_run_id'
      or p_extraction->>'document_sha256' is distinct from btrim(v_document_sha256)
      or p_extraction->>'extract_hash' is distinct from p_run->>'extract_hash'
      or (p_extraction->>'extracted_char_count')::integer
        is distinct from (p_run->>'extracted_char_count')::integer then
      raise exception 'extraction artifact does not match parser run'
        using errcode = '23514';
    end if;

    insert into core.document_extractions (
      document_sha256,
      extract_hash,
      extraction_contract_version,
      extracted_text,
      extracted_char_count
    ) values (
      v_document_sha256,
      p_extraction->>'extract_hash',
      p_extraction->>'extraction_contract_version',
      p_extraction->>'extracted_text',
      (p_extraction->>'extracted_char_count')::integer
    )
    on conflict (document_sha256, extract_hash, extraction_contract_version) do nothing;

    select e.extraction_id
      into v_extraction_id
    from core.document_extractions e
    where e.document_sha256 = v_document_sha256
      and e.extract_hash = p_extraction->>'extract_hash'
      and e.extraction_contract_version = p_extraction->>'extraction_contract_version';
    v_parser_result := 'SUCCESS';
  else
    if v_runner_result in ('SUCCESS', 'IDENTITY_NOT_FOUND') then
      raise exception 'successful text extraction requires an extraction artifact'
        using errcode = '23514';
    end if;
    if v_runner_result not in (
      'NO_EXTRACTABLE_TEXT', 'ENCRYPTED', 'EXTRACTION_FAILED', 'FAILED'
    ) then
      raise exception 'unsupported parser result: %', v_runner_result using errcode = '22023';
    end if;
    v_parser_result := v_runner_result;
  end if;

  insert into core.parser_runs (
    parser_run_id,
    attachment_observation_id,
    document_sha256,
    extraction_id,
    provenance,
    evidence_as_of,
    file_name,
    detected_magic,
    parser_name,
    parser_version,
    parser_engine,
    parser_engine_version,
    code_commit_sha,
    parser_code_dirty,
    parser_source_sha256,
    runtime_version,
    dependency_lock_hash,
    runtime_manifest_sha256,
    environment_fingerprint,
    environment,
    started_at,
    finished_at,
    parser_result,
    identity_matched,
    failure_domain,
    failure_code,
    error_class,
    error_message,
    full_stack_trace
  ) values (
    (p_run->>'parser_run_id')::uuid,
    p_attachment_observation_id,
    v_document_sha256,
    v_extraction_id,
    p_run->>'provenance',
    (p_run->>'evidence_as_of')::timestamptz,
    p_run->>'file_name',
    p_run->>'detected_magic',
    p_run->>'parser_name',
    p_run->>'parser_version',
    p_run->>'parser_engine',
    p_run->>'parser_engine_version',
    p_run->>'code_commit_sha',
    (p_run->>'parser_code_dirty')::boolean,
    p_run->>'parser_source_sha256',
    p_run->>'runtime_version',
    p_run->>'dependency_lock_hash',
    p_run->>'runtime_manifest_sha256',
    p_run->>'environment_fingerprint',
    coalesce(p_run->'environment', '{}'::jsonb),
    (p_run->>'started_at')::timestamptz,
    (p_run->>'finished_at')::timestamptz,
    v_parser_result,
    v_identity_matched,
    nullif(p_run->>'failure_domain', ''),
    nullif(p_run->>'failure_code', ''),
    nullif(p_run->>'error_class', ''),
    nullif(p_run->>'error_message', ''),
    nullif(p_run->>'full_stack_trace', '')
  );

  return v_extraction_id;
end;
$$;

create trigger source_attachment_observations_validate
before insert on core.source_attachment_observations
for each row execute function core.validate_source_attachment_observation();

create trigger parser_runs_validate_links
before insert on core.parser_runs
for each row execute function core.validate_parser_run_links();

create trigger source_attachments_append_only
before update or delete on core.source_attachments
for each row execute function core.reject_history_mutation();
create trigger source_attachment_observations_append_only
before update or delete on core.source_attachment_observations
for each row execute function core.reject_history_mutation();
create trigger document_extractions_append_only
before update or delete on core.document_extractions
for each row execute function core.reject_history_mutation();
create trigger parser_runs_append_only
before update or delete on core.parser_runs
for each row execute function core.reject_history_mutation();

create index source_attachment_observations_document_idx
  on core.source_attachment_observations (document_sha256);
create index document_extractions_document_idx
  on core.document_extractions (document_sha256, created_at);
create index parser_runs_document_idx
  on core.parser_runs (document_sha256, finished_at);
create index parser_runs_extraction_idx
  on core.parser_runs (extraction_id) where extraction_id is not null;

alter table core.source_attachments enable row level security;
alter table core.source_attachments force row level security;
alter table core.source_attachment_observations enable row level security;
alter table core.source_attachment_observations force row level security;
alter table core.document_extractions enable row level security;
alter table core.document_extractions force row level security;
alter table core.parser_runs enable row level security;
alter table core.parser_runs force row level security;

revoke all on table core.source_attachments from public, anon, authenticated;
revoke all on table core.source_attachment_observations from public, anon, authenticated;
revoke all on table core.document_extractions from public, anon, authenticated;
revoke all on table core.parser_runs from public, anon, authenticated;

revoke all on table core.source_attachments from service_role;
revoke all on table core.source_attachment_observations from service_role;
revoke all on table core.document_extractions from service_role;
revoke all on table core.parser_runs from service_role;

grant select, insert on table core.source_attachments to service_role;
grant select, insert on table core.source_attachment_observations to service_role;
grant select, insert on table core.document_extractions to service_role;
grant select, insert on table core.parser_runs to service_role;

alter function core.validate_source_attachment_observation() owner to postgres;
alter function core.validate_parser_run_links() owner to postgres;
alter function core.record_parser_execution(uuid, jsonb, jsonb) owner to postgres;
revoke all on function core.validate_source_attachment_observation()
  from public, anon, authenticated, service_role;
revoke all on function core.validate_parser_run_links()
  from public, anon, authenticated, service_role;
revoke all on function core.record_parser_execution(uuid, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function core.record_parser_execution(uuid, jsonb, jsonb)
  to service_role;

commit;
