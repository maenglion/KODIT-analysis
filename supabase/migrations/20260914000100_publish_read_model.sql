begin;

create schema if not exists publish;

revoke all on schema publish from public, anon, authenticated;
grant usage on schema publish to anon, authenticated, service_role;

alter default privileges for role postgres in schema publish revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema publish revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema publish revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema publish grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema publish grant usage, select, update on sequences to service_role;
alter default privileges for role postgres in schema publish grant execute on functions to service_role;

create table publish.releases (
  release_id uuid primary key,
  collection_cycle_id uuid not null unique,
  release_type text not null check (release_type in ('baseline', 'incremental')),
  schema_version text not null,
  evidence_as_of date not null,
  generated_at timestamptz not null,
  source_snapshot_hash char(64) not null check (source_snapshot_hash ~ '^[0-9a-f]{64}$'),
  projection_hash char(64) not null check (projection_hash ~ '^[0-9a-f]{64}$'),
  population integer not null check (population > 0),
  status text not null check (status in ('candidate', 'approved', 'retired')),
  approved_at timestamptz,
  approved_by text,
  created_at timestamptz not null default now(),
  check (status <> 'approved' or (approved_at is not null and nullif(btrim(approved_by), '') is not null))
);

create table publish.current_release (
  singleton_key boolean primary key default true check (singleton_key = true),
  release_id uuid not null references publish.releases(release_id) on delete restrict,
  changed_at timestamptz not null,
  changed_by text not null check (nullif(btrim(changed_by), '') is not null)
);

create table publish.regulations (
  release_id uuid not null references publish.releases(release_id) on delete restrict,
  regulation_id uuid not null,
  regulation_version_id uuid not null,
  regulation_code text not null,
  display_name text not null,
  normalized_name text not null,
  availability text check (availability is null or availability in ('FULLTEXT_PUBLIC', 'PARTIAL_PUBLIC', 'NOTICE_ONLY', 'SOURCE_UNKNOWN')),
  currentness text check (currentness is null or currentness in ('current_confirmed', 'past_version', 'abolished', 'merged', 'currentness_unverified', 'currentness_unresolved')),
  revision_date date,
  notice_department text,
  source_location text check (source_location is null or source_location ~ '^https?://'),
  official_source_available boolean generated always as (source_location is not null) stored,
  partial_alio boolean not null default false,
  partial_kodit_page boolean not null default false,
  partial_attachment boolean not null default false,
  first_seen_cycle_id uuid,
  last_changed_cycle_id uuid,
  is_new boolean not null default false,
  is_updated boolean not null default false,
  primary key (release_id, regulation_version_id),
  check (availability = 'PARTIAL_PUBLIC' or not (partial_alio or partial_kodit_page or partial_attachment)),
  check (availability <> 'PARTIAL_PUBLIC' or partial_alio or partial_kodit_page or partial_attachment)
);

create table publish.regulation_sources (
  source_id uuid primary key,
  release_id uuid not null,
  regulation_version_id uuid not null,
  regulation_code text not null,
  source_kind text not null check (source_kind in ('ALIO', 'KODIT_ATTACHMENT', 'KODIT_PAGE', 'OFFICIAL_OTHER')),
  evidence_role text not null check (evidence_role in ('FULLTEXT_REPRESENTATION', 'NOTICE_EVIDENCE', 'PARTIAL_EVIDENCE', 'OTHER_EVIDENCE')),
  source_location text not null check (source_location ~ '^https?://'),
  attachment_name text,
  document_sha256 char(64) check (document_sha256 is null or document_sha256 ~ '^[0-9a-f]{64}$'),
  representation_format text check (representation_format is null or representation_format in ('PDF', 'HWP', 'HWPX', 'HTML', 'ZIP', 'OTHER')),
  is_primary boolean not null default false,
  fulltext_verified boolean not null default false,
  drm_classification text check (drm_classification is null or drm_classification in ('DRMONE_CONTAINER', 'FASOO_SECURE_CONTAINER')),
  foreign key (release_id, regulation_version_id) references publish.regulations(release_id, regulation_version_id) on delete restrict,
  unique (release_id, regulation_version_id, source_location)
);

create table publish.notices (
  release_id uuid not null references publish.releases(release_id) on delete restrict,
  notice_id uuid not null,
  notice_number text not null,
  title text not null,
  notice_department text not null,
  posted_date date not null,
  source_location text not null check (source_location ~ '^https?://'),
  linked_regulation_version_ids uuid[] not null default '{}',
  primary key (release_id, notice_id),
  unique (release_id, notice_number)
);

create index publish_notices_regulation_versions_idx on publish.notices using gin (linked_regulation_version_ids);
create index publish_regulations_notice_department_idx on publish.regulations (release_id, notice_department);
create index publish_regulations_availability_idx on publish.regulations (release_id, availability);

create table publish.regulation_changes (
  change_id uuid primary key,
  release_id uuid not null,
  regulation_version_id uuid not null,
  regulation_code text not null,
  collection_cycle_id uuid not null,
  change_type text not null check (change_type in ('NEW', 'UPDATED', 'REMOVED')),
  changed_fields text[] not null default '{}',
  changed_at timestamptz not null,
  foreign key (release_id, regulation_version_id) references publish.regulations(release_id, regulation_version_id) on delete restrict
);

create table publish.spec_registry (
  spec_code text not null,
  spec_version text not null,
  artifact_path text not null,
  artifact_sha256 char(64) not null check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  effective_at timestamptz not null,
  primary key (spec_code, spec_version)
);

create function publish.guard_approved_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_release_id uuid := case when tg_op = 'DELETE' then old.release_id else new.release_id end;
begin
  if exists (
    select 1 from publish.releases r
    where r.release_id = v_release_id and r.status in ('approved', 'retired')
  ) then
    raise exception 'approved publish snapshots are immutable' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger publish_regulations_immutable
before insert or update or delete on publish.regulations
for each row execute function publish.guard_approved_snapshot();
create trigger publish_regulation_sources_immutable
before insert or update or delete on publish.regulation_sources
for each row execute function publish.guard_approved_snapshot();
create trigger publish_notices_immutable
before insert or update or delete on publish.notices
for each row execute function publish.guard_approved_snapshot();
create trigger publish_regulation_changes_immutable
before insert or update or delete on publish.regulation_changes
for each row execute function publish.guard_approved_snapshot();

create function publish.ensure_current_release_approved()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from publish.releases r
    where r.release_id = new.release_id and r.status = 'approved'
  ) then
    raise exception 'current release must be approved' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger publish_current_release_approved
before insert or update on publish.current_release
for each row execute function publish.ensure_current_release_approved();

create function publish.public_release_metadata()
returns table (
  release_id uuid,
  release_type text,
  schema_version text,
  evidence_as_of date,
  generated_at timestamptz,
  source_snapshot_hash text,
  projection_hash text,
  population integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.release_id, r.release_type, r.schema_version, r.evidence_as_of,
    r.generated_at, r.source_snapshot_hash::text, r.projection_hash::text, r.population
  from publish.current_release c
  join publish.releases r on r.release_id = c.release_id
  where c.singleton_key and r.status = 'approved';
$$;

create function publish.public_regulation_rows()
returns table (
  release_id uuid,
  regulation_version_id uuid,
  regulation_code text,
  display_name text,
  normalized_name text,
  availability text,
  currentness text,
  revision_date date,
  notice_department text,
  official_source_available boolean,
  source_location text,
  partial_alio boolean,
  partial_kodit_page boolean,
  partial_attachment boolean,
  is_new boolean,
  is_updated boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.release_id, r.regulation_version_id, r.regulation_code, r.display_name, r.normalized_name,
    r.availability, r.currentness, r.revision_date, r.notice_department,
    r.official_source_available, r.source_location, r.partial_alio,
    r.partial_kodit_page, r.partial_attachment, r.is_new, r.is_updated
  from publish.current_release c
  join publish.releases rel on rel.release_id = c.release_id
  join publish.regulations r on r.release_id = rel.release_id
  where c.singleton_key and rel.status = 'approved';
$$;

create function publish.public_regulation_source_rows()
returns table (
  release_id uuid,
  regulation_version_id uuid,
  regulation_code text,
  source_kind text,
  evidence_role text,
  source_location text,
  attachment_name text,
  document_sha256 text,
  representation_format text,
  is_primary boolean,
  fulltext_verified boolean,
  drm_classification text
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.release_id, s.regulation_version_id, s.regulation_code, s.source_kind, s.evidence_role,
    s.source_location, s.attachment_name, s.document_sha256::text,
    s.representation_format, s.is_primary, s.fulltext_verified, s.drm_classification
  from publish.current_release c
  join publish.releases r on r.release_id = c.release_id
  join publish.regulation_sources s on s.release_id = r.release_id
  where c.singleton_key and r.status = 'approved';
$$;

create function publish.public_notice_rows()
returns table (
  release_id uuid,
  notice_number text,
  title text,
  notice_department text,
  posted_date date,
  source_location text,
  linked_regulation_version_ids uuid[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.release_id, n.notice_number, n.title, n.notice_department,
    n.posted_date, n.source_location, n.linked_regulation_version_ids
  from publish.current_release c
  join publish.releases r on r.release_id = c.release_id
  join publish.notices n on n.release_id = r.release_id
  where c.singleton_key and r.status = 'approved';
$$;

do $$
declare relation record;
begin
  for relation in
    select schemaname, tablename from pg_tables where schemaname = 'publish'
  loop
    execute format('alter table %I.%I enable row level security', relation.schemaname, relation.tablename);
    execute format('alter table %I.%I force row level security', relation.schemaname, relation.tablename);
  end loop;
end;
$$;

revoke all on all tables in schema publish from public, anon, authenticated;
revoke all on all sequences in schema publish from public, anon, authenticated;
revoke all on all functions in schema publish from public, anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema publish to service_role;
grant usage, select, update on all sequences in schema publish to service_role;
grant execute on all functions in schema publish to service_role;

alter function publish.public_release_metadata() owner to postgres;
alter function publish.public_regulation_rows() owner to postgres;
alter function publish.public_regulation_source_rows() owner to postgres;
alter function publish.public_notice_rows() owner to postgres;

grant execute on function publish.public_release_metadata() to anon, authenticated;
grant execute on function publish.public_regulation_rows() to anon, authenticated;
grant execute on function publish.public_regulation_source_rows() to anon, authenticated;
grant execute on function publish.public_notice_rows() to anon, authenticated;

commit;
