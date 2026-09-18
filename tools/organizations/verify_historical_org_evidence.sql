do $$
declare
  v bigint;
  v_digest text;
begin
  select count(*) into v from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='core' and c.relname in(
    'organization_document_series','organization_document_versions','organization_document_version_series',
    'organization_evidence_spans','organization_snapshots','organization_snapshot_observations',
    'organization_function_observations','organization_function_assignment_spans')
    and (not c.relrowsecurity or not c.relforcerowsecurity);
  if v<>0 then raise exception 'T06.7 ledger without forced RLS: %',v; end if;

  select count(*) into v from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='core' and c.relname in(
    'organization_document_series','organization_document_versions','organization_document_version_series',
    'organization_evidence_spans','organization_snapshots','organization_snapshot_observations',
    'organization_function_observations','organization_function_assignment_spans')
    and (has_table_privilege('anon',c.oid,'select') or has_table_privilege('authenticated',c.oid,'select'));
  if v<>0 then raise exception 'public role can directly read T06.7 core ledger: %',v; end if;

  select count(*) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='publish' and p.proname in(
    'public_organization_evidence_catalog_v2','public_organization_evidence_document_detail')
    and (not p.prosecdef or not(coalesce(p.proconfig,'{}') @> array['search_path=""'])
      or not has_function_privilege('anon',p.oid,'execute')
      or not has_function_privilege('authenticated',p.oid,'execute'));
  if v<>0 then raise exception 'public evidence RPC security contract violation: %',v; end if;

  select count(*) into v from core.organization_evidence_documents
  where evidence_contract_version='organization-evidence-document-v2';
  if v<>42 then raise exception 'historical evidence document count changed: %',v; end if;

  select count(*) into v from core.organization_document_versions
  where version_contract_version='organization-document-version-v1';
  if v<>45 then raise exception 'document version count changed: %',v; end if;

  select count(*) into v from core.organization_document_versions d
  where d.version_contract_version='organization-document-version-v1'
    and not exists(select 1 from core.organization_document_version_series l where l.document_version_id=d.document_version_id);
  if v<>0 then raise exception 'document versions without series: %',v; end if;

  select count(*) into v from core.organization_snapshots where snapshot_contract_version='organization-snapshot-v1';
  if v<>1 then raise exception 'snapshot count changed: %',v; end if;
  select count(*) into v from core.organization_snapshot_observations;
  if v<>22 then raise exception 'snapshot organization count changed: %',v; end if;
  select count(*) into v from core.organization_function_observations
  where observation_contract_version='organization-function-observation-v1';
  if v<>200 then raise exception 'function observation count changed: %',v; end if;
  select count(*) into v from core.organization_function_assignments
  where assignment_contract_version='org-function-assignment-v2'
    and assignment_key like '2026-detailed-function:%';
  if v<>22 then raise exception 'detailed-rule assignment count changed: %',v; end if;
  select count(*) into v from core.organization_function_assignments
  where assignment_contract_version='org-function-assignment-v3';
  if v<>3 then raise exception 'privacy epoch v3 count changed: %',v; end if;
  select count(*) into v from (
    select a.function_assignment_id,b.function_assignment_id
    from core.organization_function_assignments a
    join core.organization_function_assignments b
      on a.function_assignment_id<b.function_assignment_id
     and a.assignment_contract_version='org-function-assignment-v3'
     and b.assignment_contract_version='org-function-assignment-v3'
     and a.work_string=b.work_string
     and coalesce(a.valid_from,'-infinity'::date)<coalesce(b.valid_to,'infinity'::date)
     and coalesce(b.valid_from,'-infinity'::date)<coalesce(a.valid_to,'infinity'::date)
  ) conflicts;
  if v<>0 then raise exception 'privacy epoch v3 overlap: %',v; end if;

  select count(*) into v from core.org_work_attribution_runs
  where attribution_contract_version='org-work-attribution-v1-evidence-r2';
  if v<>1272 then raise exception 'evidence-r2 attribution run count changed: %',v; end if;
  select count(*) into v from core.org_work_attribution_runs
  where attribution_contract_version='org-work-attribution-v1-evidence-r2' and final_status<>'UNRESOLVED';
  if v<>0 then raise exception 'evidence-r2 similarity-only resolution found: %',v; end if;
  select count(*) into v from analytics.org_work_attribution_evidence_r2_audit;
  if v<>1272 then raise exception 'before/after audit population changed: %',v; end if;
  select count(*) into v from analytics.org_work_attribution_evidence_r2_audit
  where old_final_status<>evidence_r2_final_status;
  if v<>0 then raise exception 'unsupported attribution status change found: %',v; end if;

  select count(*) into v from core.org_work_attribution_runs
  where attribution_contract_version='org-work-attribution-v1';
  if v<>1272 then raise exception 'T06.6 run count changed: %',v; end if;
  select count(*) into v from core.org_work_attribution_candidates c
  join core.org_work_attribution_runs r using(run_id)
  where r.attribution_contract_version='org-work-attribution-v1';
  if v<>4350 then raise exception 'T06.6 candidate count changed: %',v; end if;
  select count(*) into v from core.extraction_mentions;
  if v<>20937 then raise exception 'mention count changed: %',v; end if;
  select count(*) into v from core.labels;
  if v<>2209 then raise exception 'label count changed: %',v; end if;
  select count(*) into v from analytics.notice_rule_change_assertions a
  join publish.current_release c using(release_id) where c.singleton_key;
  if v<>1599 then raise exception 'proposal assertion count changed: %',v; end if;

  select md5(string_agg(
    residual_id::text||':'||release_id::text||':'||notice_id::text||':'||residual_code||':'||
    coalesce(raw_label,'<NULL>')||':'||comparison_label||':'||posted_at::text||':'||title||':'||
    coalesce(source_location,'<NULL>'),'|' order by residual_id
  )) into v_digest from publish.notice_department_residual_occurrences;
  if v_digest<>'942718785d383b2a71a33d1c61a4c8df' then
    raise exception 'T01 residual ledger changed: %',v_digest;
  end if;

  select count(*) into v from core.organization_snapshot_observations o
  join core.organization_snapshots s using(snapshot_id)
  join core.organization_evidence_spans e using(evidence_span_id)
  where s.organization_evidence_document_id<>e.organization_evidence_document_id;
  if v<>0 then raise exception 'snapshot evidence document mismatch: %',v; end if;
  select count(*) into v from core.organization_function_observations f
  join core.organization_evidence_spans e using(evidence_span_id)
  where f.organization_evidence_document_id<>e.organization_evidence_document_id;
  if v<>0 then raise exception 'function evidence document mismatch: %',v; end if;
  select count(*) into v from core.organization_change_events e
  where not exists(select 1 from core.organization_evidence_document_links l
    where l.organization_evidence_document_id=e.organization_evidence_document_id
      and l.organization_evidence_id=e.organization_evidence_id);
  if v<>0 then raise exception 'organization event without official evidence: %',v; end if;
end $$;

select jsonb_build_object(
  'historical_documents',42,
  'document_versions',45,
  'version_series_links',(select count(*) from core.organization_document_version_series),
  'snapshots',1,
  'snapshot_organizations',22,
  'function_observations',200,
  'detailed_function_assignments',22,
  'privacy_epochs_v3',3,
  'evidence_r2_runs',1272,
  'evidence_r2_resolved',0,
  'evidence_r2_official_corpus_links',(select count(*) from core.org_work_attribution_evidence e join core.org_work_attribution_runs r using(run_id) where r.attribution_contract_version='org-work-attribution-v1-evidence-r2' and e.evidence_kind='ORGANIZATION_DOCUMENT' and e.organization_evidence_document_id is not null),
  'old_v1_runs',1272,
  'old_v1_candidates',4350,
  'residual_digest','942718785d383b2a71a33d1c61a4c8df'
) verification;
