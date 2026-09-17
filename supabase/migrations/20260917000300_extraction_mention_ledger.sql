begin;

-- T03 stores deterministic lexical mention observations against immutable
-- extraction text. It intentionally creates no label, entity, lineage, topic,
-- or public projection object.
create function core.extraction_mention_id(
  p_extraction_id uuid,
  p_mention_contract_version text,
  p_mention_type text,
  p_span_start integer,
  p_span_end integer
)
returns uuid
language sql
immutable
strict
set search_path = ''
as $$
  select md5(
    'kodit:core:extraction-mention:' || p_extraction_id::text || ':' ||
    p_mention_contract_version || ':' || p_mention_type || ':' ||
    p_span_start::text || ':' || p_span_end::text
  )::uuid;
$$;

create table core.extraction_mentions (
  mention_id uuid generated always as (
    core.extraction_mention_id(
      extraction_id,
      mention_contract_version,
      mention_type,
      span_start,
      span_end
    )
  ) stored primary key,
  extraction_id uuid not null
    references core.document_extractions(extraction_id) on delete restrict,
  mention_contract_version text not null
    check (nullif(btrim(mention_contract_version), '') is not null),
  mention_type text not null
    check (mention_type in ('PERSON', 'ORG', 'RULE', 'WORK', 'EMAIL')),
  span_start integer not null check (span_start >= 0),
  span_end integer not null check (span_end > span_start),
  raw_text text not null check (char_length(raw_text) > 0),
  extractor_rule text not null
    check (nullif(btrim(extractor_rule), '') is not null),
  extractor_version text not null
    check (nullif(btrim(extractor_version), '') is not null),
  evidence_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence_metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (
    extraction_id,
    mention_contract_version,
    mention_type,
    span_start,
    span_end
  )
);

comment on table core.extraction_mentions is
  'Immutable lexical mention occurrences anchored to exact Unicode code-point spans in one immutable document extraction. Mention types are observations, not confirmed entities.';
comment on column core.extraction_mentions.span_start is
  'Zero-based inclusive Unicode code-point offset into core.document_extractions.extracted_text.';
comment on column core.extraction_mentions.span_end is
  'Zero-based exclusive Unicode code-point offset into core.document_extractions.extracted_text.';

create function core.validate_extraction_mention_span()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_text text;
begin
  select e.extracted_text into v_text
  from core.document_extractions e
  where e.extraction_id = new.extraction_id;

  if v_text is null then
    raise exception 'unknown extraction' using errcode = '23503';
  end if;
  if new.span_end > char_length(v_text) then
    raise exception 'mention span exceeds extraction text' using errcode = '23514';
  end if;
  if substring(v_text from new.span_start + 1 for new.span_end - new.span_start)
      is distinct from new.raw_text then
    raise exception 'mention raw_text does not match extraction span'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create function core.record_extraction_mentions(
  p_extraction_id uuid,
  p_mention_contract_version text,
  p_extractor_version text,
  p_mentions jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_inserted integer := 0;
  v_row_count integer;
begin
  if nullif(btrim(p_mention_contract_version), '') is null
     or nullif(btrim(p_extractor_version), '') is null then
    raise exception 'mention contract and extractor versions are required'
      using errcode = '22023';
  end if;
  if p_mentions is null or jsonb_typeof(p_mentions) <> 'array' then
    raise exception 'mentions payload must be a JSON array' using errcode = '22023';
  end if;
  if not exists (
    select 1 from core.document_extractions e
    where e.extraction_id = p_extraction_id
  ) then
    raise exception 'unknown extraction' using errcode = '23503';
  end if;

  for v_item in select value from jsonb_array_elements(p_mentions) loop
    insert into core.extraction_mentions (
      extraction_id,
      mention_contract_version,
      mention_type,
      span_start,
      span_end,
      raw_text,
      extractor_rule,
      extractor_version,
      evidence_metadata
    ) values (
      p_extraction_id,
      p_mention_contract_version,
      v_item->>'mention_type',
      (v_item->>'span_start')::integer,
      (v_item->>'span_end')::integer,
      v_item->>'raw_text',
      v_item->>'extractor_rule',
      p_extractor_version,
      coalesce(v_item->'evidence_metadata', '{}'::jsonb)
    )
    on conflict (
      extraction_id,
      mention_contract_version,
      mention_type,
      span_start,
      span_end
    ) do nothing;
    get diagnostics v_row_count = row_count;
    v_inserted := v_inserted + v_row_count;
  end loop;

  return v_inserted;
end;
$$;

create trigger extraction_mentions_validate_span
before insert on core.extraction_mentions
for each row execute function core.validate_extraction_mention_span();

create trigger extraction_mentions_append_only
before update or delete on core.extraction_mentions
for each row execute function core.reject_history_mutation();

create index extraction_mentions_extraction_idx
  on core.extraction_mentions (extraction_id, mention_contract_version);
create index extraction_mentions_type_text_idx
  on core.extraction_mentions (mention_contract_version, mention_type, raw_text);

alter table core.extraction_mentions enable row level security;
alter table core.extraction_mentions force row level security;

revoke all on table core.extraction_mentions from public, anon, authenticated;
revoke all on table core.extraction_mentions from service_role;
grant select, insert on table core.extraction_mentions to service_role;

alter function core.extraction_mention_id(uuid, text, text, integer, integer)
  owner to postgres;
alter function core.validate_extraction_mention_span() owner to postgres;
alter function core.record_extraction_mentions(uuid, text, text, jsonb)
  owner to postgres;

revoke all on function core.extraction_mention_id(uuid, text, text, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function core.validate_extraction_mention_span()
  from public, anon, authenticated, service_role;
revoke all on function core.record_extraction_mentions(uuid, text, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function core.record_extraction_mentions(uuid, text, text, jsonb)
  to service_role;
grant execute on function core.extraction_mention_id(uuid, text, text, integer, integer)
  to service_role;

commit;
