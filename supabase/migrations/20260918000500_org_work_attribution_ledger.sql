begin;

create table core.organization_evidence_documents (
  organization_evidence_document_id uuid primary key,
  evidence_contract_version text not null,
  evidence_key text not null,
  source_record_id uuid references core.source_records(source_record_id) on delete restrict,
  document_sha256 char(64),
  extraction_id uuid references core.document_extractions(extraction_id) on delete restrict,
  document_type text not null check (document_type in ('ORG_CHART','ORG_RULE','ORG_RULE_AMENDMENT','ORG_REORGANIZATION_NOTICE','ORG_FUNCTION_ASSIGNMENT','ORG_DELEGATION_RULE','ORG_CONTACT_DIRECTORY','PRIVACY_RESPONSIBILITY_CHANGE','ANNUAL_REPORT','OTHER_OFFICIAL_ORG_EVIDENCE')),
  source_date date not null,
  effective_date date,
  official_title text not null,
  source_url text not null check (source_url ~ '^https?://'),
  parsed_text_available boolean not null,
  created_at timestamptz not null default now(),
  unique (evidence_contract_version,evidence_key),
  check (document_sha256 is null or document_sha256 ~ '^[0-9a-f]{64}$'),
  check ((extraction_id is null and not parsed_text_available) or (extraction_id is not null and parsed_text_available))
);

create table core.organization_evidence_document_links (
  organization_evidence_document_id uuid not null references core.organization_evidence_documents(organization_evidence_document_id) on delete restrict,
  organization_evidence_id uuid not null references core.organization_evidence(organization_evidence_id) on delete restrict,
  link_type text not null check (link_type in ('SUPPORTS','CLASSIFIES','EXPRESSES_FUNCTION_CHANGE')),
  created_at timestamptz not null default now(),
  primary key (organization_evidence_document_id,organization_evidence_id,link_type)
);

create table core.organization_change_events (
  change_event_id uuid primary key,
  event_contract_version text not null,
  event_key text not null,
  relation_type text not null check (relation_type in ('RENAMED','MERGED','SPLIT','CREATED','ABOLISHED','FUNCTION_TRANSFER','OTHER_DIRECT_ORG_CHANGE')),
  effective_date date,
  organization_evidence_document_id uuid not null references core.organization_evidence_documents(organization_evidence_document_id) on delete restrict,
  organization_evidence_id uuid references core.organization_evidence(organization_evidence_id) on delete restrict,
  event_scope text not null,
  created_at timestamptz not null default now(),
  unique (event_contract_version,event_key),
  check (nullif(btrim(event_scope),'') is not null)
);

create table core.organization_change_event_nodes (
  change_event_id uuid not null references core.organization_change_events(change_event_id) on delete restrict,
  org_node_id uuid not null references core.organization_nodes(org_node_id) on delete restrict,
  participant_role text not null check (participant_role in ('FROM','TO','CREATED','ABOLISHED')),
  created_at timestamptz not null default now(),
  primary key (change_event_id,org_node_id,participant_role)
);

create table core.organization_function_assignments (
  function_assignment_id uuid primary key,
  assignment_contract_version text not null,
  assignment_key text not null,
  work_string text not null,
  org_node_id uuid not null references core.organization_nodes(org_node_id) on delete restrict,
  valid_from date,
  valid_to date,
  organization_evidence_document_id uuid not null references core.organization_evidence_documents(organization_evidence_document_id) on delete restrict,
  organization_evidence_id uuid references core.organization_evidence(organization_evidence_id) on delete restrict,
  assignment_status text not null check (assignment_status='OFFICIAL_DIRECT'),
  created_at timestamptz not null default now(),
  unique (assignment_contract_version,assignment_key),
  check (nullif(btrim(work_string),'') is not null),
  check (valid_to is null or valid_from is null or valid_from<=valid_to)
);

create table core.notice_work_contexts (
  notice_work_context_id uuid primary key,
  release_id uuid not null references publish.releases(release_id) on delete restrict,
  residual_id uuid not null references publish.notice_department_residual_occurrences(residual_id) on delete restrict,
  notice_id uuid not null,
  posted_date date not null,
  normalized_title text not null,
  attachment_sha256 char(64)[] not null default '{}',
  extraction_ids uuid[] not null default '{}',
  rule_label_ids uuid[] not null default '{}',
  regulation_ids uuid[] not null default '{}',
  proposed_regulation_ids uuid[] not null default '{}',
  work_strings text[] not null default '{}',
  body_signature char(64),
  work_context_contract_version text not null,
  created_at timestamptz not null default now(),
  unique (release_id,residual_id,work_context_contract_version),
  foreign key (release_id,notice_id) references publish.notices(release_id,notice_id) on delete restrict,
  check (body_signature is null or body_signature ~ '^[0-9a-f]{64}$')
);

create table core.organization_anchor_notices (
  anchor_notice_id uuid primary key,
  release_id uuid not null references publish.releases(release_id) on delete restrict,
  notice_id uuid not null,
  org_node_id uuid not null references core.organization_nodes(org_node_id) on delete restrict,
  anchor_basis text not null check (anchor_basis in ('OFFICIAL_ASOF_LABEL_RELATION','BODY_DIRECT','FUNCTION_ASSIGNMENT_DIRECT')),
  organization_evidence_id uuid references core.organization_evidence(organization_evidence_id) on delete restrict,
  organization_evidence_document_id uuid references core.organization_evidence_documents(organization_evidence_document_id) on delete restrict,
  anchor_contract_version text not null,
  created_at timestamptz not null default now(),
  unique (release_id,notice_id,org_node_id,anchor_contract_version),
  foreign key (release_id,notice_id) references publish.notices(release_id,notice_id) on delete restrict,
  check (organization_evidence_id is not null or organization_evidence_document_id is not null)
);

create table core.org_work_attribution_runs (
  run_id uuid primary key,
  release_id uuid not null references publish.releases(release_id) on delete restrict,
  residual_id uuid not null references publish.notice_department_residual_occurrences(residual_id) on delete restrict,
  notice_id uuid not null,
  attribution_contract_version text not null,
  similarity_contract_version text not null,
  input_context_hash char(64) not null check (input_context_hash ~ '^[0-9a-f]{64}$'),
  started_at timestamptz not null,
  completed_at timestamptz not null,
  final_status text not null check (final_status in ('DIRECT_ASOF_ORG_CONFIRMED','HISTORICAL_WORK_ORG_SUPPORTED','CURRENT_FUNCTION_DIRECT_CONFIRMED','CURRENT_FUNCTION_PATH_CONFIRMED','UNRESOLVED')),
  historical_org_node_id uuid references core.organization_nodes(org_node_id) on delete restrict,
  current_org_node_id uuid references core.organization_nodes(org_node_id) on delete restrict,
  current_candidate_org_node_id uuid references core.organization_nodes(org_node_id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (release_id,residual_id,attribution_contract_version,input_context_hash),
  foreign key (release_id,notice_id) references publish.notices(release_id,notice_id) on delete restrict,
  check (completed_at>=started_at)
);

create table core.org_work_attribution_candidates (
  candidate_id uuid primary key,
  run_id uuid not null references core.org_work_attribution_runs(run_id) on delete restrict,
  search_epoch_start date,
  search_epoch_end date,
  candidate_notice_id uuid not null,
  candidate_org_node_id uuid not null references core.organization_nodes(org_node_id) on delete restrict,
  candidate_title text not null,
  same_attachment boolean not null,
  same_regulation boolean not null,
  same_proposed_regulation boolean not null,
  title_similarity numeric(7,6) not null check (title_similarity between 0 and 1),
  body_similarity numeric(7,6) not null check (body_similarity between 0 and 1),
  work_overlap numeric(7,6) not null check (work_overlap between 0 and 1),
  combined_score numeric(9,6) not null check (combined_score>=0),
  rank integer not null check (rank>0),
  candidate_status text not null check (candidate_status in ('CURRENT_ANALOG_CANDIDATE','HISTORICAL_ANALOG_CANDIDATE','REJECTED','AMBIGUOUS')),
  rejection_reason text,
  created_at timestamptz not null default now(),
  unique (run_id,candidate_notice_id),
  unique (run_id,rank)
);

create table core.org_work_attribution_steps (
  step_id uuid primary key,
  run_id uuid not null references core.org_work_attribution_runs(run_id) on delete restrict,
  step_order integer not null check (step_order>=0),
  step_type text not null check (step_type in ('CURRENT_SEARCH','HISTORICAL_EPOCH_SEARCH','CANDIDATE_REJECTED','HISTORICAL_ANCHOR_SELECTED','ORG_CHANGE_EVENT_FOLLOWED','FUNCTION_ASSIGNMENT_CONFIRMED','FINAL_RESOLUTION')),
  epoch_start date,
  epoch_end date,
  input_description text not null,
  result_description text not null,
  selected_candidate_id uuid references core.org_work_attribution_candidates(candidate_id) on delete restrict,
  organization_evidence_id uuid references core.organization_evidence(organization_evidence_id) on delete restrict,
  change_event_id uuid references core.organization_change_events(change_event_id) on delete restrict,
  step_status text not null check (step_status in ('COMPLETED','NO_CANDIDATE','REJECTED','AMBIGUOUS')),
  created_at timestamptz not null default now(),
  unique (run_id,step_order)
);

create table core.org_work_attribution_path_steps (
  path_step_id uuid primary key,
  run_id uuid not null references core.org_work_attribution_runs(run_id) on delete restrict,
  step_order integer not null check (step_order>0),
  from_org_node_id uuid not null references core.organization_nodes(org_node_id) on delete restrict,
  to_org_node_id uuid not null references core.organization_nodes(org_node_id) on delete restrict,
  change_event_id uuid not null references core.organization_change_events(change_event_id) on delete restrict,
  relation_type text not null,
  effective_date date,
  organization_evidence_document_id uuid not null references core.organization_evidence_documents(organization_evidence_document_id) on delete restrict,
  work_scope_match boolean,
  created_at timestamptz not null default now(),
  unique (run_id,step_order)
);

create table core.org_work_attribution_evidence (
  attribution_evidence_id uuid primary key,
  run_id uuid not null references core.org_work_attribution_runs(run_id) on delete restrict,
  evidence_kind text not null check (evidence_kind in ('NOTICE_CONTEXT','ATTACHMENT_BINARY','EXTRACTION_TEXT','RULE_MENTION','PROPOSES_ASSERTION','ANCHOR_NOTICE','ORGANIZATION_DOCUMENT','ORGANIZATION_OBSERVATION','CHANGE_EVENT','FUNCTION_ASSIGNMENT')),
  notice_id uuid,
  document_sha256 char(64) references core.documents(sha256) on delete restrict,
  extraction_id uuid references core.document_extractions(extraction_id) on delete restrict,
  mention_id uuid references core.extraction_mentions(mention_id) on delete restrict,
  regulation_id uuid references core.regulations(regulation_id) on delete restrict,
  organization_evidence_document_id uuid references core.organization_evidence_documents(organization_evidence_document_id) on delete restrict,
  organization_evidence_id uuid references core.organization_evidence(organization_evidence_id) on delete restrict,
  change_event_id uuid references core.organization_change_events(change_event_id) on delete restrict,
  span_start integer,
  span_end integer,
  observed_text text,
  evidence_date date,
  created_at timestamptz not null default now(),
  check (span_end is null or span_start is null or span_end>=span_start),
  check (num_nonnulls(notice_id,document_sha256,extraction_id,mention_id,regulation_id,
    organization_evidence_document_id,organization_evidence_id,change_event_id)>0)
);

create index notice_work_contexts_release_residual_idx
  on core.notice_work_contexts(release_id,residual_id);
create index org_work_attribution_runs_release_residual_idx
  on core.org_work_attribution_runs(release_id,residual_id);
create index org_work_attribution_candidates_run_idx
  on core.org_work_attribution_candidates(run_id,rank);
create index org_work_attribution_steps_run_idx
  on core.org_work_attribution_steps(run_id,step_order);
create index org_work_attribution_path_steps_run_idx
  on core.org_work_attribution_path_steps(run_id,step_order);
create index org_work_attribution_evidence_run_idx
  on core.org_work_attribution_evidence(run_id,evidence_kind);

create view analytics.org_work_attribution_audit with (security_invoker=true) as
select r.run_id,r.release_id,r.residual_id,r.notice_id,o.raw_label,o.posted_at,o.title,
  c.notice_work_context_id,c.normalized_title,c.work_strings,c.regulation_ids,c.proposed_regulation_ids,
  r.final_status,r.historical_org_node_id,r.current_org_node_id,r.current_candidate_org_node_id,
  (select count(*) from core.org_work_attribution_candidates x where x.run_id=r.run_id) candidate_count,
  (select count(*) from core.org_work_attribution_steps x where x.run_id=r.run_id) step_count,
  (select count(*) from core.org_work_attribution_evidence x where x.run_id=r.run_id) evidence_count
from core.org_work_attribution_runs r
join publish.notice_department_residual_occurrences o on o.residual_id=r.residual_id
join core.notice_work_contexts c on c.release_id=r.release_id and c.residual_id=r.residual_id;

create function publish.public_organization_evidence_catalog()
returns table (document_id uuid,document_title text,document_type text,source_date date,effective_date date,source_url text,parsed_text_available boolean,document_sha256 text,related_change_event_count bigint,related_org_node_count bigint)
language sql stable security definer set search_path=''
as $$ select d.organization_evidence_document_id,d.official_title,d.document_type,d.source_date,d.effective_date,
  d.source_url,d.parsed_text_available,d.document_sha256::text,
  (select count(*) from core.organization_change_events e where e.organization_evidence_document_id=d.organization_evidence_document_id),
  (select count(distinct n.org_node_id) from core.organization_change_events e join core.organization_change_event_nodes n using(change_event_id) where e.organization_evidence_document_id=d.organization_evidence_document_id)
from core.organization_evidence_documents d order by d.source_date desc,d.official_title $$;

comment on table core.notice_work_contexts is 'T06.6 notice-grain work context. Raw department and person-like values are not similarity inputs.';
comment on table core.org_work_attribution_runs is 'Append-only occurrence-grain audit. Analog candidates are not confirmed organization attribution.';
comment on table core.organization_change_events is 'Reified official organization/function change; FUNCTION_TRANSFER is not whole-organization succession.';

do $$ declare t text; begin foreach t in array array[
  'organization_evidence_documents','organization_evidence_document_links','organization_change_events','organization_change_event_nodes',
  'organization_function_assignments','notice_work_contexts','organization_anchor_notices','org_work_attribution_runs',
  'org_work_attribution_candidates','org_work_attribution_steps','org_work_attribution_path_steps','org_work_attribution_evidence'] loop
  execute format('create trigger %I_append_only before update or delete on core.%I for each row execute function core.reject_history_mutation()',t,t);
  execute format('alter table core.%I enable row level security',t);
  execute format('alter table core.%I force row level security',t);
  execute format('revoke all on core.%I from public,anon,authenticated,service_role',t);
  execute format('grant select,insert on core.%I to service_role',t);
end loop; end $$;

revoke all on analytics.org_work_attribution_audit from public,anon,authenticated,service_role;
grant select on analytics.org_work_attribution_audit to service_role;
alter function publish.public_organization_evidence_catalog() owner to postgres;
revoke all on function publish.public_organization_evidence_catalog() from public,anon,authenticated,service_role;
grant execute on function publish.public_organization_evidence_catalog() to anon,authenticated,service_role;

commit;
