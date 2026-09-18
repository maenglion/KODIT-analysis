do $$
declare
  v_release uuid;
  v_residual_digest text;
  v_value bigint;
  v_expected_tables text[] := array[
    'organization_evidence_documents','organization_evidence_document_links',
    'organization_change_events','organization_change_event_nodes',
    'organization_function_assignments','notice_work_contexts','organization_anchor_notices',
    'org_work_attribution_runs','org_work_attribution_candidates','org_work_attribution_steps',
    'org_work_attribution_path_steps','org_work_attribution_evidence'
  ];
begin
  select release_id into v_release from publish.current_release where singleton_key;

  select md5(string_agg(
    residual_id::text||':'||release_id::text||':'||notice_id::text||':'||residual_code||':'||
    coalesce(raw_label,'<NULL>')||':'||comparison_label||':'||posted_at::text||':'||title||':'||
    coalesce(source_location,'<NULL>'),'|' order by residual_id
  )) into v_residual_digest
  from publish.notice_department_residual_occurrences;
  if v_residual_digest <> '942718785d383b2a71a33d1c61a4c8df' then
    raise exception 'T01 residual ledger changed: %',v_residual_digest;
  end if;

  select count(*) into v_value from publish.notices where release_id=v_release;
  if v_value<>2089 then raise exception 'notice count changed: %',v_value; end if;
  select count(*) into v_value from publish.regulations where release_id=v_release;
  if v_value<>1041 then raise exception 'regulation count changed: %',v_value; end if;
  select coalesce(sum(cardinality(linked_regulation_version_ids)),0) into v_value
  from publish.notices where release_id=v_release;
  if v_value<>3775 then raise exception 'notice/regulation linkage changed: %',v_value; end if;
  select count(*) into v_value from core.extraction_mentions;
  if v_value<>20937 then raise exception 'mention count changed: %',v_value; end if;
  select count(*) into v_value from core.labels;
  if v_value<>2209 then raise exception 'label count changed: %',v_value; end if;
  select count(*) into v_value from core.organization_nodes where org_contract_version='organization-v1';
  if v_value<>27 then raise exception 'organization node count changed: %',v_value; end if;
  select count(*) into v_value from core.organization_lineage_edges where org_contract_version='organization-v1';
  if v_value<>2 then raise exception 'T05 lineage edge count changed: %',v_value; end if;

  select count(*) into v_value from core.notice_work_contexts
  where release_id=v_release and work_context_contract_version='notice-work-context-v1';
  if v_value<>1272 then raise exception 'work context count mismatch: %',v_value; end if;
  select count(*) into v_value from core.org_work_attribution_runs
  where release_id=v_release and attribution_contract_version='org-work-attribution-v1';
  if v_value<>1272 then raise exception 'attribution run count mismatch: %',v_value; end if;

  select count(*) into v_value
  from publish.notice_department_residual_occurrences o
  left join core.notice_work_contexts c on c.release_id=o.release_id and c.residual_id=o.residual_id
    and c.work_context_contract_version='notice-work-context-v1'
  left join core.org_work_attribution_runs r on r.release_id=o.release_id and r.residual_id=o.residual_id
    and r.attribution_contract_version='org-work-attribution-v1'
  where o.release_id=v_release and (c.notice_work_context_id is null or r.run_id is null or c.notice_id<>o.notice_id or r.notice_id<>o.notice_id);
  if v_value<>0 then raise exception 'residual/context/run coverage gap: %',v_value; end if;

  select count(*) into v_value from (
    select release_id,residual_id,attribution_contract_version,count(*)
    from core.org_work_attribution_runs group by 1,2,3 having count(*)>1
  ) d;
  if v_value<>0 then raise exception 'duplicate attribution run grains: %',v_value; end if;

  select count(*) into v_value
  from core.org_work_attribution_candidates c
  join core.org_work_attribution_runs r on r.run_id=c.run_id
  left join core.organization_anchor_notices a on a.release_id=r.release_id
    and a.notice_id=c.candidate_notice_id and a.org_node_id=c.candidate_org_node_id
    and a.anchor_contract_version='org-anchor-notice-v1'
  where r.attribution_contract_version='org-work-attribution-v1' and a.anchor_notice_id is null;
  if v_value<>0 then raise exception 'candidate without evidence-backed anchor: %',v_value; end if;

  select count(*) into v_value from core.org_work_attribution_runs
  where attribution_contract_version='org-work-attribution-v1' and final_status<>'UNRESOLVED';
  if v_value<>0 then raise exception 'similarity improperly confirmed attribution: %',v_value; end if;
  select count(*) into v_value from core.org_work_attribution_path_steps;
  if v_value<>0 then raise exception 'unconfirmed run has path steps: %',v_value; end if;

  select count(*) into v_value from core.organization_evidence_documents
  where evidence_contract_version='organization-evidence-document-v1';
  if v_value<>6 then raise exception 'organization evidence catalog mismatch: %',v_value; end if;
  select count(*) into v_value from core.organization_evidence_documents d
  left join core.document_extractions e on e.extraction_id=d.extraction_id and e.document_sha256=d.document_sha256
  where d.evidence_contract_version='organization-evidence-document-v1'
    and d.parsed_text_available and e.extraction_id is null;
  if v_value<>0 then raise exception 'parsed organization evidence lacks extraction provenance: %',v_value; end if;

  select count(*) into v_value from core.organization_change_events e
  left join core.organization_evidence_documents d
    on d.organization_evidence_document_id=e.organization_evidence_document_id
  where e.event_contract_version='organization-change-event-v1'
    and (d.organization_evidence_document_id is null or e.organization_evidence_id is null);
  if v_value<>0 then raise exception 'organization change event lacks official evidence: %',v_value; end if;
  select count(*) into v_value from core.organization_change_events
  where event_contract_version='organization-change-event-v1';
  if v_value<>2 then raise exception 'organization change event count mismatch: %',v_value; end if;
  select count(*) into v_value from core.organization_function_assignments
  where assignment_contract_version='org-function-assignment-v1';
  if v_value<>2 then raise exception 'function assignment count mismatch: %',v_value; end if;

  select count(*) into v_value from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='core' and c.relname=any(v_expected_tables) and c.relrowsecurity and c.relforcerowsecurity;
  if v_value<>12 then raise exception 'T06.6 RLS/FORCE RLS table count mismatch: %',v_value; end if;
  select count(*) into v_value from unnest(v_expected_tables) t(table_name)
  where has_table_privilege('anon','core.'||quote_ident(table_name),'SELECT')
    or has_table_privilege('authenticated','core.'||quote_ident(table_name),'SELECT');
  if v_value<>0 then raise exception 'anon/authenticated has direct T06.6 table SELECT: %',v_value; end if;
  if not has_function_privilege('anon','publish.public_organization_evidence_catalog()','EXECUTE')
    or not has_function_privilege('authenticated','publish.public_organization_evidence_catalog()','EXECUTE') then
    raise exception 'public evidence catalog RPC execute grant missing';
  end if;
end $$;

select final_status,count(*)
from core.org_work_attribution_runs
where attribution_contract_version='org-work-attribution-v1'
group by final_status order by final_status;

select candidate_status,count(*)
from core.org_work_attribution_candidates c
join core.org_work_attribution_runs r using(run_id)
where r.attribution_contract_version='org-work-attribution-v1'
group by candidate_status order by candidate_status;
