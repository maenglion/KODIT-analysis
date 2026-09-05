-- TEST ONLY. Apply through a direct PostgreSQL test connection, never as an
-- operating migration and never as a PostgREST exposed schema.
begin;

create schema if not exists test_support;
revoke all on schema test_support from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema test_support
  revoke execute on functions from public, anon, authenticated, service_role;

create or replace function test_support.admin_set_user_access(
  target_user_id uuid,
  target_access_level text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if target_user_id is null then
    raise exception 'target user id is required' using errcode = '22023';
  end if;
  if target_access_level is null or target_access_level not in ('public', 'office', 'internal') then
    raise exception 'invalid access level' using errcode = '22023';
  end if;
  insert into core.user_access_profiles (user_id, access_level, active, approved_at)
  values (target_user_id, target_access_level, true, now())
  on conflict (user_id) do update
    set access_level = excluded.access_level,
        active = true,
        approved_at = excluded.approved_at,
        expires_at = null,
        updated_at = now();
end;
$$;

create or replace function test_support.admin_remove_user_access(target_user_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if target_user_id is null then
    raise exception 'target user id is required' using errcode = '22023';
  end if;
  delete from core.user_access_profiles where user_id = target_user_id;
end;
$$;

create or replace function test_support.admin_seed_access_contract()
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare fixture_id uuid := gen_random_uuid();
begin
  insert into core.claims (
    subject_type, subject_id, claim_text, claim_type, confidence_level, confidence_gate_passed, visibility
  )
  values
    ('fact', fixture_id::text, 'public fixture', 'ACCESS_TEST', 5, true, 'public'),
    ('fact', fixture_id::text, 'office fixture', 'ACCESS_TEST', 4, true, 'office'),
    ('fact', fixture_id::text, 'internal fixture', 'ACCESS_TEST', 1, false, 'internal');
  return fixture_id;
end;
$$;

create or replace function test_support.admin_cleanup_access_contract(fixture_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if fixture_id is null then
    raise exception 'fixture id is required' using errcode = '22023';
  end if;
  delete from core.claims where subject_id = fixture_id::text and claim_type = 'ACCESS_TEST';
end;
$$;

revoke all on all functions in schema test_support
  from public, anon, authenticated, service_role;

comment on schema test_support is
  'Temporary direct-PostgreSQL test fixtures; never add to PostgREST exposed schemas.';

commit;
