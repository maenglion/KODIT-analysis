do $$
declare
  v_occ integer;
  v_labels integer;
  v_category_labels integer;
  v_category_occ integer;
  v_exact integer;
  v_broken_notice_fk integer;
  v_broken_label_fk integer;
  v_broken_org_fk integer;
  v_duplicate_occurrences integer;
  v_regulations integer;
  v_notices integer;
  v_notice_links integer;
  v_attachments integer;
  v_observations integer;
  v_parser_runs integer;
  v_extractions integer;
  v_mentions integer;
  v_all_labels integer;
  v_org_nodes integer;
  v_org_relations integer;
  v_lineage_edges integer;
begin
  select count(*) into v_occ from publish.public_department_residual_analysis_rows();
  select count(*) into v_labels from publish.public_department_residual_label_rows();
  select count(*),sum(residual_occurrence_count) into v_category_labels,v_category_occ
  from publish.public_department_residual_label_rows();
  if v_occ<>1272 then raise exception 'occurrence mismatch %',v_occ; end if;
  if v_labels<>355 or v_category_labels<>355 then raise exception 'label mismatch %, %',v_labels,v_category_labels; end if;
  if v_category_occ<>1272 then raise exception 'category occurrence mismatch %',v_category_occ; end if;

  select count(*) into v_exact
  from publish.public_notice_rows()
  where publish.is_v06_canonical_notice_department(notice_department);
  if v_exact<>817 or v_exact+v_occ<>2089 then
    raise exception 'notice partition mismatch exact %, residual %, total %',v_exact,v_occ,v_exact+v_occ;
  end if;

  select count(*) into v_broken_notice_fk
  from publish.notice_department_residual_occurrences o
  left join publish.notices n on n.release_id=o.release_id and n.notice_id=o.notice_id
  where n.notice_id is null;
  select count(*) into v_broken_label_fk
  from core.notice_department_residual_labels rl
  left join core.labels l on l.label_id=rl.label_id and l.label_contract_version=rl.label_contract_version
  where l.label_id is null;
  select count(*) into v_broken_org_fk
  from core.organization_label_node_relations r
  left join core.organization_nodes n on n.org_node_id=r.org_node_id
  where n.org_node_id is null;
  select count(*) into v_duplicate_occurrences
  from (
    select release_id,notice_id,residual_code
    from publish.notice_department_residual_occurrences
    group by release_id,notice_id,residual_code having count(*)>1
  ) d;
  if v_broken_notice_fk+v_broken_label_fk+v_broken_org_fk+v_duplicate_occurrences<>0 then
    raise exception 'broken ledger links notice %, label %, org %, duplicate %',
      v_broken_notice_fk,v_broken_label_fk,v_broken_org_fk,v_duplicate_occurrences;
  end if;

  select count(*) into v_regulations from publish.public_regulation_rows();
  select count(*) into v_notices from publish.public_notice_rows();
  select coalesce(sum(cardinality(linked_regulation_version_ids)),0) into v_notice_links from publish.public_notice_rows();
  select count(*) into v_attachments from core.source_attachments;
  select count(*) into v_observations from core.source_attachment_observations;
  select count(*) into v_parser_runs from core.parser_runs;
  select count(*) into v_extractions from core.document_extractions;
  select count(*) into v_mentions from core.extraction_mentions;
  select count(*) into v_all_labels from core.labels;
  select count(*) into v_org_nodes from core.organization_nodes;
  select count(*) into v_org_relations from core.organization_label_node_relations;
  select count(*) into v_lineage_edges from core.organization_lineage_edges;

  if (v_regulations,v_notices,v_notice_links,v_attachments,v_observations,v_parser_runs,
      v_extractions,v_mentions,v_all_labels,v_org_nodes,v_org_relations,v_lineage_edges)
     is distinct from (1041,2089,3775,2414,2414,2414,2397,20937,2209,27,27,2) then
    raise exception 'protected ledger counts changed: %', jsonb_build_object(
      'regulations',v_regulations,'notices',v_notices,'notice_links',v_notice_links,
      'attachments',v_attachments,'observations',v_observations,'parser_runs',v_parser_runs,
      'extractions',v_extractions,'mentions',v_mentions,'labels',v_all_labels,
      'org_nodes',v_org_nodes,'org_relations',v_org_relations,'lineage_edges',v_lineage_edges
    );
  end if;
end $$;

select resolution_class,count(*) labels,sum(residual_occurrence_count) occurrences
from publish.public_department_residual_label_rows()
group by resolution_class order by resolution_class;
