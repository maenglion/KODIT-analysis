begin;

create or replace function publish.public_department_attribution_explanation_rows()
returns table (
  release_id uuid,
  residual_id uuid,
  notice_id uuid,
  masked_label text,
  label_type text,
  posted_at date,
  title text,
  source_location text,
  inference_basis_code text,
  inference_basis_label text,
  responsible_org_as_of_notice text,
  current_functional_equivalent text,
  current_org_candidate text,
  work_context jsonb,
  path_steps jsonb,
  reasoning_steps jsonb,
  official_evidence jsonb
)
language sql
stable
security definer
set search_path=''
as $$
  with current_residuals as (
    select o.*
    from publish.current_release c
    join publish.releases rel on rel.release_id=c.release_id and rel.status='approved'
    join publish.notice_department_residual_occurrences o on o.release_id=rel.release_id
    where c.singleton_key and o.residual_code='NOTICE_DEPARTMENT_UNMAPPED_RESIDUAL'
  ), typed as (
    select r.*,te.resolved_label_type
    from current_residuals r
    join core.notice_department_residual_labels rl
      on rl.residual_id=r.residual_id and rl.label_contract_version='label-v1'
    join core.label_type_evidence te
      on te.label_id=rl.label_id and te.label_contract_version=rl.label_contract_version
  ), selected as (
    select t.*,r.run_id,r.final_status,r.historical_org_node_id,r.current_org_node_id,
      r.current_candidate_org_node_id
    from typed t
    left join lateral (
      select x.* from core.org_work_attribution_runs x
      where x.release_id=t.release_id and x.residual_id=t.residual_id
      order by x.completed_at desc,x.created_at desc,x.attribution_contract_version desc,x.run_id desc
      limit 1
    ) r on true
  ), classified as (
    select s.*,
      case
        when s.run_id is null then 'INSUFFICIENT_EVIDENCE'
        when s.final_status='DIRECT_ASOF_ORG_CONFIRMED' then 'CONFIRMED_DIRECT_OBSERVATION'
        when s.final_status='CURRENT_FUNCTION_PATH_CONFIRMED' and exists(
          select 1 from core.org_work_attribution_evidence e
          where e.run_id=s.run_id and e.evidence_kind='FUNCTION_ASSIGNMENT'
        ) then 'CONFIRMED_ORG_CHANGE_AND_FUNCTION'
        when s.final_status='CURRENT_FUNCTION_PATH_CONFIRMED' then 'CONFIRMED_ORG_CHANGE'
        when s.final_status in ('HISTORICAL_WORK_ORG_SUPPORTED','CURRENT_FUNCTION_DIRECT_CONFIRMED') then 'LIKELY_OFFICIAL_FUNCTION'
        when exists(select 1 from core.org_work_attribution_candidates c where c.run_id=s.run_id and c.candidate_status='AMBIGUOUS') then 'MULTIPLE_CANDIDATES'
        when exists(select 1 from core.org_work_attribution_candidates c where c.run_id=s.run_id and c.candidate_status in ('CURRENT_ANALOG_CANDIDATE','HISTORICAL_ANALOG_CANDIDATE') and c.work_overlap>0) then 'INFERRED_WORK_SIMILARITY'
        when exists(select 1 from core.org_work_attribution_candidates c where c.run_id=s.run_id and c.candidate_status in ('CURRENT_ANALOG_CANDIDATE','HISTORICAL_ANALOG_CANDIDATE')) then 'INFERRED_SEMANTIC_CANDIDATE'
        else 'INSUFFICIENT_EVIDENCE'
      end inference_code
    from selected s
  )
  select x.release_id,x.residual_id,x.notice_id,
    case
      when x.resolved_label_type='PERSON' then
        case
          when char_length(btrim(x.raw_label))<=1 then '*'
          when char_length(btrim(x.raw_label))=2 then left(btrim(x.raw_label),1)||'*'
          else left(btrim(x.raw_label),1)||repeat('*',char_length(btrim(x.raw_label))-2)||right(btrim(x.raw_label),1)
        end
      else coalesce(nullif(btrim(x.raw_label),''),'미기재')
    end,
    x.resolved_label_type,x.posted_at,x.title,x.source_location,x.inference_code,
    case x.inference_code
      when 'CONFIRMED_DIRECT_OBSERVATION' then '확실(직접 관측)'
      when 'CONFIRMED_ORG_CHANGE' then '확실(조직개편)'
      when 'CONFIRMED_ORG_CHANGE_AND_FUNCTION' then '확실(조직개편·업무귀속)'
      when 'LIKELY_OFFICIAL_FUNCTION' then '유력(공식 업무귀속)'
      when 'INFERRED_WORK_SIMILARITY' then '추정(업무 유사)'
      when 'INFERRED_SEMANTIC_CANDIDATE' then '추정(시맨틱 후보)'
      when 'MULTIPLE_CANDIDATES' then '복수 후보'
      else '근거 부족'
    end,
    hn.official_name,cn.official_name,ccn.official_name,
    coalesce((select to_jsonb(w.work_strings) from core.notice_work_contexts w
      where w.release_id=x.release_id and w.residual_id=x.residual_id
      order by w.created_at desc limit 1),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'step_order',p.step_order,'from_name',fn.official_name,'to_name',tn.official_name,
      'relation_type',p.relation_type,'effective_date',p.effective_date,
      'work_scope_match',p.work_scope_match,'evidence_title',d.official_title,'evidence_url',d.source_url
    ) order by p.step_order)
      from core.org_work_attribution_path_steps p
      join core.organization_nodes fn on fn.org_node_id=p.from_org_node_id
      join core.organization_nodes tn on tn.org_node_id=p.to_org_node_id
      join core.organization_evidence_documents d on d.organization_evidence_document_id=p.organization_evidence_document_id
      where p.run_id=x.run_id),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'step_order',s.step_order,'step_type',s.step_type,'result_description',s.result_description,'step_status',s.step_status
    ) order by s.step_order) from core.org_work_attribution_steps s where s.run_id=x.run_id),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'evidence_kind',q.evidence_kind,'document_title',q.official_title,'document_type',q.document_type,
      'evidence_date',q.evidence_date,'source_url',q.source_url
    ) order by q.evidence_date nulls last,q.official_title) from (
      select distinct e.evidence_kind,d.official_title,d.document_type,
        coalesce(e.evidence_date,d.effective_date,d.source_date) evidence_date,d.source_url
      from core.org_work_attribution_evidence e
      left join core.organization_evidence_documents d
        on d.organization_evidence_document_id=e.organization_evidence_document_id
      where e.run_id=x.run_id and e.evidence_kind in ('ORGANIZATION_DOCUMENT','ORGANIZATION_OBSERVATION','CHANGE_EVENT','FUNCTION_ASSIGNMENT','ANCHOR_NOTICE')
    ) q),'[]'::jsonb)
  from classified x
  left join core.organization_nodes hn on hn.org_node_id=x.historical_org_node_id
  left join core.organization_nodes cn on cn.org_node_id=x.current_org_node_id
  left join core.organization_nodes ccn on ccn.org_node_id=x.current_candidate_org_node_id
  order by x.posted_at desc,x.notice_id;
$$;

comment on function publish.public_department_attribution_explanation_rows() is
  'Public-safe current-release explanation of the immutable T06 attribution ledger. Person-like labels are masked; candidate organizations remain separate from confirmed organizations.';

alter function publish.public_department_attribution_explanation_rows() owner to postgres;
revoke all on function publish.public_department_attribution_explanation_rows() from public,anon,authenticated,service_role;
grant execute on function publish.public_department_attribution_explanation_rows() to anon,authenticated,service_role;

commit;
