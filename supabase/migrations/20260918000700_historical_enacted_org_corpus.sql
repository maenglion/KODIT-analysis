begin;

create table core.organization_proposal_reconciliations (
  reconciliation_id uuid primary key,
  reconciliation_contract_version text not null,
  proposal_document_id uuid not null references core.organization_evidence_documents(organization_evidence_document_id) on delete restrict,
  enacted_document_id uuid references core.organization_evidence_documents(organization_evidence_document_id) on delete restrict,
  document_series_id uuid not null references core.organization_document_series(document_series_id) on delete restrict,
  reconciliation_status text not null check (reconciliation_status in (
    'ENACTED_MATCHED','ENACTED_WITH_CHANGES','WITHDRAWN_OR_NOT_CONFIRMED','NO_ENACTED_VERSION_FOUND'
  )),
  reconciliation_basis text not null,
  compared_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (reconciliation_contract_version,proposal_document_id,document_series_id)
);

create table core.temporal_function_profiles (
  temporal_profile_id uuid primary key,
  profile_contract_version text not null,
  profile_key text not null,
  document_version_id uuid not null references core.organization_document_versions(document_version_id) on delete restrict,
  document_series_id uuid not null references core.organization_document_series(document_series_id) on delete restrict,
  valid_from date not null,
  valid_to date,
  profile_status text not null check (profile_status in ('OFFICIAL_ENACTED','PARTIAL_FUNCTION_COVERAGE')),
  created_at timestamptz not null default now(),
  unique (profile_contract_version,profile_key),
  check (valid_to is null or valid_from < valid_to)
);

create table core.temporal_function_profile_assignments (
  temporal_profile_id uuid not null references core.temporal_function_profiles(temporal_profile_id) on delete restrict,
  function_assignment_id uuid not null references core.organization_function_assignments(function_assignment_id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (temporal_profile_id,function_assignment_id)
);

create index organization_proposal_reconciliations_proposal_idx
  on core.organization_proposal_reconciliations(proposal_document_id,reconciliation_status);
create index temporal_function_profiles_interval_idx
  on core.temporal_function_profiles(valid_from,valid_to,document_series_id);

create view analytics.temporal_organization_function_assignments_v1
with (security_invoker=true) as
select a.*,p.temporal_profile_id,p.profile_key,p.profile_status,p.valid_from profile_valid_from,p.valid_to profile_valid_to
from core.temporal_function_profile_assignments l
join core.temporal_function_profiles p using(temporal_profile_id)
join core.organization_function_assignments a using(function_assignment_id);

create function publish.public_organization_evidence_catalog_v3()
returns table (
  document_id uuid,document_title text,document_type text,document_series text[],revision_date date,effective_date date,
  source_url text,parsed_text_available boolean,document_sha256 text,version_status text[],previous_version_id uuid,
  proposal_reconciliation_count bigint,related_org_node_count bigint,related_function_count bigint,related_change_event_count bigint
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
  coalesce((select array_agg(distinct v.version_status order by v.version_status)
    from core.organization_document_versions v where v.organization_evidence_document_id=d.organization_evidence_document_id),'{}'::text[]),
  (select v.previous_version_id from core.organization_document_versions v
    where v.organization_evidence_document_id=d.organization_evidence_document_id order by v.revision_date desc nulls last limit 1),
  (select count(*) from core.organization_proposal_reconciliations r
    where r.enacted_document_id=d.organization_evidence_document_id),
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

comment on table core.organization_proposal_reconciliations is
  'T06.8.3 append-only proposal-to-official-enacted reconciliation. A proposal is never promoted to enacted evidence.';
comment on table core.temporal_function_profiles is
  'Official enacted as-of function profile epochs. Snapshot differences alone do not create organization-change events.';

do $$ declare t text; begin foreach t in array array[
  'organization_proposal_reconciliations','temporal_function_profiles','temporal_function_profile_assignments'
] loop
  execute format('create trigger %I_append_only before update or delete on core.%I for each row execute function core.reject_history_mutation()',t,t);
  execute format('alter table core.%I enable row level security',t);
  execute format('alter table core.%I force row level security',t);
  execute format('revoke all on core.%I from public,anon,authenticated,service_role',t);
  execute format('grant select,insert on core.%I to service_role',t);
end loop; end $$;

alter function publish.public_organization_evidence_catalog_v3() owner to postgres;
revoke all on function publish.public_organization_evidence_catalog_v3() from public,anon,authenticated,service_role;
grant execute on function publish.public_organization_evidence_catalog_v3() to anon,authenticated,service_role;
revoke all on analytics.temporal_organization_function_assignments_v1 from public,anon,authenticated,service_role;
grant select on analytics.temporal_organization_function_assignments_v1 to service_role;

commit;
