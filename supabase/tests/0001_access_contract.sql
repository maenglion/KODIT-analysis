begin;
create extension if not exists pgtap with schema extensions;
select plan(50);

select is(
  (select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')),
  0,
  'public has no application relations'
);
select ok(exists(select 1 from pg_namespace where nspname = 'core'), 'core schema exists');
select ok(exists(select 1 from pg_namespace where nspname = 'case'), 'case schema exists');
select ok(exists(select 1 from pg_namespace where nspname = 'api'), 'api schema exists');

select ok(not has_schema_privilege('anon', 'core', 'USAGE'), 'anon cannot use core');
select ok(not has_schema_privilege('authenticated', 'core', 'USAGE'), 'authenticated cannot use core');
select ok(not has_schema_privilege('anon', 'case', 'USAGE'), 'anon cannot use case');
select ok(not has_schema_privilege('authenticated', 'case', 'USAGE'), 'authenticated cannot use case');
select ok(has_schema_privilege('anon', 'api', 'USAGE'), 'anon can use api');
select ok(has_schema_privilege('authenticated', 'api', 'USAGE'), 'authenticated can use api');

select ok(
  not exists(
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('core', 'case') and c.relkind in ('r', 'p') and not c.relrowsecurity
  ),
  'RLS is enabled on every raw table'
);
select ok(
  not exists(
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('core', 'case') and c.relkind in ('r', 'p') and not c.relforcerowsecurity
  ),
  'RLS is forced on every raw table'
);
select ok(
  not exists(
    select 1 from information_schema.table_privileges
    where table_schema = 'core' and grantee = 'anon'
  ),
  'anon has no core table grant'
);
select ok(
  not exists(
    select 1 from information_schema.table_privileges
    where table_schema = 'core' and grantee = 'authenticated'
  ),
  'authenticated has no core table grant'
);
select ok(
  not exists(
    select 1 from information_schema.table_privileges
    where table_schema = 'case' and grantee in ('anon', 'authenticated')
  ),
  'browser roles have no case table grants'
);

select is(
  (select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'api' and c.relkind = 'v' and coalesce(c.reloptions, '{}') @> array['security_invoker=true']),
  (select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'api' and c.relkind = 'v'),
  'all api views are security_invoker'
);
select ok(has_table_privilege('anon', 'api.public_regulations', 'SELECT'), 'anon can select public regulations view');
select ok(has_table_privilege('anon', 'api.public_facts', 'SELECT'), 'anon can select public facts view');
select ok(has_table_privilege('anon', 'api.public_releases', 'SELECT'), 'anon can select published releases view');
select ok(has_table_privilege('anon', 'api.public_claims', 'SELECT'), 'anon can select public claims view');
select ok(not has_table_privilege('anon', 'api.office_claims', 'SELECT'), 'anon cannot select office view');
select ok(not has_table_privilege('anon', 'api.internal_verification_queue', 'SELECT'), 'anon cannot select internal view');

select ok(not exists(select 1 from pg_roles where rolname = 'office'), 'office is not a PostgreSQL role');
select ok(not exists(select 1 from pg_roles where rolname = 'internal'), 'internal is not a PostgreSQL role');
select ok(not exists(select 1 from pg_roles where rolname = 'case'), 'case is not a PostgreSQL role');
select ok(
  not exists(
    select 1
    from pg_constraint fk
    join pg_class source_table on source_table.oid = fk.conrelid
    join pg_namespace source_schema on source_schema.oid = source_table.relnamespace
    join pg_class target_table on target_table.oid = fk.confrelid
    join pg_namespace target_schema on target_schema.oid = target_table.relnamespace
    where fk.contype = 'f' and source_schema.nspname = 'core' and target_schema.nspname = 'case'
  ),
  'core never references case'
);
select ok(
  not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api' and pg_get_functiondef(p.oid) like '%"case".%'
  ),
  'api functions never read case'
);
select ok(
  not exists(select 1 from pg_policies where schemaname = 'storage' and policyname like 'kodit_%'),
  'initial database migration creates no KODIT Storage policy'
);
select ok(
  not exists(select 1 from pg_policies where schemaname = 'storage' and coalesce(qual, '') like '%case-documents%'),
  'case-documents has no browser read policy'
);
select is(
  (select count(*)::integer from storage.buckets where id in ('core-documents', 'case-documents', 'release-artifacts')),
  0,
  'initial database migration creates no KODIT bucket'
);

select ok(
  not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api' and p.proname like 'admin_%'
  ),
  'operating api contains no test administration function'
);
select is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'api'),
  10,
  'api contains only the ten allowlisted access and row functions'
);
select ok(
  not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api' and not p.prosecdef
  ),
  'all api functions are SECURITY DEFINER'
);
select ok(
  not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api'
      and not exists(select 1 from unnest(coalesce(p.proconfig, array[]::text[])) setting where setting like 'search_path=%')
  ),
  'all api functions pin search_path'
);
select ok(
  not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api' and pg_get_userbyid(p.proowner) <> 'postgres'
  ),
  'all api definer functions have the explicit postgres owner'
);
select ok(
  not exists(
    select 1 from information_schema.routine_privileges
    where specific_schema = 'api' and grantee = 'PUBLIC' and privilege_type = 'EXECUTE'
  ),
  'PostgreSQL default EXECUTE TO PUBLIC is removed from every api function'
);
select ok(has_function_privilege('anon', 'api.public_regulation_rows()', 'EXECUTE'),
  'anon can execute a public row function required by its invoker view');
select ok(not has_function_privilege('anon', 'api.current_access_level()', 'EXECUTE'),
  'anon cannot inspect authenticated access level');
select ok(not has_function_privilege('anon', 'api.office_claim_rows()', 'EXECUTE'),
  'anon cannot execute office row function');
select ok(has_function_privilege('authenticated', 'api.current_access_level()', 'EXECUTE'),
  'authenticated can resolve its own access level');
select ok(has_function_privilege('authenticated', 'api.has_access(text)', 'EXECUTE'),
  'authenticated can evaluate the access gate');
select ok(has_function_privilege('authenticated', 'api.office_claim_rows()', 'EXECUTE'),
  'authenticated can enter the office function before its runtime gate');
select ok(has_function_privilege('authenticated', 'api.internal_verification_queue_rows()', 'EXECUTE'),
  'authenticated can enter the internal function before its runtime gate');
select ok(
  not exists(
    select 1 from information_schema.routine_privileges
    where specific_schema = 'api' and grantee = 'service_role' and privilege_type = 'EXECUTE'
  ),
  'service_role has no API execution grant used as an access-test shortcut'
);
select ok(
  not exists(
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'api' and c.relkind = 'v' and pg_get_viewdef(c.oid) like '%"case".%'
  ),
  'api views never read case'
);
select ok((select rolbypassrls from pg_roles where rolname = 'postgres'),
  'api definer owner bypasses RLS, so function filters are the effective boundary');
select ok(
  not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api'
      and pg_get_functiondef(p.oid) ~* '(insert[[:space:]]+into|update|delete[[:space:]]+from|merge[[:space:]]+into)[[:space:]]+core\.'
  ),
  'no operating api function can mutate core access profiles or data'
);
select throws_ok(
  $$ select api.has_access('owner') $$,
  '22023',
  'invalid required access level',
  'has_access rejects unrecognised caller input'
);
select ok(
  not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'core' and p.prosecdef
  ),
  'core trigger functions remain SECURITY INVOKER'
);
select ok(
  not exists(
    select 1 from information_schema.routine_privileges
    where specific_schema = 'core'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
      and privilege_type = 'EXECUTE'
  ),
  'browser roles have no EXECUTE grant on core trigger functions'
);

select * from finish();
rollback;
