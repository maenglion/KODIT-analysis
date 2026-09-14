with catalog as (
  select 'column' kind, n.nspname schema_name, c.relname object_name,
    a.attnum::text || ':' || a.attname || ':' || pg_catalog.format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text || ':' || coalesce(pg_get_expr(d.adbin, d.adrelid), '') detail
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
  where n.nspname in ('core', 'case', 'api')
  union all
  select 'constraint', n.nspname, c.relname, con.conname || ':' || pg_get_constraintdef(con.oid, true)
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('core', 'case', 'api')
  union all
  select 'index', n.nspname, c.relname, i.relname || ':' || pg_get_indexdef(i.oid)
  from pg_index x
  join pg_class c on c.oid = x.indrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_class i on i.oid = x.indexrelid
  where n.nspname in ('core', 'case', 'api')
  union all
  select 'function', n.nspname, p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
    pg_get_functiondef(p.oid) || ':acl=' || coalesce(p.proacl::text, '')
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('core', 'case', 'api') and p.prokind = 'f'
  union all
  select 'relation', n.nspname, c.relname,
    c.relkind::text || ':rls=' || c.relrowsecurity::text || ':force=' || c.relforcerowsecurity::text || ':acl=' || coalesce(c.relacl::text, '')
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('core', 'case', 'api') and c.relkind in ('r', 'v', 'm', 'S')
  union all
  select 'policy', schemaname, tablename,
    policyname || ':' || permissive || ':' || roles::text || ':' || cmd || ':' || coalesce(qual, '') || ':' || coalesce(with_check, '')
  from pg_policies
  where schemaname in ('core', 'case', 'api')
)
select kind, schema_name, object_name, detail
from catalog
order by 1, 2, 3, 4;
