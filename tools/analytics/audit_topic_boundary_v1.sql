-- T07-B read-only topic boundary and recall audit.
-- This script never inserts/updates/deletes and never expands topic-v1 membership.
-- Candidate output grain: one current-release, non-member notice per candidate topic.

with recursive
cr as (
  select release_id from publish.current_release where singleton_key
),
members as (
  select tm.release_id, tm.notice_id, tm.topic_code
  from cr join analytics.topic_notice_membership_v1 tm using (release_id)
),
notices as (
  select n.* from cr join publish.notices n using (release_id)
),
member_regulations as (
  select release_id, topic_code, regulation_id from analytics.topic_mentioned_regulations_v1
  union
  select release_id, topic_code, regulation_id from analytics.topic_proposed_change_regulations_v1
),
member_work as (
  select release_id, topic_code, work_keyword from analytics.topic_work_keywords_v1
),
notice_rules as (
  select distinct mn.release_id, mn.notice_id, rr.regulation_id
  from cr
  join analytics.mention_notice_resolution mn using (release_id)
  join core.extraction_mentions em using (mention_id)
  join core.extraction_mention_labels ml using (mention_id)
  join analytics.rule_label_resolution rr
    on rr.label_id = ml.label_id
   and rr.label_contract_version = ml.label_contract_version
   and rr.resolution_status = 'RESOLVED'
  where em.mention_type = 'RULE'
),
notice_work as (
  select distinct mn.release_id, mn.notice_id, l.normalized_label work_label
  from cr
  join analytics.mention_notice_resolution mn using (release_id)
  join core.extraction_mentions em using (mention_id)
  join core.extraction_mention_labels ml using (mention_id)
  join core.labels l using (label_id, label_contract_version)
  where em.mention_type = 'WORK'
),
exact_candidates as (
  select distinct n.release_id, n.notice_id, mr.topic_code,
    'SAME_REGULATION_AS_TOPIC_MEMBER'::text basis, nr.regulation_id, null::text matching_text
  from notices n join notice_rules nr using (release_id, notice_id)
  join member_regulations mr using (release_id, regulation_id)
  where not exists (select 1 from members m where m.release_id=n.release_id and m.notice_id=n.notice_id and m.topic_code=mr.topic_code)
  union all
  select distinct n.release_id, n.notice_id, mr.topic_code,
    'SAME_PROPOSED_REGULATION', a.regulation_id, null::text
  from notices n join analytics.notice_rule_change_assertions a using (release_id, notice_id)
  join member_regulations mr using (release_id, regulation_id)
  where not exists (select 1 from members m where m.release_id=n.release_id and m.notice_id=n.notice_id and m.topic_code=mr.topic_code)
  union all
  select distinct n.release_id, n.notice_id, mw.topic_code,
    'SAME_WORK_LABEL', null::uuid, nw.work_label
  from notices n join notice_work nw using (release_id, notice_id)
  join member_work mw on mw.release_id=nw.release_id and mw.work_keyword=nw.work_label
  where not exists (select 1 from members m where m.release_id=n.release_id and m.notice_id=n.notice_id and m.topic_code=mw.topic_code)
),
phrase_contract(topic_code, phrase_kind, phrase) as (values
  ('INVESTMENT_GUARANTEE','TITLE','투자규정'),
  ('INVESTMENT_GUARANTEE','TITLE','투자업무'),
  ('INVESTMENT_GUARANTEE','TITLE','M&A보증'),
  ('INVESTMENT_GUARANTEE','BODY','투자업무운용요령'),
  ('INVESTMENT_GUARANTEE','BODY','투자업무처리기준'),
  ('INVESTMENT_GUARANTEE','BODY','투자기업'),
  ('INVESTMENT_GUARANTEE','BODY','M&A보증운용기준'),
  ('LITIGATION','BODY','소송위임')
),
notice_extractions as (
  select distinct n.release_id, n.notice_id, de.extraction_id, de.extracted_text
  from notices n
  join core.source_records sr on sr.external_key=n.notice_number
  join core.sources s on s.source_id=sr.source_id and s.source_code='kodit-preannouncement-preserved'
  join core.source_attachments sa on sa.source_record_id=sr.source_record_id
  join core.source_attachment_observations sao on sao.attachment_id=sa.attachment_id
  join core.parser_runs pr on pr.attachment_observation_id=sao.attachment_observation_id
  join core.document_extractions de on de.extraction_id=pr.extraction_id
),
phrase_candidates as (
  select distinct n.release_id,n.notice_id,p.topic_code,
    case when p.phrase_kind='TITLE' then 'HIGHLY_RECURRENT_TITLE_PHRASE' else 'MEMBER_DERIVED_BODY_PHRASE' end basis,
    null::uuid regulation_id,p.phrase matching_text
  from notices n cross join phrase_contract p
  where ((p.phrase_kind='TITLE' and strpos(replace(n.title,' ',''),replace(p.phrase,' ',''))>0)
      or (p.phrase_kind='BODY' and exists (
        select 1 from notice_extractions ne
        where ne.release_id=n.release_id and ne.notice_id=n.notice_id
          and strpos(replace(ne.extracted_text,' ',''),replace(p.phrase,' ',''))>0)))
    and not exists (select 1 from members m where m.release_id=n.release_id and m.notice_id=n.notice_id and m.topic_code=p.topic_code)
),
all_candidate_evidence as (
  select * from exact_candidates
  union all
  select * from phrase_candidates
),
candidates as (
  select n.notice_id,n.posted_date,n.title,e.topic_code candidate_topic,
    array_agg(distinct e.basis order by e.basis) candidate_basis,
    array_remove(array_agg(distinct e.regulation_id order by e.regulation_id),null) matching_regulation_ids,
    array_remove(array_agg(distinct case when e.basis='SAME_WORK_LABEL' then e.matching_text end order by case when e.basis='SAME_WORK_LABEL' then e.matching_text end),null) matching_work_labels,
    array_remove(array_agg(distinct case when e.basis like '%PHRASE' then e.matching_text end order by case when e.basis like '%PHRASE' then e.matching_text end),null) matching_phrases,
    false current_membership,
    case
      when bool_or(e.basis in ('MANUAL_SEED_MISS','SAME_PROPOSED_REGULATION'))
        or (bool_or(e.basis='SAME_REGULATION_AS_TOPIC_MEMBER') and bool_or(e.basis='SAME_WORK_LABEL')) then 'STRONG'
      when bool_or(e.basis in ('SAME_REGULATION_AS_TOPIC_MEMBER','SAME_WORK_LABEL','HIGHLY_RECURRENT_TITLE_PHRASE')) then 'MEDIUM'
      else 'WEAK'
    end candidate_strength_class
  from all_candidate_evidence e join notices n using(release_id,notice_id)
  group by n.notice_id,n.posted_date,n.title,e.topic_code
)
select * from candidates
order by candidate_topic,
  case candidate_strength_class when 'STRONG' then 1 when 'MEDIUM' then 2 else 3 end,
  posted_date desc,notice_id;

-- Negative-control prevalence must be evaluated separately. Generic terms never
-- become candidate evidence merely because they occur in a title.
