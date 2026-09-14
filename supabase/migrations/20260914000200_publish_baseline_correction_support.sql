begin;

alter table publish.releases
  drop constraint releases_collection_cycle_id_key;

create index publish_releases_collection_cycle_idx
  on publish.releases (collection_cycle_id);

alter table publish.releases
  drop constraint releases_release_type_check;

alter table publish.releases
  add constraint releases_release_type_check
  check (release_type in ('baseline', 'baseline_correction', 'incremental'));

commit;
