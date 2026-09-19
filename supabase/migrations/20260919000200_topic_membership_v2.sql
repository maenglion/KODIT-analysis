begin;

create table core.topic_families_v2 (
  family_id uuid primary key,
  topic_contract_version text not null check(topic_contract_version='topic-membership-v2'),
  parent_topic_id uuid not null references core.topics(topic_id) on delete restrict,
  family_code text not null,
  family_name text not null,
  family_status text not null check(family_status in('APPROVED_CHILD_FAMILY','RELATED_BUT_OUT_OF_SCOPE','UNRESOLVED_FAMILY_CANDIDATE')),
  scope_definition text not null,
  decision_basis text not null,
  official_reference_url text,
  created_at timestamptz not null default now(),
  unique(topic_contract_version,family_code),
  check(nullif(btrim(family_code),'') is not null),
  check(official_reference_url is null or official_reference_url ~ '^https://')
);

create table core.topic_family_regulations_v2 (
  family_regulation_id uuid primary key,
  family_id uuid not null references core.topic_families_v2(family_id) on delete restrict,
  regulation_id uuid not null references core.regulations(regulation_id) on delete restrict,
  relation_basis text not null check(relation_basis='OFFICIAL_REGULATION_IDENTITY'),
  created_at timestamptz not null default now(),
  unique(family_id,regulation_id)
);

create table core.topic_family_terms_v2 (
  family_term_id uuid primary key,
  family_id uuid not null references core.topic_families_v2(family_id) on delete restrict,
  term text not null,
  evidence_basis text not null check(evidence_basis in('TITLE_DIRECT','WORK_DIRECT')),
  created_at timestamptz not null default now(),
  unique(family_id,term,evidence_basis),
  check(nullif(btrim(term),'') is not null),
  check(term not in('보증','투자','운용기준','업무처리방법','개정','사전예고'))
);

create table core.topic_notice_family_memberships_v2 (
  family_membership_id uuid primary key,
  topic_contract_version text not null check(topic_contract_version='topic-membership-v2'),
  release_id uuid not null references publish.releases(release_id) on delete restrict,
  notice_id uuid not null,
  family_id uuid not null references core.topic_families_v2(family_id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key(release_id,notice_id) references publish.notices(release_id,notice_id) on delete restrict,
  unique(topic_contract_version,release_id,notice_id,family_id)
);

create table core.topic_family_membership_evidence_v2 (
  family_evidence_id uuid primary key,
  family_membership_id uuid not null references core.topic_notice_family_memberships_v2(family_membership_id) on delete restrict,
  evidence_basis text not null check(evidence_basis in('TITLE_DIRECT','MENTIONS_RULE','PROPOSES_CHANGE_TO','WORK_DIRECT','MANUAL_APPROVED_SEED','OFFICIAL_PRODUCT_REFERENCE')),
  source_object_id uuid,
  regulation_id uuid references core.regulations(regulation_id) on delete restrict,
  evidence_text text not null,
  created_at timestamptz not null default now(),
  check(nullif(btrim(evidence_text),'') is not null)
);

comment on table core.topic_families_v2 is 'T07-C versioned product/regulation family boundary. Generic lexical OR is prohibited.';
comment on table core.topic_notice_family_memberships_v2 is 'Release-scoped child-family memberships; parent INVESTMENT_GUARANTEE is their distinct union.';
comment on table core.topic_family_membership_evidence_v2 is 'Direct, family-bound membership evidence only. ORG/PERSON/EMAIL/department/T06 inference are prohibited.';

with parent as(select topic_id from core.topics where topic_code='INVESTMENT_GUARANTEE')
insert into core.topic_families_v2(family_id,topic_contract_version,parent_topic_id,family_code,family_name,family_status,scope_definition,decision_basis,official_reference_url)
select md5('kodit:topic-membership-v2:family:'||x.family_code)::uuid,'topic-membership-v2',parent.topic_id,x.family_code,x.family_name,x.family_status,x.scope_definition,x.decision_basis,x.url
from parent cross join(values
 ('INVESTMENT_OPTION_GUARANTEE','투자옵션부보증','APPROVED_CHILD_FAMILY','투자 전환권이 결합된 공식 보증상품 family','공식 상품 설명과 canonical regulation series','https://www.kodit.or.kr/kodit/cm/cntnts/cntntsView.do?cntntsId=11080&mi=2542'),
 ('GUARANTEE_LINKED_INVESTMENT','보증연계투자·직접투자 업무','APPROVED_CHILD_FAMILY','보증연계투자 및 신보 직접투자 규정 family','공식 투자업무 regulation identities','https://www.kodit.or.kr/kodit/cm/cntnts/cntntsView.do?cntntsId=11079&mi=2541'),
 ('MNA_GUARANTEE_RELATED','M&A보증','APPROVED_CHILD_FAMILY','합병·주식취득·영업양수 자금을 지원하는 공식 투융자복합금융 family','공식 M&A보증 상품 설명과 regulation series','https://www.kodit.or.kr/kodit/cm/cntnts/cntntsView.do?cntntsId=11081&mi=2543'),
 ('CULTURE_CONTENT_PROJECT_INVESTMENT','문화콘텐츠 프로젝트투자','APPROVED_CHILD_FAMILY','공식 문화콘텐츠 프로젝트투자 family','canonical regulation identity','https://www.kodit.or.kr/kodit/cm/cntnts/cntntsView.do?cntntsId=12242&mi=3992'),
 ('VC_FUND_CONTRIBUTION_GUARANTEE','VC펀드 출자금보증','APPROVED_CHILD_FAMILY','VC펀드 출자와 직접 결합된 공식 보증 family','canonical regulation identity','https://www.kodit.or.kr/kodit/cm/cntnts/cntntsView.do?cntntsId=12624&mi=4553'),
 ('INVESTMENT_BRIDGE_GUARANTEE','투자브릿지 보증프로그램','APPROVED_CHILD_FAMILY','후속 투자와 연결되는 공식 보증프로그램 family','canonical regulation series',null),
 ('INVESTMENT_RISK_SHARING_GUARANTEE','투자위험분담형보증','APPROVED_CHILD_FAMILY','투자 위험분담과 직접 결합된 공식 보증 family','canonical regulation identity',null),
 ('DOMESTIC_COINVESTMENT_GUARANTEE','국내동반 투자자금 보증','APPROVED_CHILD_FAMILY','동반투자 자금과 직접 결합된 공식 보증 family','canonical regulation identity',null),
 ('STARTUP_RAPID_INVESTMENT','Start-up 신속투자 프로그램','APPROVED_CHILD_FAMILY','신보 투자 프로그램의 공식 regulation family','canonical regulation identity',null),
 ('FIRST_PENGUIN_RELATED','퍼스트펭귄 창업기업 보증지원','RELATED_BUT_OUT_OF_SCOPE','창업기업 보증지원 프로그램이며 투자·자본성 금융 family로 직접 확인되지 않음','공식 제도 설명상 보증지원 프로그램','https://www.kodit.or.kr/kodit/cm/cntnts/cntntsView.do?cntntsId=11097&mi=2567')
)x(family_code,family_name,family_status,scope_definition,decision_basis,url)
on conflict(topic_contract_version,family_code) do nothing;

with mapping(family_code,canonical_name) as(values
 ('INVESTMENT_OPTION_GUARANTEE','투자옵션부보증 업무처리방법'),('INVESTMENT_OPTION_GUARANTEE','투자옵션부보증 운영기준'),('INVESTMENT_OPTION_GUARANTEE','투자옵션부보증 운용기준'),('INVESTMENT_OPTION_GUARANTEE','투자옵션부보증기준'),
 ('GUARANTEE_LINKED_INVESTMENT','투자규정'),('GUARANTEE_LINKED_INVESTMENT','투자업무 운용요령'),('GUARANTEE_LINKED_INVESTMENT','투자업무 처리기준'),('GUARANTEE_LINKED_INVESTMENT','투자기업 사후관리 운용기준'),('GUARANTEE_LINKED_INVESTMENT','투자계약 관리기준'),('GUARANTEE_LINKED_INVESTMENT','투자계약서'),('GUARANTEE_LINKED_INVESTMENT','투자운용업무요령'),
 ('MNA_GUARANTEE_RELATED','M&A보증 운영기준'),('MNA_GUARANTEE_RELATED','M&A보증 운용기준'),('MNA_GUARANTEE_RELATED','중소·중견기업 M&A 활성화를 위한 협약보증 업무처리방법'),
 ('CULTURE_CONTENT_PROJECT_INVESTMENT','문화콘텐츠 프로젝트투자 프로그램 운용기준'),('VC_FUND_CONTRIBUTION_GUARANTEE','VC펀드 출자금보증 업무처리방법'),
 ('INVESTMENT_BRIDGE_GUARANTEE','투자브릿지 보증프로그램 기준'),('INVESTMENT_BRIDGE_GUARANTEE','투자브릿지 보증프로그램 운용기준'),
 ('INVESTMENT_RISK_SHARING_GUARANTEE','투자위험분담형보증기준'),('DOMESTIC_COINVESTMENT_GUARANTEE','국내동반 투자자금 보증 업무처리방법'),('STARTUP_RAPID_INVESTMENT','Start-up 신속투자 프로그램 운용기준')
)
insert into core.topic_family_regulations_v2(family_regulation_id,family_id,regulation_id,relation_basis)
select md5('kodit:topic-membership-v2:family-regulation:'||f.family_code||':'||r.regulation_id)::uuid,f.family_id,r.regulation_id,'OFFICIAL_REGULATION_IDENTITY'
from mapping m join core.topic_families_v2 f on f.family_code=m.family_code and f.topic_contract_version='topic-membership-v2'
join core.regulations r on r.canonical_name=m.canonical_name
on conflict(family_id,regulation_id) do nothing;

with terms(family_code,term) as(values
 ('INVESTMENT_OPTION_GUARANTEE','투자옵션부보증'),('INVESTMENT_OPTION_GUARANTEE','증자참여권'),
 ('GUARANTEE_LINKED_INVESTMENT','보증연계투자'),('GUARANTEE_LINKED_INVESTMENT','투자규정'),('GUARANTEE_LINKED_INVESTMENT','투자업무 운용요령'),('GUARANTEE_LINKED_INVESTMENT','투자업무 처리기준'),('GUARANTEE_LINKED_INVESTMENT','투자기업 사후관리 운용기준'),
 ('MNA_GUARANTEE_RELATED','M&A보증'),('CULTURE_CONTENT_PROJECT_INVESTMENT','문화콘텐츠 프로젝트투자'),('VC_FUND_CONTRIBUTION_GUARANTEE','VC펀드 출자금보증'),
 ('INVESTMENT_BRIDGE_GUARANTEE','투자브릿지 보증프로그램'),('INVESTMENT_RISK_SHARING_GUARANTEE','투자위험분담형보증'),
 ('DOMESTIC_COINVESTMENT_GUARANTEE','국내동반 투자자금 보증'),('STARTUP_RAPID_INVESTMENT','Start-up 신속투자')
), bases(evidence_basis) as(values('TITLE_DIRECT'),('WORK_DIRECT'))
insert into core.topic_family_terms_v2(family_term_id,family_id,term,evidence_basis)
select md5('kodit:topic-membership-v2:family-term:'||f.family_code||':'||b.evidence_basis||':'||t.term)::uuid,f.family_id,t.term,b.evidence_basis
from terms t join core.topic_families_v2 f on f.family_code=t.family_code and f.topic_contract_version='topic-membership-v2' cross join bases b
on conflict(family_id,term,evidence_basis) do nothing;

create temporary table t07c_evidence on commit drop as
with cr as(select release_id from publish.current_release where singleton_key)
select distinct mn.release_id,mn.notice_id,f.family_id,'MENTIONS_RULE'::text evidence_basis,m.mention_id source_object_id,r.regulation_id,r.canonical_name evidence_text
from cr join analytics.mention_notice_resolution mn using(release_id)
join core.extraction_mentions m using(mention_id) join core.extraction_mention_labels ml using(mention_id)
join analytics.rule_label_resolution rr on rr.label_id=ml.label_id and rr.label_contract_version=ml.label_contract_version and rr.resolution_status='RESOLVED'
join core.topic_family_regulations_v2 fr on fr.regulation_id=rr.regulation_id join core.topic_families_v2 f using(family_id)
join core.regulations r on r.regulation_id=rr.regulation_id where m.mention_type='RULE' and f.family_status='APPROVED_CHILD_FAMILY'
union
select distinct a.release_id,a.notice_id,f.family_id,'PROPOSES_CHANGE_TO',a.assertion_id,r.regulation_id,r.canonical_name
from cr join analytics.notice_rule_change_assertions a using(release_id)
join core.topic_family_regulations_v2 fr on fr.regulation_id=a.regulation_id join core.topic_families_v2 f using(family_id)
join core.regulations r on r.regulation_id=a.regulation_id where f.family_status='APPROVED_CHILD_FAMILY'
union
select distinct n.release_id,n.notice_id,f.family_id,'TITLE_DIRECT',null::uuid,null::uuid,ft.term
from cr join publish.notices n using(release_id) join core.topic_family_terms_v2 ft on ft.evidence_basis='TITLE_DIRECT' and strpos(n.title,ft.term)>0
join core.topic_families_v2 f using(family_id) where f.family_status='APPROVED_CHILD_FAMILY'
union
select distinct mn.release_id,mn.notice_id,f.family_id,'WORK_DIRECT',m.mention_id,null::uuid,l.normalized_label
from cr join analytics.mention_notice_resolution mn using(release_id)
join core.extraction_mentions m using(mention_id) join core.extraction_mention_labels ml using(mention_id)
join core.labels l using(label_id,label_contract_version)
join core.topic_family_terms_v2 ft on ft.evidence_basis='WORK_DIRECT' and ft.term=l.normalized_label
join core.topic_families_v2 f using(family_id) where m.mention_type='WORK' and f.family_status='APPROVED_CHILD_FAMILY';

insert into core.topic_notice_family_memberships_v2(family_membership_id,topic_contract_version,release_id,notice_id,family_id)
select md5('kodit:topic-membership-v2:membership:'||release_id||':'||notice_id||':'||family_id)::uuid,'topic-membership-v2',release_id,notice_id,family_id
from(select distinct release_id,notice_id,family_id from t07c_evidence)x on conflict do nothing;

insert into core.topic_family_membership_evidence_v2(family_evidence_id,family_membership_id,evidence_basis,source_object_id,regulation_id,evidence_text)
select md5('kodit:topic-membership-v2:evidence:'||e.release_id||':'||e.notice_id||':'||e.family_id||':'||e.evidence_basis||':'||coalesce(e.source_object_id::text,'')||':'||coalesce(e.regulation_id::text,'')||':'||e.evidence_text)::uuid,
 m.family_membership_id,e.evidence_basis,e.source_object_id,e.regulation_id,e.evidence_text
from t07c_evidence e join core.topic_notice_family_memberships_v2 m on m.release_id=e.release_id and m.notice_id=e.notice_id and m.family_id=e.family_id and m.topic_contract_version='topic-membership-v2'
on conflict(family_evidence_id) do nothing;

create view analytics.topic_family_membership_v2 with(security_invoker=true) as
select m.release_id,m.notice_id,m.family_membership_id,f.family_id,f.family_code,f.family_name
from core.topic_notice_family_memberships_v2 m join core.topic_families_v2 f using(family_id)
where m.topic_contract_version='topic-membership-v2' and f.family_status='APPROVED_CHILD_FAMILY';

create view analytics.topic_parent_membership_v2 with(security_invoker=true) as
select distinct fm.release_id,fm.notice_id,t.topic_id,t.topic_code,t.name topic_name
from analytics.topic_family_membership_v2 fm join core.topic_families_v2 f using(family_id) join core.topics t on t.topic_id=f.parent_topic_id;

create view analytics.topic_mentioned_regulations_v2 with(security_invoker=true) as
select distinct m.release_id,m.notice_id,t.topic_code,e.regulation_id,r.canonical_name
from core.topic_family_membership_evidence_v2 e join core.topic_notice_family_memberships_v2 m using(family_membership_id)
join core.topic_families_v2 f using(family_id) join core.topics t on t.topic_id=f.parent_topic_id join core.regulations r using(regulation_id)
where e.evidence_basis='MENTIONS_RULE' and f.family_status='APPROVED_CHILD_FAMILY';

create view analytics.topic_proposed_change_regulations_v2 with(security_invoker=true) as
select distinct m.release_id,m.notice_id,t.topic_code,e.regulation_id,r.canonical_name
from core.topic_family_membership_evidence_v2 e join core.topic_notice_family_memberships_v2 m using(family_membership_id)
join core.topic_families_v2 f using(family_id) join core.topics t on t.topic_id=f.parent_topic_id join core.regulations r using(regulation_id)
where e.evidence_basis='PROPOSES_CHANGE_TO' and f.family_status='APPROVED_CHILD_FAMILY';

create view analytics.topic_direct_organizations_v2 with(security_invoker=true) as
select distinct tm.release_id,tm.notice_id,tm.topic_code,rel.org_node_id,n.official_name
from analytics.topic_parent_membership_v2 tm join analytics.mention_notice_resolution mn on mn.release_id=tm.release_id and mn.notice_id=tm.notice_id
join core.extraction_mentions em on em.mention_id=mn.mention_id and em.mention_type='ORG'
join core.extraction_mention_labels ml on ml.mention_id=em.mention_id
join core.organization_label_node_relations rel on rel.label_id=ml.label_id and rel.label_contract_version=ml.label_contract_version and rel.relation_status='CONFIRMED'
join core.organization_nodes n using(org_node_id);

create view analytics.topic_work_keywords_v2 with(security_invoker=true) as
select distinct m.release_id,m.notice_id,t.topic_code,e.evidence_text work_keyword
from core.topic_family_membership_evidence_v2 e join core.topic_notice_family_memberships_v2 m using(family_membership_id)
join core.topic_families_v2 f using(family_id) join core.topics t on t.topic_id=f.parent_topic_id
where e.evidence_basis='WORK_DIRECT' and f.family_status='APPROVED_CHILD_FAMILY';

create function publish.public_topic_summary_v2()
returns table(topic_code text,topic_name text,membership_contract text,notice_count bigint,regulation_count bigint,direct_org_count bigint,
 period_start date,period_end date,yearly jsonb,evidence_basis jsonb,child_families jsonb,top_mentioned_regulations jsonb,
 top_proposed_change_regulations jsonb,top_direct_organizations jsonb,selected_work_keywords jsonb)
language sql stable security definer set search_path=''
as $$
with cr as(select release_id from publish.current_release where singleton_key), base as(
 select tm.*,n.posted_date from cr join analytics.topic_parent_membership_v2 tm using(release_id) join publish.notices n using(release_id,notice_id)
), investment as(
 select 'INVESTMENT_GUARANTEE'::text topic_code,'투자·보증'::text topic_name,'topic-membership-v2'::text membership_contract,
 count(distinct b.notice_id) notice_count,
 (select count(distinct regulation_id) from analytics.topic_mentioned_regulations_v2 r join cr using(release_id) where r.topic_code='INVESTMENT_GUARANTEE') regulation_count,
 (select count(distinct org_node_id) from analytics.topic_direct_organizations_v2 o join cr using(release_id) where o.topic_code='INVESTMENT_GUARANTEE') direct_org_count,
 min(b.posted_date) period_start,max(b.posted_date) period_end,
 coalesce((select jsonb_object_agg(y,ct order by y) from(select extract(year from posted_date)::int y,count(distinct notice_id) ct from base group by 1)q),'{}'::jsonb) yearly,
 coalesce((select jsonb_object_agg(evidence_basis,ct order by evidence_basis) from(select e.evidence_basis,count(distinct m.notice_id) ct from core.topic_family_membership_evidence_v2 e join core.topic_notice_family_memberships_v2 m using(family_membership_id) join cr using(release_id) group by 1)q),'{}'::jsonb) evidence_basis,
 coalesce((select jsonb_agg(to_jsonb(q) order by notice_count desc,family_code) from(select fm.family_code,fm.family_name,count(distinct fm.notice_id) notice_count from analytics.topic_family_membership_v2 fm join cr using(release_id) group by 1,2)q),'[]'::jsonb) child_families,
 coalesce((select jsonb_agg(to_jsonb(q) order by notice_count desc,canonical_name) from(select regulation_id,canonical_name,count(distinct notice_id) notice_count from analytics.topic_mentioned_regulations_v2 r join cr using(release_id) group by 1,2 order by 3 desc,2 limit 20)q),'[]'::jsonb) top_mentioned_regulations,
 coalesce((select jsonb_agg(to_jsonb(q) order by notice_count desc,canonical_name) from(select regulation_id,canonical_name,count(distinct notice_id) notice_count from analytics.topic_proposed_change_regulations_v2 r join cr using(release_id) group by 1,2 order by 3 desc,2 limit 20)q),'[]'::jsonb) top_proposed_change_regulations,
 coalesce((select jsonb_agg(to_jsonb(q) order by notice_count desc,official_name) from(select org_node_id,official_name,count(distinct notice_id) notice_count from analytics.topic_direct_organizations_v2 o join cr using(release_id) group by 1,2 order by 3 desc,2 limit 20)q),'[]'::jsonb) top_direct_organizations,
 coalesce((select jsonb_agg(to_jsonb(q) order by notice_count desc,work_keyword) from(select work_keyword,count(distinct notice_id) notice_count from analytics.topic_work_keywords_v2 w join cr using(release_id) group by 1 order by 2 desc,1)q),'[]'::jsonb) selected_work_keywords
 from base b
), litigation as(
 select s.topic_code,s.topic_name,'topic-v1'::text membership_contract,s.notice_count,s.regulation_count,s.direct_org_count,s.period_start,s.period_end,s.yearly,s.evidence_basis,'[]'::jsonb child_families,s.top_mentioned_regulations,s.top_proposed_change_regulations,s.top_direct_organizations,s.selected_work_keywords
 from publish.public_topic_summary_v1() s where s.topic_code='LITIGATION'
)
select * from litigation union all select * from investment order by topic_code;
$$;

create function publish.public_topic_notice_rows_v2(p_topic_code text)
returns table(topic_code text,membership_contract text,notice_id uuid,notice_number text,title text,posted_date date,source_location text,
 child_families text[],evidence_basis text[],mentioned_regulations text[],proposed_change_regulations text[],direct_organizations text[],work_keywords text[])
language sql stable security definer set search_path=''
as $$
with cr as(select release_id from publish.current_release where singleton_key), investment as(
 select tm.topic_code,'topic-membership-v2'::text membership_contract,n.notice_id,n.notice_number,n.title,n.posted_date,n.source_location,
 array(select distinct fm.family_code from analytics.topic_family_membership_v2 fm where fm.release_id=tm.release_id and fm.notice_id=tm.notice_id order by 1) child_families,
 array(select distinct e.evidence_basis from core.topic_family_membership_evidence_v2 e join core.topic_notice_family_memberships_v2 m using(family_membership_id) where m.release_id=tm.release_id and m.notice_id=tm.notice_id order by 1) evidence_basis,
 array(select distinct r.canonical_name from analytics.topic_mentioned_regulations_v2 r where r.release_id=tm.release_id and r.notice_id=tm.notice_id order by 1) mentioned_regulations,
 array(select distinct r.canonical_name from analytics.topic_proposed_change_regulations_v2 r where r.release_id=tm.release_id and r.notice_id=tm.notice_id order by 1) proposed_change_regulations,
 array(select distinct o.official_name from analytics.topic_direct_organizations_v2 o where o.release_id=tm.release_id and o.notice_id=tm.notice_id order by 1) direct_organizations,
 array(select distinct w.work_keyword from analytics.topic_work_keywords_v2 w where w.release_id=tm.release_id and w.notice_id=tm.notice_id order by 1) work_keywords
 from cr join analytics.topic_parent_membership_v2 tm using(release_id) join publish.notices n using(release_id,notice_id)
 where p_topic_code='INVESTMENT_GUARANTEE'
), litigation as(
 select r.topic_code,'topic-v1'::text membership_contract,r.notice_id,r.notice_number,r.title,r.posted_date,r.source_location,'{}'::text[] child_families,r.evidence_basis,r.mentioned_regulations,r.proposed_change_regulations,r.direct_organizations,r.work_keywords
 from publish.public_topic_notice_rows_v1('LITIGATION') r where p_topic_code='LITIGATION'
)
select * from litigation union all select * from investment order by posted_date desc,notice_number;
$$;

alter table core.topic_families_v2 enable row level security;
alter table core.topic_family_regulations_v2 enable row level security;
alter table core.topic_family_terms_v2 enable row level security;
alter table core.topic_notice_family_memberships_v2 enable row level security;
alter table core.topic_family_membership_evidence_v2 enable row level security;
revoke all on core.topic_families_v2,core.topic_family_regulations_v2,core.topic_family_terms_v2,core.topic_notice_family_memberships_v2,core.topic_family_membership_evidence_v2 from public,anon,authenticated;
grant select,insert on core.topic_families_v2,core.topic_family_regulations_v2,core.topic_family_terms_v2,core.topic_notice_family_memberships_v2,core.topic_family_membership_evidence_v2 to service_role;
revoke all on analytics.topic_family_membership_v2,analytics.topic_parent_membership_v2,analytics.topic_mentioned_regulations_v2,analytics.topic_proposed_change_regulations_v2,analytics.topic_direct_organizations_v2,analytics.topic_work_keywords_v2 from public,anon,authenticated;
grant select on analytics.topic_family_membership_v2,analytics.topic_parent_membership_v2,analytics.topic_mentioned_regulations_v2,analytics.topic_proposed_change_regulations_v2,analytics.topic_direct_organizations_v2,analytics.topic_work_keywords_v2 to service_role;
create trigger topic_families_v2_append_only before update or delete on core.topic_families_v2 for each row execute function core.reject_history_mutation();
create trigger topic_family_regulations_v2_append_only before update or delete on core.topic_family_regulations_v2 for each row execute function core.reject_history_mutation();
create trigger topic_family_terms_v2_append_only before update or delete on core.topic_family_terms_v2 for each row execute function core.reject_history_mutation();
create trigger topic_notice_family_memberships_v2_append_only before update or delete on core.topic_notice_family_memberships_v2 for each row execute function core.reject_history_mutation();
create trigger topic_family_membership_evidence_v2_append_only before update or delete on core.topic_family_membership_evidence_v2 for each row execute function core.reject_history_mutation();
alter function publish.public_topic_summary_v2() owner to postgres;
alter function publish.public_topic_notice_rows_v2(text) owner to postgres;
revoke all on function publish.public_topic_summary_v2() from public,anon,authenticated,service_role;
revoke all on function publish.public_topic_notice_rows_v2(text) from public,anon,authenticated,service_role;
grant execute on function publish.public_topic_summary_v2() to anon,authenticated,service_role;
grant execute on function publish.public_topic_notice_rows_v2(text) to anon,authenticated,service_role;

commit;
