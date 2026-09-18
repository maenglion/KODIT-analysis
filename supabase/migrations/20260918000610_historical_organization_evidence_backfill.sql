begin;
set local role service_role;

-- Stable document-series identities.  Revision lineage is not organization succession.
insert into core.organization_document_series(document_series_id,series_contract_version,series_code,canonical_title)
values
  (md5('kodit:t06.7:series:organization-rule')::uuid,'organization-document-series-v1','ORGANIZATION_RULE','직제규정'),
  (md5('kodit:t06.7:series:branch-operation')::uuid,'organization-document-series-v1','BRANCH_OPERATION','본부점 세부운영기준'),
  (md5('kodit:t06.7:series:delegation')::uuid,'organization-document-series-v1','DELEGATION','직무전결요령')
on conflict do nothing;

-- Register the 2015-2026 official KODIT preannouncement series already preserved and parsed.
with candidates as (
  select distinct on (sa.attachment_id)
    sa.attachment_id,sr.source_record_id,sr.external_key,sr.published_at::date source_date,
    sr.title,sr.page_url,sa.original_file_name,sao.document_sha256,pr.extraction_id
  from core.source_records sr
  join core.sources s on s.source_id=sr.source_id and s.source_code='kodit-preannouncement-preserved'
  join core.source_attachments sa on sa.source_record_id=sr.source_record_id
  join core.source_attachment_observations sao on sao.attachment_id=sa.attachment_id
  join core.parser_runs pr on pr.attachment_observation_id=sao.attachment_observation_id and pr.extraction_id is not null
  where (sr.title ~ '(직제|조직|업무분장|전결)' or sa.original_file_name ~ '(직제|조직|업무분장|전결)')
    and coalesce(sr.title,'') !~* 'ACSIC' and coalesce(sa.original_file_name,'') !~* 'ACSIC'
  order by sa.attachment_id,pr.finished_at desc
)
insert into core.organization_evidence_documents(
  organization_evidence_document_id,evidence_contract_version,evidence_key,source_record_id,document_sha256,
  extraction_id,document_type,source_date,official_title,source_url,parsed_text_available)
select md5('kodit:t06.7:evidence-document:'||attachment_id::text)::uuid,
  'organization-evidence-document-v2','preannouncement:'||external_key||':'||attachment_id,
  source_record_id,document_sha256,extraction_id,'ORG_REORGANIZATION_NOTICE',source_date,
  title||' / '||original_file_name,page_url,true
from candidates where page_url ~ '^https?://'
on conflict do nothing;

-- One immutable document-version row per evidence representation.
insert into core.organization_document_versions(
  document_version_id,version_contract_version,organization_evidence_document_id,official_title,
  revision_date,effective_date,version_status)
select md5('kodit:t06.7:document-version:'||d.organization_evidence_document_id)::uuid,
  'organization-document-version-v1',d.organization_evidence_document_id,d.official_title,d.source_date,d.effective_date,
  case when d.evidence_contract_version='organization-evidence-document-v1' and d.document_type in ('ORG_RULE','ORG_FUNCTION_ASSIGNMENT','ORG_DELEGATION_RULE')
    then 'CURRENT_FULLTEXT' else 'OFFICIAL_PREANNOUNCEMENT' end
from core.organization_evidence_documents d
where d.document_type in ('ORG_RULE','ORG_FUNCTION_ASSIGNMENT','ORG_DELEGATION_RULE','ORG_REORGANIZATION_NOTICE')
on conflict do nothing;

insert into core.organization_document_version_series(document_version_id,document_series_id,series_relation)
select v.document_version_id,s.document_series_id,
  case when v.version_status='CURRENT_FULLTEXT' then 'VERSION_OF' else 'AMENDS' end
from core.organization_document_versions v
join core.organization_evidence_documents d using(organization_evidence_document_id)
join core.organization_document_series s on s.series_contract_version='organization-document-series-v1'
where (s.series_code='ORGANIZATION_RULE' and d.official_title like '%직제규정%')
   or (s.series_code='BRANCH_OPERATION' and d.official_title like '%본부점%')
   or (s.series_code='DELEGATION' and d.official_title like '%직무전결%')
on conflict do nothing;

-- New current organizations directly enumerated by the 2026 organization rule.
with src as (
  select d.*,e.extracted_text from core.organization_evidence_documents d
  join core.document_extractions e using(extraction_id)
  where d.document_type='ORG_RULE' and d.official_title like '직제규정(2026%'
), missing(name) as (values ('홍보협력실'),('AI혁신부'),('비상계획부'))
insert into core.organization_evidence(
  organization_evidence_id,org_contract_version,evidence_key,source_kind,source_record_id,source_reference,
  observed_name,evidence_date,evidence_strength,evidence_text,evidence_metadata)
select md5('kodit:t06.7:node-evidence:'||m.name)::uuid,'organization-v1-evidence-r2','2026-org-rule:'||m.name,
  'OFFICIAL_CORPUS_MENTION',src.source_record_id,src.source_url,m.name,src.source_date,'OFFICIAL_DIRECT',
  '2026 직제규정 제5조 및 별표2에 직접 열거',jsonb_build_object('document_id',src.organization_evidence_document_id,'locator','제5조/별표2')
from src cross join missing m
on conflict do nothing;

with missing(name) as (values ('홍보협력실'),('AI혁신부'),('비상계획부'))
insert into core.organization_nodes(org_node_id,org_contract_version,node_key,official_name,node_status,primary_evidence_id)
select md5('kodit:core:organization-node:organization-v1:'||name)::uuid,'organization-v1-evidence-r2',name,name,'CONFIRMED',
  md5('kodit:t06.7:node-evidence:'||name)::uuid
from missing on conflict do nothing;

-- Current 2026 snapshot from the direct organization enumeration in the organization rule.
insert into core.organization_snapshots(snapshot_id,snapshot_contract_version,snapshot_key,snapshot_date,effective_date,organization_evidence_document_id,snapshot_status)
select md5('kodit:t06.7:snapshot:'||d.organization_evidence_document_id)::uuid,'organization-snapshot-v1',
  '2026-org-rule:'||d.organization_evidence_document_id,d.source_date,d.effective_date,d.organization_evidence_document_id,'DIRECT_SNAPSHOT'
from core.organization_evidence_documents d where d.document_type='ORG_RULE' and d.official_title like '직제규정(2026%'
on conflict do nothing;

with orgs(ord,name) as (values
 (1,'미래전략실'),(2,'리스크준법실'),(3,'안전전략실'),(4,'홍보협력실'),(5,'비서실'),
 (6,'경영기획부'),(7,'성과관리부'),(8,'ICT전략부'),(9,'AI혁신부'),(10,'신용보증부'),
 (11,'자본시장부'),(12,'스타트업금융부'),(13,'혁신금융부'),(14,'빅데이터부'),
 (15,'신용보험부'),(16,'기업개선부'),(17,'인프라금융부'),(18,'인재경영부'),
 (19,'업무지원부'),(20,'고객지원부'),(21,'비상계획부'),(22,'감사실')
), src as (
 select d.organization_evidence_document_id,d.extraction_id,e.extracted_text,
   strpos(e.extracted_text,'[별표2]') base
 from core.organization_evidence_documents d join core.document_extractions e using(extraction_id)
 where d.document_type='ORG_RULE' and d.official_title like '직제규정(2026%'
), positions as (
 select o.*,src.*,src.base+strpos(substring(src.extracted_text from src.base),o.name)-1 pos
 from orgs o cross join src
), segments as (
 select p.*,coalesce(lead(pos) over(partition by organization_evidence_document_id order by pos),length(extracted_text)+1) next_pos
 from positions p
), spans as (
 select *,substring(extracted_text from pos for greatest(next_pos-pos,1)) observed
 from segments where pos>=base and pos>0
)
insert into core.organization_evidence_spans(
 evidence_span_id,span_contract_version,organization_evidence_document_id,extraction_id,source_locator,
 span_start,span_end,observed_text,observation_type,evidence_quality)
select md5('kodit:t06.7:snapshot-span:'||organization_evidence_document_id||':'||name)::uuid,
 'organization-evidence-span-v1',organization_evidence_document_id,extraction_id,'[별표2] '||name,
 pos-1,next_pos-1,left(observed,500),'ORG_SNAPSHOT','OFFICIAL_TABLE'
from spans on conflict do nothing;

with orgs(name) as (values
 ('미래전략실'),('리스크준법실'),('안전전략실'),('홍보협력실'),('비서실'),('경영기획부'),
 ('성과관리부'),('ICT전략부'),('AI혁신부'),('신용보증부'),('자본시장부'),('스타트업금융부'),
 ('혁신금융부'),('빅데이터부'),('신용보험부'),('기업개선부'),('인프라금융부'),('인재경영부'),
 ('업무지원부'),('고객지원부'),('비상계획부'),('감사실')
), src as (
 select d.organization_evidence_document_id,md5('kodit:t06.7:snapshot:'||d.organization_evidence_document_id)::uuid snapshot_id
 from core.organization_evidence_documents d where d.document_type='ORG_RULE' and d.official_title like '직제규정(2026%'
)
insert into core.organization_snapshot_observations(
 snapshot_observation_id,snapshot_id,org_node_id,evidence_span_id,observed_org_name,observation_kind)
select md5('kodit:t06.7:snapshot-observation:'||src.organization_evidence_document_id||':'||o.name)::uuid,
 src.snapshot_id,n.org_node_id,md5('kodit:t06.7:snapshot-span:'||src.organization_evidence_document_id||':'||o.name)::uuid,
 o.name,'DIRECT_ORG_RULE'
from src cross join orgs o join core.organization_nodes n on n.official_name=o.name
  and n.org_contract_version in ('organization-v1','organization-v1-evidence-r2')
on conflict do nothing;

-- Direct function observations from the organization rule's appendix 2.
with orgs(ord,name) as (values
 (1,'미래전략실'),(2,'리스크준법실'),(3,'안전전략실'),(4,'홍보협력실'),(5,'비서실'),
 (6,'경영기획부'),(7,'성과관리부'),(8,'ICT전략부'),(9,'AI혁신부'),(10,'신용보증부'),
 (11,'자본시장부'),(12,'스타트업금융부'),(13,'혁신금융부'),(14,'빅데이터부'),
 (15,'신용보험부'),(16,'기업개선부'),(17,'인프라금융부'),(18,'인재경영부'),
 (19,'업무지원부'),(20,'고객지원부'),(21,'비상계획부'),(22,'감사실')
), src as (
 select d.*,e.extracted_text,strpos(e.extracted_text,'[별표2]') base
 from core.organization_evidence_documents d join core.document_extractions e using(extraction_id)
 where d.document_type='ORG_RULE' and d.official_title like '직제규정(2026%'
), positions as (
 select o.*,src.*,src.base+strpos(substring(src.extracted_text from src.base),o.name)-1 pos
 from orgs o cross join src
), segments as (
 select p.*,coalesce(lead(pos) over(partition by organization_evidence_document_id order by pos),length(extracted_text)+1) next_pos
 from positions p
), duties as (
 select s.*,x.ordinality duty_no,btrim(x.part) phrase
 from segments s cross join lateral regexp_split_to_table(substring(extracted_text from pos+length(name) for greatest(next_pos-pos-length(name),1)),'[0-9]+\)') with ordinality x(part,ordinality)
 where x.ordinality>1 and length(btrim(x.part)) between 2 and 500
), prepared as (
 select d.*,n.org_node_id,
   md5('kodit:t06.7:function-evidence:'||d.organization_evidence_document_id||':'||d.name)::uuid evidence_id,
   md5('kodit:t06.7:function-span:'||d.organization_evidence_document_id||':'||d.name||':'||d.duty_no)::uuid span_id,
   md5('kodit:t06.7:function-observation:'||d.organization_evidence_document_id||':'||d.name||':'||d.duty_no)::uuid observation_id,
   md5('kodit:t06.7:function-assignment:'||d.organization_evidence_document_id||':'||d.name||':'||d.duty_no)::uuid assignment_id
 from duties d join core.organization_nodes n on n.official_name=d.name
  and n.org_contract_version in ('organization-v1','organization-v1-evidence-r2')
)
insert into core.organization_evidence(
 organization_evidence_id,org_contract_version,evidence_key,source_kind,source_record_id,source_reference,observed_name,
 evidence_date,evidence_strength,evidence_text,evidence_metadata)
select distinct evidence_id,'organization-v1-evidence-r2','2026-org-rule-function:'||name,'OFFICIAL_CORPUS_MENTION',
 source_record_id,source_url,name,source_date,'OFFICIAL_DIRECT','직제규정 별표2 직접 업무분장',
 jsonb_build_object('document_id',organization_evidence_document_id,'locator','[별표2] '||name)
from prepared on conflict do nothing;

with doc as (
 select d.organization_evidence_document_id from core.organization_evidence_documents d
 where d.document_type='ORG_RULE' and d.official_title like '직제규정(2026%'
), ev as (
 select e.organization_evidence_id,e.observed_name from core.organization_evidence e
 where e.org_contract_version='organization-v1-evidence-r2' and e.evidence_key like '2026-org-rule-function:%'
)
insert into core.organization_evidence_document_links(organization_evidence_document_id,organization_evidence_id,link_type)
select doc.organization_evidence_document_id,ev.organization_evidence_id,'SUPPORTS' from doc cross join ev
on conflict do nothing;

-- Recompute the function segments and persist source spans, observations, and direct assignments.
with orgs(ord,name) as (values
 (1,'미래전략실'),(2,'리스크준법실'),(3,'안전전략실'),(4,'홍보협력실'),(5,'비서실'),
 (6,'경영기획부'),(7,'성과관리부'),(8,'ICT전략부'),(9,'AI혁신부'),(10,'신용보증부'),
 (11,'자본시장부'),(12,'스타트업금융부'),(13,'혁신금융부'),(14,'빅데이터부'),
 (15,'신용보험부'),(16,'기업개선부'),(17,'인프라금융부'),(18,'인재경영부'),
 (19,'업무지원부'),(20,'고객지원부'),(21,'비상계획부'),(22,'감사실')
), src as (
 select d.*,e.extracted_text,strpos(e.extracted_text,'[별표2]') base
 from core.organization_evidence_documents d join core.document_extractions e using(extraction_id)
 where d.document_type='ORG_RULE' and d.official_title like '직제규정(2026%'
), positions as (
 select o.*,src.*,src.base+strpos(substring(src.extracted_text from src.base),o.name)-1 pos
 from orgs o cross join src
), segments as (
 select p.*,coalesce(lead(pos) over(partition by organization_evidence_document_id order by pos),length(extracted_text)+1) next_pos
 from positions p
), duties as (
 select s.*,x.ordinality duty_no,btrim(x.part) phrase
 from segments s cross join lateral regexp_split_to_table(substring(extracted_text from pos+length(name) for greatest(next_pos-pos-length(name),1)),'[0-9]+\)') with ordinality x(part,ordinality)
 where x.ordinality>1 and length(btrim(x.part)) between 2 and 500
), prepared as (
 select d.*,n.org_node_id,
   md5('kodit:t06.7:function-evidence:'||d.organization_evidence_document_id||':'||d.name)::uuid evidence_id,
   md5('kodit:t06.7:function-span:'||d.organization_evidence_document_id||':'||d.name||':'||d.duty_no)::uuid span_id,
   md5('kodit:t06.7:function-observation:'||d.organization_evidence_document_id||':'||d.name||':'||d.duty_no)::uuid observation_id,
   md5('kodit:t06.7:function-assignment:'||d.organization_evidence_document_id||':'||d.name||':'||d.duty_no)::uuid assignment_id
 from duties d join core.organization_nodes n on n.official_name=d.name
  and n.org_contract_version in ('organization-v1','organization-v1-evidence-r2')
)
insert into core.organization_evidence_spans(
 evidence_span_id,span_contract_version,organization_evidence_document_id,extraction_id,source_locator,
 span_start,span_end,observed_text,observation_type,evidence_quality)
select span_id,'organization-evidence-span-v1',organization_evidence_document_id,extraction_id,
 '[별표2] '||name||' 업무 '||(duty_no-1),pos-1,next_pos-1,phrase,'FUNCTION_ASSIGNMENT','OFFICIAL_TABLE'
from prepared on conflict do nothing;

with p as (
 select sp.*,n.org_node_id,e.organization_evidence_id,
   regexp_replace(lower(sp.observed_text),'[^가-힣a-z0-9]+','','g') normalized
 from core.organization_evidence_spans sp
 join core.organization_evidence_documents d using(organization_evidence_document_id)
 join core.organization_nodes n on sp.source_locator like '% '||n.official_name||' 업무 %'
 join core.organization_evidence e on e.org_contract_version='organization-v1-evidence-r2'
  and e.evidence_key='2026-org-rule-function:'||n.official_name
 where d.document_type='ORG_RULE' and d.official_title like '직제규정(2026%' and sp.observation_type='FUNCTION_ASSIGNMENT'
)
insert into core.organization_function_observations(
 function_observation_id,observation_contract_version,organization_evidence_document_id,org_node_id,evidence_span_id,
 raw_function_phrase,normalized_lexical_form,evidence_type,valid_from)
select md5('kodit:t06.7:function-observation:'||organization_evidence_document_id||':'||org_node_id||':'||evidence_span_id)::uuid,
 'organization-function-observation-v1',organization_evidence_document_id,org_node_id,evidence_span_id,
 observed_text,normalized,'DIRECT_ORG_RULE','2026-07-01'::date from p
on conflict do nothing;

with p as (
 select f.*,e.organization_evidence_id
 from core.organization_function_observations f
 join core.organization_nodes n using(org_node_id)
 join core.organization_evidence e on e.org_contract_version='organization-v1-evidence-r2'
   and e.evidence_key='2026-org-rule-function:'||n.official_name
 where f.observation_contract_version='organization-function-observation-v1' and f.evidence_type='DIRECT_ORG_RULE'
)
insert into core.organization_function_assignments(
 function_assignment_id,assignment_contract_version,assignment_key,work_string,org_node_id,valid_from,
 organization_evidence_document_id,organization_evidence_id,assignment_status)
select md5('kodit:t06.7:function-assignment:'||function_observation_id)::uuid,'org-function-assignment-v2',
 '2026-org-rule:'||function_observation_id,raw_function_phrase,org_node_id,valid_from,
 organization_evidence_document_id,organization_evidence_id,'OFFICIAL_DIRECT'
from p on conflict do nothing;

insert into core.organization_function_assignment_spans(function_assignment_id,evidence_span_id)
select md5('kodit:t06.7:function-assignment:'||f.function_observation_id)::uuid,f.evidence_span_id
from core.organization_function_observations f
where f.observation_contract_version='organization-function-observation-v1' and f.evidence_type='DIRECT_ORG_RULE'
on conflict do nothing;

-- Benchmark relationization: one complete official table block per organization from the detailed rule.
with orgs(ord,name) as (values
 (1,'미래전략실'),(2,'리스크준법실'),(3,'안전전략실'),(4,'홍보협력실'),(5,'비서실'),
 (6,'경영기획부'),(7,'성과관리부'),(8,'ICT전략부'),(9,'AI혁신부'),(10,'신용보증부'),
 (11,'자본시장부'),(12,'스타트업금융부'),(13,'혁신금융부'),(14,'빅데이터부'),
 (15,'신용보험부'),(16,'기업개선부'),(17,'인프라금융부'),(18,'인재경영부'),
 (19,'업무지원부'),(20,'고객지원부'),(21,'비상계획부'),(22,'감사실')
), src as (
 select d.*,e.extracted_text,strpos(e.extracted_text,'[별표3]') base
 from core.organization_evidence_documents d join core.document_extractions e using(extraction_id)
 where d.document_type='ORG_FUNCTION_ASSIGNMENT' and d.official_title like '본부점 세부운영기준(2026%'
), positions as (
 select o.*,src.*,src.base+strpos(substring(src.extracted_text from src.base),o.name)-1 pos
 from orgs o cross join src
), segments as (
 select p.*,coalesce(lead(pos) over(partition by organization_evidence_document_id order by pos),length(extracted_text)+1) next_pos
 from positions p
), prepared as (
 select s.*,n.org_node_id,substring(extracted_text from pos for greatest(next_pos-pos,1)) observed,
  md5('kodit:t06.7:detailed-span:'||organization_evidence_document_id||':'||name)::uuid span_id
 from segments s join core.organization_nodes n on n.official_name=s.name
  and n.org_contract_version in ('organization-v1','organization-v1-evidence-r2')
 where pos>=base and pos>0
)
insert into core.organization_evidence_spans(
 evidence_span_id,span_contract_version,organization_evidence_document_id,extraction_id,source_locator,
 span_start,span_end,observed_text,observation_type,evidence_quality)
select span_id,'organization-evidence-span-v1',organization_evidence_document_id,extraction_id,
 '[별표3] 부서별 직무명세서 / '||name,pos-1,next_pos-1,left(observed,500),'FUNCTION_ASSIGNMENT','OFFICIAL_TABLE'
from prepared on conflict do nothing;

with p as (
 select sp.*,n.org_node_id,regexp_replace(lower(sp.observed_text),'[^가-힣a-z0-9]+','','g') normalized
 from core.organization_evidence_spans sp
 join core.organization_evidence_documents d using(organization_evidence_document_id)
 join core.organization_nodes n on sp.source_locator='[별표3] 부서별 직무명세서 / '||n.official_name
 where d.document_type='ORG_FUNCTION_ASSIGNMENT' and d.official_title like '본부점 세부운영기준(2026%'
)
insert into core.organization_function_observations(
 function_observation_id,observation_contract_version,organization_evidence_document_id,org_node_id,evidence_span_id,
 raw_function_phrase,normalized_lexical_form,evidence_type,valid_from)
select md5('kodit:t06.7:detailed-function:'||organization_evidence_document_id||':'||org_node_id)::uuid,
 'organization-function-observation-v1',organization_evidence_document_id,org_node_id,evidence_span_id,
 observed_text,normalized,'DIRECT_FUNCTION_ASSIGNMENT','2026-07-02'::date from p
on conflict do nothing;

-- Delegation evidence remains a lower interpretation layer; it is not promoted to sole responsibility.
with src as (
 select d.*,e.extracted_text from core.organization_evidence_documents d join core.document_extractions e using(extraction_id)
 where d.document_type='ORG_DELEGATION_RULE' and d.official_title like '직무전결요령(2026%'
), orgs as (
 select n.org_node_id,n.official_name from core.organization_nodes n
 where n.org_contract_version in ('organization-v1','organization-v1-evidence-r2')
), hit as (
 select src.*,o.*,strpos(src.extracted_text,o.official_name) pos from src cross join orgs o
 where strpos(src.extracted_text,o.official_name)>0
)
insert into core.organization_evidence_spans(
 evidence_span_id,span_contract_version,organization_evidence_document_id,extraction_id,source_locator,
 span_start,span_end,observed_text,observation_type,evidence_quality)
select md5('kodit:t06.7:delegation-span:'||organization_evidence_document_id||':'||org_node_id)::uuid,
 'organization-evidence-span-v1',organization_evidence_document_id,extraction_id,'직무전결요령 / '||official_name,
 greatest(pos-101,0),least(pos+500,length(extracted_text)),substring(extracted_text from greatest(pos-100,1) for 600),
 'DELEGATION_EVIDENCE','OFFICIAL_TABLE' from hit on conflict do nothing;

insert into core.organization_function_observations(
 function_observation_id,observation_contract_version,organization_evidence_document_id,org_node_id,evidence_span_id,
 raw_function_phrase,normalized_lexical_form,evidence_type,valid_from)
select md5('kodit:t06.7:delegation-observation:'||sp.organization_evidence_document_id||':'||n.org_node_id)::uuid,
 'organization-function-observation-v1',sp.organization_evidence_document_id,n.org_node_id,sp.evidence_span_id,
 sp.observed_text,regexp_replace(lower(sp.observed_text),'[^가-힣a-z0-9]+','','g'),'DELEGATION_EVIDENCE','2026-07-23'::date
from core.organization_evidence_spans sp join core.organization_nodes n
 on sp.source_locator='직무전결요령 / '||n.official_name
where sp.observation_type='DELEGATION_EVIDENCE'
on conflict do nothing;

-- Persist explicit change/effective-date cues from official preannouncements without inventing participants.
with keys(keyword) as (values ('신설'),('폐지'),('개칭'),('명칭변경'),('이관'),('통합'),('분리'),('조직개편'),('분담업무'),('시행일')),
docs as (
 select d.*,e.extracted_text from core.organization_evidence_documents d join core.document_extractions e using(extraction_id)
 where d.evidence_contract_version='organization-evidence-document-v2' and d.document_type='ORG_REORGANIZATION_NOTICE'
), hits as (
 select d.*,k.keyword,strpos(d.extracted_text,k.keyword) pos from docs d cross join keys k
 where strpos(d.extracted_text,k.keyword)>0
)
insert into core.organization_evidence_spans(
 evidence_span_id,span_contract_version,organization_evidence_document_id,extraction_id,source_locator,
 span_start,span_end,observed_text,observation_type,evidence_quality)
select md5('kodit:t06.7:change-cue:'||organization_evidence_document_id||':'||keyword)::uuid,
 'organization-evidence-span-v1',organization_evidence_document_id,extraction_id,'개정 사전예고 / '||keyword,
 greatest(pos-181,0),least(pos+520,length(extracted_text)),substring(extracted_text from greatest(pos-180,1) for 700),
 case when keyword='시행일' then 'EFFECTIVE_DATE' else 'CHANGE_CUE' end,'OFFICIAL_DIRECT'
from hits on conflict do nothing;

-- Close the privacy function epochs additively under a v2 assignment contract.
with events as (
 select e.*,fromn.org_node_id from_id,ton.org_node_id to_id
 from core.organization_change_events e
 join core.organization_change_event_nodes fromn on fromn.change_event_id=e.change_event_id and fromn.participant_role='FROM'
 join core.organization_change_event_nodes ton on ton.change_event_id=e.change_event_id and ton.participant_role='TO'
 where e.event_contract_version='organization-change-event-v1' and e.event_scope='개인정보보호 책임·담당 기능'
), bounds as (
 select e1.organization_evidence_document_id,e1.organization_evidence_id,e1.from_id,e1.to_id,e1.effective_date,
  (select min(e2.effective_date) from events e2 where e2.from_id=e1.to_id and e2.effective_date>e1.effective_date) next_date
 from events e1
)
insert into core.organization_function_assignments(
 function_assignment_id,assignment_contract_version,assignment_key,work_string,org_node_id,valid_from,valid_to,
 organization_evidence_document_id,organization_evidence_id,assignment_status)
select md5('kodit:t06.7:privacy-epoch:from:'||from_id||':'||effective_date)::uuid,'org-function-assignment-v2',
 'privacy-before:'||from_id||':'||effective_date,'개인정보보호 책임·담당 기능',from_id,null,effective_date,
 organization_evidence_document_id,organization_evidence_id,'OFFICIAL_DIRECT' from bounds
union all
select md5('kodit:t06.7:privacy-epoch:to:'||to_id||':'||effective_date)::uuid,'org-function-assignment-v2',
 'privacy-after:'||to_id||':'||effective_date,'개인정보보호 책임·담당 기능',to_id,effective_date,next_date,
 organization_evidence_document_id,organization_evidence_id,'OFFICIAL_DIRECT' from bounds
on conflict do nothing;

-- Evidence-r2 attribution run: same similarity contract; old v1 audit remains immutable.
insert into core.org_work_attribution_runs(
 run_id,release_id,residual_id,notice_id,attribution_contract_version,similarity_contract_version,input_context_hash,
 started_at,completed_at,final_status,historical_org_node_id,current_org_node_id,current_candidate_org_node_id)
select md5('kodit:t06.7:rerun:'||r.run_id)::uuid,r.release_id,r.residual_id,r.notice_id,
 'org-work-attribution-v1-evidence-r2',r.similarity_contract_version,
 encode(extensions.digest(trim(r.input_context_hash)||':organization-evidence-r2','sha256'),'hex'),
 '2026-09-18 18:00:00+09'::timestamptz,'2026-09-18 18:00:00+09'::timestamptz,
 'UNRESOLVED',null,null,r.current_candidate_org_node_id
from core.org_work_attribution_runs r where r.attribution_contract_version='org-work-attribution-v1'
on conflict do nothing;

insert into core.org_work_attribution_candidates(
 candidate_id,run_id,search_epoch_start,search_epoch_end,candidate_notice_id,candidate_org_node_id,candidate_title,
 same_attachment,same_regulation,same_proposed_regulation,title_similarity,body_similarity,work_overlap,combined_score,
 rank,candidate_status,rejection_reason)
select md5('kodit:t06.7:rerun-candidate:'||c.candidate_id)::uuid,md5('kodit:t06.7:rerun:'||c.run_id)::uuid,
 c.search_epoch_start,c.search_epoch_end,c.candidate_notice_id,c.candidate_org_node_id,c.candidate_title,
 c.same_attachment,c.same_regulation,c.same_proposed_regulation,c.title_similarity,c.body_similarity,c.work_overlap,
 c.combined_score,c.rank,c.candidate_status,c.rejection_reason
from core.org_work_attribution_candidates c join core.org_work_attribution_runs r using(run_id)
where r.attribution_contract_version='org-work-attribution-v1'
on conflict do nothing;

insert into core.org_work_attribution_steps(
 step_id,run_id,step_order,step_type,epoch_start,epoch_end,input_description,result_description,
 selected_candidate_id,organization_evidence_id,change_event_id,step_status)
select md5('kodit:t06.7:rerun-step:'||s.step_id)::uuid,md5('kodit:t06.7:rerun:'||s.run_id)::uuid,
 s.step_order,s.step_type,s.epoch_start,s.epoch_end,s.input_description,
 case when s.step_type='FINAL_RESOLUTION' then 'UNRESOLVED; expanded official corpus has no case-specific as-of/path confirmation' else s.result_description end,
 null,s.organization_evidence_id,s.change_event_id,s.step_status
from core.org_work_attribution_steps s join core.org_work_attribution_runs r using(run_id)
where r.attribution_contract_version='org-work-attribution-v1'
on conflict do nothing;

insert into core.org_work_attribution_evidence(
 attribution_evidence_id,run_id,evidence_kind,notice_id,document_sha256,extraction_id,mention_id,regulation_id,
 organization_evidence_document_id,organization_evidence_id,change_event_id,span_start,span_end,observed_text,evidence_date)
select md5('kodit:t06.7:rerun-evidence:'||e.attribution_evidence_id)::uuid,
 md5('kodit:t06.7:rerun:'||e.run_id)::uuid,e.evidence_kind,e.notice_id,e.document_sha256,e.extraction_id,e.mention_id,
 e.regulation_id,e.organization_evidence_document_id,e.organization_evidence_id,e.change_event_id,e.span_start,e.span_end,
 e.observed_text,e.evidence_date
from core.org_work_attribution_evidence e join core.org_work_attribution_runs r using(run_id)
where r.attribution_contract_version='org-work-attribution-v1'
on conflict do nothing;

commit;
