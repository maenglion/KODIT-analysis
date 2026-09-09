begin;

create or replace function api.collection_job_state(p_job_code text)
returns table (
  last_checked_at timestamptz, last_successful_at timestamptz, recent_status text,
  next_due_at timestamptz, human_review_pending_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_job_code !~ '^[a-z0-9][a-z0-9_-]{2,63}$' then
    raise exception 'invalid job code' using errcode = '22023';
  end if;
  return query
    with latest as (
      select cr.* from core.crawl_runs cr
      where cr.job_code = p_job_code
      order by cr.started_at desc limit 1
    ), successful as (
      select max(coalesce(cr.completed_at, cr.finished_at)) as at
      from core.crawl_runs cr
      where cr.job_code = p_job_code and cr.status in ('succeeded', 'no_change')
    ), pending_entities as (
      select sa.entity_type || ':' || sa.entity_id as entity_key
      from core.status_assignments sa
      where not sa.human_confirmed and sa.assigned_by like 'regenerator:%:review_pending'
      union
      select 'discovery:' || d.discovery_id::text
      from core.external_discoveries d
      where d.workflow_status = 'verification_pending' and not d.human_confirmed
    )
    select (select started_at from latest), successful.at,
      coalesce((select status from latest), 'waiting'),
      successful.at + interval '10 days',
      (select count(*) from pending_entities)
    from successful;
end;
$$;

alter function api.collection_job_state(text) owner to postgres;
revoke all on function api.collection_job_state(text) from public, anon, authenticated;
grant execute on function api.collection_job_state(text) to service_role;

commit;
