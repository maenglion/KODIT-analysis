begin;

alter table core.organization_evidence_documents
  add constraint organization_evidence_documents_binary_fk
  foreign key (document_sha256) references core.documents(sha256) on delete restrict;

alter table core.organization_evidence_documents
  add constraint organization_evidence_documents_extraction_binary_fk
  foreign key (extraction_id,document_sha256)
  references core.document_extractions(extraction_id,document_sha256) on delete restrict;

alter table core.organization_change_events
  alter column organization_evidence_id set not null;
alter table core.organization_function_assignments
  alter column organization_evidence_id set not null;

create function core.validate_official_organization_evidence_pair()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if not exists (
    select 1 from core.organization_evidence_document_links l
    where l.organization_evidence_document_id=new.organization_evidence_document_id
      and l.organization_evidence_id=new.organization_evidence_id
      and l.link_type in ('SUPPORTS','EXPRESSES_FUNCTION_CHANGE')
  ) then
    raise exception 'organization event/assignment requires a linked official evidence pair'
      using errcode='23514';
  end if;
  return new;
end;
$$;

create function core.validate_org_work_candidate_anchor()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  v_release_id uuid;
begin
  select r.release_id into v_release_id
  from core.org_work_attribution_runs r where r.run_id=new.run_id;

  if v_release_id is null or not exists (
    select 1 from core.organization_anchor_notices a
    where a.release_id=v_release_id
      and a.notice_id=new.candidate_notice_id
      and a.org_node_id=new.candidate_org_node_id
      and a.anchor_contract_version='org-anchor-notice-v1'
  ) then
    raise exception 'attribution candidate requires an evidence-backed anchor in the same release'
      using errcode='23514';
  end if;
  return new;
end;
$$;

create trigger organization_change_events_validate_evidence
before insert on core.organization_change_events
for each row execute function core.validate_official_organization_evidence_pair();

create trigger organization_function_assignments_validate_evidence
before insert on core.organization_function_assignments
for each row execute function core.validate_official_organization_evidence_pair();

create trigger org_work_attribution_candidates_validate_anchor
before insert on core.org_work_attribution_candidates
for each row execute function core.validate_org_work_candidate_anchor();

alter table core.org_work_attribution_runs
  add constraint org_work_attribution_unresolved_has_no_resolved_org
  check (final_status<>'UNRESOLVED' or
    (historical_org_node_id is null and current_org_node_id is null));

alter function core.validate_official_organization_evidence_pair() owner to postgres;
alter function core.validate_org_work_candidate_anchor() owner to postgres;
revoke all on function core.validate_official_organization_evidence_pair()
  from public,anon,authenticated,service_role;
revoke all on function core.validate_org_work_candidate_anchor()
  from public,anon,authenticated,service_role;

commit;
