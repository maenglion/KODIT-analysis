begin;

-- Service-only ingestion boundary for the append-only work-trace ledger.
-- Public clients never receive EXECUTE. Batches are idempotent: a repeated ID
-- is accepted only when the stored row still matches the supplied contract.

create function api.record_work_trace_evidence_batch(p_items jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_id uuid;
  v_rows integer;
  v_inserted integer := 0;
  v_actual jsonb;
begin
  if p_items is null or jsonb_typeof(p_items)<>'array' then
    raise exception 'work trace evidence payload must be a JSON array' using errcode='22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_id := (v_item->>'evidence_reference_id')::uuid;
    insert into core.work_trace_evidence_references(
      evidence_reference_id,evidence_contract_version,evidence_key,reference_kind,
      notice_id,regulation_id,regulation_version_id,organization_evidence_document_id,
      function_assignment_id,change_event_id,source_record_id,document_sha256,
      official_title,source_url,source_date,effective_date
    ) values(
      v_id,v_item->>'evidence_contract_version',v_item->>'evidence_key',v_item->>'reference_kind',
      nullif(v_item->>'notice_id','')::uuid,
      nullif(v_item->>'regulation_id','')::uuid,
      nullif(v_item->>'regulation_version_id','')::uuid,
      nullif(v_item->>'organization_evidence_document_id','')::uuid,
      nullif(v_item->>'function_assignment_id','')::uuid,
      nullif(v_item->>'change_event_id','')::uuid,
      nullif(v_item->>'source_record_id','')::uuid,
      nullif(v_item->>'document_sha256','')::char(64),
      v_item->>'official_title',nullif(v_item->>'source_url',''),
      nullif(v_item->>'source_date','')::date,nullif(v_item->>'effective_date','')::date
    ) on conflict do nothing;
    get diagnostics v_rows=row_count;
    v_inserted := v_inserted+v_rows;

    select to_jsonb(e)-'created_at' into v_actual
    from core.work_trace_evidence_references e where e.evidence_reference_id=v_id;
    if v_actual is null or not v_actual @> v_item then
      raise exception 'work trace evidence idempotency conflict: %',v_id using errcode='23505';
    end if;
  end loop;

  return jsonb_build_object('received',jsonb_array_length(p_items),'inserted',v_inserted);
end;
$$;

create function api.record_regulation_function_correspondence_batch(p_items jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_id uuid;
  v_rows integer;
  v_inserted integer := 0;
  v_actual jsonb;
begin
  if p_items is null or jsonb_typeof(p_items)<>'array' then
    raise exception 'regulation function correspondence payload must be a JSON array' using errcode='22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_id := core.regulation_function_correspondence_id(
      (v_item->>'regulation_id')::uuid,(v_item->>'function_assignment_id')::uuid,
      v_item->>'correspondence_basis',v_item->>'comparison_contract_version'
    );
    if v_item ? 'regulation_function_correspondence_id'
      and (v_item->>'regulation_function_correspondence_id')::uuid<>v_id then
      raise exception 'regulation function correspondence id mismatch' using errcode='23514';
    end if;

    insert into core.regulation_function_correspondences(
      regulation_id,function_assignment_id,org_node_id,correspondence_basis,
      comparison_contract_version,comparison_method,regulation_observed_text,
      function_observed_text,comparison_score,regulation_evidence_reference_id,
      function_evidence_reference_id
    ) values(
      (v_item->>'regulation_id')::uuid,(v_item->>'function_assignment_id')::uuid,
      (v_item->>'org_node_id')::uuid,v_item->>'correspondence_basis',
      v_item->>'comparison_contract_version',v_item->>'comparison_method',
      v_item->>'regulation_observed_text',v_item->>'function_observed_text',
      (v_item->>'comparison_score')::numeric,
      (v_item->>'regulation_evidence_reference_id')::uuid,
      (v_item->>'function_evidence_reference_id')::uuid
    ) on conflict do nothing;
    get diagnostics v_rows=row_count;
    v_inserted := v_inserted+v_rows;

    select to_jsonb(x)-'created_at' into v_actual
    from core.regulation_function_correspondences x
    where x.regulation_function_correspondence_id=v_id;
    if v_actual is null or not v_actual @> v_item then
      raise exception 'regulation function correspondence idempotency conflict: %',v_id using errcode='23505';
    end if;
  end loop;

  return jsonb_build_object('received',jsonb_array_length(p_items),'inserted',v_inserted);
end;
$$;

create function api.record_work_trace_run_header(
  p_run jsonb,
  p_added_evidence jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run_id uuid;
  v_item jsonb;
  v_rows integer;
  v_inserted integer := 0;
  v_linked integer := 0;
  v_actual jsonb;
begin
  if p_run is null or jsonb_typeof(p_run)<>'object' then
    raise exception 'work trace run payload must be a JSON object' using errcode='22023';
  end if;
  if p_added_evidence is null or jsonb_typeof(p_added_evidence)<>'array' then
    raise exception 'added evidence payload must be a JSON array' using errcode='22023';
  end if;
  if p_run->>'run_result'<>'COMPLETED' then
    raise exception 'writer accepts completed trace runs only' using errcode='22023';
  end if;

  v_run_id := (p_run->>'trace_run_id')::uuid;
  insert into core.work_trace_runs(
    trace_run_id,parent_trace_run_id,release_id,trace_contract_version,
    evidence_corpus_digest,evidence_cutoff_date,started_at,completed_at,
    run_result,failure_detail
  ) values(
    v_run_id,nullif(p_run->>'parent_trace_run_id','')::uuid,
    (p_run->>'release_id')::uuid,p_run->>'trace_contract_version',
    (p_run->>'evidence_corpus_digest')::char(64),(p_run->>'evidence_cutoff_date')::date,
    (p_run->>'started_at')::timestamptz,(p_run->>'completed_at')::timestamptz,
    p_run->>'run_result',nullif(p_run->>'failure_detail','')
  ) on conflict do nothing;
  get diagnostics v_rows=row_count;
  v_inserted := v_inserted+v_rows;

  if not exists (
    select 1 from core.work_trace_runs r
    where r.trace_run_id=v_run_id
      and r.parent_trace_run_id is not distinct from nullif(p_run->>'parent_trace_run_id','')::uuid
      and r.release_id=(p_run->>'release_id')::uuid
      and r.trace_contract_version=p_run->>'trace_contract_version'
      and r.evidence_corpus_digest=(p_run->>'evidence_corpus_digest')::char(64)
      and r.evidence_cutoff_date=(p_run->>'evidence_cutoff_date')::date
      and r.started_at=(p_run->>'started_at')::timestamptz
      and r.completed_at=(p_run->>'completed_at')::timestamptz
      and r.run_result=p_run->>'run_result'
      and r.failure_detail is not distinct from nullif(p_run->>'failure_detail','')
  ) then
    raise exception 'work trace run idempotency conflict: %',v_run_id using errcode='23505';
  end if;

  for v_item in select value from jsonb_array_elements(p_added_evidence) loop
    insert into core.work_trace_run_evidence_references(
      trace_run_id,evidence_reference_id,added_reason
    ) values(
      v_run_id,(v_item->>'evidence_reference_id')::uuid,v_item->>'added_reason'
    ) on conflict do nothing;
    get diagnostics v_rows=row_count;
    v_linked := v_linked+v_rows;
  end loop;

  return jsonb_build_object('trace_run_id',v_run_id,'run_inserted',v_inserted,
    'added_evidence_links_inserted',v_linked);
end;
$$;

create function api.record_work_trace_branch_batch(
  p_trace_run_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_case jsonb;
  v_result jsonb;
  v_step jsonb;
  v_link jsonb;
  v_break jsonb;
  v_correspondence jsonb;
  v_correction jsonb;
  v_trace_case_id uuid;
  v_branch_result_id uuid;
  v_rows integer;
  v_cases integer := 0;
  v_results integer := 0;
  v_steps integer := 0;
  v_links integer := 0;
  v_breaks integer := 0;
  v_correspondences integer := 0;
  v_corrections integer := 0;
  v_actual jsonb;
begin
  if p_items is null or jsonb_typeof(p_items)<>'array' then
    raise exception 'work trace branch payload must be a JSON array' using errcode='22023';
  end if;
  if not exists(select 1 from core.work_trace_runs r where r.trace_run_id=p_trace_run_id) then
    raise exception 'unknown work trace run: %',p_trace_run_id using errcode='23503';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_case := v_item->'case';
    v_result := v_item->'result';
    if jsonb_typeof(v_case)<>'object' or jsonb_typeof(v_result)<>'object' then
      raise exception 'branch item requires case and result objects' using errcode='22023';
    end if;

    v_trace_case_id := core.work_trace_case_id(
      (v_case->>'notice_id')::uuid,nullif(v_case->>'regulation_id','')::uuid,
      v_case->>'work_observation_key'
    );
    if v_case ? 'trace_case_id' and (v_case->>'trace_case_id')::uuid<>v_trace_case_id then
      raise exception 'trace case id mismatch' using errcode='23514';
    end if;

    insert into core.work_trace_cases(
      notice_id,regulation_id,work_observation_id,work_observation_key,observation_kind
    ) values(
      (v_case->>'notice_id')::uuid,nullif(v_case->>'regulation_id','')::uuid,
      nullif(v_case->>'work_observation_id','')::uuid,v_case->>'work_observation_key',
      v_case->>'observation_kind'
    ) on conflict do nothing;
    get diagnostics v_rows=row_count;
    v_cases := v_cases+v_rows;

    select to_jsonb(c)-'created_at' into v_actual
    from core.work_trace_cases c where c.trace_case_id=v_trace_case_id;
    if v_actual is null or not v_actual @> (v_case || jsonb_build_object('trace_case_id',v_trace_case_id)) then
      raise exception 'work trace case idempotency conflict: %',v_trace_case_id using errcode='23505';
    end if;

    v_branch_result_id := (v_result->>'branch_result_id')::uuid;
    if (v_result->>'trace_run_id')::uuid<>p_trace_run_id
      or (v_result->>'trace_case_id')::uuid<>v_trace_case_id then
      raise exception 'branch result run/case mismatch' using errcode='23514';
    end if;
    insert into core.work_trace_branch_results(
      branch_result_id,trace_run_id,trace_case_id,terminal_outcome,completion_scope,
      last_verified_date,last_verified_step_id,public_summary
    ) values(
      v_branch_result_id,p_trace_run_id,v_trace_case_id,v_result->>'terminal_outcome',
      nullif(v_result->>'completion_scope',''),nullif(v_result->>'last_verified_date','')::date,
      (v_result->>'last_verified_step_id')::uuid,v_result->>'public_summary'
    ) on conflict do nothing;
    get diagnostics v_rows=row_count;
    v_results := v_results+v_rows;

    select to_jsonb(r)-'created_at' into v_actual
    from core.work_trace_branch_results r where r.branch_result_id=v_branch_result_id;
    if v_actual is null or not v_actual @> v_result then
      raise exception 'branch result idempotency conflict: %',v_branch_result_id using errcode='23505';
    end if;

    if jsonb_typeof(coalesce(v_item->'steps','[]'::jsonb))<>'array' then
      raise exception 'branch steps must be a JSON array' using errcode='22023';
    end if;
    for v_step in select value from jsonb_array_elements(coalesce(v_item->'steps','[]'::jsonb)) loop
      if (v_step->>'branch_result_id')::uuid<>v_branch_result_id then
        raise exception 'trace step branch mismatch' using errcode='23514';
      end if;
      insert into core.work_trace_steps(
        trace_step_id,branch_result_id,step_order,step_kind,relation_kind,step_basis,
        notice_id,regulation_id,work_observation_id,function_assignment_id,org_node_id,
        change_event_id,observed_at,effective_at,observed_phrase,matched_phrase,step_description
      ) values(
        (v_step->>'trace_step_id')::uuid,v_branch_result_id,(v_step->>'step_order')::integer,
        v_step->>'step_kind',v_step->>'relation_kind',v_step->>'step_basis',
        nullif(v_step->>'notice_id','')::uuid,nullif(v_step->>'regulation_id','')::uuid,
        nullif(v_step->>'work_observation_id','')::uuid,
        nullif(v_step->>'function_assignment_id','')::uuid,nullif(v_step->>'org_node_id','')::uuid,
        nullif(v_step->>'change_event_id','')::uuid,nullif(v_step->>'observed_at','')::date,
        nullif(v_step->>'effective_at','')::date,nullif(v_step->>'observed_phrase',''),
        nullif(v_step->>'matched_phrase',''),v_step->>'step_description'
      ) on conflict do nothing;
      get diagnostics v_rows=row_count;
      v_steps := v_steps+v_rows;

      select to_jsonb(s)-'created_at' into v_actual
      from core.work_trace_steps s where s.trace_step_id=(v_step->>'trace_step_id')::uuid;
      if v_actual is null or not v_actual @> (v_step-'evidence_links') then
        raise exception 'trace step idempotency conflict: %',v_step->>'trace_step_id' using errcode='23505';
      end if;

      if jsonb_typeof(coalesce(v_step->'evidence_links','[]'::jsonb))<>'array' then
        raise exception 'step evidence_links must be a JSON array' using errcode='22023';
      end if;
      for v_link in select value from jsonb_array_elements(coalesce(v_step->'evidence_links','[]'::jsonb)) loop
        insert into core.work_trace_step_evidence_links(
          trace_step_id,evidence_reference_id,evidence_role,citation_order
        ) values(
          (v_step->>'trace_step_id')::uuid,(v_link->>'evidence_reference_id')::uuid,
          v_link->>'evidence_role',(v_link->>'citation_order')::integer
        ) on conflict do nothing;
        get diagnostics v_rows=row_count;
        v_links := v_links+v_rows;
      end loop;
    end loop;

    v_break := v_item->'branch_break';
    if v_break is not null and jsonb_typeof(v_break)<>'null' then
      if (v_break->>'branch_result_id')::uuid<>v_branch_result_id then
        raise exception 'branch break result mismatch' using errcode='23514';
      end if;
      insert into core.work_trace_branch_breaks(
        branch_result_id,break_kind,after_step_id,next_known_step_id,missing_relation,
        gap_from,gap_to,required_evidence_description,public_explanation
      ) values(
        v_branch_result_id,v_break->>'break_kind',nullif(v_break->>'after_step_id','')::uuid,
        nullif(v_break->>'next_known_step_id','')::uuid,v_break->>'missing_relation',
        nullif(v_break->>'gap_from','')::date,nullif(v_break->>'gap_to','')::date,
        v_break->>'required_evidence_description',v_break->>'public_explanation'
      ) on conflict do nothing;
      get diagnostics v_rows=row_count;
      v_breaks := v_breaks+v_rows;
    end if;

    if jsonb_typeof(coalesce(v_item->'correspondences','[]'::jsonb))<>'array' then
      raise exception 'branch correspondences must be a JSON array' using errcode='22023';
    end if;
    for v_correspondence in select value from jsonb_array_elements(coalesce(v_item->'correspondences','[]'::jsonb)) loop
      if (v_correspondence->>'branch_result_id')::uuid<>v_branch_result_id then
        raise exception 'branch correspondence result mismatch' using errcode='23514';
      end if;
      insert into core.work_trace_function_correspondences(
        correspondence_id,branch_result_id,trace_step_id,regulation_function_correspondence_id,
        org_node_id,function_assignment_id,correspondence_basis,comparison_contract_version,
        observed_phrase,matched_phrase,comparison_score
      ) values(
        (v_correspondence->>'correspondence_id')::uuid,v_branch_result_id,
        (v_correspondence->>'trace_step_id')::uuid,
        (v_correspondence->>'regulation_function_correspondence_id')::uuid,
        (v_correspondence->>'org_node_id')::uuid,
        (v_correspondence->>'function_assignment_id')::uuid,
        v_correspondence->>'correspondence_basis',
        v_correspondence->>'comparison_contract_version',
        v_correspondence->>'observed_phrase',v_correspondence->>'matched_phrase',
        nullif(v_correspondence->>'comparison_score','')::numeric
      ) on conflict do nothing;
      get diagnostics v_rows=row_count;
      v_correspondences := v_correspondences+v_rows;
    end loop;

    v_correction := v_item->'correction';
    if v_correction is not null and jsonb_typeof(v_correction)<>'null' then
      if (v_correction->>'superseding_result_id')::uuid<>v_branch_result_id then
        raise exception 'branch correction superseding result mismatch' using errcode='23514';
      end if;
      insert into core.work_trace_branch_corrections(
        correction_id,superseded_result_id,superseding_result_id,
        correction_reason_code,correction_explanation,correction_evidence_reference_id,
        recorded_at
      ) values(
        (v_correction->>'correction_id')::uuid,
        (v_correction->>'superseded_result_id')::uuid,v_branch_result_id,
        v_correction->>'correction_reason_code',v_correction->>'correction_explanation',
        (v_correction->>'correction_evidence_reference_id')::uuid,
        coalesce(nullif(v_correction->>'recorded_at','')::timestamptz,now())
      ) on conflict do nothing;
      get diagnostics v_rows=row_count;
      v_corrections := v_corrections+v_rows;
    end if;
  end loop;

  return jsonb_build_object(
    'received',jsonb_array_length(p_items),'cases_inserted',v_cases,
    'results_inserted',v_results,'steps_inserted',v_steps,'evidence_links_inserted',v_links,
    'breaks_inserted',v_breaks,'correspondences_inserted',v_correspondences,
    'corrections_inserted',v_corrections
  );
end;
$$;

create function api.record_work_trace_evidence_need_batch(
  p_trace_run_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_branch jsonb;
  v_need_id uuid;
  v_rows integer;
  v_needs integer := 0;
  v_links integer := 0;
begin
  if p_items is null or jsonb_typeof(p_items)<>'array' then
    raise exception 'work trace evidence need payload must be a JSON array' using errcode='22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if (v_item->>'trace_run_id')::uuid<>p_trace_run_id then
      raise exception 'evidence need run mismatch' using errcode='23514';
    end if;
    v_need_id := (v_item->>'evidence_need_id')::uuid;
    insert into core.work_trace_evidence_needs(
      evidence_need_id,trace_run_id,need_key,need_kind,required_evidence_description,
      period_from,period_to
    ) values(
      v_need_id,p_trace_run_id,v_item->>'need_key',v_item->>'need_kind',
      v_item->>'required_evidence_description',nullif(v_item->>'period_from','')::date,
      nullif(v_item->>'period_to','')::date
    ) on conflict do nothing;
    get diagnostics v_rows=row_count;
    v_needs := v_needs+v_rows;

    if jsonb_typeof(coalesce(v_item->'branch_result_ids','[]'::jsonb))<>'array' then
      raise exception 'evidence need branch_result_ids must be a JSON array' using errcode='22023';
    end if;
    for v_branch in select value from jsonb_array_elements(coalesce(v_item->'branch_result_ids','[]'::jsonb)) loop
      insert into core.work_trace_evidence_need_branches(evidence_need_id,branch_result_id)
      values(v_need_id,(v_branch#>>'{}')::uuid)
      on conflict do nothing;
      get diagnostics v_rows=row_count;
      v_links := v_links+v_rows;
    end loop;
  end loop;
  return jsonb_build_object('received',jsonb_array_length(p_items),'needs_inserted',v_needs,
    'branch_links_inserted',v_links);
end;
$$;

create function api.finalize_work_trace_run(
  p_trace_run_id uuid,
  p_validation_contract_version text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_branches bigint;
begin
  select count(*) into v_branches
  from core.work_trace_branch_results where trace_run_id=p_trace_run_id;
  if v_branches=0 then
    raise exception 'work trace run has no branch results' using errcode='23514';
  end if;
  perform core.validate_work_trace_run(p_trace_run_id,p_validation_contract_version);
  return jsonb_build_object(
    'trace_run_id',p_trace_run_id,
    'validation_contract_version',p_validation_contract_version,
    'branch_count',v_branches,
    'validated',true
  );
end;
$$;

alter function api.record_work_trace_evidence_batch(jsonb) owner to postgres;
alter function api.record_regulation_function_correspondence_batch(jsonb) owner to postgres;
alter function api.record_work_trace_run_header(jsonb,jsonb) owner to postgres;
alter function api.record_work_trace_branch_batch(uuid,jsonb) owner to postgres;
alter function api.record_work_trace_evidence_need_batch(uuid,jsonb) owner to postgres;
alter function api.finalize_work_trace_run(uuid,text) owner to postgres;

revoke all on function api.record_work_trace_evidence_batch(jsonb) from public,anon,authenticated,service_role;
revoke all on function api.record_regulation_function_correspondence_batch(jsonb) from public,anon,authenticated,service_role;
revoke all on function api.record_work_trace_run_header(jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function api.record_work_trace_branch_batch(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function api.record_work_trace_evidence_need_batch(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function api.finalize_work_trace_run(uuid,text) from public,anon,authenticated,service_role;

grant execute on function api.record_work_trace_evidence_batch(jsonb) to service_role;
grant execute on function api.record_regulation_function_correspondence_batch(jsonb) to service_role;
grant execute on function api.record_work_trace_run_header(jsonb,jsonb) to service_role;
grant execute on function api.record_work_trace_branch_batch(uuid,jsonb) to service_role;
grant execute on function api.record_work_trace_evidence_need_batch(uuid,jsonb) to service_role;
grant execute on function api.finalize_work_trace_run(uuid,text) to service_role;

commit;
