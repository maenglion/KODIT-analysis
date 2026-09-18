begin;
set local role service_role;

-- Documents in the same source year are recorded as corpus-search inputs only.
-- They are not direct attribution evidence and cannot change final_status by themselves.
insert into core.org_work_attribution_evidence(
  attribution_evidence_id,run_id,evidence_kind,organization_evidence_document_id,
  observed_text,evidence_date
)
select md5('kodit:t06.7:rerun-corpus-document:'||r.run_id||':'||d.organization_evidence_document_id)::uuid,
  r.run_id,'ORGANIZATION_DOCUMENT',d.organization_evidence_document_id,
  '공식 조직 근거 corpus 검색 입력(귀속 확정 근거 아님): '||d.official_title,d.source_date
from core.org_work_attribution_runs r
join publish.notice_department_residual_occurrences o on o.residual_id=r.residual_id
join core.organization_evidence_documents d
  on d.evidence_contract_version='organization-evidence-document-v2'
 and extract(year from d.source_date)=extract(year from o.posted_at)
where r.attribution_contract_version='org-work-attribution-v1-evidence-r2'
on conflict do nothing;

reset role;

create or replace view analytics.org_work_attribution_evidence_r2_audit
with (security_invoker=true) as
select old.release_id,old.residual_id,old.notice_id,
  old.run_id old_run_id,new.run_id evidence_r2_run_id,
  old.final_status old_final_status,new.final_status evidence_r2_final_status,
  (select count(*) from core.org_work_attribution_candidates c where c.run_id=old.run_id) old_candidate_count,
  (select count(*) from core.org_work_attribution_candidates c where c.run_id=new.run_id) evidence_r2_candidate_count,
  (select count(*) from core.org_work_attribution_evidence e
    where e.run_id=new.run_id and e.evidence_kind='ORGANIZATION_DOCUMENT'
      and e.organization_evidence_document_id is not null) official_corpus_document_count,
  (select count(*) from core.org_work_attribution_path_steps p where p.run_id=new.run_id) official_path_step_count
from core.org_work_attribution_runs old
join core.org_work_attribution_runs new
  on new.release_id=old.release_id and new.residual_id=old.residual_id
 and new.attribution_contract_version='org-work-attribution-v1-evidence-r2'
where old.attribution_contract_version='org-work-attribution-v1';

comment on view analytics.org_work_attribution_evidence_r2_audit is
  'T06.7 before/after audit. Same-year official corpus documents are search inputs, not confirmed attribution evidence.';

revoke all on analytics.org_work_attribution_evidence_r2_audit from public,anon,authenticated,service_role;
grant select on analytics.org_work_attribution_evidence_r2_audit to service_role;

commit;
