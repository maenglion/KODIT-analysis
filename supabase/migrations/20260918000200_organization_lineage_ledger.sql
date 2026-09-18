begin;

create table core.organization_evidence (
  organization_evidence_id uuid primary key,
  org_contract_version text not null,
  evidence_key text not null,
  source_kind text not null check (source_kind in (
    'OFFICIAL_CURRENT_ORGANIZATION_PAGE','OFFICIAL_POLICY_HISTORY',
    'OFFICIAL_CORPUS_MENTION','OFFICIAL_PRESS_RELEASE')),
  source_record_id uuid references core.source_records(source_record_id) on delete restrict,
  mention_id uuid references core.extraction_mentions(mention_id) on delete restrict,
  source_reference text not null,
  observed_name text not null,
  evidence_date date not null,
  effective_from date,
  effective_to date,
  evidence_strength text not null check (evidence_strength in (
    'OFFICIAL_DIRECT','OFFICIAL_DERIVED','CORPUS_CORROBORATION')),
  evidence_text text,
  evidence_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (org_contract_version, evidence_key),
  check (nullif(btrim(observed_name),'') is not null),
  check (source_reference ~ '^https?://'),
  check (effective_to is null or effective_from is null or effective_from <= effective_to)
);

create table core.organization_nodes (
  org_node_id uuid primary key,
  org_contract_version text not null,
  node_key text not null,
  official_name text not null,
  valid_from date,
  valid_to date,
  node_status text not null check (node_status in ('CONFIRMED','PARTIAL_WINDOW')),
  primary_evidence_id uuid not null references core.organization_evidence(organization_evidence_id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (org_contract_version, node_key),
  check (nullif(btrim(official_name),'') is not null),
  check (valid_to is null or valid_from is null or valid_from <= valid_to)
);

create table core.organization_label_assessments (
  label_id uuid not null,
  label_contract_version text not null,
  org_contract_version text not null,
  mapping_outcome text not null check (mapping_outcome in (
    'CURRENT_EXACT','CONFIRMED_NODE','MULTIPLE_NODE_CANDIDATES',
    'NO_OFFICIAL_EVIDENCE','TEMP_OR_SUBUNIT','UNRESOLVED')),
  org_node_id uuid references core.organization_nodes(org_node_id) on delete restrict,
  evidence_id uuid references core.organization_evidence(organization_evidence_id) on delete restrict,
  unresolved_reason text,
  observation_first_seen date,
  observation_last_seen date,
  created_at timestamptz not null default now(),
  primary key (label_id, label_contract_version, org_contract_version),
  foreign key (label_id, label_contract_version)
    references core.labels(label_id, label_contract_version) on delete restrict,
  check (observation_last_seen is null or observation_first_seen is null or observation_first_seen <= observation_last_seen),
  check (
    (mapping_outcome in ('CURRENT_EXACT','CONFIRMED_NODE') and org_node_id is not null and evidence_id is not null and unresolved_reason is null)
    or
    (mapping_outcome not in ('CURRENT_EXACT','CONFIRMED_NODE') and org_node_id is null and unresolved_reason is not null)
  )
);

create table core.organization_label_node_relations (
  label_node_relation_id uuid primary key,
  label_id uuid not null,
  label_contract_version text not null,
  org_node_id uuid not null references core.organization_nodes(org_node_id) on delete restrict,
  org_contract_version text not null,
  relation_type text not null check (relation_type = 'AS_OF'),
  time_basis text not null check (time_basis in ('SOURCE_OBSERVATION_RANGE','CURRENT_OFFICIAL_SNAPSHOT')),
  observed_from date,
  observed_to date,
  evidence_id uuid not null references core.organization_evidence(organization_evidence_id) on delete restrict,
  relation_status text not null check (relation_status = 'CONFIRMED'),
  created_at timestamptz not null default now(),
  unique (label_id, label_contract_version, org_contract_version, org_node_id, relation_type),
  foreign key (label_id, label_contract_version)
    references core.labels(label_id, label_contract_version) on delete restrict,
  check (observed_to is null or observed_from is null or observed_from <= observed_to)
);

create table core.organization_lineage_edges (
  lineage_edge_id uuid primary key,
  org_contract_version text not null,
  from_org_node_id uuid not null references core.organization_nodes(org_node_id) on delete restrict,
  to_org_node_id uuid not null references core.organization_nodes(org_node_id) on delete restrict,
  relation_type text not null check (relation_type in (
    'RENAMED_TO','MERGED_INTO','SPLIT_INTO','FUNCTION_TRANSFERRED_TO','SUCCEEDED_BY')),
  effective_date date not null,
  edge_scope text not null,
  evidence_id uuid not null references core.organization_evidence(organization_evidence_id) on delete restrict,
  evidence_status text not null check (evidence_status = 'OFFICIAL_DIRECT'),
  created_at timestamptz not null default now(),
  unique (org_contract_version, from_org_node_id, to_org_node_id, relation_type, effective_date, edge_scope),
  check (from_org_node_id <> to_org_node_id),
  check (nullif(btrim(edge_scope),'') is not null)
);

comment on table core.organization_nodes is
  'Evidence-backed, time-aware institutional units. A lexical ORG label is not an organization node.';
comment on table core.organization_label_assessments is
  'Exhaustive T05 assessment of label-v1 ORG labels, including explicitly unresolved extractor contamination.';
comment on table core.organization_lineage_edges is
  'Official-evidence lineage only. FUNCTION_TRANSFERRED_TO records a scoped function, not whole-organization identity.';

create trigger organization_evidence_append_only before update or delete on core.organization_evidence
for each row execute function core.reject_history_mutation();
create trigger organization_nodes_append_only before update or delete on core.organization_nodes
for each row execute function core.reject_history_mutation();
create trigger organization_label_assessments_append_only before update or delete on core.organization_label_assessments
for each row execute function core.reject_history_mutation();
create trigger organization_label_node_relations_append_only before update or delete on core.organization_label_node_relations
for each row execute function core.reject_history_mutation();
create trigger organization_lineage_edges_append_only before update or delete on core.organization_lineage_edges
for each row execute function core.reject_history_mutation();

alter table core.organization_evidence enable row level security;
alter table core.organization_evidence force row level security;
alter table core.organization_nodes enable row level security;
alter table core.organization_nodes force row level security;
alter table core.organization_label_assessments enable row level security;
alter table core.organization_label_assessments force row level security;
alter table core.organization_label_node_relations enable row level security;
alter table core.organization_label_node_relations force row level security;
alter table core.organization_lineage_edges enable row level security;
alter table core.organization_lineage_edges force row level security;

revoke all on core.organization_evidence, core.organization_nodes,
  core.organization_label_assessments, core.organization_label_node_relations,
  core.organization_lineage_edges from public, anon, authenticated, service_role;
grant select, insert on core.organization_evidence, core.organization_nodes,
  core.organization_label_assessments, core.organization_label_node_relations,
  core.organization_lineage_edges to service_role;

commit;
