begin;

-- The former safe functions mixed PERSON observations with organization-shaped
-- columns. Hiding those values in the UI is not a public contract boundary, so
-- PERSON observations and organization attribution are now separate schemas.

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
  from publish.public_department_residual_analysis_rows() r
  where r.label_type <> 'PERSON';
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
  from publish.public_department_residual_label_rows() r
  where r.label_type <> 'PERSON';
$$;

create or replace function publish.public_person_residual_observation_rows()
returns table (
  public_alias text,
  posted_at date,
  title text,
  source_location text,
  observation_count bigint
)
language sql stable security definer set search_path=''
as $$
  select
    publish.public_residual_display_label(r.label_type,r.raw_label,r.label_id),
    r.posted_at,
    r.title,
    r.source_location,
    1::bigint
  from publish.public_department_residual_analysis_rows() r
  where r.label_type='PERSON'
  order by r.posted_at desc,r.title,r.source_location;
$$;

comment on function publish.public_person_residual_observation_rows() is
  'Minimal PERSON observation contract. It exposes only the approved alias and public source observation; no internal identifier or organization-shaped field is returned.';

create or replace function publish.public_organization_attribution_explanation_rows()
returns table (
  release_id uuid,residual_id uuid,notice_id uuid,display_label text,posted_at date,title text,
  source_location text,inference_basis_code text,inference_basis_label text,responsible_org_as_of_notice text,
  current_functional_equivalent text,current_org_candidate text,work_context jsonb,path_steps jsonb,
  reasoning_steps jsonb,official_evidence jsonb
)
language sql stable security definer set search_path=''
as $$
  select r.release_id,r.residual_id,r.notice_id,r.masked_label,r.posted_at,r.title,
    r.source_location,r.inference_basis_code,r.inference_basis_label,r.responsible_org_as_of_notice,
    r.current_functional_equivalent,r.current_org_candidate,r.work_context,r.path_steps,
    r.reasoning_steps,r.official_evidence
  from publish.public_department_attribution_explanation_rows_safe() r
  where r.label_type='ORG'
  order by r.posted_at desc,r.notice_id;
$$;

comment on function publish.public_organization_attribution_explanation_rows() is
  'ORG-only public attribution explanation. PERSON aliases, label identifiers and mention identifiers are outside this return schema.';

alter function publish.public_department_residual_analysis_rows_safe() owner to postgres;
alter function publish.public_department_residual_label_rows_safe() owner to postgres;
alter function publish.public_person_residual_observation_rows() owner to postgres;
alter function publish.public_organization_attribution_explanation_rows() owner to postgres;

revoke all on function publish.public_department_attribution_explanation_rows() from public,anon,authenticated,service_role;
revoke all on function publish.public_department_attribution_explanation_rows_safe() from public,anon,authenticated,service_role;
revoke all on function publish.public_department_residual_analysis_rows_safe() from public,anon,authenticated,service_role;
revoke all on function publish.public_department_residual_label_rows_safe() from public,anon,authenticated,service_role;
revoke all on function publish.public_person_residual_observation_rows() from public,anon,authenticated,service_role;
revoke all on function publish.public_organization_attribution_explanation_rows() from public,anon,authenticated,service_role;

grant execute on function publish.public_department_residual_analysis_rows_safe() to anon,authenticated,service_role;
grant execute on function publish.public_department_residual_label_rows_safe() to anon,authenticated,service_role;
grant execute on function publish.public_person_residual_observation_rows() to anon,authenticated,service_role;
grant execute on function publish.public_organization_attribution_explanation_rows() to anon,authenticated,service_role;

notify pgrst, 'reload schema';

commit;
