begin;

alter table core.crawl_runs drop constraint crawl_runs_status_check;
alter table core.crawl_runs
  add column job_code text,
  add column trigger_type text check (trigger_type in ('schedule', 'manual')),
  add column scheduled_for timestamptz,
  add column completed_at timestamptz,
  add column last_successful_at timestamptz,
  add column next_due_at timestamptz,
  add column collected_count integer not null default 0 check (collected_count >= 0),
  add column changed_count integer not null default 0 check (changed_count >= 0),
  add column failed_source_count integer not null default 0 check (failed_source_count >= 0),
  add column error_summary text,
  add column draft_release_id uuid references core.releases(release_id),
  add constraint crawl_runs_status_check check (
    status in ('running', 'succeeded', 'partial', 'failed', 'no_change', 'not_due')
  ),
  add constraint crawl_runs_schedule_order_check check (
    next_due_at is null or last_successful_at is null or next_due_at = last_successful_at + interval '10 days'
  );

create unique index crawl_runs_one_running_job_idx
  on core.crawl_runs(job_code)
  where job_code is not null and status = 'running';
create index crawl_runs_job_history_idx on core.crawl_runs(job_code, started_at desc);

alter table core.document_url_observations add column observation_key char(64)
  check (observation_key is null or observation_key ~ '^[0-9a-f]{64}$');
create unique index document_url_observations_key_idx
  on core.document_url_observations(observation_key);

alter table core.external_discoveries
  add column crawl_run_id uuid references core.crawl_runs(crawl_run_id),
  add column draft_release_id uuid references core.releases(release_id),
  add column next_verification_engine text check (next_verification_engine in ('grok', 'gemini', 'deepseek')),
  add column search_verification_count integer not null default 0 check (search_verification_count >= 0),
  add column human_confirmed boolean not null default false;
create unique index external_discoveries_run_title_idx
  on core.external_discoveries(crawl_run_id, title)
  where crawl_run_id is not null;

insert into core.sources(source_code, name, source_type, base_url, is_official, active)
values ('kodit-ten-day-collection', 'KODIT 10일 전체 수집', 'scheduled_collection', 'https://www.kodit.or.kr', true, true)
on conflict(source_code) do nothing;

insert into core.crawl_runs(
  source_id, collector_version, started_at, finished_at, status, fetched_count, error_count,
  job_code, trigger_type, scheduled_for, completed_at, last_successful_at, next_due_at,
  collected_count, changed_count, failed_source_count, draft_release_id, log_summary
)
select s.source_id, 'kodit-full-regenerator/0.1', timestamptz '2026-09-08 19:20:31+09',
  timestamptz '2026-09-08 19:20:45+09', 'succeeded', 1041, 1,
  'kodit-regulation-full-collection', 'manual', timestamptz '2026-09-08 19:20:31+09',
  timestamptz '2026-09-08 19:20:45+09', timestamptz '2026-09-08 19:20:45+09',
  timestamptz '2026-09-18 19:20:45+09', 1041, 1041, 1, r.release_id,
  jsonb_build_object('bootstrap', '2026-09-08 review manifest', 'release_status', 'review_pending')
from core.sources s
left join lateral (
  select release_id from core.releases
  where as_of_date = date '2026-09-08' and status = 'draft'
  order by release_id limit 1
) r on true
where s.source_code = 'kodit-ten-day-collection'
  and not exists (
    select 1 from core.crawl_runs where job_code = 'kodit-regulation-full-collection'
  );

create function api.collection_job_state(p_job_code text)
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
    )
    select (select started_at from latest), successful.at,
      coalesce((select status from latest), 'waiting'),
      successful.at + interval '10 days',
      (select count(*) from core.external_discoveries d
       where d.workflow_status = 'verification_pending' and not d.human_confirmed)
    from successful;
end;
$$;

create function api.claim_collection_run(
  p_job_code text, p_trigger_type text, p_scheduled_for timestamptz, p_now timestamptz default now()
)
returns table (
  outcome text, crawl_run_id uuid, last_successful_at timestamptz,
  next_due_at timestamptz, previous_fingerprint text
)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_source_id uuid;
  v_run_id uuid;
  v_last_success timestamptz;
  v_due timestamptz;
  v_fingerprint text;
begin
  if p_job_code !~ '^[a-z0-9][a-z0-9_-]{2,63}$'
     or p_trigger_type not in ('schedule', 'manual')
     or p_scheduled_for is null or p_now is null then
    raise exception 'invalid collection claim input' using errcode = '22023';
  end if;

  select max(coalesce(cr.completed_at, cr.finished_at)) into v_last_success
  from core.crawl_runs cr
  where cr.job_code = p_job_code and cr.status in ('succeeded', 'no_change');
  v_due := coalesce(v_last_success + interval '10 days', p_now);
  select cr.log_summary ->> 'content_fingerprint' into v_fingerprint
  from core.crawl_runs cr
  where cr.job_code = p_job_code and cr.status in ('succeeded', 'no_change')
  order by coalesce(cr.completed_at, cr.finished_at) desc limit 1;

  select source_id into v_source_id from core.sources
  where source_code = 'kodit-ten-day-collection';

  if p_now < v_due then
    insert into core.crawl_runs(
      source_id, collector_version, started_at, finished_at, status, job_code, trigger_type,
      scheduled_for, completed_at, last_successful_at, next_due_at, log_summary
    ) values (
      v_source_id, 'kodit-scheduled-collector/0.1', p_now, p_now, 'not_due', p_job_code,
      p_trigger_type, p_scheduled_for, p_now, v_last_success, v_due,
      jsonb_build_object('outcome', 'not_due')
    ) returning core.crawl_runs.crawl_run_id into v_run_id;
    return query select 'not_due'::text, v_run_id, v_last_success, v_due, v_fingerprint;
    return;
  end if;

  begin
    insert into core.crawl_runs(
      source_id, collector_version, started_at, status, job_code, trigger_type,
      scheduled_for, last_successful_at, next_due_at
    ) values (
      v_source_id, 'kodit-scheduled-collector/0.1', p_now, 'running', p_job_code,
      p_trigger_type, p_scheduled_for, v_last_success, v_due
    ) returning core.crawl_runs.crawl_run_id into v_run_id;
  exception when unique_violation then
    return query select 'locked'::text, null::uuid, v_last_success, v_due, v_fingerprint;
    return;
  end;
  return query select 'claimed'::text, v_run_id, v_last_success, v_due, v_fingerprint;
end;
$$;

create function api.complete_collection_run(
  p_crawl_run_id uuid, p_status text, p_completed_at timestamptz,
  p_collected_count integer, p_changed_count integer, p_failed_source_count integer,
  p_content_fingerprint text, p_error_summary text, p_observations jsonb default '[]'::jsonb,
  p_queue_items jsonb default '[]'::jsonb
)
returns table (status text, draft_release_id uuid, last_successful_at timestamptz, next_due_at timestamptz)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_run core.crawl_runs%rowtype;
  v_last_success timestamptz;
  v_next_due timestamptz;
  v_release_id uuid;
  v_source_id uuid;
  v_item jsonb;
  v_record_id uuid;
  v_url_id uuid;
  v_previous_id uuid;
  v_previous_sha char(64);
  v_sha char(64);
  v_normalized_url text;
  v_observation_key char(64);
begin
  if p_status not in ('succeeded', 'failed', 'no_change') or p_completed_at is null
     or p_collected_count < 0 or p_changed_count < 0 or p_failed_source_count < 0
     or p_content_fingerprint !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_observations) <> 'array' or jsonb_array_length(p_observations) > 5000
     or jsonb_typeof(p_queue_items) <> 'array' or jsonb_array_length(p_queue_items) > 5000 then
    raise exception 'invalid collection completion input' using errcode = '22023';
  end if;

  select * into v_run from core.crawl_runs where crawl_run_id = p_crawl_run_id for update;
  if v_run.crawl_run_id is null or v_run.status <> 'running' then
    raise exception 'collection run is not claimable' using errcode = '55000';
  end if;
  v_source_id := v_run.source_id;
  v_last_success := case when p_status in ('succeeded', 'no_change') then p_completed_at else v_run.last_successful_at end;
  v_next_due := case when p_status in ('succeeded', 'no_change') then p_completed_at + interval '10 days' else v_run.next_due_at end;

  if p_status = 'succeeded' and p_changed_count > 0 then
    insert into core.releases(
      release_no, as_of_date, file_name, file_sha256, schema_version, collector_version,
      methodology_version, status, changed_record_count, is_latest
    ) values (
      'auto-draft-' || to_char(p_completed_at at time zone 'Asia/Seoul', 'YYYYMMDD-HH24MISS') || '-' || left(p_crawl_run_id::text, 8),
      (p_completed_at at time zone 'Asia/Seoul')::date,
      'scheduled-collection-' || p_crawl_run_id::text || '.json', p_content_fingerprint,
      'v0.4', 'kodit-scheduled-collector/0.1', 'v0.4', 'draft', p_changed_count, false
    ) returning release_id into v_release_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_observations) loop
    v_sha := nullif(v_item ->> 'sha256', '')::char(64);
    v_normalized_url := v_item ->> 'normalized_url';
    if v_normalized_url !~ '^https?://' or v_sha !~ '^[0-9a-f]{64}$' then continue; end if;
    insert into core.source_records(source_id, external_key, title, page_url, raw_metadata)
    values (v_source_id, encode(extensions.digest(v_normalized_url, 'sha256'), 'hex'),
      left(coalesce(v_item ->> 'title', v_normalized_url), 1000), v_normalized_url,
      jsonb_build_object('crawl_run_id', p_crawl_run_id, 'scheduled', true))
    on conflict(source_id, external_key) do update set last_seen_at = p_completed_at, raw_metadata = excluded.raw_metadata
    returning source_record_id into v_record_id;
    insert into core.documents(sha256, file_name, file_size_bytes, mime_type, detected_format, magic_verified)
    values (v_sha, nullif(v_item ->> 'file_name', ''), (v_item ->> 'content_length')::bigint,
      nullif(v_item ->> 'mime_type', ''), coalesce(nullif(v_item ->> 'detected_format', ''), 'unknown'), true)
    on conflict(sha256) do update set file_size_bytes = excluded.file_size_bytes, mime_type = excluded.mime_type;
    select document_url_id into v_url_id from core.document_urls
      where normalized_url = v_normalized_url order by first_seen_at limit 1;
    if v_url_id is null then
      insert into core.document_urls(source_record_id, discovered_url, normalized_url, final_url, discovery_method)
      values (v_record_id, v_normalized_url, v_normalized_url, coalesce(v_item ->> 'final_url', v_normalized_url), 'scheduled_collection')
      returning document_url_id into v_url_id;
    else
      update core.document_urls set last_seen_at = p_completed_at,
        final_url = coalesce(v_item ->> 'final_url', final_url) where document_url_id = v_url_id;
    end if;
    select document_url_observation_id, document_sha256 into v_previous_id, v_previous_sha
      from core.document_url_observations where document_url_id = v_url_id order by observed_at desc limit 1;
    v_observation_key := encode(extensions.digest(
      v_normalized_url || '|' || v_sha || '|' || coalesce(v_item ->> 'etag', '') || '|' || coalesce(v_item ->> 'last_modified', ''), 'sha256'
    ), 'hex');
    insert into core.document_url_observations(
      document_url_id, document_sha256, observed_at, http_status, etag, last_modified,
      content_length, previous_observation_id, content_changed, change_reason, observation_key
    ) values (
      v_url_id, v_sha, p_completed_at, (v_item ->> 'http_status')::integer,
      nullif(v_item ->> 'etag', ''), nullif(v_item ->> 'last_modified', ''),
      (v_item ->> 'content_length')::bigint, v_previous_id,
      v_previous_id is not null and v_previous_sha is distinct from v_sha,
      case when v_previous_id is null then 'initial scheduled observation'
           when v_previous_sha is not distinct from v_sha then 'content unchanged'
           else 'same URL returned a different SHA-256' end,
      v_observation_key
    ) on conflict(observation_key) do nothing;
  end loop;

  if v_release_id is not null then
    insert into core.external_discoveries(
      title, discovered_by, candidate_url, workflow_status, visibility,
      crawl_run_id, draft_release_id, next_verification_engine, search_verification_count, human_confirmed
    ) select distinct left(coalesce(value ->> 'title', '수집 변경 검토'), 1000),
      'scheduled-collector', nullif(value ->> 'url', ''), 'verification_pending', 'internal',
      p_crawl_run_id, v_release_id, 'grok', 0, false
    from jsonb_array_elements(p_queue_items)
    on conflict(crawl_run_id, title) where crawl_run_id is not null do nothing;
  end if;

  update core.crawl_runs set
    finished_at = p_completed_at, completed_at = p_completed_at, status = p_status,
    fetched_count = p_collected_count, error_count = p_failed_source_count,
    collected_count = p_collected_count, changed_count = p_changed_count,
    failed_source_count = p_failed_source_count, error_summary = nullif(left(p_error_summary, 4000), ''),
    draft_release_id = v_release_id, last_successful_at = v_last_success, next_due_at = v_next_due,
    log_summary = jsonb_build_object('content_fingerprint', p_content_fingerprint, 'source_failures', p_failed_source_count)
  where crawl_run_id = p_crawl_run_id;
  return query select p_status, v_release_id, v_last_success, v_next_due;
end;
$$;

alter function api.collection_job_state(text) owner to postgres;
alter function api.claim_collection_run(text, text, timestamptz, timestamptz) owner to postgres;
alter function api.complete_collection_run(uuid, text, timestamptz, integer, integer, integer, text, text, jsonb, jsonb) owner to postgres;
revoke all on function api.collection_job_state(text) from public, anon, authenticated;
revoke all on function api.claim_collection_run(text, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function api.complete_collection_run(uuid, text, timestamptz, integer, integer, integer, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function api.collection_job_state(text) to service_role;
grant execute on function api.claim_collection_run(text, text, timestamptz, timestamptz) to service_role;
grant execute on function api.complete_collection_run(uuid, text, timestamptz, integer, integer, integer, text, text, jsonb, jsonb) to service_role;

commit;
