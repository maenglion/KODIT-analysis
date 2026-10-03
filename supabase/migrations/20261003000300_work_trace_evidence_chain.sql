begin;

-- Work traces are release-independent investigation cases evaluated in
-- append-only, release-scoped runs. They do not assign a PERSON or raw
-- department label to an organization.

create function core.work_trace_case_id(
  p_notice_id uuid,
  p_regulation_id uuid,
  p_work_observation_key text
)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select md5(
    'kodit:core:work-trace-case-v1:' || p_notice_id::text || ':' ||
    coalesce(p_regulation_id::text,'UNRESOLVED_REGULATION') || ':' ||
    p_work_observation_key
  )::uuid;
$$;

create table core.work_trace_evidence_references (
  evidence_reference_id uuid primary key,
  evidence_contract_version text not null,
  evidence_key text not null,
  reference_kind text not null check (reference_kind in (
    'NOTICE','REGULATION','REGULATION_VERSION','ORGANIZATION_DOCUMENT','FUNCTION_ASSIGNMENT',
    'CHANGE_EVENT','SOURCE_RECORD','DOCUMENT_BINARY','OTHER_OFFICIAL'
  )),
  notice_id uuid,
  regulation_id uuid references core.regulations(regulation_id) on delete restrict,
  regulation_version_id uuid references core.regulation_versions(regulation_version_id) on delete restrict,
  organization_evidence_document_id uuid references core.organization_evidence_documents(organization_evidence_document_id) on delete restrict,
  function_assignment_id uuid references core.organization_function_assignments(function_assignment_id) on delete restrict,
  change_event_id uuid references core.organization_change_events(change_event_id) on delete restrict,
  source_record_id uuid references core.source_records(source_record_id) on delete restrict,
  document_sha256 char(64) references core.documents(sha256) on delete restrict,
  official_title text not null check (nullif(btrim(official_title),'') is not null),
  source_url text check (source_url is null or source_url ~ '^https?://'),
  source_date date,
  effective_date date,
  created_at timestamptz not null default now(),
  unique (evidence_contract_version,evidence_key),
  check (num_nonnulls(
    notice_id,regulation_id,regulation_version_id,organization_evidence_document_id,
    function_assignment_id,change_event_id,source_record_id,document_sha256
  ) > 0)
);

create function core.regulation_function_correspondence_id(
  p_regulation_id uuid,
  p_function_assignment_id uuid,
  p_correspondence_basis text,
  p_comparison_contract_version text
)
returns uuid
language sql
immutable
strict
set search_path = ''
as $$
  select md5(
    'kodit:core:regulation-function-correspondence-v1:' || p_regulation_id::text || ':' ||
    p_function_assignment_id::text || ':' || p_correspondence_basis || ':' ||
    p_comparison_contract_version
  )::uuid;
$$;

-- This reusable relation ledger is deliberately not a single-owner lookup.
-- One regulation may have direct or candidate correspondences to several
-- current functions. No row asserts organization succession or PERSON -> ORG.
create table core.regulation_function_correspondences (
  regulation_function_correspondence_id uuid generated always as (
    core.regulation_function_correspondence_id(
      regulation_id,function_assignment_id,correspondence_basis,comparison_contract_version
    )
  ) stored primary key,
  regulation_id uuid not null references core.regulations(regulation_id) on delete restrict,
  function_assignment_id uuid not null references core.organization_function_assignments(function_assignment_id) on delete restrict,
  org_node_id uuid not null references core.organization_nodes(org_node_id) on delete restrict,
  correspondence_basis text not null check (correspondence_basis in (
    'FUNCTION_DIRECT','FUNCTION_PHRASE_CANDIDATE'
  )),
  comparison_contract_version text not null check (nullif(btrim(comparison_contract_version),'') is not null),
  comparison_method text not null check (comparison_method in (
    'EXACT_REGULATION_MANAGEMENT_REFERENCE','CHARACTER_NGRAM_COSINE'
  )),
  regulation_observed_text text not null check (nullif(btrim(regulation_observed_text),'') is not null),
  function_observed_text text not null check (nullif(btrim(function_observed_text),'') is not null),
  comparison_score numeric(9,6) not null check (comparison_score between 0 and 1),
  regulation_evidence_reference_id uuid not null references core.work_trace_evidence_references(evidence_reference_id) on delete restrict,
  function_evidence_reference_id uuid not null references core.work_trace_evidence_references(evidence_reference_id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (regulation_id,function_assignment_id,correspondence_basis,comparison_contract_version),
  check (correspondence_basis<>'FUNCTION_DIRECT' or comparison_score=1),
  check (correspondence_basis<>'FUNCTION_DIRECT' or comparison_method='EXACT_REGULATION_MANAGEMENT_REFERENCE')
);

create function core.validate_regulation_function_correspondence()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from core.organization_function_assignments a
    where a.function_assignment_id=new.function_assignment_id
      and a.org_node_id=new.org_node_id
  ) then
    raise exception 'function correspondence organization mismatch' using errcode='23514';
  end if;

  if not exists (
    select 1
    from core.work_trace_evidence_references e
    left join core.regulation_versions v on v.regulation_version_id=e.regulation_version_id
    where e.evidence_reference_id=new.regulation_evidence_reference_id
      and (
        (e.reference_kind='REGULATION' and e.regulation_id=new.regulation_id)
        or (e.reference_kind='REGULATION_VERSION' and v.regulation_id=new.regulation_id)
      )
  ) then
    raise exception 'function correspondence regulation evidence mismatch' using errcode='23514';
  end if;

  if not exists (
    select 1 from core.work_trace_evidence_references e
    where e.evidence_reference_id=new.function_evidence_reference_id
      and e.reference_kind='FUNCTION_ASSIGNMENT'
      and e.function_assignment_id=new.function_assignment_id
  ) then
    raise exception 'function correspondence assignment evidence mismatch' using errcode='23514';
  end if;

  return new;
end;
$$;

create trigger regulation_function_correspondences_validate
before insert on core.regulation_function_correspondences
for each row execute function core.validate_regulation_function_correspondence();

create table core.work_trace_cases (
  trace_case_id uuid generated always as (
    core.work_trace_case_id(notice_id,regulation_id,work_observation_key)
  ) stored primary key,
  notice_id uuid not null,
  regulation_id uuid references core.regulations(regulation_id) on delete restrict,
  work_observation_id uuid references core.extraction_mentions(mention_id) on delete restrict,
  work_observation_key text not null check (nullif(btrim(work_observation_key),'') is not null),
  observation_kind text not null check (observation_kind in (
    'EXTRACTION_WORK_MENTION','NOTICE_TITLE','REGULATION_TEXT','UNRESOLVED_WORK'
  )),
  created_at timestamptz not null default now(),
  check (observation_kind <> 'EXTRACTION_WORK_MENTION' or work_observation_id is not null)
);

create table core.work_trace_runs (
  trace_run_id uuid primary key,
  parent_trace_run_id uuid references core.work_trace_runs(trace_run_id) on delete restrict,
  release_id uuid not null references publish.releases(release_id) on delete restrict,
  trace_contract_version text not null check (nullif(btrim(trace_contract_version),'') is not null),
  evidence_corpus_digest char(64) not null check (evidence_corpus_digest ~ '^[0-9a-f]{64}$'),
  evidence_cutoff_date date not null,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  run_result text not null check (run_result in ('COMPLETED','FAILED')),
  failure_detail text,
  created_at timestamptz not null default now(),
  check (completed_at >= started_at),
  check (parent_trace_run_id is null or parent_trace_run_id <> trace_run_id),
  check ((run_result='FAILED') = (failure_detail is not null))
);

create table core.work_trace_run_evidence_references (
  trace_run_id uuid not null references core.work_trace_runs(trace_run_id) on delete restrict,
  evidence_reference_id uuid not null references core.work_trace_evidence_references(evidence_reference_id) on delete restrict,
  added_reason text not null check (nullif(btrim(added_reason),'') is not null),
  created_at timestamptz not null default now(),
  primary key (trace_run_id,evidence_reference_id)
);

create table core.work_trace_branch_results (
  branch_result_id uuid primary key,
  trace_run_id uuid not null references core.work_trace_runs(trace_run_id) on delete restrict,
  trace_case_id uuid not null references core.work_trace_cases(trace_case_id) on delete restrict,
  terminal_outcome text not null check (terminal_outcome in (
    'COMPLETE','SOURCE_DOCUMENT_GAP','RELATION_EVIDENCE_GAP',
    'FUNCTION_CORRESPONDENCE_UNCONFIRMED','FUNCTION_MULTIPLE_CANDIDATES'
  )),
  completion_scope text check (completion_scope in (
    'CURRENT_FUNCTION_OBSERVED','OFFICIAL_TRANSFER_PATH_VERIFIED'
  )),
  last_verified_date date,
  public_summary text not null check (nullif(btrim(public_summary),'') is not null),
  created_at timestamptz not null default now(),
  unique (trace_run_id,trace_case_id),
  check (
    (terminal_outcome='COMPLETE' and completion_scope is not null)
    or (terminal_outcome<>'COMPLETE' and completion_scope is null)
  )
);

create table core.work_trace_steps (
  trace_step_id uuid primary key,
  branch_result_id uuid not null references core.work_trace_branch_results(branch_result_id) on delete restrict,
  step_order integer not null check (step_order>0),
  step_kind text not null check (step_kind in (
    'NOTICE_OBSERVED','PROPOSES_CHANGE_TO','REGULATION_WORK_OBSERVED',
    'FUNCTION_ASSIGNMENT_OBSERVED','ORG_CHANGE_EVENT_FOLLOWED',
    'CURRENT_FUNCTION_OBSERVED','SEPARATE_CURRENT_OBSERVATION'
  )),
  relation_kind text not null check (nullif(btrim(relation_kind),'') is not null),
  step_basis text not null check (step_basis in (
    'OFFICIAL_DOCUMENT','EXISTING_ASSERTION','TEXT_COMPARISON'
  )),
  notice_id uuid,
  regulation_id uuid references core.regulations(regulation_id) on delete restrict,
  work_observation_id uuid references core.extraction_mentions(mention_id) on delete restrict,
  function_assignment_id uuid references core.organization_function_assignments(function_assignment_id) on delete restrict,
  org_node_id uuid references core.organization_nodes(org_node_id) on delete restrict,
  change_event_id uuid references core.organization_change_events(change_event_id) on delete restrict,
  observed_at date,
  effective_at date,
  observed_phrase text,
  matched_phrase text,
  step_description text not null check (nullif(btrim(step_description),'') is not null),
  created_at timestamptz not null default now(),
  unique (branch_result_id,step_order),
  check (
    step_basis <> 'TEXT_COMPARISON'
    or (nullif(btrim(observed_phrase),'') is not null and nullif(btrim(matched_phrase),'') is not null)
  )
);

alter table core.work_trace_branch_results
  add column last_verified_step_id uuid;

alter table core.work_trace_branch_results
  add constraint work_trace_branch_results_last_verified_step_fk
  foreign key (last_verified_step_id)
  references core.work_trace_steps(trace_step_id) on delete restrict
  deferrable initially deferred;

create table core.work_trace_step_evidence_links (
  trace_step_id uuid not null references core.work_trace_steps(trace_step_id) on delete restrict,
  evidence_reference_id uuid not null references core.work_trace_evidence_references(evidence_reference_id) on delete restrict,
  evidence_role text not null check (evidence_role in (
    'SUPPORTS_SOURCE','SUPPORTS_RELATION','SUPPORTS_EFFECTIVE_DATE',
    'SUPPORTS_TEXT_COMPARISON_SOURCE','SUPPORTS_TEXT_COMPARISON_TARGET'
  )),
  citation_order integer not null check (citation_order>0),
  created_at timestamptz not null default now(),
  primary key (trace_step_id,evidence_reference_id,evidence_role),
  unique (trace_step_id,citation_order)
);

create table core.work_trace_branch_breaks (
  branch_result_id uuid primary key references core.work_trace_branch_results(branch_result_id) on delete restrict,
  break_kind text not null check (break_kind in (
    'SOURCE_DOCUMENT_GAP','RELATION_EVIDENCE_GAP','FUNCTION_CORRESPONDENCE_UNCONFIRMED'
  )),
  after_step_id uuid references core.work_trace_steps(trace_step_id) on delete restrict,
  next_known_step_id uuid references core.work_trace_steps(trace_step_id) on delete restrict,
  missing_relation text not null check (nullif(btrim(missing_relation),'') is not null),
  gap_from date,
  gap_to date,
  required_evidence_description text not null check (nullif(btrim(required_evidence_description),'') is not null),
  public_explanation text not null check (nullif(btrim(public_explanation),'') is not null),
  created_at timestamptz not null default now(),
  check (gap_to is null or gap_from is null or gap_to>=gap_from),
  check (after_step_id is null or after_step_id is distinct from next_known_step_id)
);

create table core.work_trace_function_correspondences (
  correspondence_id uuid primary key,
  branch_result_id uuid not null references core.work_trace_branch_results(branch_result_id) on delete restrict,
  trace_step_id uuid not null references core.work_trace_steps(trace_step_id) on delete restrict,
  regulation_function_correspondence_id uuid not null references core.regulation_function_correspondences(regulation_function_correspondence_id) on delete restrict,
  org_node_id uuid not null references core.organization_nodes(org_node_id) on delete restrict,
  function_assignment_id uuid not null references core.organization_function_assignments(function_assignment_id) on delete restrict,
  correspondence_basis text not null check (correspondence_basis in (
    'FUNCTION_DIRECT','FUNCTION_PHRASE_CANDIDATE'
  )),
  comparison_contract_version text not null check (nullif(btrim(comparison_contract_version),'') is not null),
  observed_phrase text not null check (nullif(btrim(observed_phrase),'') is not null),
  matched_phrase text not null check (nullif(btrim(matched_phrase),'') is not null),
  comparison_score numeric(9,6) check (comparison_score between 0 and 1),
  created_at timestamptz not null default now(),
  unique (branch_result_id,org_node_id,function_assignment_id,correspondence_basis)
);

create table core.work_trace_branch_corrections (
  correction_id uuid primary key,
  superseded_result_id uuid not null references core.work_trace_branch_results(branch_result_id) on delete restrict,
  superseding_result_id uuid not null references core.work_trace_branch_results(branch_result_id) on delete restrict,
  correction_reason_code text not null check (correction_reason_code in (
    'SOURCE_DATE_CORRECTED','EFFECTIVE_DATE_CORRECTED','EVIDENCE_WITHDRAWN',
    'RELATION_CORRECTED','OTHER_DOCUMENTED_CORRECTION'
  )),
  correction_explanation text not null check (nullif(btrim(correction_explanation),'') is not null),
  correction_evidence_reference_id uuid not null references core.work_trace_evidence_references(evidence_reference_id) on delete restrict,
  recorded_at timestamptz not null default now(),
  unique (superseded_result_id,superseding_result_id),
  check (superseded_result_id<>superseding_result_id)
);

create table core.work_trace_evidence_needs (
  evidence_need_id uuid primary key,
  trace_run_id uuid not null references core.work_trace_runs(trace_run_id) on delete restrict,
  need_key text not null,
  need_kind text not null check (need_kind in (
    'SOURCE_DOCUMENT_GAP','RELATION_EVIDENCE_GAP','FUNCTION_CORRESPONDENCE_UNCONFIRMED'
  )),
  required_evidence_description text not null check (nullif(btrim(required_evidence_description),'') is not null),
  period_from date,
  period_to date,
  created_at timestamptz not null default now(),
  unique (trace_run_id,need_key),
  check (period_to is null or period_from is null or period_to>=period_from)
);

create table core.work_trace_evidence_need_branches (
  evidence_need_id uuid not null references core.work_trace_evidence_needs(evidence_need_id) on delete restrict,
  branch_result_id uuid not null references core.work_trace_branch_results(branch_result_id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (evidence_need_id,branch_result_id)
);

create table core.work_trace_run_validations (
  trace_run_id uuid not null references core.work_trace_runs(trace_run_id) on delete restrict,
  validation_contract_version text not null,
  validated_at timestamptz not null default now(),
  primary key (trace_run_id,validation_contract_version)
);

create index work_trace_cases_notice_idx on core.work_trace_cases(notice_id);
create index work_trace_cases_regulation_idx on core.work_trace_cases(regulation_id);
create index regulation_function_correspondences_regulation_idx
  on core.regulation_function_correspondences(regulation_id,correspondence_basis,org_node_id);
create index work_trace_runs_release_idx on core.work_trace_runs(release_id,completed_at);
create index work_trace_branch_results_run_idx on core.work_trace_branch_results(trace_run_id,terminal_outcome);
create index work_trace_steps_result_idx on core.work_trace_steps(branch_result_id,step_order);
create index work_trace_correspondences_result_idx on core.work_trace_function_correspondences(branch_result_id,org_node_id);
create index work_trace_corrections_superseded_idx on core.work_trace_branch_corrections(superseded_result_id);
create index work_trace_need_branches_result_idx on core.work_trace_evidence_need_branches(branch_result_id);

create function core.validate_work_trace_run(
  p_trace_run_id uuid,
  p_validation_contract_version text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count bigint;
begin
  if not exists (
    select 1 from core.work_trace_runs r
    where r.trace_run_id=p_trace_run_id and r.run_result='COMPLETED'
  ) then
    raise exception 'unknown or non-completed work trace run' using errcode='22023';
  end if;

  select count(*) into v_count
  from core.work_trace_branch_results r
  left join core.work_trace_branch_breaks b on b.branch_result_id=r.branch_result_id
  where r.trace_run_id=p_trace_run_id
    and (
      (r.terminal_outcome in ('SOURCE_DOCUMENT_GAP','RELATION_EVIDENCE_GAP','FUNCTION_CORRESPONDENCE_UNCONFIRMED')
        and (b.branch_result_id is null or b.break_kind<>r.terminal_outcome))
      or
      (r.terminal_outcome in ('COMPLETE','FUNCTION_MULTIPLE_CANDIDATES') and b.branch_result_id is not null)
    );
  if v_count<>0 then raise exception 'work trace break/outcome mismatch: %',v_count using errcode='23514'; end if;

  select count(*) into v_count
  from core.work_trace_branch_results r
  where r.trace_run_id=p_trace_run_id and r.terminal_outcome='FUNCTION_MULTIPLE_CANDIDATES'
    and (select count(distinct c.org_node_id) from core.work_trace_function_correspondences c
         where c.branch_result_id=r.branch_result_id)<2;
  if v_count<>0 then raise exception 'multiple correspondence with fewer than two orgs: %',v_count using errcode='23514'; end if;

  select count(*) into v_count
  from core.work_trace_branch_results r
  where r.trace_run_id=p_trace_run_id and r.terminal_outcome<>'FUNCTION_MULTIPLE_CANDIDATES'
    and (select count(distinct c.org_node_id) from core.work_trace_function_correspondences c
         where c.branch_result_id=r.branch_result_id)>1;
  if v_count<>0 then raise exception 'multi-org correspondence without multiple outcome: %',v_count using errcode='23514'; end if;

  select count(*) into v_count
  from core.work_trace_branch_results r
  where r.trace_run_id=p_trace_run_id and r.terminal_outcome='COMPLETE'
    and (
      not exists(select 1 from core.work_trace_steps s
        where s.branch_result_id=r.branch_result_id and s.step_kind='CURRENT_FUNCTION_OBSERVED')
      or (r.completion_scope='OFFICIAL_TRANSFER_PATH_VERIFIED' and not exists(
        select 1 from core.work_trace_steps s
        where s.branch_result_id=r.branch_result_id and s.step_kind='ORG_CHANGE_EVENT_FOLLOWED'
      ))
    );
  if v_count<>0 then raise exception 'complete branch lacks required scope steps: %',v_count using errcode='23514'; end if;

  select count(*) into v_count
  from core.work_trace_branch_results r
  join core.work_trace_branch_breaks b using(branch_result_id)
  where r.trace_run_id=p_trace_run_id and r.last_verified_date>b.gap_from;
  if v_count<>0 then raise exception 'last verified date after gap start: %',v_count using errcode='23514'; end if;

  select count(*) into v_count from (
    select s.trace_step_id
    from core.work_trace_branch_results r
    join core.work_trace_steps s on s.branch_result_id=r.branch_result_id
    left join core.work_trace_step_evidence_links l on l.trace_step_id=s.trace_step_id
    where r.trace_run_id=p_trace_run_id
    group by s.trace_step_id
    having count(l.evidence_reference_id)=0
  ) missing_step_evidence;
  if v_count<>0 then raise exception 'work trace step without evidence: %',v_count using errcode='23514'; end if;

  select count(*) into v_count
  from core.work_trace_branch_results r
  join core.work_trace_steps s on s.branch_result_id=r.branch_result_id
  where r.trace_run_id=p_trace_run_id
    and (
      (s.step_kind='NOTICE_OBSERVED' and not exists(
        select 1 from core.work_trace_step_evidence_links l
        join core.work_trace_evidence_references e using(evidence_reference_id)
        where l.trace_step_id=s.trace_step_id and e.notice_id=s.notice_id
      ))
      or (s.step_kind='PROPOSES_CHANGE_TO' and not exists(
        select 1 from core.work_trace_step_evidence_links l
        join core.work_trace_evidence_references e using(evidence_reference_id)
        left join core.regulation_versions v on v.regulation_version_id=e.regulation_version_id
        where l.trace_step_id=s.trace_step_id
          and (e.notice_id=s.notice_id or e.regulation_id=s.regulation_id or v.regulation_id=s.regulation_id)
      ))
      or (s.step_kind in ('FUNCTION_ASSIGNMENT_OBSERVED','CURRENT_FUNCTION_OBSERVED','SEPARATE_CURRENT_OBSERVATION')
        and s.function_assignment_id is not null and not exists(
          select 1 from core.work_trace_step_evidence_links l
          join core.work_trace_evidence_references e using(evidence_reference_id)
          where l.trace_step_id=s.trace_step_id
            and e.function_assignment_id=s.function_assignment_id
        ))
      or (s.step_kind='ORG_CHANGE_EVENT_FOLLOWED' and not exists(
        select 1 from core.work_trace_step_evidence_links l
        join core.work_trace_evidence_references e using(evidence_reference_id)
        where l.trace_step_id=s.trace_step_id and e.change_event_id=s.change_event_id
      ))
    );
  if v_count<>0 then raise exception 'work trace step evidence entity mismatch: %',v_count using errcode='23514'; end if;

  select count(*) into v_count
  from core.work_trace_branch_results r
  join core.work_trace_steps s on s.branch_result_id=r.branch_result_id
  where r.trace_run_id=p_trace_run_id and s.step_basis='TEXT_COMPARISON'
    and (
      not exists(select 1 from core.work_trace_step_evidence_links l
        where l.trace_step_id=s.trace_step_id and l.evidence_role='SUPPORTS_TEXT_COMPARISON_SOURCE')
      or not exists(select 1 from core.work_trace_step_evidence_links l
        where l.trace_step_id=s.trace_step_id and l.evidence_role='SUPPORTS_TEXT_COMPARISON_TARGET')
    );
  if v_count<>0 then raise exception 'text comparison lacks source/target evidence: %',v_count using errcode='23514'; end if;

  select count(*) into v_count
  from core.work_trace_branch_results r
  where r.trace_run_id=p_trace_run_id and r.last_verified_step_id is null;
  if v_count<>0 then raise exception 'work trace branch without last verified step: %',v_count using errcode='23514'; end if;

  select count(*) into v_count
  from core.work_trace_branch_results r
  join core.work_trace_steps s on s.trace_step_id=r.last_verified_step_id
  where r.trace_run_id=p_trace_run_id and s.branch_result_id<>r.branch_result_id;
  if v_count<>0 then raise exception 'last verified step belongs to another branch: %',v_count using errcode='23514'; end if;

  select count(*) into v_count
  from core.work_trace_branch_results r
  join core.work_trace_branch_breaks b using(branch_result_id)
  left join core.work_trace_steps a on a.trace_step_id=b.after_step_id
  left join core.work_trace_steps n on n.trace_step_id=b.next_known_step_id
  where r.trace_run_id=p_trace_run_id
    and ((a.trace_step_id is not null and a.branch_result_id<>r.branch_result_id)
      or (n.trace_step_id is not null and n.branch_result_id<>r.branch_result_id));
  if v_count<>0 then raise exception 'break step belongs to another branch: %',v_count using errcode='23514'; end if;

  select count(*) into v_count
  from core.work_trace_function_correspondences c
  join core.work_trace_branch_results r on r.branch_result_id=c.branch_result_id
  join core.work_trace_steps s on s.trace_step_id=c.trace_step_id
  join core.organization_function_assignments a on a.function_assignment_id=c.function_assignment_id
  join core.regulation_function_correspondences rf
    on rf.regulation_function_correspondence_id=c.regulation_function_correspondence_id
  where r.trace_run_id=p_trace_run_id
    and (s.branch_result_id<>r.branch_result_id
      or a.org_node_id<>c.org_node_id
      or rf.regulation_id is distinct from s.regulation_id
      or rf.function_assignment_id<>c.function_assignment_id
      or rf.org_node_id<>c.org_node_id
      or rf.correspondence_basis<>c.correspondence_basis
      or rf.comparison_contract_version<>c.comparison_contract_version
      or (c.correspondence_basis='FUNCTION_DIRECT' and s.step_basis<>'OFFICIAL_DOCUMENT')
      or (c.correspondence_basis='FUNCTION_PHRASE_CANDIDATE' and s.step_basis<>'TEXT_COMPARISON'));
  if v_count<>0 then raise exception 'correspondence provenance mismatch: %',v_count using errcode='23514'; end if;

  select count(*) into v_count
  from core.work_trace_branch_corrections c
  join core.work_trace_branch_results old on old.branch_result_id=c.superseded_result_id
  join core.work_trace_branch_results new on new.branch_result_id=c.superseding_result_id
  join core.work_trace_runs current_run on current_run.trace_run_id=new.trace_run_id
  where new.trace_run_id=p_trace_run_id
    and (old.trace_case_id<>new.trace_case_id
      or current_run.parent_trace_run_id is distinct from old.trace_run_id);
  if v_count<>0 then raise exception 'invalid branch correction relation: %',v_count using errcode='23514'; end if;

  select count(*) into v_count
  from core.work_trace_evidence_need_branches nb
  join core.work_trace_evidence_needs n using(evidence_need_id)
  join core.work_trace_branch_results r on r.branch_result_id=nb.branch_result_id
  where n.trace_run_id=p_trace_run_id
    and (r.trace_run_id<>p_trace_run_id
      or r.terminal_outcome in ('COMPLETE','FUNCTION_MULTIPLE_CANDIDATES')
      or r.terminal_outcome<>n.need_kind);
  if v_count<>0 then raise exception 'invalid evidence backlog membership: %',v_count using errcode='23514'; end if;

  insert into core.work_trace_run_validations(trace_run_id,validation_contract_version)
  values(p_trace_run_id,p_validation_contract_version)
  on conflict do nothing;
end;
$$;

create view analytics.work_trace_branch_audit with (security_invoker=true) as
select
  r.trace_run_id,r.parent_trace_run_id,r.release_id,r.trace_contract_version,r.evidence_corpus_digest,
  br.branch_result_id,br.trace_case_id,c.notice_id,c.regulation_id,c.work_observation_id,c.work_observation_key,
  br.terminal_outcome,br.completion_scope,br.last_verified_date,br.public_summary,
  b.break_kind,b.missing_relation,b.gap_from,b.gap_to,b.required_evidence_description,b.public_explanation,
  (select count(*) from core.work_trace_steps s where s.branch_result_id=br.branch_result_id)::bigint step_count,
  (select count(*) from core.work_trace_function_correspondences x where x.branch_result_id=br.branch_result_id)::bigint correspondence_count,
  exists(select 1 from core.work_trace_branch_corrections x where x.superseded_result_id=br.branch_result_id) is_superseded,
  (select x.superseding_result_id from core.work_trace_branch_corrections x
   where x.superseded_result_id=br.branch_result_id order by x.recorded_at desc limit 1) superseding_result_id,
  exists(select 1 from core.work_trace_run_validations v where v.trace_run_id=r.trace_run_id) is_validated
from core.work_trace_branch_results br
join core.work_trace_runs r using(trace_run_id)
join core.work_trace_cases c using(trace_case_id)
left join core.work_trace_branch_breaks b using(branch_result_id);

create view analytics.work_trace_run_deltas with (security_invoker=true) as
with run_pairs as (
  select cur.trace_run_id current_run_id,cur.parent_trace_run_id previous_run_id,
    cur.trace_contract_version current_contract_version,prev.trace_contract_version previous_contract_version
  from core.work_trace_runs cur
  left join core.work_trace_runs prev on prev.trace_run_id=cur.parent_trace_run_id
  where cur.parent_trace_run_id is not null
), case_keys as (
  select p.current_run_id,p.previous_run_id,br.trace_case_id
  from run_pairs p join core.work_trace_branch_results br on br.trace_run_id=p.current_run_id
  union
  select p.current_run_id,p.previous_run_id,br.trace_case_id
  from run_pairs p join core.work_trace_branch_results br on br.trace_run_id=p.previous_run_id
), compared as (
  select k.current_run_id,k.previous_run_id,k.trace_case_id,
    p.current_contract_version,p.previous_contract_version,
    prev.branch_result_id previous_result_id,cur.branch_result_id current_result_id,
    prev.terminal_outcome previous_outcome,cur.terminal_outcome current_outcome,
    prev.completion_scope previous_completion_scope,cur.completion_scope current_completion_scope,
    prev.last_verified_date previous_last_verified_date,cur.last_verified_date current_last_verified_date,
    (select count(*) from core.work_trace_steps s where s.branch_result_id=prev.branch_result_id) previous_step_count,
    (select count(*) from core.work_trace_steps s where s.branch_result_id=cur.branch_result_id) current_step_count
  from case_keys k
  join run_pairs p on p.current_run_id=k.current_run_id
  left join core.work_trace_branch_results prev on prev.trace_run_id=k.previous_run_id and prev.trace_case_id=k.trace_case_id
  left join core.work_trace_branch_results cur on cur.trace_run_id=k.current_run_id and cur.trace_case_id=k.trace_case_id
)
select x.*,
  case when previous_result_id is null then 'ADDED_CASE'
       when current_result_id is null then 'OUT_OF_SCOPE_CASE'
       else 'EXISTING_CASE' end population_change,
  (current_contract_version=previous_contract_version) comparable_contract,
  case
    when previous_result_id is null or current_result_id is null
      or current_contract_version<>previous_contract_version then null
    when exists(select 1 from core.work_trace_branch_corrections c
      where c.superseded_result_id=previous_result_id and c.superseding_result_id=current_result_id)
      and (current_last_verified_date<previous_last_verified_date or current_step_count<previous_step_count)
      then 'SHORTENED_CORRECTION'
    when previous_outcome<>'COMPLETE' and current_outcome='COMPLETE' then 'COMPLETED'
    when previous_outcome is distinct from current_outcome
      or previous_completion_scope is distinct from current_completion_scope then 'OUTCOME_CHANGED'
    when current_last_verified_date>previous_last_verified_date or current_step_count>previous_step_count then 'EXTENDED'
    else 'UNCHANGED'
  end primary_change_class,
  exists(
    select 1 from core.work_trace_steps s
    join core.work_trace_step_evidence_links l using(trace_step_id)
    join core.work_trace_run_evidence_references a
      on a.trace_run_id=current_run_id and a.evidence_reference_id=l.evidence_reference_id
    where s.branch_result_id=current_result_id
  ) evidence_added,
  (current_outcome='FUNCTION_MULTIPLE_CANDIDATES'
    and previous_outcome is distinct from 'FUNCTION_MULTIPLE_CANDIDATES') became_multiple_correspondence,
  (previous_completion_scope is distinct from current_completion_scope) completion_scope_changed,
  (current_completion_scope='OFFICIAL_TRANSFER_PATH_VERIFIED'
    and previous_completion_scope is distinct from 'OFFICIAL_TRANSFER_PATH_VERIFIED') official_path_added
from compared x;

create view analytics.work_trace_research_backlog with (security_invoker=true) as
select n.trace_run_id,n.evidence_need_id,n.need_key,n.need_kind,n.required_evidence_description,
  n.period_from,n.period_to,
  count(distinct nb.branch_result_id)::bigint current_affected_branch_count,
  count(distinct c.notice_id)::bigint affected_notice_count,
  count(distinct c.regulation_id) filter(where c.regulation_id is not null)::bigint affected_regulation_count
from core.work_trace_evidence_needs n
join core.work_trace_evidence_need_branches nb using(evidence_need_id)
join core.work_trace_branch_results br on br.branch_result_id=nb.branch_result_id
join core.work_trace_cases c using(trace_case_id)
where br.terminal_outcome in (
  'SOURCE_DOCUMENT_GAP','RELATION_EVIDENCE_GAP','FUNCTION_CORRESPONDENCE_UNCONFIRMED'
)
group by n.trace_run_id,n.evidence_need_id,n.need_key,n.need_kind,n.required_evidence_description,n.period_from,n.period_to;

create view analytics.work_trace_evidence_need_effects with (security_invoker=true) as
select n.evidence_need_id,n.trace_run_id baseline_run_id,child.trace_run_id evaluating_run_id,
  count(distinct nb.branch_result_id)::bigint expected_affected_branch_count,
  count(distinct d.trace_case_id) filter(where d.primary_change_class='EXTENDED')::bigint extended_branch_count,
  count(distinct d.trace_case_id) filter(where d.primary_change_class='COMPLETED')::bigint completed_branch_count,
  count(distinct d.trace_case_id) filter(where d.primary_change_class='OUTCOME_CHANGED')::bigint outcome_changed_branch_count,
  count(distinct d.trace_case_id) filter(where d.became_multiple_correspondence)::bigint multiple_correspondence_branch_count,
  count(distinct d.trace_case_id) filter(where d.current_outcome in (
    'SOURCE_DOCUMENT_GAP','RELATION_EVIDENCE_GAP','FUNCTION_CORRESPONDENCE_UNCONFIRMED'
  ))::bigint still_stopped_branch_count,
  count(distinct d.trace_case_id) filter(where d.evidence_added)::bigint added_evidence_cited_branch_count
from core.work_trace_evidence_needs n
join core.work_trace_evidence_need_branches nb using(evidence_need_id)
join core.work_trace_branch_results base on base.branch_result_id=nb.branch_result_id
join core.work_trace_runs child on child.parent_trace_run_id=n.trace_run_id
left join analytics.work_trace_run_deltas d
  on d.current_run_id=child.trace_run_id and d.trace_case_id=base.trace_case_id
where child.trace_contract_version=(select r.trace_contract_version from core.work_trace_runs r where r.trace_run_id=n.trace_run_id)
group by n.evidence_need_id,n.trace_run_id,child.trace_run_id;

comment on table core.work_trace_cases is
  'Release-independent notice/regulation/work investigation identity. It contains no raw department label and no person-to-organization assignment.';
comment on table core.regulation_function_correspondences is
  'Reusable many-to-many regulation-to-current-function observations. Direct means exact official wording; candidate means a retained search lead, never organization succession.';
comment on table core.work_trace_branch_results is
  'Append-only run result. Gaps stop at the last verified step; multiple correspondence is an output, not a failure or backlog item.';
comment on table core.work_trace_branch_corrections is
  'Append-only supersession link. Historical results remain readable and are marked as corrected through read models.';
comment on view analytics.work_trace_evidence_need_effects is
  'Expected affected branches versus measured extension after a same-contract child run; expected count never guarantees resolution.';

do $$ declare t text; begin foreach t in array array[
  'work_trace_evidence_references','regulation_function_correspondences','work_trace_cases','work_trace_runs','work_trace_run_evidence_references',
  'work_trace_branch_results','work_trace_steps','work_trace_step_evidence_links','work_trace_branch_breaks',
  'work_trace_function_correspondences','work_trace_branch_corrections','work_trace_evidence_needs',
  'work_trace_evidence_need_branches','work_trace_run_validations'
] loop
  execute format('create trigger %I_append_only before update or delete on core.%I for each row execute function core.reject_history_mutation()',t,t);
  execute format('alter table core.%I enable row level security',t);
  execute format('alter table core.%I force row level security',t);
  execute format('revoke all on core.%I from public,anon,authenticated,service_role',t);
  execute format('grant select,insert on core.%I to service_role',t);
end loop; end $$;

revoke all on analytics.work_trace_branch_audit from public,anon,authenticated,service_role;
revoke all on analytics.work_trace_run_deltas from public,anon,authenticated,service_role;
revoke all on analytics.work_trace_research_backlog from public,anon,authenticated,service_role;
revoke all on analytics.work_trace_evidence_need_effects from public,anon,authenticated,service_role;
grant select on analytics.work_trace_branch_audit,analytics.work_trace_run_deltas,
  analytics.work_trace_research_backlog,analytics.work_trace_evidence_need_effects to service_role;

alter function core.work_trace_case_id(uuid,uuid,text) owner to postgres;
alter function core.regulation_function_correspondence_id(uuid,uuid,text,text) owner to postgres;
alter function core.validate_regulation_function_correspondence() owner to postgres;
alter function core.validate_work_trace_run(uuid,text) owner to postgres;
revoke all on function core.work_trace_case_id(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function core.regulation_function_correspondence_id(uuid,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function core.validate_regulation_function_correspondence() from public,anon,authenticated,service_role;
revoke all on function core.validate_work_trace_run(uuid,text) from public,anon,authenticated,service_role;
grant execute on function core.work_trace_case_id(uuid,uuid,text) to service_role;
grant execute on function core.regulation_function_correspondence_id(uuid,uuid,text,text) to service_role;
grant execute on function core.validate_work_trace_run(uuid,text) to service_role;

commit;
