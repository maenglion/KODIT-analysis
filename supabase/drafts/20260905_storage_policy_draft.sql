-- DRAFT ONLY: do not execute until the Storage contract is approved.
-- This file is deliberately outside supabase/migrations.
begin;

-- Buckets stay private. Public delivery uses server-generated signed URLs.
insert into storage.buckets (id, name, public, file_size_limit) values
  ('core-documents', 'core-documents', false, 104857600),
  ('case-documents', 'case-documents', false, 104857600),
  ('release-artifacts', 'release-artifacts', false, 104857600)
on conflict (id) do nothing;

create policy kodit_internal_core_objects_select on storage.objects for select to authenticated
using (bucket_id in ('core-documents', 'release-artifacts') and api.has_access('internal'));
create policy kodit_office_release_artifacts_select on storage.objects for select to authenticated
using (bucket_id = 'release-artifacts' and api.has_access('office'));
create policy kodit_internal_core_objects_insert on storage.objects for insert to authenticated
with check (bucket_id in ('core-documents', 'release-artifacts') and api.has_access('internal'));
create policy kodit_internal_core_objects_update on storage.objects for update to authenticated
using (bucket_id in ('core-documents', 'release-artifacts') and api.has_access('internal'))
with check (bucket_id in ('core-documents', 'release-artifacts') and api.has_access('internal'));
create policy kodit_internal_core_objects_delete on storage.objects for delete to authenticated
using (bucket_id in ('core-documents', 'release-artifacts') and api.has_access('internal'));
-- Deliberately no anon policy and no browser policy for case-documents.

commit;
