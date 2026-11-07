-- Change anybody's password (admins included) from the Supabase dashboard, in the profiles table.
--
-- Passwords are never stored in `profiles`. `new_password` is a write-only cell: type a password
-- there (Table Editor -> profiles -> the person's row -> new_password) and save. A trigger hashes it
-- into the real sign-in account (auth.users, bcrypt, the same format Supabase Auth writes), ends that
-- person's open sessions, records the change in user_status_events, and clears the cell, so the
-- plain text is never stored. Signed-in users cannot write this column through the API (it is not in
-- the column grant list from migration 3); only the dashboard / service role can.

alter type public.user_status_event_kind add value if not exists 'password_changed';

alter table public.profiles add column new_password text;

comment on column public.profiles.new_password is
  'Write-only. Type a new password (8+ characters) and save: it is hashed into auth.users and this cell is cleared. Never holds a password at rest.';

create function public.apply_profile_new_password() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.new_password is null then return new; end if;

  -- Only the dashboard / service role (no signed-in user) or an active admin may do this.
  if (select auth.uid()) is not null and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if length(new.new_password) < 8 then
    raise exception 'weak_password: use at least 8 characters' using errcode = '22023';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(new.new_password, extensions.gen_salt('bf', 10)),
         updated_at = now()
   where id = new.id;
  if not found then raise exception 'user_not_found'; end if;

  -- Whoever had the old password is signed out everywhere (also drops their refresh tokens).
  delete from auth.sessions where user_id = new.id;

  insert into public.user_status_events (user_id, actor_id, kind, reason)
  values (new.id, (select auth.uid()), 'password_changed',
          case when (select auth.uid()) is null then 'changed in Supabase dashboard' else 'changed by an administrator' end);

  new.new_password := null;  -- never stored
  return new;
end $$;

revoke execute on function public.apply_profile_new_password() from public, anon, authenticated;

create trigger profiles_apply_new_password before update of new_password on public.profiles
  for each row
  when (new.new_password is not null)
  execute function public.apply_profile_new_password();
