begin;

create table core.organization_document_series (
  document_series_id uuid primary key,
  series_contract_version text not null,
  series_code text not null,
  canonical_title text not null,
  issuing_body text not null default '신용보증기금',
  created_at timestamptz not null default now(),
  unique (series_contract_version,series_code)
);

create table core.organization_document_versions (
  document_version_id uuid primary key,
  version_contract_version text not null,
  organization_evidence_document_id uuid not null references core.organization_evidence_documents(organization_evidence_document_id) on delete restrict,
  official_title text not null,
  revision_date date,
  effective_date date,
  previous_version_id uuid references core.organization_document_versions(document_version_id) on delete restrict,
  version_status text not null check (version_status in ('CURRENT_FULLTEXT','OFFICIAL_PREANNOUNCEMENT','HISTORICAL_FULLTEXT')),
  created_at timestamptz not null default now(),
  unique (version_contract_version,organization_evidence_document_id)
);

create table core.organization_document_version_series (
  document_version_id uuid not null references core.organization_document_versions(document_version_id) on delete restrict,
  document_series_id uuid not null references core.organization_document_series(document_series_id) on delete restrict,
  series_relation text not null check (series_relation in ('VERSION_OF','AMENDS','REFERENCES')),
  created_at timestamptz not null default now(),
  primary key (document_version_id,document_series_id)
);

create table core.organization_evidence_spans (
  evidence_span_id uuid primary key,
  span_contract_version text not null,
  organization_evidence_document_id uuid not null references core.organization_evidence_documents(organization_evidence_document_id) on delete restrict,
  extraction_id uuid references core.document_extractions(extraction_id) on delete restrict,
  source_locator text not null,
  span_start integer,
  span_end integer,
  observed_text text not null,
  observation_type text not null check (observation_type in ('ORG_SNAPSHOT','FUNCTION_ASSIGNMENT','DELEGATION_EVIDENCE','CHANGE_CUE','EFFECTIVE_DATE')),
  evidence_quality text not null check (evidence_quality in ('OFFICIAL_DIRECT','OFFICIAL_TABLE','OFFICIAL_DERIVED')),
  created_at timestamptz not null default now(),
  unique (span_contract_version,organization_evidence_document_id,source_locator,observation_type,observed_text),
  check (span_start is null or span_start>=0),
  check (span_end is null or span_start is null or span_end>=span_start)
);

create table core.organization_snapshots (
  snapshot_id uuid primary key,
  snapshot_contract_version text not null,
  snapshot_key text not null,
  snapshot_date date not null,
  effective_date date,
  organization_evidence_document_id uuid not null references core.organization_evidence_documents(organization_evidence_document_id) on delete restrict,
  snapshot_status text not null check (snapshot_status in ('DIRECT_SNAPSHOT','PARTIAL_SNAPSHOT')),
  created_at timestamptz not null default now(),
  unique (snapshot_contract_version,snapshot_key)
);

create table core.organization_snapshot_observations (
  snapshot_observation_id uuid primary key,
  snapshot_id uuid not null references core.organization_snapshots(snapshot_id) on delete restrict,
  org_node_id uuid not null references core.organization_nodes(org_node_id) on delete restrict,
  evidence_span_id uuid not null references core.organization_evidence_spans(evidence_span_id) on delete restrict,
  observed_org_name text not null,
  observation_kind text not null check (observation_kind in ('DIRECT_ORG_CHART','DIRECT_ORG_RULE','DIRECT_FUNCTION_RULE','DIRECT_CONTACT_DIRECTORY')),
  observed_present boolean not null default true,
  created_at timestamptz not null default now(),
  unique (snapshot_id,org_node_id,evidence_span_id)
);

create table core.organization_function_observations (
  function_observation_id uuid primary key,
  observation_contract_version text not null,
  organization_evidence_document_id uuid not null references core.organization_evidence_documents(organization_evidence_document_id) on delete restrict,
  org_node_id uuid not null references core.organization_nodes(org_node_id) on delete restrict,
  evidence_span_id uuid not null references core.organization_evidence_spans(evidence_span_id) on delete restrict,
  raw_function_phrase text not null,
  normalized_lexical_form text not null,
  evidence_type text not null check (evidence_type in ('DIRECT_FUNCTION_ASSIGNMENT','DIRECT_ORG_RULE','DELEGATION_EVIDENCE','CONTACT_DIRECTORY_EVIDENCE')),
  valid_from date,
  valid_to date,
  created_at timestamptz not null default now(),
  unique (observation_contract_version,organization_evidence_document_id,org_node_id,evidence_span_id,raw_function_phrase),
  check (valid_to is null or valid_from is null or valid_from<=valid_to)
);

create table core.organization_function_assignment_spans (
  function_assignment_id uuid not null references core.organization_function_assignments(function_assignment_id) on delete restrict,
  evidence_span_id uuid not null references core.organization_evidence_spans(evidence_span_id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (function_assignment_id,evidence_span_id)
);

create index organization_document_versions_document_idx
  on core.organization_document_versions(organization_evidence_document_id);
create index organization_document_version_series_series_idx
  on core.organization_document_version_series(document_series_id,document_version_id);
create index organization_evidence_spans_document_type_idx
  on core.organization_evidence_spans(organization_evidence_document_id,observation_type);
create index organization_snapshots_document_date_idx
  on core.organization_snapshots(organization_evidence_document_id,snapshot_date);
create index organization_snapshot_observations_org_idx
  on core.organization_snapshot_observations(org_node_id,snapshot_id);
create index organization_function_observations_org_type_idx
  on core.organization_function_observations(org_node_id,evidence_type);

create function core.validate_organization_evidence_span()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if new.extraction_id is not null and not exists (
    select 1 from core.organization_evidence_documents d
    where d.organization_evidence_document_id=new.organization_evidence_document_id
      and d.extraction_id=new.extraction_id
  ) then
    raise exception 'organization evidence span must use the evidence document extraction'
      using errcode='23514';
  end if;
  return new;
end;
$$;

create function core.validate_organization_snapshot_observation()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if not exists (
    select 1
    from core.organization_snapshots s
    join core.organization_evidence_spans e
      on e.organization_evidence_document_id=s.organization_evidence_document_id
    where s.snapshot_id=new.snapshot_id and e.evidence_span_id=new.evidence_span_id
  ) then
    raise exception 'snapshot observation span must belong to the snapshot evidence document'
      using errcode='23514';
  end if;
  return new;
end;
$$;

create function core.validate_organization_function_observation()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if not exists (
    select 1 from core.organization_evidence_spans e
    where e.evidence_span_id=new.evidence_span_id
      and e.organization_evidence_document_id=new.organization_evidence_document_id
  ) then
    raise exception 'function observation span must belong to the observation evidence document'
      using errcode='23514';
  end if;
  return new;
end;
$$;

create function core.validate_organization_function_assignment_span()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if not exists (
    select 1
    from core.organization_function_assignments a
    join core.organization_evidence_spans e
      on e.organization_evidence_document_id=a.organization_evidence_document_id
    where a.function_assignment_id=new.function_assignment_id
      and e.evidence_span_id=new.evidence_span_id
  ) then
    raise exception 'function assignment span must belong to the assignment evidence document'
      using errcode='23514';
  end if;
  return new;
end;
$$;

create trigger organization_evidence_spans_validate
before insert on core.organization_evidence_spans
for each row execute function core.validate_organization_evidence_span();
create trigger organization_snapshot_observations_validate
before insert on core.organization_snapshot_observations
for each row execute function core.validate_organization_snapshot_observation();
create trigger organization_function_observations_validate
before insert on core.organization_function_observations
for each row execute function core.validate_organization_function_observation();
create trigger organization_function_assignment_spans_validate
before insert on core.organization_function_assignment_spans
for each row execute function core.validate_organization_function_assignment_span();

create function publish.public_organization_evidence_catalog_v2()
returns table (
  document_id uuid,document_title text,document_type text,document_series text[],revision_date date,effective_date date,
  source_url text,parsed_text_available boolean,document_sha256 text,related_org_node_count bigint,
  related_function_count bigint,related_change_event_count bigint
)
language sql stable security definer set search_path=''
as $$
select d.organization_evidence_document_id,d.official_title,d.document_type,
  coalesce((select array_agg(distinct s.canonical_title order by s.canonical_title)
    from core.organization_document_versions v
    join core.organization_document_version_series l using(document_version_id)
    join core.organization_document_series s using(document_series_id)
    where v.organization_evidence_document_id=d.organization_evidence_document_id),'{}'::text[]),
  (select max(v.revision_date) from core.organization_document_versions v where v.organization_evidence_document_id=d.organization_evidence_document_id),
  d.effective_date,d.source_url,d.parsed_text_available,d.document_sha256::text,
  (select count(distinct x.org_node_id) from (
    select so.org_node_id from core.organization_snapshots os join core.organization_snapshot_observations so using(snapshot_id)
      where os.organization_evidence_document_id=d.organization_evidence_document_id
    union select f.org_node_id from core.organization_function_observations f
      where f.organization_evidence_document_id=d.organization_evidence_document_id
  ) x),
  (select count(*) from core.organization_function_observations f where f.organization_evidence_document_id=d.organization_evidence_document_id),
  (select count(*) from core.organization_change_events e where e.organization_evidence_document_id=d.organization_evidence_document_id)
from core.organization_evidence_documents d
order by coalesce(d.effective_date,d.source_date) desc,d.official_title
$$;

create function publish.public_organization_evidence_document_detail(p_document_id uuid)
returns jsonb
language sql stable security definer set search_path=''
as $$
select jsonb_build_object(
  'document_id',d.organization_evidence_document_id,'title',d.official_title,'document_type',d.document_type,
  'source_date',d.source_date,'effective_date',d.effective_date,'source_url',d.source_url,
  'parsed_text_available',d.parsed_text_available,
  'snapshots',coalesce((select jsonb_agg(jsonb_build_object('snapshot_date',s.snapshot_date,'organization_name',n.official_name,'observed_org_name',o.observed_org_name,'observation_kind',o.observation_kind) order by o.observed_org_name)
    from core.organization_snapshots s join core.organization_snapshot_observations o using(snapshot_id)
    join core.organization_nodes n using(org_node_id)
    where s.organization_evidence_document_id=d.organization_evidence_document_id),'[]'::jsonb),
  'functions',coalesce((select jsonb_agg(jsonb_build_object('organization_name',n.official_name,'raw_function_phrase',f.raw_function_phrase,'evidence_type',f.evidence_type,'source_locator',sp.source_locator) order by f.raw_function_phrase)
    from core.organization_function_observations f join core.organization_evidence_spans sp using(evidence_span_id)
    join core.organization_nodes n using(org_node_id)
    where f.organization_evidence_document_id=d.organization_evidence_document_id),'[]'::jsonb),
  'change_events',coalesce((select jsonb_agg(jsonb_build_object('change_event_id',e.change_event_id,'relation_type',e.relation_type,'effective_date',e.effective_date,'event_scope',e.event_scope) order by e.effective_date)
    from core.organization_change_events e where e.organization_evidence_document_id=d.organization_evidence_document_id),'[]'::jsonb)
)
from core.organization_evidence_documents d where d.organization_evidence_document_id=p_document_id
$$;

do $$ declare t text; begin foreach t in array array[
  'organization_document_series','organization_document_versions','organization_document_version_series',
  'organization_evidence_spans','organization_snapshots','organization_snapshot_observations',
  'organization_function_observations','organization_function_assignment_spans'] loop
  execute format('create trigger %I_append_only before update or delete on core.%I for each row execute function core.reject_history_mutation()',t,t);
  execute format('alter table core.%I enable row level security',t);
  execute format('alter table core.%I force row level security',t);
  execute format('revoke all on core.%I from public,anon,authenticated,service_role',t);
  execute format('grant select,insert on core.%I to service_role',t);
end loop; end $$;

alter function publish.public_organization_evidence_catalog_v2() owner to postgres;
alter function publish.public_organization_evidence_document_detail(uuid) owner to postgres;
alter function core.validate_organization_evidence_span() owner to postgres;
alter function core.validate_organization_snapshot_observation() owner to postgres;
alter function core.validate_organization_function_observation() owner to postgres;
alter function core.validate_organization_function_assignment_span() owner to postgres;
revoke all on function core.validate_organization_evidence_span() from public,anon,authenticated,service_role;
revoke all on function core.validate_organization_snapshot_observation() from public,anon,authenticated,service_role;
revoke all on function core.validate_organization_function_observation() from public,anon,authenticated,service_role;
revoke all on function core.validate_organization_function_assignment_span() from public,anon,authenticated,service_role;
revoke all on function publish.public_organization_evidence_catalog_v2() from public,anon,authenticated,service_role;
revoke all on function publish.public_organization_evidence_document_detail(uuid) from public,anon,authenticated,service_role;
grant execute on function publish.public_organization_evidence_catalog_v2() to anon,authenticated,service_role;
grant execute on function publish.public_organization_evidence_document_detail(uuid) to anon,authenticated,service_role;

commit;
