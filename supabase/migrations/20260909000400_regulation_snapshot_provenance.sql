begin;

create table core.release_regulation_snapshot_manifests (
  release_id uuid primary key references core.releases(release_id) on delete restrict,
  source_file_name text not null,
  source_sha256 char(64) not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_row_count integer not null check (source_row_count > 0),
  staged_at timestamptz not null default now()
);

create trigger release_regulation_snapshot_manifests_guard
before insert or update or delete on core.release_regulation_snapshot_manifests
for each row execute function core.guard_release_regulation_snapshot();
alter table core.release_regulation_snapshot_manifests enable row level security;
alter table core.release_regulation_snapshot_manifests force row level security;
revoke all on core.release_regulation_snapshot_manifests from public, anon, authenticated;
grant select, insert, update, delete on core.release_regulation_snapshot_manifests to service_role;

create function api.register_draft_regulation_snapshot(
  p_release_id uuid, p_source_file_name text, p_source_sha256 text, p_source_row_count integer
)
returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if p_release_id is null or nullif(btrim(p_source_file_name), '') is null
    or p_source_sha256 !~ '^[0-9a-f]{64}$' or p_source_row_count <= 0 then
    raise exception 'invalid snapshot provenance' using errcode = '22023';
  end if;
  if not exists (select 1 from core.releases r where r.release_id = p_release_id and r.status = 'draft' and not r.is_latest) then
    raise exception 'target release must be a non-latest draft' using errcode = '22023';
  end if;
  insert into core.release_regulation_snapshot_manifests(release_id, source_file_name, source_sha256, source_row_count)
  values (p_release_id, p_source_file_name, p_source_sha256, p_source_row_count)
  on conflict (release_id) do update set
    source_file_name = excluded.source_file_name,
    source_sha256 = excluded.source_sha256,
    source_row_count = excluded.source_row_count,
    staged_at = now();
  return p_release_id;
end;
$$;

create or replace function api.publish_regulation_release(
  p_release_id uuid, p_confirmation text, p_approval_note text, p_approved_by_actor text,
  p_dry_run boolean default false
)
returns table (release_id uuid, result text, regulation_count bigint, decision_count bigint, claim_count bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_release core.releases%rowtype;
  v_manifest core.release_regulation_snapshot_manifests%rowtype;
  v_regulation_count bigint;
  v_decision_count bigint;
  v_claim_count bigint;
  v_now timestamptz := clock_timestamp();
begin
  if p_confirmation is distinct from 'PUBLISH' then raise exception 'confirmation must be PUBLISH' using errcode = '22023'; end if;
  if nullif(btrim(p_approval_note), '') is null or length(p_approval_note) > 2000 then raise exception 'approval note is required' using errcode = '22023'; end if;
  if p_approved_by_actor !~ '^[A-Za-z0-9][A-Za-z0-9-]{0,38}$' then raise exception 'invalid GitHub actor' using errcode = '22023'; end if;

  select * into v_release from core.releases r where r.release_id = p_release_id for update;
  if not found then raise exception 'release not found' using errcode = 'P0002'; end if;
  if v_release.status = 'withdrawn' then raise exception 'withdrawn release cannot be published' using errcode = '22023'; end if;
  if v_release.status <> 'draft' or v_release.is_latest then raise exception 'target release must be a non-latest draft' using errcode = '22023'; end if;
  select * into v_manifest from core.release_regulation_snapshot_manifests m where m.release_id = p_release_id;
  if not found then raise exception 'snapshot provenance is missing' using errcode = '23514'; end if;

  select count(*), count(*) filter (where nullif(btrim(rr.decision_reason_code), '') is not null),
    count(*) filter (where nullif(btrim(rr.primary_claim), '') is not null)
  into v_regulation_count, v_decision_count, v_claim_count
  from core.release_regulation_rows rr where rr.release_id = p_release_id;
  if v_regulation_count = 0 or v_regulation_count <> v_manifest.source_row_count
    or v_decision_count <> v_regulation_count or v_claim_count <> v_regulation_count then
    raise exception 'release snapshot is empty, incomplete, or differs from source row count' using errcode = '23514';
  end if;

  if p_dry_run then
    return query select p_release_id, 'dry_run'::text, v_regulation_count, v_decision_count, v_claim_count;
    return;
  end if;
  update core.releases r set is_latest = false where r.is_latest;
  update core.releases r set status = 'published', is_latest = true,
    approved_at = v_now, published_at = v_now, approved_by_actor = p_approved_by_actor,
    approval_note = p_approval_note
  where r.release_id = p_release_id;
  return query select p_release_id, 'published'::text, v_regulation_count, v_decision_count, v_claim_count;
end;
$$;

alter function api.register_draft_regulation_snapshot(uuid, text, text, integer) owner to postgres;
alter function api.publish_regulation_release(uuid, text, text, text, boolean) owner to postgres;
revoke all on function api.register_draft_regulation_snapshot(uuid, text, text, integer) from public, anon, authenticated, service_role;
revoke all on function api.publish_regulation_release(uuid, text, text, text, boolean) from public, anon, authenticated, service_role;
grant execute on function api.register_draft_regulation_snapshot(uuid, text, text, integer) to service_role;
grant execute on function api.publish_regulation_release(uuid, text, text, text, boolean) to service_role;

commit;
