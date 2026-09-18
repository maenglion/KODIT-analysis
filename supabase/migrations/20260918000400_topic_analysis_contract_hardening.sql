begin;

create schema analytics;
revoke all on schema analytics from public,anon,authenticated;
grant usage on schema analytics to service_role;
alter default privileges for role postgres in schema analytics revoke all on tables from public,anon,authenticated;

create view analytics.label_channel_evidence with (security_invoker=true) as
select l.label_id,l.label_contract_version,
  count(distinct rl.residual_id)>0 as has_department_observation,
  count(distinct rl.residual_id)::bigint as department_occurrence_count,
  count(distinct ml.mention_id) filter(where m.mention_type='PERSON')::bigint as person_mention_count,
  count(distinct ml.mention_id) filter(where m.mention_type='ORG')::bigint as org_mention_count,
  count(distinct ml.mention_id) filter(where m.mention_type='RULE')::bigint as rule_mention_count,
  count(distinct ml.mention_id) filter(where m.mention_type='WORK')::bigint as work_mention_count,
  count(distinct ml.mention_id) filter(where m.mention_type='EMAIL')::bigint as email_mention_count
from core.labels l
left join core.notice_department_residual_labels rl on rl.label_id=l.label_id and rl.label_contract_version=l.label_contract_version
left join core.extraction_mention_labels ml on ml.label_id=l.label_id and ml.label_contract_version=l.label_contract_version
left join core.extraction_mentions m on m.mention_id=ml.mention_id
group by l.label_id,l.label_contract_version;

create view analytics.mention_notice_resolution with (security_invoker=true) as
select distinct n.release_id,m.mention_id,n.notice_id,
  'KODIT_SOURCE_RECORD_EXTERNAL_KEY'::text resolution_basis,
  'mention-notice-v1'::text resolution_contract_version
from core.extraction_mentions m
join core.parser_runs pr on pr.extraction_id=m.extraction_id
join core.source_attachment_observations sao on sao.attachment_observation_id=pr.attachment_observation_id
join core.source_attachments sa on sa.attachment_id=sao.attachment_id
join core.source_records sr on sr.source_record_id=sa.source_record_id
join core.sources s on s.source_id=sr.source_id and s.source_code='kodit-preannouncement-preserved'
join publish.notices n on n.notice_number=sr.external_key
join publish.releases rel on rel.release_id=n.release_id and rel.status in('approved','retired');

create view analytics.rule_label_resolution with (security_invoker=true) as
select l.label_id,l.label_contract_version,'rule-label-regulation-v1'::text resolution_contract_version,
  case when count(r.regulation_id)=1 then 'RESOLVED' when count(r.regulation_id)>1 then 'AMBIGUOUS' else 'UNRESOLVED' end::text resolution_status,
  case when count(r.regulation_id)=1 then (array_agg(r.regulation_id) filter(where r.regulation_id is not null))[1] end regulation_id,
  'CANONICAL_NAME_EXACT'::text resolution_basis,count(r.regulation_id)::integer candidate_count
from core.labels l
join core.label_type_evidence e on e.label_id=l.label_id and e.label_contract_version=l.label_contract_version
left join core.regulations r on r.canonical_name=l.normalized_label
where l.label_contract_version='label-v1' and e.resolved_label_type='RULE'
group by l.label_id,l.label_contract_version;

create view analytics.notice_rule_change_assertions with (security_invoker=true) as
with raw_match as (
  select n.release_id,n.notice_id,n.title,r.regulation_id,r.canonical_name,
    strpos(n.title,r.canonical_name)-1 span_start,char_length(r.canonical_name) name_len
  from publish.notices n join publish.releases rel on rel.release_id=n.release_id and rel.status in('approved','retired')
  join core.regulations r on strpos(n.title,r.canonical_name)>0
  where n.title ~ '(제정|개정|폐지)'
), maximal as (
  select a.* from raw_match a where not exists(
    select 1 from raw_match b where b.release_id=a.release_id and b.notice_id=a.notice_id and b.regulation_id<>a.regulation_id
      and strpos(b.canonical_name,a.canonical_name)>0 and b.name_len>a.name_len)
), candidates as (
  select m.* from maximal m where strpos(m.title,'「'||m.canonical_name||'」')>0
    or (left(btrim(m.title),m.name_len)=m.canonical_name
      and substring(btrim(m.title) from m.name_len+1) ~ '^[[:space:]]*(제정|개정|폐지)')
), direct as (
  select m.*,case
    when m.title like '%폐지%' and m.title not like '%개정%' and m.title not like '%제정%' then 'PROPOSES_REPEAL'
    when m.title like '%제정%' and m.title not like '%개정%' and m.title not like '%폐지%' then 'PROPOSES_ENACTMENT'
    when m.title like '%개정%' and m.title not like '%폐지%' then 'PROPOSES_AMENDMENT' end change_kind
  from candidates m
  where (select count(*) from candidates x where x.release_id=m.release_id and x.notice_id=m.notice_id)=1
    and ((m.title like '%폐지%' and m.title not like '%개정%' and m.title not like '%제정%')
      or (m.title like '%제정%' and m.title not like '%개정%' and m.title not like '%폐지%')
      or (m.title like '%개정%' and m.title not like '%폐지%'))
)
select md5('kodit:analytics:change-assertion-v1:'||release_id::text||':'||notice_id::text||':'||regulation_id::text||':'||change_kind)::uuid assertion_id,
  release_id,notice_id,regulation_id,null::uuid target_regulation_version_id,change_kind,
  'TITLE_DIRECT'::text evidence_source_kind,null::uuid evidence_extraction_id,null::uuid evidence_mention_id,
  span_start,span_start+name_len span_end,title evidence_text,'change-assertion-v1'::text assertion_contract_version
from direct;

comment on view analytics.mention_notice_resolution is 'Canonical release-scoped mention-to-notice resolution. Count DISTINCT notice_id for notice metrics.';
comment on view analytics.rule_label_resolution is 'RULE labels resolve only to regulation identity, never to regulation_version by name.';
comment on view analytics.notice_rule_change_assertions is 'High-precision TITLE_DIRECT proposal assertions; LINKED_TO_RULE and a bare mention are insufficient.';

revoke all on all tables in schema analytics from public,anon,authenticated,service_role;
grant select on analytics.label_channel_evidence,analytics.mention_notice_resolution,
  analytics.rule_label_resolution,analytics.notice_rule_change_assertions to service_role;

commit;
