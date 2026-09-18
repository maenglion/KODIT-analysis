select mapping_outcome,count(*) from core.organization_label_assessments
where org_contract_version='organization-v1' group by mapping_outcome order by mapping_outcome;
select relation_type,count(*) from core.organization_lineage_edges
where org_contract_version='organization-v1' group by relation_type order by relation_type;
select count(*) as self_loops from core.organization_lineage_edges where from_org_node_id=to_org_node_id;
