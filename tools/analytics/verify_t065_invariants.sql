do $$
declare v bigint;
begin
  select count(*) into v from core.extraction_mentions m join core.document_extractions e using(extraction_id)
  where substring(e.extracted_text from m.span_start+1 for m.span_end-m.span_start) is distinct from m.raw_text;
  if v<>0 then raise exception 'mention span violations: %',v; end if;

  select count(*) into v from core.extraction_mentions m left join core.extraction_mention_labels ml
    on ml.mention_id=m.mention_id and ml.label_contract_version='label-v1' where ml.mention_id is null;
  if v<>0 then raise exception 'orphan mentions without label: %',v; end if;

  select count(*) into v from (select document_sha256,extract_hash,extraction_contract_version,count(*)
    from core.document_extractions group by 1,2,3 having count(*)>1) q;
  if v<>0 then raise exception 'extraction dedupe violations: %',v; end if;

  select count(*) into v from core.parser_runs pr left join core.document_extractions e on e.extraction_id=pr.extraction_id
    where pr.extraction_id is not null and e.extraction_id is null;
  if v<>0 then raise exception 'parser extraction orphans: %',v; end if;

  select count(*) into v from (select attachment_id,document_url_observation_id,count(*)
    from core.source_attachment_observations group by 1,2 having count(*)>1) q;
  if v<>0 then raise exception 'attachment observation duplicates: %',v; end if;

  select count(*) into v from analytics.mention_notice_resolution r
    left join core.extraction_mentions m using(mention_id)
    left join publish.notices n on n.release_id=r.release_id and n.notice_id=r.notice_id
    where m.mention_id is null or n.notice_id is null;
  if v<>0 then raise exception 'mention notice broken relations: %',v; end if;

  select count(*) into v from (
    select label_id,org_node_id,observed_from,observed_to,
      lag(org_node_id) over(partition by label_id order by observed_from nulls first,observed_to nulls last,org_node_id) prior_node,
      lag(observed_to) over(partition by label_id order by observed_from nulls first,observed_to nulls last,org_node_id) prior_to
    from core.organization_label_node_relations) q
  where prior_node is not null and prior_node<>org_node_id
    and coalesce(observed_from,'-infinity'::date)<=coalesce(prior_to,'infinity'::date);
  if v<>0 then raise exception 'organization temporal conflicts: %',v; end if;

  with recursive walk(start_id,node_id,path,cycle) as (
    select from_org_node_id,to_org_node_id,array[from_org_node_id,to_org_node_id],false
    from core.organization_lineage_edges
    union all
    select w.start_id,e.to_org_node_id,w.path||e.to_org_node_id,e.to_org_node_id=any(w.path)
    from walk w join core.organization_lineage_edges e on e.from_org_node_id=w.node_id
    where not w.cycle)
  select count(*) into v from walk where cycle;
  if v<>0 then raise exception 'lineage cycles: %',v; end if;

  select count(*) into v from analytics.notice_rule_change_assertions a join core.regulations r using(regulation_id)
  where a.evidence_source_kind<>'TITLE_DIRECT' or a.evidence_text is null
    or substring(a.evidence_text from a.span_start+1 for a.span_end-a.span_start)<>r.canonical_name;
  if v<>0 then raise exception 'proposal assertions without direct evidence: %',v; end if;

  select count(*) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in('api','core','publish','analytics') and p.prosecdef
    and not(coalesce(p.proconfig,'{}') @> array['search_path=""']);
  if v<>0 then raise exception 'security definer search_path violations: %',v; end if;

  select count(*) into v from (
    select p.oid,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in('api','core','publish','analytics') and p.prosecdef
      and p.proname not like 'public\_%' escape '\'
      and p.proname not in('current_access_level','has_access','internal_verification_queue_rows','office_claim_rows')
      and (has_function_privilege('public',p.oid,'execute') or has_function_privilege('anon',p.oid,'execute')
        or has_function_privilege('authenticated',p.oid,'execute'))) q;
  if v<>0 then raise exception 'writer/helper execute violations: %',v; end if;

  select count(*) into v from core.notice_department_residual_labels rl
  right join publish.notice_department_residual_occurrences r using(residual_id)
  join publish.current_release c using(release_id)
  where c.singleton_key and rl.residual_id is null;
  if v<>0 then raise exception 'current residuals without label: %',v; end if;

  select count(*) into v from core.label_metrics where source_record_count=0;
  if v<>0 then raise exception 'labels without source: %',v; end if;
end $$;

select json_build_object(
  'mention_notice_rows',(select count(*) from analytics.mention_notice_resolution r join publish.current_release c using(release_id) where c.singleton_key),
  'mention_notice_mentions',(select count(distinct mention_id) from analytics.mention_notice_resolution r join publish.current_release c using(release_id) where c.singleton_key),
  'multi_notice_mentions',(select count(*) from (select mention_id from analytics.mention_notice_resolution r join publish.current_release c using(release_id) where c.singleton_key group by mention_id having count(distinct notice_id)>1) q),
  'rule_resolution',(select json_object_agg(resolution_status,c) from (select resolution_status,count(*) c from analytics.rule_label_resolution group by resolution_status) q),
  'proposals',(select json_object_agg(change_kind,c) from (select change_kind,count(*) c from analytics.notice_rule_change_assertions a join publish.current_release cr using(release_id) where cr.singleton_key group by change_kind) q),
  'proposal_total',(select count(*) from analytics.notice_rule_change_assertions a join publish.current_release cr using(release_id) where cr.singleton_key),
  'linked_to_rule',(select sum(cardinality(n.linked_regulation_version_ids)) from publish.notices n join publish.current_release c using(release_id) where c.singleton_key),
  'mentions_rule',(select count(*) from core.extraction_mentions where mention_type='RULE'),
  'residuals',(select count(*) from publish.notice_department_residual_occurrences r join publish.current_release c using(release_id) where c.singleton_key),
  'publish_regulations',(select count(*) from publish.regulations r join publish.current_release c using(release_id) where c.singleton_key),
  'publish_notices',(select count(*) from publish.notices n join publish.current_release c using(release_id) where c.singleton_key),
  'source_attachments',(select count(*) from core.source_attachments),
  'attachment_observations',(select count(*) from core.source_attachment_observations),
  'parser_runs',(select count(*) from core.parser_runs),
  'document_extractions',(select count(*) from core.document_extractions),
  'organization_nodes',(select count(*) from core.organization_nodes),
  'organization_relations',(select count(*) from core.organization_label_node_relations),
  'lineage_edges',(select count(*) from core.organization_lineage_edges),
  'analytics_anon_privileges',(select count(*) from information_schema.role_table_grants where table_schema='analytics' and grantee in('PUBLIC','anon','authenticated')),
  'labels',(select count(*) from core.labels),
  'mentions',(select count(*) from core.extraction_mentions)
);
