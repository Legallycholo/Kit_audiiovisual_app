-- Admins need to identify users; auth.users is not readable from the API, so keep a
-- read-only copy of the email on profiles (users cannot edit it: no column grant).
alter table public.profiles add column email text;
update public.profiles p set email = u.email from auth.users u where u.id = p.id;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_status public.account_status := 'active';
begin
  if coalesce((select value #>> '{}' from public.app_settings where key = 'require_account_approval'), 'false') = 'true' then
    v_status := 'pending';
  end if;

  insert into public.profiles (id, email, full_name, phone, account_status)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), ''),
    v_status
  );
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  insert into public.user_status_events (user_id, kind, to_value) values (new.id, 'signup', 'user');
  insert into public.login_events (user_id, event, ip, user_agent)
  values (new.id, 'signup', public.request_ip(), public.request_user_agent());
  return new;
end $$;

create function public.sync_profile_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.sync_profile_email();

revoke execute on function public.sync_profile_email() from public, anon, authenticated;
