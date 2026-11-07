-- Role changes made directly in the Supabase dashboard / SQL editor have no signed-in user
-- (auth.uid() is null). Record them in the history too; changes made through the portal
-- already write their own event.
create function public.log_dashboard_role_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.user_status_events (user_id, actor_id, kind, from_value, to_value, reason)
  values (new.user_id, null, 'role_changed', old.role::text, new.role::text, 'changed in Supabase dashboard');
  return null;
end $$;

create trigger user_roles_dashboard_change after update of role on public.user_roles
  for each row
  when (old.role is distinct from new.role and (select auth.uid()) is null)
  execute function public.log_dashboard_role_change();

revoke execute on function public.log_dashboard_role_change() from public, anon, authenticated;
