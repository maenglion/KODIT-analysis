begin;

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
    case when r.label_type='PERSON' then
      case when char_length(btrim(r.raw_label))<=1 then '*'
        when char_length(btrim(r.raw_label))=2 then left(btrim(r.raw_label),1)||'*'
        else left(btrim(r.raw_label),1)||repeat('*',char_length(btrim(r.raw_label))-2)||right(btrim(r.raw_label),1) end
      else r.raw_label end,
    case when r.label_type='PERSON' then
      case when char_length(btrim(r.normalized_label))<=1 then '*'
        when char_length(btrim(r.normalized_label))=2 then left(btrim(r.normalized_label),1)||'*'
        else left(btrim(r.normalized_label),1)||repeat('*',char_length(btrim(r.normalized_label))-2)||right(btrim(r.normalized_label),1) end
      else r.normalized_label end,
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
    case when r.label_type='PERSON' then
      case when char_length(btrim(r.raw_label))<=1 then '*'
        when char_length(btrim(r.raw_label))=2 then left(btrim(r.raw_label),1)||'*'
        else left(btrim(r.raw_label),1)||repeat('*',char_length(btrim(r.raw_label))-2)||right(btrim(r.raw_label),1) end
      else r.raw_label end,
    case when r.label_type='PERSON' then
      case when char_length(btrim(r.normalized_label))<=1 then '*'
        when char_length(btrim(r.normalized_label))=2 then left(btrim(r.normalized_label),1)||'*'
        else left(btrim(r.normalized_label),1)||repeat('*',char_length(btrim(r.normalized_label))-2)||right(btrim(r.normalized_label),1) end
      else r.normalized_label end,
    r.resolution_class,r.label_type,r.first_seen_at,r.last_seen_at,r.residual_occurrence_count,r.notice_count,
    r.mention_occurrence_count,r.extractor_rule_distribution,r.mention_source_locations,r.org_node_id,
    r.org_official_name,r.org_valid_from,r.org_valid_to,r.organization_assessment,r.official_evidence_url,r.lineage_edges
  from publish.public_department_residual_label_rows() r;
$$;

comment on function publish.public_department_residual_analysis_rows_safe() is
  'Public-safe residual occurrence contract. Person-like lexical observations are masked before leaving Postgres.';
comment on function publish.public_department_residual_label_rows_safe() is
  'Public-safe residual label contract. Person-like lexical observations are masked before leaving Postgres.';

alter function publish.public_department_residual_analysis_rows_safe() owner to postgres;
alter function publish.public_department_residual_label_rows_safe() owner to postgres;
revoke all on function publish.public_department_residual_analysis_rows() from anon,authenticated;
revoke all on function publish.public_department_residual_label_rows() from anon,authenticated;
revoke all on function publish.public_department_residual_analysis_rows_safe() from public,anon,authenticated,service_role;
revoke all on function publish.public_department_residual_label_rows_safe() from public,anon,authenticated,service_role;
grant execute on function publish.public_department_residual_analysis_rows_safe() to anon,authenticated,service_role;
grant execute on function publish.public_department_residual_label_rows_safe() to anon,authenticated,service_role;

commit;
