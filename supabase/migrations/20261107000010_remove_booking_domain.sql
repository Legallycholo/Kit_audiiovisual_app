-- KIT is an admin-only workspace, not a meeting scheduler. Remove the booking domain and the
-- client role. What stays: profiles (role + account status), login/status history, audit log and
-- the app settings that still apply (business name, timezone, account approval).
--
-- Safety: every dropped table was empty except `services` (2 seeded rows) and
-- `availability_rules` (5 seeded rows); `bookings`, `sessions`, `payment_promises`,
-- `media_assets` and `notifications` had no rows, and the storage buckets held no objects.

-- 1. Functions that take or return booking types.
drop function if exists public.create_booking(uuid, timestamptz, text, uuid);
drop function if exists public.update_booking_status(uuid, public.booking_status, text);
drop function if exists public._create_session(public.bookings, uuid);
drop function if exists public._set_sessions_status(uuid, public.session_status, uuid);

-- 2. Storage policies for the booking buckets. (Supabase blocks deleting buckets from SQL; the
--    three empty buckets `avatars`, `deliverables` and `session-attachments` can be deleted in the
--    dashboard, Storage. Without these policies nobody but the service role can use them.)
drop policy if exists attachments_admin on storage.objects;
drop policy if exists avatars_delete_own on storage.objects;
drop policy if exists avatars_update_own on storage.objects;
drop policy if exists avatars_write_own on storage.objects;
drop policy if exists deliverables_admin_write on storage.objects;
drop policy if exists deliverables_select on storage.objects;

-- 3. Tables (children first; their policies, triggers and indexes go with them).
drop table if exists public.payment_promise_events cascade;
drop table if exists public.payment_promises cascade;
drop table if exists public.media_access_log cascade;
drop table if exists public.media_assets cascade;
drop table if exists public.session_notes cascade;
drop table if exists public.session_events cascade;
drop table if exists public.sessions cascade;
drop table if exists public.booking_notes cascade;
drop table if exists public.booking_events cascade;
drop table if exists public.bookings cascade;
drop table if exists public.availability_exceptions cascade;
drop table if exists public.availability_rules cascade;
drop table if exists public.services cascade;
drop table if exists public.calendar_integrations cascade;
drop table if exists public.notifications cascade;

-- 4. Trigger/helper functions and enum types that only the booking domain used.
drop function if exists public.promote_first_booking();
drop function if exists public.log_promise_change();
drop function if exists public.setting_int(text, integer);

drop type if exists public.booking_event_kind;
drop type if exists public.booking_source;
drop type if exists public.booking_status;
drop type if exists public.availability_exception_kind;
drop type if exists public.media_visibility;
drop type if exists public.notification_channel;
drop type if exists public.promise_method;
drop type if exists public.promise_status;
drop type if exists public.session_status;

-- 5. Booking-only settings.
delete from public.app_settings
 where key in ('cancellation_window_hours', 'max_horizon_days', 'min_notice_hours');

-- 6. Roles: a person is either an admin or a plain user (an employee later on). No clients.
update public.profiles set role = 'user' where role = 'client';

drop trigger if exists profiles_dashboard_change on public.profiles;
drop function if exists public.admin_set_role(uuid, public.app_role, text);

alter type public.app_role rename to app_role_old;
create type public.app_role as enum ('user', 'admin');
alter table public.profiles alter column role drop default;
alter table public.profiles
  alter column role type public.app_role using role::text::public.app_role;
alter table public.profiles alter column role set default 'user';
drop type public.app_role_old;

create function public.admin_set_role(p_user_id uuid, p_role public.app_role, p_reason text default null)
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

revoke execute on function public.admin_set_role(uuid, public.app_role, text) from public, anon;
grant execute on function public.admin_set_role(uuid, public.app_role, text) to authenticated, service_role;

create trigger profiles_dashboard_change after update of role, account_status on public.profiles
  for each row
  when ((old.role is distinct from new.role or old.account_status is distinct from new.account_status)
        and auth.uid() is null)
  execute function public.log_dashboard_profile_change();
