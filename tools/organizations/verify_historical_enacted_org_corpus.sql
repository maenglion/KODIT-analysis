select json_build_object(
  'documents',(select count(*) from core.organization_evidence_documents
    where evidence_key like 'ORGANIZATION_RULE:%' or evidence_key like 'BRANCH_OPERATION:%' or evidence_key like 'DELEGATION:%'),
  'versions',(select count(*) from core.organization_document_versions
    where version_contract_version='organization-document-version-v1' and version_status='HISTORICAL_FULLTEXT'),
  'effective_dates',(select count(*) from core.organization_document_versions
    where version_contract_version='organization-document-version-v1' and effective_date is not null),
  'version_chain_links',(select count(*) from core.organization_document_versions
    where version_contract_version='organization-document-version-v1' and previous_version_id is not null),
  'profiles',(select count(*) from core.temporal_function_profiles where profile_contract_version='temporal-function-profile-v2'),
  'assignments',(select count(*) from core.organization_function_assignments where assignment_contract_version='org-function-assignment-v4'),
  'duplicate_profiles',(select count(*) from (select profile_key,count(*) from core.temporal_function_profiles group by profile_key having count(*)>1) d),
  'duplicate_assignments',(select count(*) from (select assignment_key,count(*) from core.organization_function_assignments where assignment_contract_version='org-function-assignment-v4' group by assignment_key having count(*)>1) d),
  'broken_profile_fk',(select count(*) from core.temporal_function_profile_assignments l left join core.organization_function_assignments a using(function_assignment_id) where a.function_assignment_id is null),
  'proposal_rows',(select count(*) from core.organization_proposal_reconciliations where reconciliation_contract_version='proposal-enacted-reconciliation-v1'),
  'prior_v2',(select count(*) from core.organization_function_assignments where assignment_contract_version='org-function-assignment-v2'),
  'prior_v3',(select count(*) from core.organization_function_assignments where assignment_contract_version='org-function-assignment-v3')
) verification;
