with cr as(select release_id from publish.current_release where singleton_key), population as(
 select count(distinct notice_id) n from cr join publish.notices using(release_id)
), memberships as(
 select t.topic_code,count(distinct m.notice_id) notice_count,min(n.posted_date) period_start,max(n.posted_date) period_end
 from cr join core.topic_notice_memberships m using(release_id) join core.topics t using(topic_id)
 join publish.notices n using(release_id,notice_id) where m.topic_contract_version='topic-v1' group by t.topic_code
), overlap as(
 select count(*) filter(where topic_count=1) only_one,count(*) filter(where topic_count=2) both_count
 from(select notice_id,count(distinct topic_id) topic_count from cr join core.topic_notice_memberships using(release_id)
      where topic_contract_version='topic-v1' group by notice_id) q
), broken as(
 select count(*) n from core.topic_membership_evidence e left join core.topic_notice_memberships m using(topic_membership_id)
 where m.topic_membership_id is null
), dup as(
 select count(*) n from(select topic_contract_version,release_id,topic_id,notice_id,count(*) from core.topic_notice_memberships
  group by 1,2,3,4 having count(*)>1) q
), deterministic_membership as(
 select count(*) n from core.topic_notice_memberships m join core.topics t using(topic_id)
 where m.topic_contract_version='topic-v1'
   and m.topic_membership_id<>md5('kodit:topic-v1:'||m.release_id||':'||t.topic_code||':'||m.notice_id)::uuid
), deterministic_evidence as(
 select count(*) n from core.topic_membership_evidence e
 join core.topic_notice_memberships m using(topic_membership_id)
 join core.topics t using(topic_id)
 where e.topic_evidence_id<>md5('kodit:topic-evidence-v1:'||m.release_id||':'||t.topic_code||':'||m.notice_id||':'||e.evidence_basis||':'||coalesce(e.source_object_id::text,'')||':'||coalesce(e.regulation_id::text,'')||':'||e.evidence_text)::uuid
)
select json_build_object(
 'population',(select n from population),
 'topics',(select jsonb_agg(to_jsonb(m) order by topic_code) from memberships m),
 'only_one',(select only_one from overlap),'both',(select both_count from overlap),
 'neither',(select n from population)-(select only_one+both_count from overlap),
 'membership_rows',(select count(*) from cr join core.topic_notice_memberships using(release_id) where topic_contract_version='topic-v1'),
 'evidence_rows',(select count(*) from cr join core.topic_notice_memberships m using(release_id) join core.topic_membership_evidence e using(topic_membership_id)),
 'broken_evidence_fk',(select n from broken),'duplicate_membership',(select n from dup),
 'person_email_evidence',(select count(*) from core.topic_membership_evidence where evidence_basis not in('TITLE_TERM','MENTIONS_RULE','PROPOSES_CHANGE_TO','MENTIONS_WORK')),
 'linked_to_rule_evidence',(select count(*) from core.topic_membership_evidence where evidence_basis='LINKED_TO_RULE'),
 'nondeterministic_membership_id',(select n from deterministic_membership),
 'nondeterministic_evidence_id',(select n from deterministic_evidence)
) verification;
