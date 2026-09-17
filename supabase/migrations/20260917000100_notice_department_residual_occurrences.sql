begin;

-- T01 keeps the raw notice-department occurrence intact. It does not classify
-- people, organizations, historical units, or noise.
create function publish.is_v06_canonical_notice_department(p_label text)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select btrim(p_label) = any (array[
    '경영기획부', '성과관리부', 'ICT전략부',
    '신용보증부', '자본시장부', '4.0창업부', '플랫폼금융부', '빅데이터부',
    '신용보험부', '기업개선부', '인프라금융부',
    '인재경영부', '업무지원부', '고객지원부', '안전관리관',
    '감사실', '미래전략실', '리스크준법실', '홍보실', '비서실'
  ]::text[]);
$$;

create function publish.notice_department_residual_id(
  p_release_id uuid,
  p_notice_id uuid,
  p_residual_code text
)
returns uuid
language sql
immutable
strict
set search_path = ''
as $$
  select md5(
    'kodit:publish:notice-residual:' || p_release_id::text || ':' ||
    p_notice_id::text || ':' || p_residual_code
  )::uuid;
$$;

create table publish.notice_department_residual_occurrences (
  residual_id uuid generated always as (
    publish.notice_department_residual_id(release_id, notice_id, residual_code)
  ) stored primary key,
  release_id uuid not null,
  notice_id uuid not null,
  residual_code text not null default 'NOTICE_DEPARTMENT_UNMAPPED_RESIDUAL'
    check (residual_code = 'NOTICE_DEPARTMENT_UNMAPPED_RESIDUAL'),
  raw_label text not null,
  comparison_label text not null,
  posted_at date not null,
  title text not null,
  source_location text not null check (source_location ~ '^https?://'),
  foreign key (release_id, notice_id)
    references publish.notices(release_id, notice_id) on delete restrict,
  unique (release_id, notice_id, residual_code),
  check (comparison_label = btrim(raw_label))
);

comment on table publish.notice_department_residual_occurrences is
  'Release-scoped notice occurrences whose trimmed department label does not exactly match the v0.6 canonical 20-label set. No semantic classification is implied.';
comment on column publish.notice_department_residual_occurrences.raw_label is
  'Original publish.notices.notice_department value without normalization.';
comment on column publish.notice_department_residual_occurrences.comparison_label is
  'Only btrim(raw_label), exactly as used for the v0.6 equality comparison.';

create index publish_notice_department_residual_release_idx
  on publish.notice_department_residual_occurrences (release_id, comparison_label);

-- Existing approved releases are snapshotted once. Future notice inserts and
-- candidate-release edits are maintained by the trigger below.
insert into publish.notice_department_residual_occurrences (
  release_id, notice_id, residual_code, raw_label, comparison_label,
  posted_at, title, source_location
)
select
  n.release_id,
  n.notice_id,
  'NOTICE_DEPARTMENT_UNMAPPED_RESIDUAL',
  n.notice_department,
  btrim(n.notice_department),
  n.posted_date,
  n.title,
  n.source_location
from publish.notices n
where not publish.is_v06_canonical_notice_department(n.notice_department)
on conflict (release_id, notice_id, residual_code) do nothing;

create function publish.capture_v06_notice_department_residual()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if publish.is_v06_canonical_notice_department(new.notice_department) then
    delete from publish.notice_department_residual_occurrences o
    where o.release_id = new.release_id
      and o.notice_id = new.notice_id
      and o.residual_code = 'NOTICE_DEPARTMENT_UNMAPPED_RESIDUAL';
  else
    insert into publish.notice_department_residual_occurrences (
      release_id, notice_id, residual_code, raw_label, comparison_label,
      posted_at, title, source_location
    ) values (
      new.release_id,
      new.notice_id,
      'NOTICE_DEPARTMENT_UNMAPPED_RESIDUAL',
      new.notice_department,
      btrim(new.notice_department),
      new.posted_date,
      new.title,
      new.source_location
    )
    on conflict (release_id, notice_id, residual_code) do update set
      raw_label = excluded.raw_label,
      comparison_label = excluded.comparison_label,
      posted_at = excluded.posted_at,
      title = excluded.title,
      source_location = excluded.source_location;
  end if;
  return new;
end;
$$;

create trigger publish_notice_department_residual_capture
after insert or update of notice_department, posted_date, title, source_location
on publish.notices
for each row execute function publish.capture_v06_notice_department_residual();

create trigger publish_notice_department_residual_immutable
before insert or update or delete on publish.notice_department_residual_occurrences
for each row execute function publish.guard_approved_snapshot();

create function publish.public_department_residual_rows()
returns table (
  residual_id uuid,
  release_id uuid,
  notice_id uuid,
  residual_code text,
  raw_label text,
  comparison_label text,
  posted_at date,
  title text,
  source_location text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.residual_id,
    o.release_id,
    o.notice_id,
    o.residual_code,
    o.raw_label,
    o.comparison_label,
    o.posted_at,
    o.title,
    o.source_location
  from publish.current_release c
  join publish.releases r on r.release_id = c.release_id
  join publish.notice_department_residual_occurrences o
    on o.release_id = r.release_id
  where c.singleton_key
    and r.status = 'approved'
    and o.residual_code = 'NOTICE_DEPARTMENT_UNMAPPED_RESIDUAL';
$$;

alter table publish.notice_department_residual_occurrences enable row level security;
alter table publish.notice_department_residual_occurrences force row level security;

revoke all on table publish.notice_department_residual_occurrences
  from public, anon, authenticated;
grant select, insert, update, delete
  on table publish.notice_department_residual_occurrences to service_role;

alter function publish.is_v06_canonical_notice_department(text) owner to postgres;
alter function publish.notice_department_residual_id(uuid, uuid, text) owner to postgres;
alter function publish.capture_v06_notice_department_residual() owner to postgres;
alter function publish.public_department_residual_rows() owner to postgres;

revoke all on function publish.is_v06_canonical_notice_department(text)
  from public, anon, authenticated, service_role;
revoke all on function publish.notice_department_residual_id(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function publish.capture_v06_notice_department_residual()
  from public, anon, authenticated, service_role;
revoke all on function publish.public_department_residual_rows()
  from public, anon, authenticated, service_role;

grant execute on function publish.is_v06_canonical_notice_department(text)
  to service_role;
grant execute on function publish.notice_department_residual_id(uuid, uuid, text)
  to service_role;
grant execute on function publish.public_department_residual_rows()
  to anon, authenticated, service_role;

commit;
