-- Put the role on profiles (visible and editable in the Supabase Table Editor) and delete user_roles.
--
-- Run this once in the Supabase SQL editor (the hosted project's migration connector declined it).
-- The app code already reads profiles.role, so run it after pulling this branch.
--
-- Safety: authenticated users can only UPDATE the profile columns granted in migration 3
-- (full_name, phone, company, avatar_path, locale, marketing_opt_in, last_seen_at). `role` and
-- `account_status` are NOT in that list, so a user cannot change their own role. Never run
-- `grant update on public.profiles to authenticated` (table-wide); always list columns.

alter table public.profiles add column role public.app_role not null default 'user';
update public.profiles p set role = r.role from public.user_roles r where r.user_id = p.id;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin' and p.account_status = 'active'
  );
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_status public.account_status := 'active';
begin
  if coalesce((select value #>> '{}' from public.app_settings where key = 'require_account_approval'), 'false') = 'true' then
    v_status := 'pending';
  end if;
  -- The role is never read from user-supplied metadata: every new account is 'user'.
  insert into public.profiles (id, email, full_name, phone, account_status, role)
  values (
    new.id, new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), ''),
    v_status, 'user'
  );
  insert into public.user_status_events (user_id, kind, to_value) values (new.id, 'signup', 'user');
  insert into public.login_events (user_id, event, ip, user_agent)
  values (new.id, 'signup', public.request_ip(), public.request_user_agent());
  return new;
end $$;

create or replace function public.promote_first_booking() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set role = 'client' where id = new.client_id and role = 'user';
  if found then
    insert into public.user_status_events (user_id, actor_id, kind, from_value, to_value, reason)
    values (new.client_id, (select auth.uid()), 'role_changed', 'user', 'client', 'first_booking');
  end if;
  return new;
end $$;

create or replace function public.admin_set_role(p_user_id uuid, p_role public.app_role, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_old public.app_role;
  v_admins integer;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select role into v_old from public.profiles where id = p_user_id for update;
  if not found then raise exception 'user_not_found'; end if;
  if v_old = p_role then return; end if;
  if v_old = 'admin' then
    select count(*) into v_admins from public.profiles where role = 'admin' and account_status = 'active';
    if v_admins <= 1 then raise exception 'last_admin'; end if;
  end if;
  update public.profiles set role = p_role where id = p_user_id;
  insert into public.user_status_events (user_id, actor_id, kind, from_value, to_value, reason)
  values (p_user_id, (select auth.uid()), 'role_changed', v_old::text, p_role::text, p_reason);
end $$;

create or replace function public.create_booking(
  p_service_id uuid, p_starts_at timestamptz, p_notes text default null, p_client_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_admin boolean := public.is_admin();
  v_client uuid;
  v_behalf boolean;
  v_service public.services;
  v_booking public.bookings;
  v_role public.app_role;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.is_active_user() then raise exception 'account_not_active' using errcode = '42501'; end if;

  v_client := v_uid;
  if p_client_id is not null and p_client_id <> v_uid then
    if not v_admin then raise exception 'forbidden' using errcode = '42501'; end if;
    v_client := p_client_id;
  end if;
  v_behalf := v_client <> v_uid;

  select * into v_service from public.services where id = p_service_id and active;
  if not found then raise exception 'service_not_found'; end if;

  if not v_admin then
    if p_starts_at < now() + make_interval(hours => public.setting_int('min_notice_hours', 12)) then
      raise exception 'too_soon';
    end if;
    if p_starts_at > now() + make_interval(days => public.setting_int('max_horizon_days', 90)) then
      raise exception 'too_far';
    end if;
  end if;

  begin
    insert into public.bookings (client_id, service_id, status, starts_at, ends_at, notes_client, created_by, source)
    values (
      v_client, p_service_id,
      case when v_behalf then 'confirmed' else 'requested' end::public.booking_status,
      p_starts_at, p_starts_at + make_interval(mins => v_service.duration_minutes),
      nullif(trim(coalesce(p_notes, '')), ''), v_uid,
      case when v_behalf then 'admin' else 'portal' end::public.booking_source)
    returning * into v_booking;
  exception when exclusion_violation then
    raise exception 'slot_taken';
  end;

  select role into v_role from public.profiles where id = v_uid;
  insert into public.booking_events (booking_id, actor_id, actor_role, kind, to_status, payload)
  values (v_booking.id, v_uid, v_role, 'created', v_booking.status, jsonb_build_object('source', v_booking.source));

  if v_booking.status = 'confirmed' then
    perform public._create_session(v_booking, v_uid);
  end if;
  return v_booking.id;
end $$;

create or replace function public.update_booking_status(
  p_booking_id uuid, p_status public.booking_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_admin boolean := public.is_admin();
  v_b public.bookings;
  v_old public.booking_status;
  v_role public.app_role;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'booking_not_found'; end if;
  v_old := v_b.status;
  if not (v_admin or (v_b.client_id = v_uid and public.is_active_user())) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not (case v_b.status
            when 'requested' then p_status in ('confirmed', 'rejected', 'cancelled')
            when 'confirmed' then p_status in ('cancelled', 'completed', 'no_show')
            else false end) then
    raise exception 'invalid_transition';
  end if;

  if not v_admin then
    if p_status <> 'cancelled' then raise exception 'forbidden' using errcode = '42501'; end if;
    if v_b.status = 'confirmed'
       and v_b.starts_at < now() + make_interval(hours => public.setting_int('cancellation_window_hours', 24)) then
      raise exception 'cancellation_window';
    end if;
  end if;

  update public.bookings set status = p_status where id = p_booking_id returning * into v_b;

  select role into v_role from public.profiles where id = v_uid;
  insert into public.booking_events (booking_id, actor_id, actor_role, kind, from_status, to_status, payload)
  values (p_booking_id, v_uid, v_role, p_status::text::public.booking_event_kind,
          v_old, p_status, jsonb_build_object('note', p_note));

  if p_status = 'confirmed' then
    perform public._create_session(v_b, v_uid);
  elsif p_status in ('cancelled', 'rejected') then
    perform public._set_sessions_status(p_booking_id, 'cancelled', v_uid);
  elsif p_status = 'completed' then
    perform public._set_sessions_status(p_booking_id, 'completed', v_uid);
  elsif p_status = 'no_show' then
    perform public._set_sessions_status(p_booking_id, 'no_show', v_uid);
  end if;
end $$;

-- Retire the old table (its dashboard-edit trigger goes with it).
drop table public.user_roles;
drop function if exists public.log_dashboard_role_change();

-- Role / status edits made directly in the Supabase dashboard (no signed-in user) are logged.
create or replace function public.log_dashboard_profile_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.role is distinct from old.role then
    insert into public.user_status_events (user_id, actor_id, kind, from_value, to_value, reason)
    values (new.id, null, 'role_changed', old.role::text, new.role::text, 'changed in Supabase dashboard');
  end if;
  if new.account_status is distinct from old.account_status then
    insert into public.user_status_events (user_id, actor_id, kind, from_value, to_value, reason)
    values (new.id, null,
      (case new.account_status
         when 'rejected' then 'rejected' when 'banned' then 'banned' when 'deleted' then 'deleted'
         else case old.account_status when 'banned' then 'unbanned' when 'pending' then 'approved' else 'reactivated' end
       end)::public.user_status_event_kind,
      old.account_status::text, new.account_status::text, 'changed in Supabase dashboard');
  end if;
  return null;
end $$;

create trigger profiles_dashboard_change after update of role, account_status on public.profiles
  for each row
  when ((old.role is distinct from new.role or old.account_status is distinct from new.account_status)
        and auth.uid() is null)
  execute function public.log_dashboard_profile_change();

revoke execute on function public.log_dashboard_profile_change() from public, anon, authenticated;
