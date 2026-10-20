begin;

-- Case records never feed core/api/public projections. No browser policies.
create schema if not exists "case";
create table "case".bethel_documents (
  document_id text primary key,
  sha256 text not null unique check (sha256 ~ '^[a-f0-9]{64}$'),
  filename text not null,
  format text not null,
  intake_basis text not null,
  parse_status text not null,
  original_storage_key text,
  created_at timestamptz not null default now()
);
create table "case".bethel_extractions (
  document_id text primary key references "case".bethel_documents,
  native_blocks jsonb not null check(jsonb_typeof(native_blocks)='array'),
  ocr_blocks jsonb not null check(jsonb_typeof(ocr_blocks)='array'),
  parser_run jsonb,
  ocr_review_status text not null default 'unverified'
    check(ocr_review_status in ('unverified','partial_visual_review','verified')),
  updated_at timestamptz not null default now()
);
create table "case".bethel_correspondence (
  document_id text primary key references "case".bethel_documents,
  sender text, recipient text, subject_person text,
  document_date date, sent_at timestamptz, received_at timestamptz,
  procedure text check(procedure in ('information_disclosure','personal_data_access','document_transmission','other','mixed','unknown')),
  direction text check(direction in ('request','reply','reference','unknown')),
  round_claimed integer check(round_claimed>0),
  round_confirmed integer check(round_confirmed>0),
  dispatch_status text not null default 'unverified',
  receipt_status text not null default 'unverified',
  receipt_number text,
  reply_to text references "case".bethel_documents,
  metadata_review text not null default 'pending',
  metadata_evidence jsonb not null default '[]'::jsonb,
  notes text
);
create table "case".bethel_evidence (
  evidence_id text primary key,
  document_id text not null references "case".bethel_documents,
  locator text not null,
  speaker text not null,
  passage_role text not null check(passage_role in ('request_text','reply_text','attachment','secondary_summary','litigation_argument')),
  topic text not null,
  quotation text not null,
  proposition text not null,
  epistemic_status text not null check(epistemic_status in ('document_statement','verified_external_fact','inference','unresolved')),
  visual_review boolean not null default false
);
create table "case".bethel_questions (
  question_id text primary key,
  stage integer not null check(stage between 1 and 3),
  authority text not null,
  question text not null,
  evidence_ids text[] not null default '{}',
  status text not null default 'not_sent',
  reply_document_id text references "case".bethel_documents
);
create table "case".bethel_relations (
  source_id text not null references "case".bethel_documents,
  target_id text not null references "case".bethel_documents,
  relation text not null check(relation in ('replies_to','corrects','same_content_candidate','attachment_of','supersedes_draft')),
  basis text not null,
  review_status text not null default 'candidate',
  primary key(source_id,target_id,relation),
  check(source_id<>target_id)
);
create table "case".bethel_response_items (
  item_id text primary key,
  topic text not null,
  request_document_id text references "case".bethel_documents,
  request_locator text,
  reply_document_id text not null references "case".bethel_documents,
  reply_locator text not null,
  response_status text not null check(response_status in
    ('substantive','partial','prior_reference','refusal','outside_scope','unanswered','correction','stated_absence')),
  match_basis text not null check(match_basis in ('topic_only','explicit_reference','request_not_supplied')),
  assessment text not null,
  intent_assessed boolean not null default false check(intent_assessed=false)
);

do $$
declare t text;
begin
  foreach t in array array['bethel_documents','bethel_extractions','bethel_correspondence','bethel_evidence','bethel_questions','bethel_relations','bethel_response_items'] loop
    execute format('alter table "case".%I enable row level security',t);
    execute format('revoke all on table "case".%I from public, anon, authenticated',t);
    execute format('grant select, insert, update on table "case".%I to service_role',t);
  end loop;
end $$;
grant usage on schema "case" to service_role;

comment on table "case".bethel_evidence is 'A statement being present in a reply does not establish the truth of that statement. Native and OCR locators remain distinct.';
comment on table "case".bethel_correspondence is 'Filename rounds and file timestamps never establish dispatch, receipt, or a confirmed procedural round.';
commit;
