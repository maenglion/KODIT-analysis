begin;

insert into core.topics(topic_id,topic_code,name) values
 (md5('kodit:topic-v1:LITIGATION')::uuid,'LITIGATION','소송'),
 (md5('kodit:topic-v1:INVESTMENT_GUARANTEE')::uuid,'INVESTMENT_GUARANTEE','투자·보증')
on conflict(topic_code) do nothing;

insert into core.topic_terms(topic_term_id,topic_id,term,term_type,weight)
select md5('kodit:topic-v1:'||t.topic_code||':'||x.term_type||':'||x.term)::uuid,t.topic_id,x.term,x.term_type,1
from core.topics t join (values
 ('LITIGATION','소송','TITLE_KEYWORD'),('LITIGATION','법률구조','TITLE_KEYWORD'),
 ('LITIGATION','변호사','TITLE_KEYWORD'),('LITIGATION','법무사','TITLE_KEYWORD'),
 ('LITIGATION','소송','RULE_KEYWORD'),('LITIGATION','법률구조','RULE_KEYWORD'),
 ('LITIGATION','변호사','RULE_KEYWORD'),('LITIGATION','법무사','RULE_KEYWORD'),
 ('LITIGATION','소송대리','WORK_KEYWORD'),
 ('INVESTMENT_GUARANTEE','투자옵션부보증','TITLE_KEYWORD'),
 ('INVESTMENT_GUARANTEE','보증연계투자','TITLE_KEYWORD'),
 ('INVESTMENT_GUARANTEE','증자참여권','TITLE_KEYWORD'),
 ('INVESTMENT_GUARANTEE','퍼스트펭귄','TITLE_KEYWORD'),
 ('INVESTMENT_GUARANTEE','투자보증','TITLE_KEYWORD'),
 ('INVESTMENT_GUARANTEE','투자옵션부보증','RULE_KEYWORD'),
 ('INVESTMENT_GUARANTEE','보증연계투자','RULE_KEYWORD'),
 ('INVESTMENT_GUARANTEE','증자참여권','RULE_KEYWORD'),
 ('INVESTMENT_GUARANTEE','퍼스트펭귄','RULE_KEYWORD'),
 ('INVESTMENT_GUARANTEE','투자보증','RULE_KEYWORD'),
 ('INVESTMENT_GUARANTEE','투자옵션부보증','WORK_KEYWORD'),
 ('INVESTMENT_GUARANTEE','보증연계투자','WORK_KEYWORD'),
 ('INVESTMENT_GUARANTEE','증자참여권','WORK_KEYWORD')
) x(topic_code,term,term_type) on x.topic_code=t.topic_code
on conflict(topic_id,term,term_type) do nothing;

create table core.topic_notice_memberships (
  topic_membership_id uuid primary key,
  topic_contract_version text not null check(topic_contract_version='topic-v1'),
  release_id uuid not null references publish.releases(release_id) on delete restrict,
  topic_id uuid not null references core.topics(topic_id) on delete restrict,
  notice_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key(release_id,notice_id) references publish.notices(release_id,notice_id) on delete restrict,
  unique(topic_contract_version,release_id,topic_id,notice_id)
);

create table core.topic_membership_evidence (
  topic_evidence_id uuid primary key,
  topic_membership_id uuid not null references core.topic_notice_memberships(topic_membership_id) on delete restrict,
  evidence_basis text not null check(evidence_basis in('TITLE_TERM','MENTIONS_RULE','PROPOSES_CHANGE_TO','MENTIONS_WORK')),
  source_object_id uuid,
  regulation_id uuid references core.regulations(regulation_id) on delete restrict,
  evidence_text text not null,
  created_at timestamptz not null default now(),
  unique(topic_membership_id,evidence_basis,source_object_id,regulation_id,evidence_text),
  check(nullif(btrim(evidence_text),'') is not null)
);

comment on table core.topic_notice_memberships is 'T07-A non-exclusive, release-scoped topic-v1 membership at DISTINCT notice_id grain.';
comment on table core.topic_membership_evidence is 'Separated direct evidence channels. LINKED_TO_RULE, PERSON, EMAIL, department, and T06 functional attribution are prohibited.';

with cr as(select release_id from publish.current_release where singleton_key), evidence as (
 select n.release_id,n.notice_id,t.topic_id,t.topic_code,'TITLE_TERM'::text basis,null::uuid object_id,null::uuid regulation_id,tt.term evidence_text
 from cr join publish.notices n using(release_id) join core.topics t on t.topic_code in('LITIGATION','INVESTMENT_GUARANTEE')
 join core.topic_terms tt on tt.topic_id=t.topic_id and tt.term_type='TITLE_KEYWORD'
 where strpos(n.title,tt.term)>0
 union all
 select mn.release_id,mn.notice_id,t.topic_id,t.topic_code,'MENTIONS_RULE',m.mention_id,rr.regulation_id,r.canonical_name
 from cr join analytics.mention_notice_resolution mn using(release_id)
 join core.extraction_mentions m using(mention_id) join core.extraction_mention_labels ml using(mention_id)
 join analytics.rule_label_resolution rr on rr.label_id=ml.label_id and rr.label_contract_version=ml.label_contract_version and rr.resolution_status='RESOLVED'
 join core.regulations r using(regulation_id) join core.topics t on t.topic_code in('LITIGATION','INVESTMENT_GUARANTEE')
 join core.topic_terms tt on tt.topic_id=t.topic_id and tt.term_type='RULE_KEYWORD' and strpos(r.canonical_name,tt.term)>0
 where m.mention_type='RULE'
 union all
 select a.release_id,a.notice_id,t.topic_id,t.topic_code,'PROPOSES_CHANGE_TO',a.assertion_id,a.regulation_id,r.canonical_name
 from cr join analytics.notice_rule_change_assertions a using(release_id) join core.regulations r using(regulation_id)
 join core.topics t on t.topic_code in('LITIGATION','INVESTMENT_GUARANTEE')
 join core.topic_terms tt on tt.topic_id=t.topic_id and tt.term_type='RULE_KEYWORD' and strpos(r.canonical_name,tt.term)>0
 union all
 select mn.release_id,mn.notice_id,t.topic_id,t.topic_code,'MENTIONS_WORK',m.mention_id,null::uuid,l.normalized_label
 from cr join analytics.mention_notice_resolution mn using(release_id)
 join core.extraction_mentions m using(mention_id) join core.extraction_mention_labels ml using(mention_id)
 join core.labels l using(label_id,label_contract_version) join core.topics t on t.topic_code in('LITIGATION','INVESTMENT_GUARANTEE')
 join core.topic_terms tt on tt.topic_id=t.topic_id and tt.term_type='WORK_KEYWORD' and tt.term=l.normalized_label
 where m.mention_type='WORK'
), memberships as (
 select distinct release_id,notice_id,topic_id,topic_code,
  md5('kodit:topic-v1:'||release_id||':'||topic_code||':'||notice_id)::uuid membership_id from evidence
)
insert into core.topic_notice_memberships(topic_membership_id,topic_contract_version,release_id,topic_id,notice_id)
select membership_id,'topic-v1',release_id,topic_id,notice_id from memberships on conflict do nothing;

with cr as(select release_id from publish.current_release where singleton_key), evidence as (
 select n.release_id,n.notice_id,t.topic_id,t.topic_code,'TITLE_TERM'::text basis,null::uuid object_id,null::uuid regulation_id,tt.term evidence_text
 from cr join publish.notices n using(release_id) join core.topics t on t.topic_code in('LITIGATION','INVESTMENT_GUARANTEE')
 join core.topic_terms tt on tt.topic_id=t.topic_id and tt.term_type='TITLE_KEYWORD' where strpos(n.title,tt.term)>0
 union all
 select mn.release_id,mn.notice_id,t.topic_id,t.topic_code,'MENTIONS_RULE',m.mention_id,rr.regulation_id,r.canonical_name
 from cr join analytics.mention_notice_resolution mn using(release_id) join core.extraction_mentions m using(mention_id)
 join core.extraction_mention_labels ml using(mention_id) join analytics.rule_label_resolution rr on rr.label_id=ml.label_id and rr.label_contract_version=ml.label_contract_version and rr.resolution_status='RESOLVED'
 join core.regulations r using(regulation_id) join core.topics t on t.topic_code in('LITIGATION','INVESTMENT_GUARANTEE')
 join core.topic_terms tt on tt.topic_id=t.topic_id and tt.term_type='RULE_KEYWORD' and strpos(r.canonical_name,tt.term)>0 where m.mention_type='RULE'
 union all
 select a.release_id,a.notice_id,t.topic_id,t.topic_code,'PROPOSES_CHANGE_TO',a.assertion_id,a.regulation_id,r.canonical_name
 from cr join analytics.notice_rule_change_assertions a using(release_id) join core.regulations r using(regulation_id)
 join core.topics t on t.topic_code in('LITIGATION','INVESTMENT_GUARANTEE') join core.topic_terms tt on tt.topic_id=t.topic_id and tt.term_type='RULE_KEYWORD' and strpos(r.canonical_name,tt.term)>0
 union all
 select mn.release_id,mn.notice_id,t.topic_id,t.topic_code,'MENTIONS_WORK',m.mention_id,null::uuid,l.normalized_label
 from cr join analytics.mention_notice_resolution mn using(release_id) join core.extraction_mentions m using(mention_id)
 join core.extraction_mention_labels ml using(mention_id) join core.labels l using(label_id,label_contract_version)
 join core.topics t on t.topic_code in('LITIGATION','INVESTMENT_GUARANTEE') join core.topic_terms tt on tt.topic_id=t.topic_id and tt.term_type='WORK_KEYWORD' and tt.term=l.normalized_label where m.mention_type='WORK'
), distinct_evidence as (select distinct * from evidence)
insert into core.topic_membership_evidence(topic_evidence_id,topic_membership_id,evidence_basis,source_object_id,regulation_id,evidence_text)
select md5('kodit:topic-evidence-v1:'||e.release_id||':'||e.topic_code||':'||e.notice_id||':'||e.basis||':'||coalesce(e.object_id::text,'')||':'||coalesce(e.regulation_id::text,'')||':'||e.evidence_text)::uuid,
 m.topic_membership_id,e.basis,e.object_id,e.regulation_id,e.evidence_text
from distinct_evidence e join core.topic_notice_memberships m on m.release_id=e.release_id and m.notice_id=e.notice_id and m.topic_id=e.topic_id and m.topic_contract_version='topic-v1'
on conflict do nothing;

create view analytics.topic_notice_membership_v1 with(security_invoker=true) as
select m.release_id,m.notice_id,t.topic_id,t.topic_code,t.name topic_name,m.topic_membership_id
from core.topic_notice_memberships m join core.topics t using(topic_id) where m.topic_contract_version='topic-v1';

create view analytics.topic_mentioned_regulations_v1 with(security_invoker=true) as
select distinct m.release_id,m.notice_id,t.topic_code,e.regulation_id,r.canonical_name
from core.topic_membership_evidence e join core.topic_notice_memberships m using(topic_membership_id)
join core.topics t using(topic_id) join core.regulations r using(regulation_id)
where e.evidence_basis='MENTIONS_RULE';

create view analytics.topic_proposed_change_regulations_v1 with(security_invoker=true) as
select distinct m.release_id,m.notice_id,t.topic_code,e.regulation_id,r.canonical_name
from core.topic_membership_evidence e join core.topic_notice_memberships m using(topic_membership_id)
join core.topics t using(topic_id) join core.regulations r using(regulation_id)
where e.evidence_basis='PROPOSES_CHANGE_TO';

create view analytics.topic_direct_organizations_v1 with(security_invoker=true) as
select distinct tm.release_id,tm.notice_id,tm.topic_code,rel.org_node_id,n.official_name
from analytics.topic_notice_membership_v1 tm join analytics.mention_notice_resolution mn on mn.release_id=tm.release_id and mn.notice_id=tm.notice_id
join core.extraction_mentions em on em.mention_id=mn.mention_id and em.mention_type='ORG'
join core.extraction_mention_labels ml on ml.mention_id=em.mention_id
join core.organization_label_node_relations rel on rel.label_id=ml.label_id and rel.label_contract_version=ml.label_contract_version and rel.relation_status='CONFIRMED'
join core.organization_nodes n using(org_node_id);

create view analytics.topic_work_keywords_v1 with(security_invoker=true) as
select distinct m.release_id,m.notice_id,t.topic_code,e.evidence_text work_keyword
from core.topic_membership_evidence e join core.topic_notice_memberships m using(topic_membership_id)
join core.topics t using(topic_id) where e.evidence_basis='MENTIONS_WORK';

create function publish.public_topic_summary_v1()
returns table(topic_code text,topic_name text,notice_count bigint,regulation_count bigint,direct_org_count bigint,
 period_start date,period_end date,yearly jsonb,evidence_basis jsonb,top_mentioned_regulations jsonb,
 top_proposed_change_regulations jsonb,top_direct_organizations jsonb,selected_work_keywords jsonb)
language sql stable security definer set search_path=''
as $$
with cr as(select release_id from publish.current_release where singleton_key), base as(
 select tm.*,n.posted_date from cr join analytics.topic_notice_membership_v1 tm using(release_id) join publish.notices n using(release_id,notice_id)
), topics as(select distinct topic_code,topic_name from base)
select x.topic_code,x.topic_name,
 (select count(distinct notice_id) from base b where b.topic_code=x.topic_code),
 (select count(distinct regulation_id) from analytics.topic_mentioned_regulations_v1 r join cr using(release_id) where r.topic_code=x.topic_code),
 (select count(distinct org_node_id) from analytics.topic_direct_organizations_v1 o join cr using(release_id) where o.topic_code=x.topic_code),
 (select min(posted_date) from base b where b.topic_code=x.topic_code),(select max(posted_date) from base b where b.topic_code=x.topic_code),
 coalesce((select jsonb_object_agg(y,ct order by y) from(select extract(year from posted_date)::int y,count(distinct notice_id) ct from base b where b.topic_code=x.topic_code group by 1) q),'{}'::jsonb),
 coalesce((select jsonb_object_agg(evidence_basis,ct order by evidence_basis) from(select e.evidence_basis,count(distinct m.notice_id) ct from core.topic_membership_evidence e join core.topic_notice_memberships m using(topic_membership_id) join cr using(release_id) join core.topics t using(topic_id) where t.topic_code=x.topic_code group by 1) q),'{}'::jsonb),
 coalesce((select jsonb_agg(to_jsonb(q) order by notice_count desc,canonical_name) from(select regulation_id,canonical_name,count(distinct notice_id) notice_count from analytics.topic_mentioned_regulations_v1 r join cr using(release_id) where r.topic_code=x.topic_code group by 1,2 order by 3 desc,2 limit 20) q),'[]'::jsonb),
 coalesce((select jsonb_agg(to_jsonb(q) order by notice_count desc,canonical_name) from(select regulation_id,canonical_name,count(distinct notice_id) notice_count from analytics.topic_proposed_change_regulations_v1 r join cr using(release_id) where r.topic_code=x.topic_code group by 1,2 order by 3 desc,2 limit 20) q),'[]'::jsonb),
 coalesce((select jsonb_agg(to_jsonb(q) order by notice_count desc,official_name) from(select org_node_id,official_name,count(distinct notice_id) notice_count from analytics.topic_direct_organizations_v1 o join cr using(release_id) where o.topic_code=x.topic_code group by 1,2 order by 3 desc,2 limit 20) q),'[]'::jsonb),
 coalesce((select jsonb_agg(to_jsonb(q) order by notice_count desc,work_keyword) from(select work_keyword,count(distinct notice_id) notice_count from analytics.topic_work_keywords_v1 w join cr using(release_id) where w.topic_code=x.topic_code group by 1 order by 2 desc,1) q),'[]'::jsonb)
from topics x order by x.topic_code;
$$;

create function publish.public_topic_notice_rows_v1(p_topic_code text)
returns table(topic_code text,notice_id uuid,notice_number text,title text,posted_date date,source_location text,
 evidence_basis text[],mentioned_regulations text[],proposed_change_regulations text[],direct_organizations text[],work_keywords text[])
language sql stable security definer set search_path=''
as $$
with cr as(select release_id from publish.current_release where singleton_key)
select tm.topic_code,n.notice_id,n.notice_number,n.title,n.posted_date,n.source_location,
 array(select distinct e.evidence_basis from core.topic_membership_evidence e where e.topic_membership_id=tm.topic_membership_id order by 1),
 array(select distinct r.canonical_name from analytics.topic_mentioned_regulations_v1 r where r.release_id=tm.release_id and r.notice_id=tm.notice_id and r.topic_code=tm.topic_code order by 1),
 array(select distinct r.canonical_name from analytics.topic_proposed_change_regulations_v1 r where r.release_id=tm.release_id and r.notice_id=tm.notice_id and r.topic_code=tm.topic_code order by 1),
 array(select distinct o.official_name from analytics.topic_direct_organizations_v1 o where o.release_id=tm.release_id and o.notice_id=tm.notice_id and o.topic_code=tm.topic_code order by 1),
 array(select distinct w.work_keyword from analytics.topic_work_keywords_v1 w where w.release_id=tm.release_id and w.notice_id=tm.notice_id and w.topic_code=tm.topic_code order by 1)
from cr join analytics.topic_notice_membership_v1 tm using(release_id) join publish.notices n using(release_id,notice_id)
where tm.topic_code=p_topic_code order by n.posted_date desc,n.notice_number;
$$;

alter table core.topic_notice_memberships enable row level security;
alter table core.topic_membership_evidence enable row level security;
revoke all on core.topic_notice_memberships,core.topic_membership_evidence from public,anon,authenticated;
grant select,insert on core.topic_notice_memberships,core.topic_membership_evidence to service_role;
revoke all on all tables in schema analytics from public,anon,authenticated;
grant select on analytics.topic_notice_membership_v1,analytics.topic_mentioned_regulations_v1,
 analytics.topic_proposed_change_regulations_v1,analytics.topic_direct_organizations_v1,analytics.topic_work_keywords_v1 to service_role;
create trigger topic_notice_memberships_append_only before update or delete on core.topic_notice_memberships for each row execute function core.reject_history_mutation();
create trigger topic_membership_evidence_append_only before update or delete on core.topic_membership_evidence for each row execute function core.reject_history_mutation();
alter function publish.public_topic_summary_v1() owner to postgres;
alter function publish.public_topic_notice_rows_v1(text) owner to postgres;
revoke all on function publish.public_topic_summary_v1() from public,anon,authenticated,service_role;
revoke all on function publish.public_topic_notice_rows_v1(text) from public,anon,authenticated,service_role;
grant execute on function publish.public_topic_summary_v1() to anon,authenticated,service_role;
grant execute on function publish.public_topic_notice_rows_v1(text) to anon,authenticated,service_role;

commit;
