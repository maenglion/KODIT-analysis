export type PublicWorkTraceTerminalOutcome =
  | "COMPLETE"
  | "SOURCE_DOCUMENT_GAP"
  | "RELATION_EVIDENCE_GAP"
  | "FUNCTION_CORRESPONDENCE_UNCONFIRMED"
  | "FUNCTION_MULTIPLE_CANDIDATES";

export type PublicWorkTraceCompletionScope =
  | "CURRENT_FUNCTION_OBSERVED"
  | "OFFICIAL_TRANSFER_PATH_VERIFIED";

export type PublicWorkTraceCorrespondenceBasis =
  | "FUNCTION_DIRECT"
  | "FUNCTION_PHRASE_CANDIDATE";

export type PublicWorkTraceEvidence = {
  evidence_no: string;
  reference_kind: string;
  title: string;
  source_url: string | null;
  source_date: string | null;
  effective_date: string | null;
};

export type PublicWorkTraceEndpoint = {
  current_org_key: string;
  current_org_name: string;
  correspondence_basis: PublicWorkTraceCorrespondenceBasis;
  correspondence_basis_label: string;
  observed_phrase: string;
  matched_phrase: string;
  evidence_numbers: string[];
};

export type PublicWorkTraceStep = {
  step_order: number;
  step_kind: string;
  step_basis: "OFFICIAL_DOCUMENT" | "EXISTING_ASSERTION" | "TEXT_COMPARISON";
  public_description: string;
  observed_at: string | null;
  effective_at: string | null;
  observed_phrase: string | null;
  matched_phrase: string | null;
  current_org_key: string | null;
  current_org_name: string | null;
  evidence_numbers: string[];
};

export type PublicWorkTraceBreak = {
  break_kind:
    | "SOURCE_DOCUMENT_GAP"
    | "RELATION_EVIDENCE_GAP"
    | "FUNCTION_CORRESPONDENCE_UNCONFIRMED";
  missing_relation: string;
  gap_from: string | null;
  gap_to: string | null;
  required_evidence_description: string;
  public_explanation: string;
};

export type PublicWorkTraceBranch = {
  public_branch_key: string;
  public_notice_key: string;
  notice: {
    posted_at: string;
    title: string;
    source_url: string | null;
  };
  regulation: {
    public_regulation_key: string;
    title: string;
    source_url: string | null;
  } | null;
  terminal_outcome: PublicWorkTraceTerminalOutcome;
  terminal_outcome_label: string;
  completion_scope: PublicWorkTraceCompletionScope | null;
  completion_scope_label: string | null;
  public_summary: string;
  last_verified_date: string | null;
  current_endpoint_count: number;
  steps: PublicWorkTraceStep[];
  break: PublicWorkTraceBreak | null;
  current_endpoints: PublicWorkTraceEndpoint[];
  corrected_by_later_run: boolean;
};

export type PublicWorkTraceNoticeAxisRow = {
  public_notice_key: string;
  posted_at: string;
  title: string;
  source_url: string | null;
  branch_count: number;
  public_branch_keys: string[];
  terminal_outcome_counts: Record<PublicWorkTraceTerminalOutcome, number>;
  current_org_count: number;
};

export type PublicWorkTraceRegulationAxisRow = {
  public_regulation_key: string;
  title: string;
  source_url: string | null;
  notice_count: number;
  branch_count: number;
  public_branch_keys: string[];
  terminal_outcome_counts: Record<PublicWorkTraceTerminalOutcome, number>;
  current_org_count: number;
  direct_current_org_count: number;
  candidate_current_org_count: number;
};

export type PublicWorkTraceOrganizationAxisRow = {
  current_org_key: string;
  current_org_name: string;
  notice_count: number;
  regulation_count: number;
  branch_count: number;
  direct_branch_count: number;
  candidate_branch_count: number;
  public_branch_keys: string[];
  public_regulation_keys: string[];
};

export type PublicWorkTraceResearchBacklogRow = {
  public_need_key: string;
  need_kind: "SOURCE_DOCUMENT_GAP" | "RELATION_EVIDENCE_GAP" | "FUNCTION_CORRESPONDENCE_UNCONFIRMED";
  required_evidence_description: string;
  period_from: string | null;
  period_to: string | null;
  current_affected_branch_count: number;
  affected_notice_count: number;
  affected_regulation_count: number;
  public_branch_keys: string[];
  last_evidence_numbers: string[];
};

export type PublicWorkTraceRunComparison = {
  previous_public_run_key: string;
  current_public_run_key: string;
  comparable_contract: boolean;
  primary_change_counts: Record<string, number>;
  evidence_added_branch_count: number;
  multiple_correspondence_transition_count: number;
  completion_scope_change_count: number;
  official_path_added_count: number;
};

export type PublicWorkTraceSnapshot = {
  snapshot_contract: "public-work-trace-snapshot-v1";
  trace_contract_version: string;
  validation_contract_version: string;
  relation_contract_version: string;
  public_run_key: string;
  parent_public_run_key: string | null;
  release_id: string;
  evidence_as_of: string;
  projected_at: string;
  summary: {
    notice_count: number;
    branch_count: number;
    regulation_count: number;
    current_organization_count: number;
    terminal_outcomes: Record<PublicWorkTraceTerminalOutcome, number>;
    completion_scopes: Record<string, number>;
    correspondence_basis: Record<PublicWorkTraceCorrespondenceBasis, number>;
    endpoint_width: Record<string, number>;
    official_current_function_observed: number;
    single_phrase_candidate_only: number;
    multiple_phrase_candidates: number;
    relation_evidence_gap: number;
  };
  branches: PublicWorkTraceBranch[];
  axes: {
    notices: PublicWorkTraceNoticeAxisRow[];
    regulations: PublicWorkTraceRegulationAxisRow[];
    current_organizations: PublicWorkTraceOrganizationAxisRow[];
  };
  evidence: PublicWorkTraceEvidence[];
  research_backlog: PublicWorkTraceResearchBacklogRow[];
  run_comparisons: PublicWorkTraceRunComparison[];
  data_literacy: Record<string, string>;
};
