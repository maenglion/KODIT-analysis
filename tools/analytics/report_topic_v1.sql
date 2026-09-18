select json_build_object(
 'summary',(select jsonb_agg(to_jsonb(s) order by topic_code) from publish.public_topic_summary_v1() s),
 'litigation_rows',(select count(*) from publish.public_topic_notice_rows_v1('LITIGATION')),
 'investment_guarantee_rows',(select count(*) from publish.public_topic_notice_rows_v1('INVESTMENT_GUARANTEE')),
 'invalid_topic_rows',(select count(*) from publish.public_topic_notice_rows_v1('NOT_A_TOPIC')),
 'evidence_basis',(select jsonb_object_agg(topic_code,bases order by topic_code) from(
   select t.topic_code,jsonb_object_agg(evidence_basis,n order by evidence_basis) bases
   from(select t.topic_code,e.evidence_basis,count(distinct m.notice_id) n
     from core.topic_membership_evidence e join core.topic_notice_memberships m using(topic_membership_id)
     join core.topics t using(topic_id) join publish.current_release c on c.release_id=m.release_id and c.singleton_key
     group by 1,2) q join core.topics t using(topic_code) group by t.topic_code) x)
) report;
