begin;

alter table core.releases
  add column approved_by_actor text,
  add column approval_note text;

do $$
declare v_constraint text;
begin
  select c.conname into v_constraint
  from pg_constraint c
  where c.conrelid = 'core.releases'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%approved_by%approved_at%';
  if v_constraint is not null then
    execute format('alter table core.releases drop constraint %I', v_constraint);
  end if;
end;
$$;

alter table core.releases add constraint releases_approval_identity_check check (
  status not in ('approved', 'published')
  or (approved_at is not null and (approved_by is not null or nullif(btrim(approved_by_actor), '') is not null))
);

create table core.release_regulation_rows (
  release_regulation_row_id uuid primary key default gen_random_uuid(),
  release_id uuid not null references core.releases(release_id) on delete restrict,
  regulation_code text not null,
  regulation_name text not null,
  normalized_name text not null,
  public_status_code text not null check (public_status_code in ('FULLTEXT_PUBLIC', 'EXTRACTION_PENDING', 'NOTICE_ONLY', 'SOURCE_UNKNOWN', 'NONPUBLIC', 'NONPUBLIC_CANDIDATE')),
  public_status_label text not null,
  lifecycle_code text not null,
  document_verification_code text not null,
  nonpublic_stage smallint not null default 0 check (nonpublic_stage between 0 and 4),
  primary_claim text not null,
  confidence_level smallint not null check (confidence_level between 1 and 5),
  decision_reason_code text not null,
  decision_reason text not null,
  official_source_count integer not null default 0 check (official_source_count >= 0),
  search_verification_count smallint not null default 0 check (search_verification_count between 0 and 3),
  human_confirmed boolean not null default false,
  last_collected_at timestamptz not null,
  last_verified_at timestamptz not null,
  official_url text,
  document_sha256 char(64) check (document_sha256 is null or document_sha256 ~ '^[0-9a-f]{64}$'),
  document_format text,
  revision_date text,
  methodology_version text not null,
  created_at timestamptz not null default now(),
  unique (release_id, regulation_name),
  check (official_url is null or official_url ~ '^https?://')
);

create index release_regulation_rows_release_idx on core.release_regulation_rows(release_id);
create function core.guard_release_regulation_snapshot()
returns trigger language plpgsql set search_path = '' as $$
declare v_release_id uuid := case when tg_op = 'DELETE' then old.release_id else new.release_id end;
begin
  if not exists (
    select 1 from core.releases r where r.release_id = v_release_id and r.status = 'draft' and not r.is_latest
  ) then
    raise exception 'published or latest release snapshots are immutable' using errcode = '55000';
  end if;
  if tg_op = 'UPDATE' and old.release_id <> new.release_id then
    raise exception 'release snapshot rows cannot move between releases' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger release_regulation_rows_guard
before insert or update or delete on core.release_regulation_rows
for each row execute function core.guard_release_regulation_snapshot();
alter table core.release_regulation_rows enable row level security;
alter table core.release_regulation_rows force row level security;
revoke all on core.release_regulation_rows from public, anon, authenticated;
grant select, insert, update, delete on core.release_regulation_rows to service_role;

drop view if exists api.public_regulations;
drop function if exists api.public_regulation_rows();

create function api.public_regulation_rows()
returns table (
  release_id uuid, release_as_of_date date, regulation_code text, regulation_name text,
  normalized_name text, public_status_code text, public_status_label text, lifecycle_code text,
  document_verification_code text, nonpublic_stage smallint, primary_claim text,
  confidence_level smallint, decision_reason_code text, decision_reason text,
  official_source_count integer, search_verification_count smallint, human_confirmed boolean,
  last_collected_at timestamptz, last_verified_at timestamptz, official_url text,
  document_sha256 text, document_format text, revision_date text, methodology_version text,
  release_status text
)
language sql stable security definer set search_path = '' as $$
  select r.release_id, r.as_of_date, rr.regulation_code, rr.regulation_name,
    rr.normalized_name, rr.public_status_code, rr.public_status_label, rr.lifecycle_code,
    rr.document_verification_code, rr.nonpublic_stage, rr.primary_claim,
    rr.confidence_level, rr.decision_reason_code, rr.decision_reason,
    rr.official_source_count, rr.search_verification_count, rr.human_confirmed,
    rr.last_collected_at, rr.last_verified_at, rr.official_url,
    rr.document_sha256::text, rr.document_format, rr.revision_date, rr.methodology_version,
    r.status
  from core.releases r
  join core.release_regulation_rows rr on rr.release_id = r.release_id
  where r.status = 'published'
    and r.is_latest
    and r.published_at is not null
    and r.published_at <= now();
$$;

create function api.public_collection_state()
returns table (
  last_checked_at timestamptz, last_successful_at timestamptz, recent_status text,
  next_due_at timestamptz, human_review_pending_count bigint
)
language sql stable security definer set search_path = '' as $$
  with latest as (
    select cr.* from core.crawl_runs cr
    where cr.job_code = 'kodit-regulation-full-collection'
    order by cr.started_at desc limit 1
  ), successful as (
    select max(coalesce(cr.completed_at, cr.finished_at)) as at
    from core.crawl_runs cr
    where cr.job_code = 'kodit-regulation-full-collection' and cr.status in ('succeeded', 'no_change')
  ), pending_entities as (
    select sa.entity_type || ':' || sa.entity_id as entity_key
    from core.status_assignments sa
    where not sa.human_confirmed and sa.assigned_by like 'regenerator:%:review_pending'
    union
    select 'discovery:' || d.discovery_id::text
    from core.external_discoveries d
    where d.workflow_status = 'verification_pending' and not d.human_confirmed
  )
  select (select started_at from latest), successful.at,
    coalesce((select status from latest), 'waiting'), successful.at + interval '10 days',
    (select count(*) from pending_entities)
  from successful;
$$;

create function api.upsert_draft_regulation_rows(p_release_id uuid, p_rows jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if p_release_id is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 250 then
    raise exception 'invalid release rows batch' using errcode = '22023';
  end if;
  if not exists (select 1 from core.releases r where r.release_id = p_release_id and r.status = 'draft' and not r.is_latest) then
    raise exception 'target release must be a non-latest draft' using errcode = '22023';
  end if;

  insert into core.release_regulation_rows (
    release_id, regulation_code, regulation_name, normalized_name, public_status_code,
    public_status_label, lifecycle_code, document_verification_code, nonpublic_stage,
    primary_claim, confidence_level, decision_reason_code, decision_reason,
    official_source_count, search_verification_count, human_confirmed, last_collected_at,
    last_verified_at, official_url, document_sha256, document_format, revision_date, methodology_version
  )
  select p_release_id, x.regulation_code, x.regulation_name, x.normalized_name, x.public_status_code,
    x.public_status_label, x.lifecycle_code, x.document_verification_code, x.nonpublic_stage,
    x.primary_claim, x.confidence_level, x.decision_reason_code, x.decision_reason,
    x.official_source_count, x.search_verification_count, x.human_confirmed, x.last_collected_at,
    x.last_verified_at, nullif(x.official_url, ''), nullif(x.document_sha256, ''),
    nullif(x.document_format, ''), nullif(x.revision_date, ''), x.methodology_version
  from jsonb_to_recordset(p_rows) as x(
    regulation_code text, regulation_name text, normalized_name text, public_status_code text,
    public_status_label text, lifecycle_code text, document_verification_code text,
    nonpublic_stage smallint, primary_claim text, confidence_level smallint,
    decision_reason_code text, decision_reason text, official_source_count integer,
    search_verification_count smallint, human_confirmed boolean, last_collected_at timestamptz,
    last_verified_at timestamptz, official_url text, document_sha256 text,
    document_format text, revision_date text, methodology_version text
  )
  on conflict (release_id, regulation_name) do update set
    regulation_code = excluded.regulation_code, normalized_name = excluded.normalized_name,
    public_status_code = excluded.public_status_code, public_status_label = excluded.public_status_label,
    lifecycle_code = excluded.lifecycle_code, document_verification_code = excluded.document_verification_code,
    nonpublic_stage = excluded.nonpublic_stage, primary_claim = excluded.primary_claim,
    confidence_level = excluded.confidence_level, decision_reason_code = excluded.decision_reason_code,
    decision_reason = excluded.decision_reason, official_source_count = excluded.official_source_count,
    search_verification_count = excluded.search_verification_count, human_confirmed = excluded.human_confirmed,
    last_collected_at = excluded.last_collected_at, last_verified_at = excluded.last_verified_at,
    official_url = excluded.official_url, document_sha256 = excluded.document_sha256,
    document_format = excluded.document_format, revision_date = excluded.revision_date,
    methodology_version = excluded.methodology_version;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create function api.publish_regulation_release(
  p_release_id uuid, p_confirmation text, p_approval_note text, p_approved_by_actor text,
  p_dry_run boolean default false
)
returns table (release_id uuid, result text, regulation_count bigint, decision_count bigint, claim_count bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_release core.releases%rowtype;
  v_regulation_count bigint;
  v_decision_count bigint;
  v_claim_count bigint;
  v_now timestamptz := clock_timestamp();
begin
  if p_confirmation is distinct from 'PUBLISH' then raise exception 'confirmation must be PUBLISH' using errcode = '22023'; end if;
  if nullif(btrim(p_approval_note), '') is null or length(p_approval_note) > 2000 then raise exception 'approval note is required' using errcode = '22023'; end if;
  if p_approved_by_actor !~ '^[A-Za-z0-9][A-Za-z0-9-]{0,38}$' then raise exception 'invalid GitHub actor' using errcode = '22023'; end if;

  select * into v_release from core.releases r where r.release_id = p_release_id for update;
  if not found then raise exception 'release not found' using errcode = 'P0002'; end if;
  if v_release.status = 'withdrawn' then raise exception 'withdrawn release cannot be published' using errcode = '22023'; end if;
  if v_release.status <> 'draft' or v_release.is_latest then raise exception 'target release must be a non-latest draft' using errcode = '22023'; end if;

  select count(*), count(*) filter (where nullif(btrim(rr.decision_reason_code), '') is not null),
    count(*) filter (where nullif(btrim(rr.primary_claim), '') is not null)
  into v_regulation_count, v_decision_count, v_claim_count
  from core.release_regulation_rows rr where rr.release_id = p_release_id;
  if v_regulation_count = 0 or v_decision_count <> v_regulation_count or v_claim_count <> v_regulation_count then
    raise exception 'release is empty or incomplete' using errcode = '23514';
  end if;

  if p_dry_run then
    return query select p_release_id, 'dry_run'::text, v_regulation_count, v_decision_count, v_claim_count;
    return;
  end if;

  update core.releases r set is_latest = false where r.is_latest;
  update core.releases r set status = 'published', is_latest = true,
    approved_at = v_now, published_at = v_now, approved_by_actor = p_approved_by_actor,
    approval_note = p_approval_note
  where r.release_id = p_release_id;
  return query select p_release_id, 'published'::text, v_regulation_count, v_decision_count, v_claim_count;
end;
$$;

create function api.draft_regulation_release_candidates()
returns table (release_id uuid, release_no text, as_of_date date, collector_version text, methodology_version text, row_count bigint)
language sql stable security definer set search_path = '' as $$
  select r.release_id, r.release_no, r.as_of_date, r.collector_version, r.methodology_version, count(rr.release_regulation_row_id)
  from core.releases r
  left join core.release_regulation_rows rr on rr.release_id = r.release_id
  where r.status = 'draft' and not r.is_latest
  group by r.release_id, r.release_no, r.as_of_date, r.collector_version, r.methodology_version
  order by r.as_of_date desc, r.release_no desc;
$$;

create view api.public_regulations with (security_invoker = true) as select * from api.public_regulation_rows();

alter function api.public_regulation_rows() owner to postgres;
alter function api.public_collection_state() owner to postgres;
alter function api.upsert_draft_regulation_rows(uuid, jsonb) owner to postgres;
alter function api.publish_regulation_release(uuid, text, text, text, boolean) owner to postgres;
alter function api.draft_regulation_release_candidates() owner to postgres;

revoke all on function api.public_regulation_rows() from public, anon, authenticated, service_role;
revoke all on function api.public_collection_state() from public, anon, authenticated, service_role;
revoke all on function api.upsert_draft_regulation_rows(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function api.publish_regulation_release(uuid, text, text, text, boolean) from public, anon, authenticated, service_role;
revoke all on function api.draft_regulation_release_candidates() from public, anon, authenticated, service_role;
grant execute on function api.public_regulation_rows(), api.public_collection_state() to anon, authenticated;
grant execute on function api.upsert_draft_regulation_rows(uuid, jsonb), api.publish_regulation_release(uuid, text, text, text, boolean) to service_role;
grant execute on function api.draft_regulation_release_candidates() to service_role;
revoke all on api.public_regulations from public, anon, authenticated;
grant select on api.public_regulations to anon, authenticated;

commit;
