begin;

create or replace function publish.public_person_initials(p_label text)
returns text
language plpgsql
immutable
security invoker
set search_path=''
as $$
declare
  v_initials text := '';
  v_char text;
  v_code integer;
  v_index integer;
  v_initial_table constant text := 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
begin
  for v_index in 1..char_length(btrim(coalesce(p_label,''))) loop
    v_char := substr(btrim(coalesce(p_label,'')),v_index,1);
    v_code := ascii(v_char);
    if v_code between 44032 and 55203 then
      v_initials := v_initials || substr(v_initial_table,((v_code-44032)/588)+1,1);
    end if;
  end loop;
  return coalesce(nullif(v_initials,''),'인물');
end;
$$;

create or replace function publish.public_person_alias_code(p_opaque_id uuid)
returns text
language plpgsql
immutable
strict
security invoker
set search_path=''
as $$
declare
  v_hash numeric := 174;
  v_value text := lower(p_opaque_id::text);
  v_index integer;
begin
  for v_index in 1..char_length(v_value) loop
    v_hash := mod(v_hash*707+ascii(substr(v_value,v_index,1)),4294967296);
  end loop;
  return lpad(mod(v_hash,10000)::bigint::text,4,'0');
end;
$$;

create or replace function publish.public_residual_display_label(
  p_label_type text,
  p_label text,
  p_opaque_id uuid
)
returns text
language sql
immutable
security invoker
set search_path=''
as $$
  select case
    when p_label_type='ORG' then coalesce(nullif(btrim(p_label),''),'미기재')
    when p_label_type='PERSON' then
      publish.public_person_initials(p_label)||'('||publish.public_person_alias_code(p_opaque_id)||')'
    else '미분류 표기 · '||left(p_opaque_id::text,8)
  end;
$$;

comment on function publish.public_person_initials(text) is
  'Public PERSON redaction helper. It exposes Hangul initials only and does not change the canonical raw label.';
comment on function publish.public_person_alias_code(uuid) is
  'Deterministic four-digit public alias code derived from an opaque label identifier, never from a person name. Contract seed=174, multiplier=707.';
comment on function publish.public_residual_display_label(text,text,uuid) is
  'Public display redaction only. PERSON labels use initials plus an opaque four-digit alias to protect rare surnames and reduce re-identification risk.';

alter function publish.public_person_initials(text) owner to postgres;
alter function publish.public_person_alias_code(uuid) owner to postgres;
alter function publish.public_residual_display_label(text,text,uuid) owner to postgres;
revoke all on function publish.public_person_initials(text) from public,anon,authenticated,service_role;
revoke all on function publish.public_person_alias_code(uuid) from public,anon,authenticated,service_role;
revoke all on function publish.public_residual_display_label(text,text,uuid) from public,anon,authenticated,service_role;

create or replace function publish.public_department_attribution_explanation_rows_safe()
returns table (
  release_id uuid,residual_id uuid,notice_id uuid,masked_label text,label_type text,posted_at date,title text,
  source_location text,inference_basis_code text,inference_basis_label text,responsible_org_as_of_notice text,
  current_functional_equivalent text,current_org_candidate text,work_context jsonb,path_steps jsonb,
  reasoning_steps jsonb,official_evidence jsonb
)
language sql stable security definer set search_path=''
as $$
  select r.release_id,r.residual_id,r.notice_id,
    publish.public_residual_display_label(r.label_type,o.raw_label,rl.label_id),
    r.label_type,r.posted_at,r.title,r.source_location,r.inference_basis_code,r.inference_basis_label,
    r.responsible_org_as_of_notice,r.current_functional_equivalent,r.current_org_candidate,
    r.work_context,r.path_steps,r.reasoning_steps,r.official_evidence
  from publish.public_department_attribution_explanation_rows() r
  join publish.notice_department_residual_occurrences o
    on o.release_id=r.release_id and o.residual_id=r.residual_id and o.notice_id=r.notice_id
  join core.notice_department_residual_labels rl
    on rl.residual_id=r.residual_id and rl.label_contract_version='label-v1';
$$;

comment on function publish.public_department_attribution_explanation_rows_safe() is
  'Public attribution explanation contract. PERSON observations use Hangul initials plus a deterministic four-digit alias; canonical raw labels remain private.';

alter function publish.public_department_attribution_explanation_rows_safe() owner to postgres;
revoke all on function publish.public_department_attribution_explanation_rows_safe() from public,anon,authenticated,service_role;
grant execute on function publish.public_department_attribution_explanation_rows_safe() to anon,authenticated,service_role;

commit;
