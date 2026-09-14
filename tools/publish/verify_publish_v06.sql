with expected_tables(name) as (
  values ('releases'), ('current_release'), ('regulations'), ('regulation_sources'),
    ('notices'), ('regulation_changes'), ('spec_registry')
), forbidden_columns(name) as (
  values ('confidence'), ('confidence_level'), ('human_confirmed'), ('residual'),
    ('parser_failure'), ('reevaluation_state'), ('raw_claim_check'), ('internal_notes'),
    ('traceback'), ('publication_department')
), publish_references(classid, objid) as (
  select 'pg_class'::regclass, c.oid
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'publish'
  union all
  select 'pg_proc'::regclass, p.oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'publish'
), existing_references(classid, objid) as (
  select 'pg_class'::regclass, c.oid
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('core', 'case', 'api')
  union all
  select 'pg_proc'::regclass, p.oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('core', 'case', 'api')
), existing_dependents(classid, objid) as (
  select * from existing_references
  union all
  select 'pg_rewrite'::regclass, rw.oid
  from pg_rewrite rw
  join pg_class c on c.oid = rw.ev_class
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('core', 'case', 'api')
)
select
  (select count(*) from publish.releases) as releases_count,
  (select count(*) from publish.current_release) as current_release_count,
  (select count(*) from publish.regulations) as regulations_count,
  (select count(*) from publish.regulation_sources) as regulation_sources_count,
  (select count(*) from publish.notices) as notices_count,
  (select count(*) from publish.regulation_changes) as regulation_changes_count,
  (select count(*) from publish.spec_registry) as spec_registry_count,
  (select count(*) from publish.regulations where source_location is not null) as source_location_non_null,
  (select count(*) from publish.regulations where source_location is null) as source_location_null,
  (select count(*) from publish.regulations where notice_department is not null) as notice_department_non_null,
  (select count(*) from publish.regulations where revision_date is not null) as revision_date_non_null,
  (select count(*) from publish.regulation_sources where document_sha256 is not null) as document_source_linkage,
  (select count(*) from publish.regulations where partial_alio) as partial_alio,
  (select count(*) from publish.regulations where partial_kodit_page) as partial_kodit_page,
  (select count(*) from publish.regulations where partial_attachment) as partial_attachment,
  (select count(*) from publish.regulations where is_new or is_updated) as baseline_change_flags,
  (select release_id from publish.current_release where singleton_key) as current_release_id,
  (select status from publish.releases r join publish.current_release c using (release_id) where c.singleton_key) as current_release_status,
  (select bool_and(c.relrowsecurity and c.relforcerowsecurity)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'publish' and c.relkind = 'r') as all_publish_tables_rls_forced,
  (select count(*) = 7 from pg_tables t join expected_tables e on e.name = t.tablename where t.schemaname = 'publish') as expected_table_count,
  (select count(*) = 0 from information_schema.columns c join forbidden_columns f on f.name = c.column_name where c.table_schema = 'publish') as forbidden_column_count_zero,
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'publish' and p.proname like 'public\_%' escape '\') as public_rpcs_definer_fixed_path,
  (select count(*) = 4
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'publish' and p.proname like 'public\_%' escape '\'
     and has_function_privilege('anon', p.oid, 'EXECUTE')
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')) as four_public_rpcs_allowed,
  (select bool_and(not has_table_privilege('anon', format('%I.%I', schemaname, tablename), 'SELECT')
                   and not has_table_privilege('authenticated', format('%I.%I', schemaname, tablename), 'SELECT'))
   from pg_tables where schemaname = 'publish') as publish_base_tables_denied,
  (select count(*) = 1 and bool_and(release_id = '9a87d0c2-2901-5fc8-bceb-f068f02b697a'::uuid)
   from publish.current_release) as singleton_points_to_baseline,
  (select count(*) = 1
   from pg_constraint con
   join pg_class rel on rel.oid = con.conrelid
   join pg_namespace n on n.oid = rel.relnamespace
   where n.nspname = 'publish' and rel.relname = 'current_release'
     and con.contype = 'p') as current_release_has_single_pk,
  (select count(*) = 1
   from pg_constraint con
   join pg_class rel on rel.oid = con.conrelid
   join pg_namespace n on n.oid = rel.relnamespace
   where n.nspname = 'publish' and rel.relname = 'current_release'
     and con.contype = 'c'
     and pg_get_constraintdef(con.oid) ilike '%singleton_key = true%') as singleton_true_check_present,
  (select count(*) = 1
   from pg_constraint con
   join pg_class rel on rel.oid = con.conrelid
   join pg_namespace n on n.oid = rel.relnamespace
   where n.nspname = 'publish' and rel.relname = 'current_release'
     and con.contype = 'f'
     and pg_get_constraintdef(con.oid) ilike '%references publish.releases(release_id)%') as current_release_release_fk_present,
  (select count(*) = 0
   from pg_constraint con
   join pg_class rel on rel.oid = con.conrelid
   join pg_namespace n on n.oid = rel.relnamespace
   join pg_class refrel on refrel.oid = con.confrelid
   join pg_namespace refn on refn.oid = refrel.relnamespace
   where con.contype = 'f'
     and ((n.nspname = 'publish' and refn.nspname in ('core', 'case', 'api'))
       or (n.nspname in ('core', 'case', 'api') and refn.nspname = 'publish'))) as no_cross_schema_foreign_keys,
  (select count(*) = 0
   from pg_depend d
   join existing_dependents o on o.classid = d.classid and o.objid = d.objid
   join publish_references r on r.classid = d.refclassid and r.objid = d.refobjid) as existing_catalog_objects_do_not_depend_on_publish,
  (select count(*) = 0
   from pg_depend d
   join publish_references o on o.classid = d.classid and o.objid = d.objid
   join existing_references r on r.classid = d.refclassid and r.objid = d.refobjid) as publish_catalog_objects_do_not_depend_on_existing,
  (select count(*) = 1 from supabase_migrations.schema_migrations where version = '20260914000100') as migration_recorded;
