begin;

create table core.topic_family_official_references_v2 (
  family_reference_id uuid primary key,
  family_id uuid not null references core.topic_families_v2(family_id) on delete restrict,
  reference_role text not null check(reference_role='CANONICAL_OFFICIAL_PRODUCT_PAGE'),
  official_url text not null check(official_url ~ '^https://www\\.kodit\\.or\\.kr/'),
  verified_on date not null,
  created_at timestamptz not null default now(),
  unique(family_id,reference_role,official_url)
);

comment on table core.topic_family_official_references_v2 is 'Canonical append-only official product references. This relation supersedes any denormalized family URL for evidence use.';

with refs(family_code,url) as(values
 ('INVESTMENT_OPTION_GUARANTEE','https://www.kodit.or.kr/kodit/cm/cntnts/cntntsView.do?cntntsId=11080&mi=2542'),
 ('GUARANTEE_LINKED_INVESTMENT','https://www.kodit.or.kr/kodit/cm/cntnts/cntntsView.do?cntntsId=11079&mi=2541'),
 ('MNA_GUARANTEE_RELATED','https://www.kodit.or.kr/kodit/cm/cntnts/cntntsView.do?cntntsId=11081&mi=2543'),
 ('CULTURE_CONTENT_PROJECT_INVESTMENT','https://www.kodit.or.kr/kodit/cm/cntnts/cntntsView.do?cntntsId=12242&mi=3992'),
 ('VC_FUND_CONTRIBUTION_GUARANTEE','https://www.kodit.or.kr/kodit/cm/cntnts/cntntsView.do?cntntsId=12624&mi=4553'),
 ('FIRST_PENGUIN_RELATED','https://www.kodit.or.kr/kodit/cm/cntnts/cntntsView.do?cntntsId=11097&mi=2567')
)
insert into core.topic_family_official_references_v2(family_reference_id,family_id,reference_role,official_url,verified_on)
select md5('kodit:topic-membership-v2:official-reference:'||f.family_code||':'||r.url)::uuid,f.family_id,
 'CANONICAL_OFFICIAL_PRODUCT_PAGE',r.url,date '2026-09-19'
from refs r join core.topic_families_v2 f on f.family_code=r.family_code and f.topic_contract_version='topic-membership-v2'
on conflict(family_id,reference_role,official_url) do nothing;

alter table core.topic_family_official_references_v2 enable row level security;
revoke all on core.topic_family_official_references_v2 from public,anon,authenticated;
grant select,insert on core.topic_family_official_references_v2 to service_role;
create trigger topic_family_official_references_v2_append_only before update or delete on core.topic_family_official_references_v2 for each row execute function core.reject_history_mutation();

commit;
