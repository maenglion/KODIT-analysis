begin;
set constraints all deferred;
set local role service_role;

insert into publish.releases(
  release_id,collection_cycle_id,release_type,schema_version,evidence_as_of,generated_at,
  source_snapshot_hash,projection_hash,population,status,approved_at,approved_by
) values
  (md5('work-trace-test-release-1')::uuid,md5('work-trace-test-cycle-1')::uuid,'baseline','test',date '2026-01-01',now(),repeat('a',64),repeat('b',64),1,'approved',now(),'work-trace-test'),
  (md5('work-trace-test-release-2')::uuid,md5('work-trace-test-cycle-2')::uuid,'incremental','test',date '2026-02-01',now(),repeat('c',64),repeat('d',64),1,'approved',now(),'work-trace-test'),
  (md5('work-trace-test-release-3')::uuid,md5('work-trace-test-cycle-3')::uuid,'incremental','test',date '2026-03-01',now(),repeat('e',64),repeat('f',64),1,'approved',now(),'work-trace-test');

insert into core.regulations(regulation_id,canonical_name,regulation_type,lifecycle_status,visibility)
values(md5('work-trace-test-regulation')::uuid,'테스트 업무규정','INTERNAL','current','public');

insert into core.regulation_versions(
  regulation_version_id,regulation_id,revision_date,effective_date,version_label,currency_status
) values(
  md5('work-trace-test-regulation-version')::uuid,
  md5('work-trace-test-regulation')::uuid,date '2020-01-01',date '2020-01-01','test-v1','current'
);

insert into core.organization_evidence(
  organization_evidence_id,org_contract_version,evidence_key,source_kind,source_reference,
  observed_name,evidence_date,evidence_strength
) values
  (md5('work-trace-test-org-evidence-a')::uuid,'work-trace-test','org-a','OFFICIAL_CURRENT_ORGANIZATION_PAGE','https://example.invalid/org-a','테스트부서A',date '2026-01-01','OFFICIAL_DIRECT'),
  (md5('work-trace-test-org-evidence-b')::uuid,'work-trace-test','org-b','OFFICIAL_CURRENT_ORGANIZATION_PAGE','https://example.invalid/org-b','테스트부서B',date '2026-01-01','OFFICIAL_DIRECT');

insert into core.organization_nodes(
  org_node_id,org_contract_version,node_key,official_name,valid_from,node_status,primary_evidence_id
) values
  (md5('work-trace-test-org-a')::uuid,'work-trace-test','org-a','테스트부서A',date '2026-01-01','CONFIRMED',md5('work-trace-test-org-evidence-a')::uuid),
  (md5('work-trace-test-org-b')::uuid,'work-trace-test','org-b','테스트부서B',date '2026-01-01','CONFIRMED',md5('work-trace-test-org-evidence-b')::uuid);

insert into core.organization_evidence_documents(
  organization_evidence_document_id,evidence_contract_version,evidence_key,document_type,
  source_date,effective_date,official_title,source_url,parsed_text_available
) values
  (md5('work-trace-test-doc-a')::uuid,'work-trace-test','doc-a','ORG_FUNCTION_ASSIGNMENT',date '2026-01-01',date '2026-01-01','테스트부서A 업무분장','https://example.invalid/doc-a',false),
  (md5('work-trace-test-doc-b')::uuid,'work-trace-test','doc-b','ORG_FUNCTION_ASSIGNMENT',date '2026-02-01',date '2026-02-01','테스트부서B 업무분장','https://example.invalid/doc-b',false);

insert into core.organization_evidence_document_links(
  organization_evidence_document_id,organization_evidence_id,link_type
) values
  (md5('work-trace-test-doc-a')::uuid,md5('work-trace-test-org-evidence-a')::uuid,'SUPPORTS'),
  (md5('work-trace-test-doc-b')::uuid,md5('work-trace-test-org-evidence-b')::uuid,'SUPPORTS');

insert into core.organization_function_assignments(
  function_assignment_id,assignment_contract_version,assignment_key,work_string,org_node_id,
  valid_from,organization_evidence_document_id,organization_evidence_id,assignment_status
) values
  (md5('work-trace-test-function-a')::uuid,'work-trace-test','function-a','테스트 업무의 직접 운영',md5('work-trace-test-org-a')::uuid,date '2026-01-01',md5('work-trace-test-doc-a')::uuid,md5('work-trace-test-org-evidence-a')::uuid,'OFFICIAL_DIRECT'),
  (md5('work-trace-test-function-b')::uuid,'work-trace-test','function-b','관련 테스트 업무 지원',md5('work-trace-test-org-b')::uuid,date '2026-02-01',md5('work-trace-test-doc-b')::uuid,md5('work-trace-test-org-evidence-b')::uuid,'OFFICIAL_DIRECT');

insert into core.work_trace_evidence_references(
  evidence_reference_id,evidence_contract_version,evidence_key,reference_kind,notice_id,
  official_title,source_url,source_date
) values(
  md5('work-trace-test-evidence-notice')::uuid,'work-trace-test','notice','NOTICE',md5('work-trace-test-notice')::uuid,
  '테스트 사규예고','https://example.invalid/notice',date '2020-01-01'
);

insert into core.work_trace_evidence_references(
  evidence_reference_id,evidence_contract_version,evidence_key,reference_kind,regulation_id,
  official_title,source_url,source_date,effective_date
) values(
  md5('work-trace-test-evidence-regulation')::uuid,'work-trace-test','regulation','REGULATION',md5('work-trace-test-regulation')::uuid,
  '테스트 업무규정','https://example.invalid/regulation',date '2020-01-01',date '2020-01-01'
);

insert into core.work_trace_evidence_references(
  evidence_reference_id,evidence_contract_version,evidence_key,reference_kind,function_assignment_id,
  organization_evidence_document_id,official_title,source_url,source_date,effective_date
) values
  (md5('work-trace-test-evidence-function-a')::uuid,'work-trace-test','function-a','FUNCTION_ASSIGNMENT',md5('work-trace-test-function-a')::uuid,md5('work-trace-test-doc-a')::uuid,'테스트부서A 업무분장','https://example.invalid/doc-a',date '2026-01-01',date '2026-01-01'),
  (md5('work-trace-test-evidence-function-b')::uuid,'work-trace-test','function-b','FUNCTION_ASSIGNMENT',md5('work-trace-test-function-b')::uuid,md5('work-trace-test-doc-b')::uuid,'테스트부서B 업무분장','https://example.invalid/doc-b',date '2026-02-01',date '2026-02-01');

insert into core.regulation_function_correspondences(
  regulation_id,function_assignment_id,org_node_id,correspondence_basis,
  comparison_contract_version,comparison_method,regulation_observed_text,
  function_observed_text,comparison_score,regulation_evidence_reference_id,
  function_evidence_reference_id
) values
  (md5('work-trace-test-regulation')::uuid,md5('work-trace-test-function-a')::uuid,
   md5('work-trace-test-org-a')::uuid,'FUNCTION_DIRECT','work-trace-test-comparison-v1',
   'EXACT_REGULATION_MANAGEMENT_REFERENCE','테스트 업무규정','테스트 업무의 직접 운영',1,
   md5('work-trace-test-evidence-regulation')::uuid,md5('work-trace-test-evidence-function-a')::uuid),
  (md5('work-trace-test-regulation')::uuid,md5('work-trace-test-function-b')::uuid,
   md5('work-trace-test-org-b')::uuid,'FUNCTION_PHRASE_CANDIDATE','work-trace-test-comparison-v1',
   'CHARACTER_NGRAM_COSINE','테스트 업무규정','관련 테스트 업무 지원',0.8,
   md5('work-trace-test-evidence-regulation')::uuid,md5('work-trace-test-evidence-function-b')::uuid);

insert into core.work_trace_cases(
  notice_id,regulation_id,work_observation_key,observation_kind
) values(
  md5('work-trace-test-notice')::uuid,md5('work-trace-test-regulation')::uuid,
  'NOTICE_TITLE:test-work','NOTICE_TITLE'
);

-- Run 1 stops at a source-document gap and records one research need.
insert into core.work_trace_runs(
  trace_run_id,release_id,trace_contract_version,evidence_corpus_digest,evidence_cutoff_date,
  started_at,completed_at,run_result
) values(
  md5('work-trace-test-run-1')::uuid,md5('work-trace-test-release-1')::uuid,'work-trace-test-v1',repeat('1',64),date '2026-01-01',now(),now(),'COMPLETED'
);

insert into core.work_trace_branch_results(
  branch_result_id,trace_run_id,trace_case_id,terminal_outcome,last_verified_date,
  last_verified_step_id,public_summary
) values(
  md5('work-trace-test-result-1')::uuid,md5('work-trace-test-run-1')::uuid,
  core.work_trace_case_id(md5('work-trace-test-notice')::uuid,md5('work-trace-test-regulation')::uuid,'NOTICE_TITLE:test-work'),
  'SOURCE_DOCUMENT_GAP',date '2020-01-01',md5('work-trace-test-step-1-2')::uuid,
  '2020년 규정 관계까지 확인되고 이후 관계 확인자료는 확보 범위에서 확인되지 않음'
);

insert into core.work_trace_steps(
  trace_step_id,branch_result_id,step_order,step_kind,relation_kind,step_basis,
  notice_id,regulation_id,observed_at,step_description
) values
  (md5('work-trace-test-step-1-1')::uuid,md5('work-trace-test-result-1')::uuid,1,'NOTICE_OBSERVED','SOURCE_NOTICE','OFFICIAL_DOCUMENT',md5('work-trace-test-notice')::uuid,null,date '2020-01-01','공식 사규예고 관측'),
  (md5('work-trace-test-step-1-2')::uuid,md5('work-trace-test-result-1')::uuid,2,'PROPOSES_CHANGE_TO','PROPOSES_CHANGE_TO','EXISTING_ASSERTION',md5('work-trace-test-notice')::uuid,md5('work-trace-test-regulation')::uuid,date '2020-01-01','개정 대상 규정 직접 확인');

insert into core.work_trace_step_evidence_links(
  trace_step_id,evidence_reference_id,evidence_role,citation_order
) values
  (md5('work-trace-test-step-1-1')::uuid,md5('work-trace-test-evidence-notice')::uuid,'SUPPORTS_SOURCE',1),
  (md5('work-trace-test-step-1-2')::uuid,md5('work-trace-test-evidence-regulation')::uuid,'SUPPORTS_RELATION',1);

insert into core.work_trace_branch_breaks(
  branch_result_id,break_kind,after_step_id,missing_relation,gap_from,
  required_evidence_description,public_explanation
) values(
  md5('work-trace-test-result-1')::uuid,'SOURCE_DOCUMENT_GAP',md5('work-trace-test-step-1-2')::uuid,
  'REGULATION_TO_CURRENT_FUNCTION',date '2020-01-01','2020년 이후 업무분장 관계 확인자료',
  '2020년 이후 업무분장 관계를 확인할 수 있는 자료가 현재 확보 범위에 없습니다.'
);

insert into core.work_trace_evidence_needs(
  evidence_need_id,trace_run_id,need_key,need_kind,required_evidence_description,period_from
) values(
  md5('work-trace-test-need-1')::uuid,md5('work-trace-test-run-1')::uuid,'post-2020-function-evidence',
  'SOURCE_DOCUMENT_GAP','2020년 이후 업무분장 관계 확인자료',date '2020-01-01'
);
insert into core.work_trace_evidence_need_branches(evidence_need_id,branch_result_id)
values(md5('work-trace-test-need-1')::uuid,md5('work-trace-test-result-1')::uuid);

select core.validate_work_trace_run(md5('work-trace-test-run-1')::uuid,'work-trace-run-validation-v1');

-- Run 2 adds one document and records two distinct current correspondences.
insert into core.work_trace_runs(
  trace_run_id,parent_trace_run_id,release_id,trace_contract_version,evidence_corpus_digest,
  evidence_cutoff_date,started_at,completed_at,run_result
) values(
  md5('work-trace-test-run-2')::uuid,md5('work-trace-test-run-1')::uuid,
  md5('work-trace-test-release-2')::uuid,'work-trace-test-v1',repeat('2',64),date '2026-02-01',now(),now(),'COMPLETED'
);
insert into core.work_trace_run_evidence_references(trace_run_id,evidence_reference_id,added_reason)
values(md5('work-trace-test-run-2')::uuid,md5('work-trace-test-evidence-function-b')::uuid,'새 현행 업무분장 근거');

insert into core.work_trace_branch_results(
  branch_result_id,trace_run_id,trace_case_id,terminal_outcome,last_verified_date,
  last_verified_step_id,public_summary
) values(
  md5('work-trace-test-result-2')::uuid,md5('work-trace-test-run-2')::uuid,
  core.work_trace_case_id(md5('work-trace-test-notice')::uuid,md5('work-trace-test-regulation')::uuid,'NOTICE_TITLE:test-work'),
  'FUNCTION_MULTIPLE_CANDIDATES',date '2026-02-01',md5('work-trace-test-step-2-4')::uuid,
  '두 현행 부서에서 서로 다른 강도의 업무 대응이 관측됨'
);

insert into core.work_trace_steps(
  trace_step_id,branch_result_id,step_order,step_kind,relation_kind,step_basis,
  notice_id,regulation_id,function_assignment_id,org_node_id,observed_at,effective_at,
  observed_phrase,matched_phrase,step_description
) values
  (md5('work-trace-test-step-2-1')::uuid,md5('work-trace-test-result-2')::uuid,1,'NOTICE_OBSERVED','SOURCE_NOTICE','OFFICIAL_DOCUMENT',md5('work-trace-test-notice')::uuid,null,null,null,date '2020-01-01',null,null,null,'공식 사규예고 관측'),
  (md5('work-trace-test-step-2-2')::uuid,md5('work-trace-test-result-2')::uuid,2,'PROPOSES_CHANGE_TO','PROPOSES_CHANGE_TO','EXISTING_ASSERTION',md5('work-trace-test-notice')::uuid,md5('work-trace-test-regulation')::uuid,null,null,date '2020-01-01',null,null,null,'개정 대상 규정 직접 확인'),
  (md5('work-trace-test-step-2-3')::uuid,md5('work-trace-test-result-2')::uuid,3,'CURRENT_FUNCTION_OBSERVED','CURRENT_FUNCTION_DIRECT','OFFICIAL_DOCUMENT',md5('work-trace-test-notice')::uuid,md5('work-trace-test-regulation')::uuid,md5('work-trace-test-function-a')::uuid,md5('work-trace-test-org-a')::uuid,date '2026-01-01',date '2026-01-01','테스트 업무','테스트 업무의 직접 운영','부서 A 공식 업무분장 직접 확인'),
  (md5('work-trace-test-step-2-4')::uuid,md5('work-trace-test-result-2')::uuid,4,'SEPARATE_CURRENT_OBSERVATION','CURRENT_FUNCTION_PHRASE','TEXT_COMPARISON',md5('work-trace-test-notice')::uuid,md5('work-trace-test-regulation')::uuid,md5('work-trace-test-function-b')::uuid,md5('work-trace-test-org-b')::uuid,date '2026-02-01',date '2026-02-01','테스트 업무','관련 테스트 업무 지원','부서 B 업무 문구 대조 후보');

insert into core.work_trace_step_evidence_links(
  trace_step_id,evidence_reference_id,evidence_role,citation_order
) values
  (md5('work-trace-test-step-2-1')::uuid,md5('work-trace-test-evidence-notice')::uuid,'SUPPORTS_SOURCE',1),
  (md5('work-trace-test-step-2-2')::uuid,md5('work-trace-test-evidence-regulation')::uuid,'SUPPORTS_RELATION',1),
  (md5('work-trace-test-step-2-3')::uuid,md5('work-trace-test-evidence-function-a')::uuid,'SUPPORTS_RELATION',1),
  (md5('work-trace-test-step-2-4')::uuid,md5('work-trace-test-evidence-regulation')::uuid,'SUPPORTS_TEXT_COMPARISON_SOURCE',1),
  (md5('work-trace-test-step-2-4')::uuid,md5('work-trace-test-evidence-function-b')::uuid,'SUPPORTS_TEXT_COMPARISON_TARGET',2);

insert into core.work_trace_function_correspondences(
  correspondence_id,branch_result_id,trace_step_id,regulation_function_correspondence_id,
  org_node_id,function_assignment_id,
  correspondence_basis,comparison_contract_version,observed_phrase,matched_phrase,comparison_score
) values
  (md5('work-trace-test-correspondence-a')::uuid,md5('work-trace-test-result-2')::uuid,
   md5('work-trace-test-step-2-3')::uuid,
   core.regulation_function_correspondence_id(md5('work-trace-test-regulation')::uuid,md5('work-trace-test-function-a')::uuid,'FUNCTION_DIRECT','work-trace-test-comparison-v1'),
   md5('work-trace-test-org-a')::uuid,md5('work-trace-test-function-a')::uuid,
   'FUNCTION_DIRECT','work-trace-test-comparison-v1','테스트 업무','테스트 업무의 직접 운영',1),
  (md5('work-trace-test-correspondence-b')::uuid,md5('work-trace-test-result-2')::uuid,
   md5('work-trace-test-step-2-4')::uuid,
   core.regulation_function_correspondence_id(md5('work-trace-test-regulation')::uuid,md5('work-trace-test-function-b')::uuid,'FUNCTION_PHRASE_CANDIDATE','work-trace-test-comparison-v1'),
   md5('work-trace-test-org-b')::uuid,md5('work-trace-test-function-b')::uuid,
   'FUNCTION_PHRASE_CANDIDATE','work-trace-test-comparison-v1','테스트 업무','관련 테스트 업무 지원',0.8);

select core.validate_work_trace_run(md5('work-trace-test-run-2')::uuid,'work-trace-run-validation-v1');

do $$
declare d record; e record;
begin
  select * into d from analytics.work_trace_run_deltas
  where current_run_id=md5('work-trace-test-run-2')::uuid;
  if d.population_change<>'EXISTING_CASE'
    or d.primary_change_class<>'OUTCOME_CHANGED'
    or not d.evidence_added
    or not d.became_multiple_correspondence then
    raise exception 'unexpected run-2 delta: %',row_to_json(d);
  end if;

  select * into e from analytics.work_trace_evidence_need_effects
  where evidence_need_id=md5('work-trace-test-need-1')::uuid
    and evaluating_run_id=md5('work-trace-test-run-2')::uuid;
  if e.expected_affected_branch_count<>1
    or e.outcome_changed_branch_count<>1
    or e.multiple_correspondence_branch_count<>1
    or e.still_stopped_branch_count<>0
    or e.added_evidence_cited_branch_count<>1 then
    raise exception 'unexpected evidence effect: %',row_to_json(e);
  end if;
end $$;

-- Run 3 shortens the previous result and therefore requires an explicit correction link.
insert into core.work_trace_runs(
  trace_run_id,parent_trace_run_id,release_id,trace_contract_version,evidence_corpus_digest,
  evidence_cutoff_date,started_at,completed_at,run_result
) values(
  md5('work-trace-test-run-3')::uuid,md5('work-trace-test-run-2')::uuid,
  md5('work-trace-test-release-3')::uuid,'work-trace-test-v1',repeat('3',64),date '2026-03-01',now(),now(),'COMPLETED'
);

insert into core.work_trace_branch_results(
  branch_result_id,trace_run_id,trace_case_id,terminal_outcome,last_verified_date,
  last_verified_step_id,public_summary
) values(
  md5('work-trace-test-result-3')::uuid,md5('work-trace-test-run-3')::uuid,
  core.work_trace_case_id(md5('work-trace-test-notice')::uuid,md5('work-trace-test-regulation')::uuid,'NOTICE_TITLE:test-work'),
  'SOURCE_DOCUMENT_GAP',date '2020-01-01',md5('work-trace-test-step-3-1')::uuid,
  '이전 현행 대응은 시행일 근거 정정으로 철회되고 규정 단계에서 추적이 멈춤'
);
insert into core.work_trace_steps(
  trace_step_id,branch_result_id,step_order,step_kind,relation_kind,step_basis,
  notice_id,observed_at,step_description
) values(
  md5('work-trace-test-step-3-1')::uuid,md5('work-trace-test-result-3')::uuid,1,'NOTICE_OBSERVED','SOURCE_NOTICE','OFFICIAL_DOCUMENT',md5('work-trace-test-notice')::uuid,date '2020-01-01','공식 사규예고 관측');
insert into core.work_trace_step_evidence_links(trace_step_id,evidence_reference_id,evidence_role,citation_order)
values(md5('work-trace-test-step-3-1')::uuid,md5('work-trace-test-evidence-notice')::uuid,'SUPPORTS_SOURCE',1);
insert into core.work_trace_branch_breaks(
  branch_result_id,break_kind,after_step_id,missing_relation,gap_from,
  required_evidence_description,public_explanation
) values(
  md5('work-trace-test-result-3')::uuid,'SOURCE_DOCUMENT_GAP',md5('work-trace-test-step-3-1')::uuid,
  'NOTICE_TO_REGULATION_REVIEW',date '2020-01-01','개정 대상 규정 재확인 자료',
  '이전 연결은 정정되었으며 개정 대상 규정을 다시 확인할 자료가 필요합니다.'
);
insert into core.work_trace_branch_corrections(
  correction_id,superseded_result_id,superseding_result_id,correction_reason_code,
  correction_explanation,correction_evidence_reference_id
) values(
  md5('work-trace-test-correction')::uuid,md5('work-trace-test-result-2')::uuid,md5('work-trace-test-result-3')::uuid,
  'EFFECTIVE_DATE_CORRECTED','업무분장 시행일이 예고 이후로 확인되어 이전 연속 경로를 철회함',
  md5('work-trace-test-evidence-function-b')::uuid
);

select core.validate_work_trace_run(md5('work-trace-test-run-3')::uuid,'work-trace-run-validation-v1');

do $$
declare d record; a record;
begin
  select * into d from analytics.work_trace_run_deltas
  where current_run_id=md5('work-trace-test-run-3')::uuid;
  if d.primary_change_class<>'SHORTENED_CORRECTION' then
    raise exception 'unexpected correction delta: %',row_to_json(d);
  end if;
  select * into a from analytics.work_trace_branch_audit
  where branch_result_id=md5('work-trace-test-result-2')::uuid;
  if not a.is_superseded or a.superseding_result_id<>md5('work-trace-test-result-3')::uuid then
    raise exception 'superseded result not marked: %',row_to_json(a);
  end if;
end $$;

-- Service-only writer smoke: create a fourth validated run entirely through
-- the API boundary, then repeat every call to verify idempotency.
do $$
declare
  v_response jsonb;
  v_run jsonb;
  v_branch jsonb;
  v_need jsonb;
begin
  v_response := api.record_work_trace_evidence_batch(jsonb_build_array(
    jsonb_build_object(
      'evidence_reference_id',md5('work-trace-test-evidence-regulation-writer')::uuid,
      'evidence_contract_version','work-trace-test','evidence_key','regulation-writer',
      'reference_kind','REGULATION_VERSION',
      'regulation_version_id',md5('work-trace-test-regulation-version')::uuid,
      'official_title','테스트 업무규정 writer 근거',
      'source_url','https://example.invalid/regulation-writer',
      'source_date','2020-01-01','effective_date','2020-01-01'
    ),
    jsonb_build_object(
      'evidence_reference_id',md5('work-trace-test-evidence-notice-writer')::uuid,
      'evidence_contract_version','work-trace-test','evidence_key','notice-writer',
      'reference_kind','NOTICE','notice_id',md5('work-trace-test-notice-writer')::uuid,
      'official_title','writer 테스트 사규예고',
      'source_url','https://example.invalid/notice-writer','source_date','2020-01-01'
    )
  ));
  if (v_response->>'inserted')::integer<>2 then raise exception 'evidence writer insert failed: %',v_response; end if;
  v_response := api.record_work_trace_evidence_batch(jsonb_build_array(
    jsonb_build_object(
    'evidence_reference_id',md5('work-trace-test-evidence-regulation-writer')::uuid,
    'evidence_contract_version','work-trace-test','evidence_key','regulation-writer',
    'reference_kind','REGULATION_VERSION',
    'regulation_version_id',md5('work-trace-test-regulation-version')::uuid,
    'official_title','테스트 업무규정 writer 근거',
    'source_url','https://example.invalid/regulation-writer',
    'source_date','2020-01-01','effective_date','2020-01-01'
    ),
    jsonb_build_object(
      'evidence_reference_id',md5('work-trace-test-evidence-notice-writer')::uuid,
      'evidence_contract_version','work-trace-test','evidence_key','notice-writer',
      'reference_kind','NOTICE','notice_id',md5('work-trace-test-notice-writer')::uuid,
      'official_title','writer 테스트 사규예고',
      'source_url','https://example.invalid/notice-writer','source_date','2020-01-01'
    )
  ));
  if (v_response->>'inserted')::integer<>0 then raise exception 'evidence writer is not idempotent: %',v_response; end if;

  v_response := api.record_regulation_function_correspondence_batch(jsonb_build_array(jsonb_build_object(
    'regulation_function_correspondence_id',core.regulation_function_correspondence_id(
      md5('work-trace-test-regulation')::uuid,md5('work-trace-test-function-a')::uuid,
      'FUNCTION_DIRECT','work-trace-writer-test-v1'),
    'regulation_id',md5('work-trace-test-regulation')::uuid,
    'function_assignment_id',md5('work-trace-test-function-a')::uuid,
    'org_node_id',md5('work-trace-test-org-a')::uuid,
    'correspondence_basis','FUNCTION_DIRECT',
    'comparison_contract_version','work-trace-writer-test-v1',
    'comparison_method','EXACT_REGULATION_MANAGEMENT_REFERENCE',
    'regulation_observed_text','테스트 업무규정',
    'function_observed_text','테스트 업무의 직접 운영',
    'comparison_score',1,
    'regulation_evidence_reference_id',md5('work-trace-test-evidence-regulation-writer')::uuid,
    'function_evidence_reference_id',md5('work-trace-test-evidence-function-a')::uuid
  )));
  if (v_response->>'inserted')::integer<>1 then raise exception 'relation writer insert failed: %',v_response; end if;

  v_run := jsonb_build_object(
    'trace_run_id',md5('work-trace-test-run-writer')::uuid,
    'parent_trace_run_id',null,
    'release_id',md5('work-trace-test-release-3')::uuid,
    'trace_contract_version','work-trace-writer-test-v1',
    'evidence_corpus_digest',repeat('4',64),
    'evidence_cutoff_date','2026-03-01',
    'started_at','2026-03-01T00:00:00Z',
    'completed_at','2026-03-01T00:00:01Z',
    'run_result','COMPLETED','failure_detail',null
  );
  v_response := api.record_work_trace_run_header(v_run,'[]'::jsonb);
  if (v_response->>'run_inserted')::integer<>1 then raise exception 'run writer insert failed: %',v_response; end if;

  v_branch := jsonb_build_object(
    'case',jsonb_build_object(
      'trace_case_id',core.work_trace_case_id(md5('work-trace-test-notice-writer')::uuid,null,'UNRESOLVED_REGULATION'),
      'notice_id',md5('work-trace-test-notice-writer')::uuid,
      'regulation_id',null,'work_observation_id',null,
      'work_observation_key','UNRESOLVED_REGULATION','observation_kind','UNRESOLVED_WORK'
    ),
    'result',jsonb_build_object(
      'branch_result_id',md5('work-trace-test-result-writer')::uuid,
      'trace_run_id',md5('work-trace-test-run-writer')::uuid,
      'trace_case_id',core.work_trace_case_id(md5('work-trace-test-notice-writer')::uuid,null,'UNRESOLVED_REGULATION'),
      'terminal_outcome','RELATION_EVIDENCE_GAP','completion_scope',null,
      'last_verified_date','2020-01-01',
      'last_verified_step_id',md5('work-trace-test-step-writer')::uuid,
      'public_summary','공식 사규예고는 확인했으나 개정 대상 규정 연결 근거가 확인되지 않음'
    ),
    'steps',jsonb_build_array(jsonb_build_object(
      'trace_step_id',md5('work-trace-test-step-writer')::uuid,
      'branch_result_id',md5('work-trace-test-result-writer')::uuid,
      'step_order',1,'step_kind','NOTICE_OBSERVED','relation_kind','SOURCE_NOTICE',
      'step_basis','OFFICIAL_DOCUMENT','notice_id',md5('work-trace-test-notice-writer')::uuid,
      'regulation_id',null,'work_observation_id',null,'function_assignment_id',null,
      'org_node_id',null,'change_event_id',null,'observed_at','2020-01-01',
      'effective_at',null,'observed_phrase',null,'matched_phrase',null,
      'step_description','공식 사규예고 관측',
      'evidence_links',jsonb_build_array(jsonb_build_object(
        'evidence_reference_id',md5('work-trace-test-evidence-notice-writer')::uuid,
        'evidence_role','SUPPORTS_SOURCE','citation_order',1
      ))
    )),
    'branch_break',jsonb_build_object(
      'branch_result_id',md5('work-trace-test-result-writer')::uuid,
      'break_kind','RELATION_EVIDENCE_GAP',
      'after_step_id',md5('work-trace-test-step-writer')::uuid,
      'next_known_step_id',null,'missing_relation','NOTICE_TO_REGULATION',
      'gap_from','2020-01-01','gap_to',null,
      'required_evidence_description','사규예고와 개정 대상 규정을 직접 잇는 근거',
      'public_explanation','개정 대상 규정을 직접 잇는 근거가 현재 확보 범위에서 확인되지 않았습니다.'
    ),
    'correspondences','[]'::jsonb,'correction',null
  );
  v_response := api.record_work_trace_branch_batch(md5('work-trace-test-run-writer')::uuid,jsonb_build_array(v_branch));
  if (v_response->>'results_inserted')::integer<>1 or (v_response->>'steps_inserted')::integer<>1 then
    raise exception 'branch writer insert failed: %',v_response;
  end if;
  v_response := api.record_work_trace_branch_batch(md5('work-trace-test-run-writer')::uuid,jsonb_build_array(v_branch));
  if (v_response->>'results_inserted')::integer<>0 or (v_response->>'steps_inserted')::integer<>0 then
    raise exception 'branch writer is not idempotent: %',v_response;
  end if;

  v_need := jsonb_build_object(
    'evidence_need_id',md5('work-trace-test-need-writer')::uuid,
    'trace_run_id',md5('work-trace-test-run-writer')::uuid,
    'need_key','notice-to-regulation-writer','need_kind','RELATION_EVIDENCE_GAP',
    'required_evidence_description','사규예고와 개정 대상 규정을 직접 잇는 근거',
    'period_from','2020-01-01','period_to',null,
    'branch_result_ids',jsonb_build_array(md5('work-trace-test-result-writer')::uuid)
  );
  v_response := api.record_work_trace_evidence_need_batch(md5('work-trace-test-run-writer')::uuid,jsonb_build_array(v_need));
  if (v_response->>'needs_inserted')::integer<>1 then raise exception 'need writer insert failed: %',v_response; end if;

  v_response := api.finalize_work_trace_run(
    md5('work-trace-test-run-writer')::uuid,'work-trace-run-validation-v1'
  );
  if not (v_response->>'validated')::boolean then raise exception 'writer run not validated: %',v_response; end if;
end $$;

reset role;
rollback;
