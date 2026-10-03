begin;

do $$
declare
  v bigint;
begin
  select count(*) into v
  from core.work_trace_branch_results r
  left join core.work_trace_branch_breaks b using(branch_result_id)
  where (r.terminal_outcome in (
      'SOURCE_DOCUMENT_GAP','RELATION_EVIDENCE_GAP','FUNCTION_CORRESPONDENCE_UNCONFIRMED'
    ) and (b.branch_result_id is null or b.break_kind<>r.terminal_outcome))
    or (r.terminal_outcome in ('COMPLETE','FUNCTION_MULTIPLE_CANDIDATES') and b.branch_result_id is not null);
  if v<>0 then raise exception 'terminal outcome / break mismatch: %',v; end if;

  select count(*) into v
  from core.work_trace_branch_results r
  where (r.terminal_outcome='COMPLETE')<>(r.completion_scope is not null);
  if v<>0 then raise exception 'completion scope mismatch: %',v; end if;

  select count(*) into v
  from core.work_trace_branch_results r
  where r.terminal_outcome='FUNCTION_MULTIPLE_CANDIDATES'
    and (select count(distinct c.org_node_id)
         from core.work_trace_function_correspondences c
         where c.branch_result_id=r.branch_result_id)<2;
  if v<>0 then raise exception 'multiple correspondence has fewer than two organizations: %',v; end if;

  select count(*) into v
  from core.work_trace_branch_results r
  where r.terminal_outcome<>'FUNCTION_MULTIPLE_CANDIDATES'
    and (select count(distinct c.org_node_id)
         from core.work_trace_function_correspondences c
         where c.branch_result_id=r.branch_result_id)>1;
  if v<>0 then raise exception 'multi-org correspondence without multiple outcome: %',v; end if;

  select count(*) into v
  from core.work_trace_evidence_need_branches nb
  join core.work_trace_branch_results r on r.branch_result_id=nb.branch_result_id
  where r.terminal_outcome in ('COMPLETE','FUNCTION_MULTIPLE_CANDIDATES');
  if v<>0 then raise exception 'completed/multiple branch leaked into research backlog: %',v; end if;

  select count(*) into v
  from core.work_trace_branch_results r
  join core.work_trace_branch_breaks b using(branch_result_id)
  where r.last_verified_date>b.gap_from;
  if v<>0 then raise exception 'last_verified_date after gap_from: %',v; end if;

  select count(*) into v from (
    select s.trace_step_id
    from core.work_trace_steps s
    left join core.work_trace_step_evidence_links l using(trace_step_id)
    group by s.trace_step_id
    having count(l.evidence_reference_id)=0
  ) q;
  if v<>0 then raise exception 'steps without evidence reference: %',v; end if;

  select count(*) into v
  from core.work_trace_steps s
  where s.step_basis='TEXT_COMPARISON'
    and (
      not exists(select 1 from core.work_trace_step_evidence_links l
        where l.trace_step_id=s.trace_step_id and l.evidence_role='SUPPORTS_TEXT_COMPARISON_SOURCE')
      or not exists(select 1 from core.work_trace_step_evidence_links l
        where l.trace_step_id=s.trace_step_id and l.evidence_role='SUPPORTS_TEXT_COMPARISON_TARGET')
    );
  if v<>0 then raise exception 'text-comparison steps missing source/target evidence: %',v; end if;

  select count(*) into v
  from core.work_trace_function_correspondences c
  join core.work_trace_steps s on s.trace_step_id=c.trace_step_id
  join core.organization_function_assignments a on a.function_assignment_id=c.function_assignment_id
  join core.regulation_function_correspondences rf
    on rf.regulation_function_correspondence_id=c.regulation_function_correspondence_id
  where s.branch_result_id<>c.branch_result_id
    or a.org_node_id<>c.org_node_id
    or rf.regulation_id is distinct from s.regulation_id
    or rf.function_assignment_id<>c.function_assignment_id
    or rf.org_node_id<>c.org_node_id
    or rf.correspondence_basis<>c.correspondence_basis
    or rf.comparison_contract_version<>c.comparison_contract_version
    or (c.correspondence_basis='FUNCTION_DIRECT' and s.step_basis<>'OFFICIAL_DOCUMENT')
    or (c.correspondence_basis='FUNCTION_PHRASE_CANDIDATE' and s.step_basis<>'TEXT_COMPARISON');
  if v<>0 then raise exception 'correspondence provenance mismatch: %',v; end if;

  select count(*) into v
  from core.work_trace_branch_corrections c
  join core.work_trace_branch_results old on old.branch_result_id=c.superseded_result_id
  join core.work_trace_branch_results new on new.branch_result_id=c.superseding_result_id
  where old.trace_case_id<>new.trace_case_id;
  if v<>0 then raise exception 'correction links different trace cases: %',v; end if;

  select count(*) into v
  from analytics.work_trace_run_deltas d
  where d.primary_change_class='SHORTENED_CORRECTION'
    and not exists (
      select 1 from core.work_trace_branch_corrections c
      where c.superseded_result_id=d.previous_result_id
        and c.superseding_result_id=d.current_result_id
    );
  if v<>0 then raise exception 'shortened branch without correction relation: %',v; end if;

  select count(*) into v
  from analytics.work_trace_run_deltas d
  where not d.comparable_contract and d.primary_change_class is not null;
  if v<>0 then raise exception 'cross-contract run classified as evidence effect: %',v; end if;
end $$;

select jsonb_build_object(
  'trace_cases',(select count(*) from core.work_trace_cases),
  'regulation_function_correspondences',(select count(*) from core.regulation_function_correspondences),
  'trace_runs',(select count(*) from core.work_trace_runs),
  'validated_runs',(select count(distinct trace_run_id) from core.work_trace_run_validations),
  'branch_results',(select count(*) from core.work_trace_branch_results),
  'steps',(select count(*) from core.work_trace_steps),
  'evidence_links',(select count(*) from core.work_trace_step_evidence_links),
  'multiple_correspondence',(select count(*) from core.work_trace_branch_results where terminal_outcome='FUNCTION_MULTIPLE_CANDIDATES'),
  'research_backlog_branches',(select coalesce(sum(current_affected_branch_count),0) from analytics.work_trace_research_backlog),
  'corrections',(select count(*) from core.work_trace_branch_corrections)
) verification;

rollback;
