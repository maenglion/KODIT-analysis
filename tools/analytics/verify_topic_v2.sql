with cr as(select release_id from publish.current_release where singleton_key),
v2 as(select * from analytics.topic_parent_membership_v2 join cr using(release_id)),
v1i as(select tm.notice_id from analytics.topic_notice_membership_v1 tm join cr using(release_id) where tm.topic_code='INVESTMENT_GUARANTEE'),
v1l as(select tm.notice_id from analytics.topic_notice_membership_v1 tm join cr using(release_id) where tm.topic_code='LITIGATION'),
direct_candidates as(
 select distinct mn.release_id,mn.notice_id,f.family_id
 from cr join analytics.mention_notice_resolution mn using(release_id)
 join core.extraction_mentions em using(mention_id) join core.extraction_mention_labels ml using(mention_id)
 join analytics.rule_label_resolution rr on rr.label_id=ml.label_id and rr.label_contract_version=ml.label_contract_version and rr.resolution_status='RESOLVED'
 join core.topic_family_regulations_v2 fr on fr.regulation_id=rr.regulation_id join core.topic_families_v2 f using(family_id)
 where em.mention_type='RULE' and f.family_status='APPROVED_CHILD_FAMILY'
 union select distinct a.release_id,a.notice_id,f.family_id from cr join analytics.notice_rule_change_assertions a using(release_id)
 join core.topic_family_regulations_v2 fr on fr.regulation_id=a.regulation_id join core.topic_families_v2 f using(family_id)
 where f.family_status='APPROVED_CHILD_FAMILY'
 union select distinct n.release_id,n.notice_id,f.family_id from cr join publish.notices n using(release_id)
 join core.topic_family_terms_v2 ft on ft.evidence_basis='TITLE_DIRECT' and strpos(n.title,ft.term)>0 join core.topic_families_v2 f using(family_id)
 where f.family_status='APPROVED_CHILD_FAMILY'
 union select distinct mn.release_id,mn.notice_id,f.family_id from cr join analytics.mention_notice_resolution mn using(release_id)
 join core.extraction_mentions em using(mention_id) join core.extraction_mention_labels ml using(mention_id) join core.labels l using(label_id,label_contract_version)
 join core.topic_family_terms_v2 ft on ft.evidence_basis='WORK_DIRECT' and ft.term=l.normalized_label join core.topic_families_v2 f using(family_id)
 where em.mention_type='WORK' and f.family_status='APPROVED_CHILD_FAMILY'
),
stored as(select distinct release_id,notice_id,family_id from core.topic_notice_family_memberships_v2 join cr using(release_id))
select jsonb_build_object(
 'v1_investment_notices',(select count(*) from v1i),
 'v2_investment_notices',(select count(*) from v2),
 'retained',(select count(*) from(select notice_id from v2 intersect select notice_id from v1i)q),
 'added',(select count(*) from(select notice_id from v2 except select notice_id from v1i)q),
 'v2_excluded',(select count(*) from(select notice_id from v1i except select notice_id from v2)q),
 'litigation_overlap',(select count(*) from(select notice_id from v2 intersect select notice_id from v1l)q),
 'parent_without_child',(select count(*) from v2 p where not exists(select 1 from analytics.topic_family_membership_v2 f where f.release_id=p.release_id and f.notice_id=p.notice_id)),
 'membership_without_evidence',(select count(*) from core.topic_notice_family_memberships_v2 m join cr using(release_id) where not exists(select 1 from core.topic_family_membership_evidence_v2 e where e.family_membership_id=m.family_membership_id)),
 'unapproved_family_memberships',(select count(*) from core.topic_notice_family_memberships_v2 m join cr using(release_id) join core.topic_families_v2 f using(family_id) where f.family_status<>'APPROVED_CHILD_FAMILY'),
 'duplicate_memberships',(select count(*) from(select release_id,notice_id,family_id,count(*) from core.topic_notice_family_memberships_v2 join cr using(release_id) group by 1,2,3 having count(*)>1)q),
 'direct_candidate_missing',(select count(*) from(select * from direct_candidates except select * from stored)q),
 'family_counts',(select jsonb_agg(to_jsonb(q) order by family_code) from(select family_code,count(distinct notice_id) notice_count from analytics.topic_family_membership_v2 join cr using(release_id) group by 1)q),
 'evidence_counts',(select jsonb_object_agg(evidence_basis,n order by evidence_basis) from(select e.evidence_basis,count(distinct m.notice_id) n from core.topic_family_membership_evidence_v2 e join core.topic_notice_family_memberships_v2 m using(family_membership_id) join cr using(release_id) group by 1)q),
 'v1_membership_rows',(select count(*) from core.topic_notice_memberships where topic_contract_version='topic-v1' and release_id=(select release_id from cr)),
 'v1_evidence_rows',(select count(*) from core.topic_membership_evidence e join core.topic_notice_memberships m using(topic_membership_id) join cr using(release_id) where m.topic_contract_version='topic-v1')
) verification;
