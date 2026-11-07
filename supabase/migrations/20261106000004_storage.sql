-- Storage buckets and policies. Paths: avatars/<user_id>/<file>; deliverables and
-- attachments are indexed in public.media_assets.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('deliverables', 'deliverables', false, null, null),
  ('session-attachments', 'session-attachments', false, null, null)
on conflict (id) do nothing;

create policy avatars_write_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars'
              and (storage.foldername(name))[1] = (select auth.uid())::text
              and public.is_active_user());
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy deliverables_select on storage.objects for select to authenticated
  using (bucket_id = 'deliverables' and (
    public.is_admin() or exists (
      select 1 from public.media_assets m
      where m.bucket = 'deliverables' and m.path = name
        and m.client_id = (select auth.uid()) and m.visibility = 'shared_with_client')));
create policy deliverables_admin_write on storage.objects for all to authenticated
  using (bucket_id = 'deliverables' and public.is_admin())
  with check (bucket_id = 'deliverables' and public.is_admin());

create policy attachments_admin on storage.objects for all to authenticated
  using (bucket_id = 'session-attachments' and public.is_admin())
  with check (bucket_id = 'session-attachments' and public.is_admin());
