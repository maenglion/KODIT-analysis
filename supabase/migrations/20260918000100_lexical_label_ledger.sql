begin;

-- T04 groups raw observations by a deliberately conservative lexical
-- contract. A label is neither an entity nor an organization node.
create function core.normalize_label_v1(p_raw text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select regexp_replace(
    btrim(normalize(p_raw, NFC)),
    '[[:space:]]+',
    ' ',
    'g'
  );
$$;

create function core.lexical_label_id(
  p_label_contract_version text,
  p_normalized_label text
)
returns uuid
language sql
immutable
strict
set search_path = ''
as $$
  select md5(
    'kodit:core:lexical-label:' || p_label_contract_version || ':' ||
    p_normalized_label
  )::uuid;
$$;

create table core.labels (
  label_id uuid generated always as (
    core.lexical_label_id(label_contract_version, normalized_label)
  ) stored primary key,
  label_contract_version text not null
    check (nullif(btrim(label_contract_version), '') is not null),
  normalized_label text not null
    check (nullif(normalized_label, '') is not null),
  created_at timestamptz not null default now(),
  unique (label_contract_version, normalized_label),
  unique (label_id, label_contract_version),
  check (normalized_label = core.normalize_label_v1(normalized_label))
);

comment on table core.labels is
  'Deterministic lexical identities. Labels are not people, entities, institutional nodes, or canonical display names.';
comment on column core.labels.normalized_label is
  'Unicode NFC, outer trim, and internal whitespace normalization only. Semantic normalization is prohibited by label-v1.';

create table core.extraction_mention_labels (
  mention_id uuid not null
    references core.extraction_mentions(mention_id) on delete restrict,
  label_id uuid not null,
  label_contract_version text not null,
  created_at timestamptz not null default now(),
  primary key (mention_id, label_contract_version),
  foreign key (label_id, label_contract_version)
    references core.labels(label_id, label_contract_version) on delete restrict
);

comment on table core.extraction_mention_labels is
  'Versioned lexical-label link for one immutable extraction mention. The original mention type remains the only type evidence.';

create table core.notice_department_residual_labels (
  residual_id uuid not null
    references publish.notice_department_residual_occurrences(residual_id)
    on delete restrict,
  label_id uuid not null,
  label_contract_version text not null,
  created_at timestamptz not null default now(),
  primary key (residual_id, label_contract_version),
  foreign key (label_id, label_contract_version)
    references core.labels(label_id, label_contract_version) on delete restrict
);

comment on table core.notice_department_residual_labels is
  'Versioned lexical-label link for a T01 department residual. A residual occurrence supplies no PERSON/ORG/etc type evidence.';

create function core.record_lexical_label_links(
  p_label_contract_version text,
  p_labels jsonb default '[]'::jsonb,
  p_mention_links jsonb default '[]'::jsonb,
  p_residual_links jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_normalized text;
  v_label_id uuid;
  v_labels integer := 0;
  v_mentions integer := 0;
  v_residuals integer := 0;
  v_count integer;
begin
  if nullif(btrim(p_label_contract_version), '') is null then
    raise exception 'label contract version is required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_labels) <> 'array'
     or jsonb_typeof(p_mention_links) <> 'array'
     or jsonb_typeof(p_residual_links) <> 'array' then
    raise exception 'all label payloads must be JSON arrays' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_labels) loop
    v_normalized := v_item->>'normalized_label';
    if v_normalized is null
       or v_normalized = ''
       or v_normalized <> core.normalize_label_v1(v_normalized) then
      raise exception 'invalid normalized label' using errcode = '22023';
    end if;
    insert into core.labels (label_contract_version, normalized_label)
    values (p_label_contract_version, v_normalized)
    on conflict (label_contract_version, normalized_label) do nothing;
    get diagnostics v_count = row_count;
    v_labels := v_labels + v_count;
  end loop;

  for v_item in select value from jsonb_array_elements(p_mention_links) loop
    v_normalized := v_item->>'normalized_label';
    v_label_id := core.lexical_label_id(p_label_contract_version, v_normalized);
    insert into core.extraction_mention_labels (
      mention_id, label_id, label_contract_version
    ) values (
      (v_item->>'mention_id')::uuid, v_label_id, p_label_contract_version
    ) on conflict (mention_id, label_contract_version) do nothing;
    get diagnostics v_count = row_count;
    v_mentions := v_mentions + v_count;
  end loop;

  for v_item in select value from jsonb_array_elements(p_residual_links) loop
    v_normalized := v_item->>'normalized_label';
    v_label_id := core.lexical_label_id(p_label_contract_version, v_normalized);
    insert into core.notice_department_residual_labels (
      residual_id, label_id, label_contract_version
    ) values (
      (v_item->>'residual_id')::uuid, v_label_id, p_label_contract_version
    ) on conflict (residual_id, label_contract_version) do nothing;
    get diagnostics v_count = row_count;
    v_residuals := v_residuals + v_count;
  end loop;

  return jsonb_build_object(
    'labels', v_labels,
    'mention_links', v_mentions,
    'residual_links', v_residuals
  );
end;
$$;

create view core.label_type_evidence
with (security_invoker = true)
as
select
  l.label_id,
  l.label_contract_version,
  count(m.mention_id) filter (where m.mention_type = 'PERSON')::bigint as person_mention_count,
  count(m.mention_id) filter (where m.mention_type = 'ORG')::bigint as org_mention_count,
  count(m.mention_id) filter (where m.mention_type = 'RULE')::bigint as rule_mention_count,
  count(m.mention_id) filter (where m.mention_type = 'WORK')::bigint as work_mention_count,
  count(m.mention_id) filter (where m.mention_type = 'EMAIL')::bigint as email_mention_count,
  case
    when count(distinct m.mention_type) = 0 then 'UNTYPED'
    when count(distinct m.mention_type) > 1 then 'AMBIGUOUS'
    else min(m.mention_type)
  end as resolved_label_type
from core.labels l
left join core.extraction_mention_labels ml
  on ml.label_id = l.label_id
 and ml.label_contract_version = l.label_contract_version
left join core.extraction_mentions m on m.mention_id = ml.mention_id
group by l.label_id, l.label_contract_version;

create view core.label_raw_variants
with (security_invoker = true)
as
with variants as (
  select ml.label_id, ml.label_contract_version, m.raw_text as raw_variant,
         1::bigint as mention_count, 0::bigint as residual_count
  from core.extraction_mention_labels ml
  join core.extraction_mentions m on m.mention_id = ml.mention_id
  union all
  select rl.label_id, rl.label_contract_version, r.raw_label,
         0::bigint, 1::bigint
  from core.notice_department_residual_labels rl
  join publish.notice_department_residual_occurrences r
    on r.residual_id = rl.residual_id
)
select label_id, label_contract_version, raw_variant,
       sum(mention_count)::bigint as mention_occurrence_count,
       sum(residual_count)::bigint as department_residual_occurrence_count,
       sum(mention_count + residual_count)::bigint as total_occurrence_count
from variants
group by label_id, label_contract_version, raw_variant;

create view core.label_metrics
with (security_invoker = true)
as
with mention_rollup as (
  select ml.label_id, ml.label_contract_version,
         count(*)::bigint as mention_occurrence_count,
         count(distinct m.extraction_id)::bigint as extraction_count
  from core.extraction_mention_labels ml
  join core.extraction_mentions m on m.mention_id = ml.mention_id
  group by ml.label_id, ml.label_contract_version
), residual_rollup as (
  select rl.label_id, rl.label_contract_version,
         count(*)::bigint as residual_occurrence_count
  from core.notice_department_residual_labels rl
  group by rl.label_id, rl.label_contract_version
), source_occurrences as (
  select distinct
    ml.label_id,
    ml.label_contract_version,
    s.source_code || ':' || coalesce(sr.external_key, sr.source_record_id::text)
      as source_record_key,
    case when s.source_code = 'kodit-preannouncement-preserved'
      then 'KODIT:' || coalesce(sr.external_key, sr.source_record_id::text)
      else null end as kodit_notice_key,
    sr.published_at as observed_at
  from core.extraction_mention_labels ml
  join core.extraction_mentions m on m.mention_id = ml.mention_id
  join core.parser_runs pr on pr.extraction_id = m.extraction_id
  join core.source_attachment_observations sao
    on sao.attachment_observation_id = pr.attachment_observation_id
  join core.source_attachments sa on sa.attachment_id = sao.attachment_id
  join core.source_records sr on sr.source_record_id = sa.source_record_id
  join core.sources s on s.source_id = sr.source_id
  union
  select distinct
    rl.label_id,
    rl.label_contract_version,
    'kodit-preannouncement-preserved:' || n.notice_number,
    'KODIT:' || n.notice_number,
    r.posted_at
  from core.notice_department_residual_labels rl
  join publish.notice_department_residual_occurrences r
    on r.residual_id = rl.residual_id
  join publish.notices n
    on n.release_id = r.release_id and n.notice_id = r.notice_id
), source_rollup as (
  select label_id, label_contract_version,
         count(distinct source_record_key)::bigint as source_record_count,
         count(distinct kodit_notice_key)::bigint as kodit_notice_count,
         min(observed_at) as first_seen_at,
         max(observed_at) as last_seen_at
  from source_occurrences
  group by label_id, label_contract_version
), variant_rollup as (
  select label_id, label_contract_version,
         count(*)::bigint as distinct_raw_variant_count
  from core.label_raw_variants
  group by label_id, label_contract_version
)
select
  l.label_id,
  l.label_contract_version,
  l.normalized_label,
  coalesce(m.mention_occurrence_count, 0)::bigint as mention_occurrence_count,
  coalesce(r.residual_occurrence_count, 0)::bigint
    as department_residual_occurrence_count,
  coalesce(m.extraction_count, 0)::bigint as extraction_count,
  coalesce(s.source_record_count, 0)::bigint as source_record_count,
  coalesce(s.kodit_notice_count, 0)::bigint as kodit_notice_count,
  s.first_seen_at,
  s.last_seen_at,
  coalesce(v.distinct_raw_variant_count, 0)::bigint as distinct_raw_variant_count
from core.labels l
left join mention_rollup m using (label_id, label_contract_version)
left join residual_rollup r using (label_id, label_contract_version)
left join source_rollup s using (label_id, label_contract_version)
left join variant_rollup v using (label_id, label_contract_version);

create trigger labels_append_only
before update or delete on core.labels
for each row execute function core.reject_history_mutation();
create trigger extraction_mention_labels_append_only
before update or delete on core.extraction_mention_labels
for each row execute function core.reject_history_mutation();
create trigger notice_department_residual_labels_append_only
before update or delete on core.notice_department_residual_labels
for each row execute function core.reject_history_mutation();

create index extraction_mention_labels_label_idx
  on core.extraction_mention_labels (label_contract_version, label_id);
create index notice_department_residual_labels_label_idx
  on core.notice_department_residual_labels (label_contract_version, label_id);

alter table core.labels enable row level security;
alter table core.labels force row level security;
alter table core.extraction_mention_labels enable row level security;
alter table core.extraction_mention_labels force row level security;
alter table core.notice_department_residual_labels enable row level security;
alter table core.notice_department_residual_labels force row level security;

revoke all on table core.labels from public, anon, authenticated, service_role;
revoke all on table core.extraction_mention_labels from public, anon, authenticated, service_role;
revoke all on table core.notice_department_residual_labels from public, anon, authenticated, service_role;
grant select, insert on table core.labels to service_role;
grant select, insert on table core.extraction_mention_labels to service_role;
grant select, insert on table core.notice_department_residual_labels to service_role;

revoke all on core.label_type_evidence from public, anon, authenticated;
revoke all on core.label_raw_variants from public, anon, authenticated;
revoke all on core.label_metrics from public, anon, authenticated;
grant select on core.label_type_evidence to service_role;
grant select on core.label_raw_variants to service_role;
grant select on core.label_metrics to service_role;

alter function core.normalize_label_v1(text) owner to postgres;
alter function core.lexical_label_id(text, text) owner to postgres;
alter function core.record_lexical_label_links(text, jsonb, jsonb, jsonb)
  owner to postgres;

revoke all on function core.normalize_label_v1(text)
  from public, anon, authenticated, service_role;
revoke all on function core.lexical_label_id(text, text)
  from public, anon, authenticated, service_role;
revoke all on function core.record_lexical_label_links(text, jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function core.normalize_label_v1(text) to service_role;
grant execute on function core.lexical_label_id(text, text) to service_role;
grant execute on function core.record_lexical_label_links(text, jsonb, jsonb, jsonb)
  to service_role;

commit;
