begin;

create function publish.public_residual_display_label(
  p_label_type text,
  p_label text,
  p_opaque_id uuid
)
returns text
language sql
immutable
security invoker
set search_path=''
as $$
  select case
    when p_label_type='ORG' then coalesce(nullif(btrim(p_label),''),'미기재')
    when p_label_type='PERSON' then
      case
        when char_length(btrim(coalesce(p_label,'')))<=1 then '*'
        when char_length(btrim(p_label))=2 then left(btrim(p_label),1)||'*'
        else left(btrim(p_label),1)||repeat('*',char_length(btrim(p_label))-2)||right(btrim(p_label),1)
      end
    else '미분류 표기 · '||left(p_opaque_id::text,8)
  end;
$$;

comment on function publish.public_residual_display_label(text,text,uuid) is
  'Public display redaction only. ORG labels remain visible, PERSON labels are masked, and untyped/ambiguous observations receive an opaque label without changing the canonical ledger.';

alter function publish.public_residual_display_label(text,text,uuid) owner to postgres;
revoke all on function publish.public_residual_display_label(text,text,uuid) from public,anon,authenticated,service_role;

create or replace function publish.public_department_residual_analysis_rows_safe()
returns table (
  release_id uuid,residual_id uuid,notice_id uuid,label_id uuid,raw_label text,normalized_label text,
  resolution_class text,label_type text,posted_at date,title text,source_location text,
  first_seen_at date,last_seen_at date,label_occurrence_count bigint,notice_count bigint,
  org_node_id uuid,org_official_name text,org_valid_from date,org_valid_to date,organization_assessment text
)
language sql stable security definer set search_path=''
as $$
  select r.release_id,r.residual_id,r.notice_id,r.label_id,
    publish.public_residual_display_label(r.label_type,r.raw_label,r.label_id),
    publish.public_residual_display_label(r.label_type,r.normalized_label,r.label_id),
    r.resolution_class,r.label_type,r.posted_at,r.title,r.source_location,r.first_seen_at,r.last_seen_at,
    r.label_occurrence_count,r.notice_count,r.org_node_id,r.org_official_name,r.org_valid_from,r.org_valid_to,r.organization_assessment
  from publish.public_department_residual_analysis_rows() r;
$$;

create or replace function publish.public_department_residual_label_rows_safe()
returns table (
  release_id uuid,label_id uuid,raw_label text,normalized_label text,resolution_class text,label_type text,
  first_seen_at date,last_seen_at date,residual_occurrence_count bigint,notice_count bigint,mention_occurrence_count bigint,
  extractor_rule_distribution jsonb,mention_source_locations jsonb,org_node_id uuid,org_official_name text,
  org_valid_from date,org_valid_to date,organization_assessment text,official_evidence_url text,lineage_edges jsonb
)
language sql stable security definer set search_path=''
as $$
  select r.release_id,r.label_id,
    publish.public_residual_display_label(r.label_type,r.raw_label,r.label_id),
    publish.public_residual_display_label(r.label_type,r.normalized_label,r.label_id),
    r.resolution_class,r.label_type,r.first_seen_at,r.last_seen_at,r.residual_occurrence_count,r.notice_count,
    r.mention_occurrence_count,r.extractor_rule_distribution,r.mention_source_locations,r.org_node_id,
    r.org_official_name,r.org_valid_from,r.org_valid_to,r.organization_assessment,r.official_evidence_url,r.lineage_edges
  from publish.public_department_residual_label_rows() r;
$$;

create function publish.public_department_attribution_explanation_rows_safe()
returns table (
  release_id uuid,residual_id uuid,notice_id uuid,masked_label text,label_type text,posted_at date,title text,
  source_location text,inference_basis_code text,inference_basis_label text,responsible_org_as_of_notice text,
  current_functional_equivalent text,current_org_candidate text,work_context jsonb,path_steps jsonb,
  reasoning_steps jsonb,official_evidence jsonb
)
language sql stable security definer set search_path=''
as $$
  select r.release_id,r.residual_id,r.notice_id,
    case when r.label_type='ORG' then r.masked_label
      when r.label_type='PERSON' then r.masked_label
      else '미분류 표기 · '||left(r.residual_id::text,8) end,
    r.label_type,r.posted_at,r.title,r.source_location,r.inference_basis_code,r.inference_basis_label,
    r.responsible_org_as_of_notice,r.current_functional_equivalent,r.current_org_candidate,
    r.work_context,r.path_steps,r.reasoning_steps,r.official_evidence
  from publish.public_department_attribution_explanation_rows() r;
$$;

comment on function publish.public_department_attribution_explanation_rows_safe() is
  'Public attribution explanation contract with PERSON masking and opaque labels for observations whose semantic type is not confirmed.';

alter function publish.public_department_residual_analysis_rows_safe() owner to postgres;
alter function publish.public_department_residual_label_rows_safe() owner to postgres;
alter function publish.public_department_attribution_explanation_rows_safe() owner to postgres;
revoke all on function publish.public_department_attribution_explanation_rows() from anon,authenticated;
revoke all on function publish.public_department_attribution_explanation_rows_safe() from public,anon,authenticated,service_role;
grant execute on function publish.public_department_attribution_explanation_rows_safe() to anon,authenticated,service_role;

commit;
