-- Run after 20260917000100_notice_department_residual_occurrences.sql.
-- Read-only contract verification for the current approved publish release.

do $verify$
declare
  v_release_id uuid;
  v_notice_count integer;
  v_canonical_count integer;
  v_residual_count integer;
  v_distinct_raw_label_count integer;
  v_missing_notice_count integer;
  v_duplicate_count integer;
  v_group_mismatch_count integer;
  v_projection_mismatch_count integer;
  v_link_occurrence_count bigint;
begin
  select release_id into strict v_release_id
  from publish.current_release
  where singleton_key;

  select count(*) into v_notice_count
  from publish.notices
  where release_id = v_release_id;

  select count(*) into v_canonical_count
  from publish.notices
  where release_id = v_release_id
    and publish.is_v06_canonical_notice_department(notice_department);

  select count(*), count(distinct raw_label)
  into v_residual_count, v_distinct_raw_label_count
  from publish.notice_department_residual_occurrences
  where release_id = v_release_id
    and residual_code = 'NOTICE_DEPARTMENT_UNMAPPED_RESIDUAL';

  select count(*) into v_missing_notice_count
  from publish.notice_department_residual_occurrences o
  left join publish.notices n
    on n.release_id = o.release_id and n.notice_id = o.notice_id
  where o.release_id = v_release_id and n.notice_id is null;

  select count(*) into v_duplicate_count
  from (
    select release_id, notice_id, residual_code
    from publish.notice_department_residual_occurrences
    where release_id = v_release_id
    group by release_id, notice_id, residual_code
    having count(*) > 1
  ) duplicate_rows;

  with expected as (
    select notice_department as raw_label, count(*) as occurrence_count
    from publish.notices
    where release_id = v_release_id
      and not publish.is_v06_canonical_notice_department(notice_department)
    group by notice_department
  ), actual as (
    select raw_label, count(*) as occurrence_count
    from publish.notice_department_residual_occurrences
    where release_id = v_release_id
      and residual_code = 'NOTICE_DEPARTMENT_UNMAPPED_RESIDUAL'
    group by raw_label
  )
  select count(*) into v_group_mismatch_count
  from (
    (select * from expected except select * from actual)
    union all
    (select * from actual except select * from expected)
  ) mismatches;

  with expected as (
    select
      publish.notice_department_residual_id(
        n.release_id,
        n.notice_id,
        'NOTICE_DEPARTMENT_UNMAPPED_RESIDUAL'
      ) as residual_id,
      n.release_id,
      n.notice_id,
      'NOTICE_DEPARTMENT_UNMAPPED_RESIDUAL'::text as residual_code,
      n.notice_department as raw_label,
      btrim(n.notice_department) as comparison_label,
      n.posted_date as posted_at,
      n.title,
      n.source_location
    from publish.notices n
    where n.release_id = v_release_id
      and not publish.is_v06_canonical_notice_department(n.notice_department)
  ), actual as (
    select residual_id, release_id, notice_id, residual_code, raw_label,
      comparison_label, posted_at, title, source_location
    from publish.notice_department_residual_occurrences
    where release_id = v_release_id
  )
  select count(*) into v_projection_mismatch_count
  from (
    (select * from expected except select * from actual)
    union all
    (select * from actual except select * from expected)
  ) mismatches;

  select coalesce(sum(cardinality(linked_regulation_version_ids)), 0)
  into v_link_occurrence_count
  from publish.notices
  where release_id = v_release_id;

  if v_notice_count <> 2089 then raise exception 'notice count mismatch: %', v_notice_count; end if;
  if v_canonical_count <> 817 then raise exception 'canonical count mismatch: %', v_canonical_count; end if;
  if v_residual_count <> 1272 then raise exception 'residual count mismatch: %', v_residual_count; end if;
  if v_distinct_raw_label_count <> 355 then raise exception 'raw-label count mismatch: %', v_distinct_raw_label_count; end if;
  if v_missing_notice_count <> 0 then raise exception 'unjoined residual count: %', v_missing_notice_count; end if;
  if v_duplicate_count <> 0 then raise exception 'duplicate residual count: %', v_duplicate_count; end if;
  if v_group_mismatch_count <> 0 then raise exception 'raw-label group mismatch: %', v_group_mismatch_count; end if;
  if v_projection_mismatch_count <> 0 then raise exception 'deterministic reprojection mismatch: %', v_projection_mismatch_count; end if;
  if v_link_occurrence_count <> 3775 then raise exception 'notice linkage occurrence mismatch: %', v_link_occurrence_count; end if;
end;
$verify$;

with current_id as (
  select release_id from publish.current_release where singleton_key
)
select
  c.release_id,
  count(n.*) as notice_count,
  count(n.*) filter (
    where publish.is_v06_canonical_notice_department(n.notice_department)
  ) as canonical_exact_match_count,
  count(o.*) as residual_count,
  count(distinct o.raw_label) as distinct_raw_label_count,
  coalesce(sum(cardinality(n.linked_regulation_version_ids)), 0) as linked_regulation_occurrence_count,
  count(o.notice_id) filter (where n.notice_id is not null) as residual_notice_join_count
from current_id c
join publish.notices n on n.release_id = c.release_id
left join publish.notice_department_residual_occurrences o
  on o.release_id = n.release_id
 and o.notice_id = n.notice_id
 and o.residual_code = 'NOTICE_DEPARTMENT_UNMAPPED_RESIDUAL'
group by c.release_id;
