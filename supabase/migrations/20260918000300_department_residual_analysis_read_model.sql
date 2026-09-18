begin;

create function publish.public_department_residual_analysis_rows()
returns table (
  release_id uuid,
  residual_id uuid,
  notice_id uuid,
  label_id uuid,
  raw_label text,
  normalized_label text,
  resolution_class text,
  label_type text,
  posted_at date,
  title text,
  source_location text,
  first_seen_at date,
  last_seen_at date,
  label_occurrence_count bigint,
  notice_count bigint,
  org_node_id uuid,
  org_official_name text,
  org_valid_from date,
  org_valid_to date,
  organization_assessment text
)
language sql
stable
security definer
set search_path = ''
as $$
  with current_residuals as (
    select o.*
    from publish.current_release c
    join publish.releases rel on rel.release_id=c.release_id
    join publish.notice_department_residual_occurrences o on o.release_id=rel.release_id
    where c.singleton_key and rel.status='approved'
      and o.residual_code='NOTICE_DEPARTMENT_UNMAPPED_RESIDUAL'
  ), classified as (
    select r.*,rl.label_id,l.normalized_label,e.resolved_label_type,
      case
        when e.resolved_label_type='PERSON' then 'PERSON_EVIDENCE'
        when e.resolved_label_type='ORG' and a.mapping_outcome='CURRENT_EXACT' then 'ORG_CURRENT'
        when e.resolved_label_type='ORG' and a.mapping_outcome='CONFIRMED_NODE' then 'ORG_HISTORICAL'
        when e.resolved_label_type='UNTYPED' then 'UNTYPED'
        when e.resolved_label_type='AMBIGUOUS' then 'AMBIGUOUS'
      end as resolution_class,
      m.first_seen_at,m.last_seen_at,a.mapping_outcome,a.org_node_id,
      n.official_name,n.valid_from,n.valid_to
    from current_residuals r
    join core.notice_department_residual_labels rl
      on rl.residual_id=r.residual_id and rl.label_contract_version='label-v1'
    join core.labels l on l.label_id=rl.label_id and l.label_contract_version=rl.label_contract_version
    join core.label_type_evidence e on e.label_id=l.label_id and e.label_contract_version=l.label_contract_version
    join core.label_metrics m on m.label_id=l.label_id and m.label_contract_version=l.label_contract_version
    left join core.organization_label_assessments a
      on a.label_id=l.label_id and a.label_contract_version=l.label_contract_version
     and a.org_contract_version='organization-v1'
    left join core.organization_nodes n on n.org_node_id=a.org_node_id
  ), counts as (
    select label_id,count(*)::bigint occurrence_count,count(distinct notice_id)::bigint notice_count
    from classified group by label_id
  )
  select x.release_id,x.residual_id,x.notice_id,x.label_id,x.raw_label,x.normalized_label,
    x.resolution_class,x.resolved_label_type,x.posted_at,x.title,x.source_location,
    x.first_seen_at,x.last_seen_at,c.occurrence_count,c.notice_count,
    x.org_node_id,x.official_name,x.valid_from,x.valid_to,x.mapping_outcome
  from classified x join counts c using(label_id)
  where x.resolution_class is not null
  order by x.posted_at desc,x.notice_id;
$$;

create function publish.public_department_residual_label_rows()
returns table (
  release_id uuid,
  label_id uuid,
  raw_label text,
  normalized_label text,
  resolution_class text,
  label_type text,
  first_seen_at date,
  last_seen_at date,
  residual_occurrence_count bigint,
  notice_count bigint,
  mention_occurrence_count bigint,
  extractor_rule_distribution jsonb,
  mention_source_locations jsonb,
  org_node_id uuid,
  org_official_name text,
  org_valid_from date,
  org_valid_to date,
  organization_assessment text,
  official_evidence_url text,
  lineage_edges jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with occurrence_rows as (
    select * from publish.public_department_residual_analysis_rows()
  ), labels as (
    select release_id,label_id,min(raw_label) raw_label,min(normalized_label) normalized_label,
      min(resolution_class) resolution_class,min(label_type) label_type,
      min(first_seen_at) first_seen_at,max(last_seen_at) last_seen_at,
      count(*)::bigint residual_occurrence_count,count(distinct notice_id)::bigint notice_count,
      (array_agg(org_node_id) filter (where org_node_id is not null))[1] org_node_id,
      min(org_official_name) org_official_name,
      min(org_valid_from) org_valid_from,min(org_valid_to) org_valid_to,
      min(organization_assessment) organization_assessment
    from occurrence_rows group by release_id,label_id
  ), mention_counts as (
    select ml.label_id,count(*)::bigint mention_occurrence_count
    from core.extraction_mention_labels ml
    join core.extraction_mentions m on m.mention_id=ml.mention_id
    where ml.label_contract_version='label-v1'
    group by ml.label_id
  ), rule_counts as (
    select label_id,jsonb_object_agg(extractor_rule,n order by extractor_rule) rules
    from (
      select ml.label_id,m.extractor_rule,count(*)::bigint n
      from core.extraction_mention_labels ml join core.extraction_mentions m on m.mention_id=ml.mention_id
      where ml.label_contract_version='label-v1' group by ml.label_id,m.extractor_rule
    ) x group by label_id
  ), source_distinct as (
    select distinct ml.label_id,sr.page_url
    from core.extraction_mention_labels ml
    join core.extraction_mentions m on m.mention_id=ml.mention_id
    join core.parser_runs pr on pr.extraction_id=m.extraction_id
    join core.source_attachment_observations sao on sao.attachment_observation_id=pr.attachment_observation_id
    join core.source_attachments sa on sa.attachment_id=sao.attachment_id
    join core.source_records sr on sr.source_record_id=sa.source_record_id
    where ml.label_contract_version='label-v1' and sr.page_url ~ '^https?://'
  ), source_ranked as (
    select label_id,page_url,row_number() over(partition by label_id order by page_url) rn
    from source_distinct
  ), sources as (
    select label_id,jsonb_agg(page_url order by page_url) locations
    from source_ranked where rn<=5 group by label_id
  )
  select l.release_id,l.label_id,l.raw_label,l.normalized_label,l.resolution_class,l.label_type,
    l.first_seen_at,l.last_seen_at,l.residual_occurrence_count,l.notice_count,
    coalesce(mc.mention_occurrence_count,0),coalesce(rc.rules,'{}'::jsonb),
    coalesce(s.locations,'[]'::jsonb),l.org_node_id,l.org_official_name,l.org_valid_from,
    l.org_valid_to,l.organization_assessment,ev.source_reference,
    coalesce((select jsonb_agg(jsonb_build_object(
      'relation_type',g.relation_type,'direction',case when g.from_org_node_id=l.org_node_id then 'OUTGOING' else 'INCOMING' end,
      'from_name',fn.official_name,'to_name',tn.official_name,'effective_date',g.effective_date,
      'edge_scope',g.edge_scope,'evidence_url',gev.source_reference) order by g.effective_date)
      from core.organization_lineage_edges g
      join core.organization_nodes fn on fn.org_node_id=g.from_org_node_id
      join core.organization_nodes tn on tn.org_node_id=g.to_org_node_id
      join core.organization_evidence gev on gev.organization_evidence_id=g.evidence_id
      where g.org_contract_version='organization-v1'
        and (g.from_org_node_id=l.org_node_id or g.to_org_node_id=l.org_node_id)), '[]'::jsonb)
  from labels l
  left join mention_counts mc using(label_id)
  left join rule_counts rc using(label_id)
  left join sources s using(label_id)
  left join core.organization_label_assessments a
    on a.label_id=l.label_id and a.label_contract_version='label-v1' and a.org_contract_version='organization-v1'
  left join core.organization_evidence ev on ev.organization_evidence_id=a.evidence_id
  order by l.residual_occurrence_count desc,l.normalized_label;
$$;

alter function publish.public_department_residual_analysis_rows() owner to postgres;
alter function publish.public_department_residual_label_rows() owner to postgres;
revoke all on function publish.public_department_residual_analysis_rows() from public,anon,authenticated,service_role;
revoke all on function publish.public_department_residual_label_rows() from public,anon,authenticated,service_role;
grant execute on function publish.public_department_residual_analysis_rows() to anon,authenticated,service_role;
grant execute on function publish.public_department_residual_label_rows() to anon,authenticated,service_role;

commit;
