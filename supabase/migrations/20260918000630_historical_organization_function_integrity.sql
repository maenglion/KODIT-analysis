begin;
set local role service_role;

-- Promote each directly observed appendix-3 organization block to an official
-- function assignment while retaining the raw block and exact extraction span.
insert into core.organization_evidence(
  organization_evidence_id,org_contract_version,evidence_key,source_kind,source_record_id,source_reference,
  observed_name,evidence_date,evidence_strength,evidence_text,evidence_metadata
)
select md5('kodit:t06.7:detailed-function-evidence:'||f.organization_evidence_document_id||':'||f.org_node_id)::uuid,
  'organization-v1-evidence-r2','2026-detailed-function:'||n.official_name,'OFFICIAL_CORPUS_MENTION',
  d.source_record_id,d.source_url,n.official_name,d.source_date,'OFFICIAL_DIRECT',
  '본부점 세부운영기준 별표3의 부서별 직무명세서 직접 관측',
  jsonb_build_object('document_id',d.organization_evidence_document_id,'locator',s.source_locator)
from core.organization_function_observations f
join core.organization_evidence_documents d using(organization_evidence_document_id)
join core.organization_evidence_spans s using(evidence_span_id)
join core.organization_nodes n using(org_node_id)
where f.observation_contract_version='organization-function-observation-v1'
  and f.evidence_type='DIRECT_FUNCTION_ASSIGNMENT'
on conflict do nothing;

insert into core.organization_evidence_document_links(
  organization_evidence_document_id,organization_evidence_id,link_type
)
select f.organization_evidence_document_id,
  md5('kodit:t06.7:detailed-function-evidence:'||f.organization_evidence_document_id||':'||f.org_node_id)::uuid,
  'SUPPORTS'
from core.organization_function_observations f
where f.observation_contract_version='organization-function-observation-v1'
  and f.evidence_type='DIRECT_FUNCTION_ASSIGNMENT'
on conflict do nothing;

insert into core.organization_function_assignments(
  function_assignment_id,assignment_contract_version,assignment_key,work_string,org_node_id,valid_from,
  organization_evidence_document_id,organization_evidence_id,assignment_status
)
select md5('kodit:t06.7:detailed-function-assignment:'||f.function_observation_id)::uuid,
  'org-function-assignment-v2','2026-detailed-function:'||f.function_observation_id,
  f.raw_function_phrase,f.org_node_id,f.valid_from,f.organization_evidence_document_id,
  md5('kodit:t06.7:detailed-function-evidence:'||f.organization_evidence_document_id||':'||f.org_node_id)::uuid,
  'OFFICIAL_DIRECT'
from core.organization_function_observations f
where f.observation_contract_version='organization-function-observation-v1'
  and f.evidence_type='DIRECT_FUNCTION_ASSIGNMENT'
on conflict do nothing;

insert into core.organization_function_assignment_spans(function_assignment_id,evidence_span_id)
select md5('kodit:t06.7:detailed-function-assignment:'||f.function_observation_id)::uuid,f.evidence_span_id
from core.organization_function_observations f
where f.observation_contract_version='organization-function-observation-v1'
  and f.evidence_type='DIRECT_FUNCTION_ASSIGNMENT'
on conflict do nothing;

-- Canonical privacy-function epochs. Intervals use [valid_from, valid_to).
with events as (
  select e.*,fromn.org_node_id from_id,ton.org_node_id to_id,
    row_number() over(order by e.effective_date,e.change_event_id) seq
  from core.organization_change_events e
  join core.organization_change_event_nodes fromn
    on fromn.change_event_id=e.change_event_id and fromn.participant_role='FROM'
  join core.organization_change_event_nodes ton
    on ton.change_event_id=e.change_event_id and ton.participant_role='TO'
  where e.event_contract_version='organization-change-event-v1'
    and e.event_scope='개인정보보호 책임·담당 기능'
), epochs as (
  select from_id org_node_id,null::date valid_from,effective_date valid_to,
    organization_evidence_document_id,organization_evidence_id,'initial' epoch_key
  from events where seq=1
  union all
  select e.to_id,e.effective_date,
    (select min(n.effective_date) from events n where n.from_id=e.to_id and n.effective_date>e.effective_date),
    e.organization_evidence_document_id,e.organization_evidence_id,'after:'||e.change_event_id
  from events e
)
insert into core.organization_function_assignments(
  function_assignment_id,assignment_contract_version,assignment_key,work_string,org_node_id,valid_from,valid_to,
  organization_evidence_document_id,organization_evidence_id,assignment_status
)
select md5('kodit:t06.7:privacy-epoch-v3:'||epoch_key)::uuid,'org-function-assignment-v3',
  'privacy-epoch:'||epoch_key,'개인정보보호 책임·담당 기능',org_node_id,valid_from,valid_to,
  organization_evidence_document_id,organization_evidence_id,'OFFICIAL_DIRECT'
from epochs on conflict do nothing;

reset role;

create or replace view analytics.canonical_organization_function_assignments
with (security_invoker=true) as
select a.* from core.organization_function_assignments a
where a.assignment_contract_version='org-function-assignment-v2'
  and a.assignment_key not like 'privacy-before:%'
  and a.assignment_key not like 'privacy-after:%'
union all
select a.* from core.organization_function_assignments a
where a.assignment_contract_version='org-function-assignment-v3';

comment on view analytics.canonical_organization_function_assignments is
  'Canonical T06.7 assignment read path. Privacy v3 uses non-overlapping [from,to) epochs; earlier additive v2 privacy rows remain audit history.';
revoke all on analytics.canonical_organization_function_assignments from public,anon,authenticated,service_role;
grant select on analytics.canonical_organization_function_assignments to service_role;

commit;
