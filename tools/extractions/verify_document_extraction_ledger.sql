-- Run after 20260917000200_document_extraction_ledger.sql.
-- This file is read-only and returns contract facts for an applied database.
select
  count(*) filter (where c.relrowsecurity) = 4 as all_rls_enabled,
  count(*) filter (where c.relforcerowsecurity) = 4 as all_rls_forced,
  count(*) = 4 as expected_table_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'core'
  and c.relname = any (array[
    'source_attachments',
    'source_attachment_observations',
    'document_extractions',
    'parser_runs'
  ])
  and c.relkind = 'r';

select
  count(*) = 0 as browser_table_grants_absent
from information_schema.role_table_grants
where table_schema = 'core'
  and table_name = any (array[
    'source_attachments',
    'source_attachment_observations',
    'document_extractions',
    'parser_runs'
  ])
  and grantee in ('PUBLIC', 'anon', 'authenticated');

select
  count(*) = 4 as append_only_trigger_count
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'core'
  and c.relname = any (array[
    'source_attachments',
    'source_attachment_observations',
    'document_extractions',
    'parser_runs'
  ])
  and not t.tgisinternal
  and t.tgname like '%append_only';

select
  has_function_privilege(
    'service_role',
    'core.record_parser_execution(uuid,jsonb,jsonb)',
    'EXECUTE'
  ) as service_role_can_record,
  not has_function_privilege(
    'anon',
    'core.record_parser_execution(uuid,jsonb,jsonb)',
    'EXECUTE'
  ) as anon_cannot_record,
  not has_function_privilege(
    'authenticated',
    'core.record_parser_execution(uuid,jsonb,jsonb)',
    'EXECUTE'
  ) as authenticated_cannot_record;
