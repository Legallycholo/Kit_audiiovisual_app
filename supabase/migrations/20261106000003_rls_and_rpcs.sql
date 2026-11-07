-- Row-level security, privileges and RPCs.
-- Rule: writes to roles, status, bookings, sessions and every history table go
-- through the SECURITY DEFINER functions below, never directly from the browser.

alter table public.app_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_status_events enable row level security;
alter table public.login_events enable row level security;
alter table public.services enable row level security;
alter table public.availability_rules enable row level security;
alter table public.availability_exceptions enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_notes enable row level security;
alter table public.booking_events enable row level security;
alter table public.sessions enable row level security;
alter table public.session_notes enable row level security;
alter table public.session_events enable row level security;
alter table public.payment_promises enable row level security;
alter table public.payment_promise_events enable row level security;
alter table public.media_assets enable row level security;
alter table public.media_access_log enable row level security;
alter table public.notifications enable row level security;
alter table public.calendar_integrations enable row level security;
alter table public.audit_log enable row level security;

-- ---------- Policies ----------
-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- user_roles / histories: read only
create policy user_roles_select on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy user_status_events_select on public.user_status_events for select to authenticated
  using (public.is_admin());
create policy login_events_select on public.login_events for select to authenticated
  using (public.is_admin());
create policy audit_log_select on public.audit_log for select to authenticated
  using (public.is_admin());
create policy media_access_log_select on public.media_access_log for select to authenticated
  using (public.is_admin());

-- settings, catalog, availability: signed-in users read, admins write
create policy app_settings_select on public.app_settings for select to authenticated using (true);
create policy app_settings_admin on public.app_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy services_select on public.services for select to authenticated
  using (active or public.is_admin());
create policy services_admin on public.services for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy availability_rules_select on public.availability_rules for select to authenticated using (true);
create policy availability_rules_admin on public.availability_rules for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy availability_exceptions_select on public.availability_exceptions for select to authenticated using (true);
create policy availability_exceptions_admin on public.availability_exceptions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- bookings and children: owner or admin read
create policy bookings_select on public.bookings for select to authenticated
  using (client_id = (select auth.uid()) or public.is_admin());
create policy booking_events_select on public.booking_events for select to authenticated
  using (public.is_admin() or exists (
    select 1 from public.bookings b
    where b.id = booking_id and b.client_id = (select auth.uid())));
create policy booking_notes_admin on public.booking_notes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy sessions_select on public.sessions for select to authenticated
  using (public.is_admin() or exists (
    select 1 from public.bookings b
    where b.id = booking_id and b.client_id = (select auth.uid())));
create policy session_events_select on public.session_events for select to authenticated
  using (public.is_admin() or exists (
    select 1 from public.sessions s join public.bookings b on b.id = s.booking_id
    where s.id = session_id and b.client_id = (select auth.uid())));
create policy session_notes_admin on public.session_notes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy payment_promises_select on public.payment_promises for select to authenticated
  using (public.is_admin() or exists (
    select 1 from public.bookings b
    where b.id = booking_id and b.client_id = (select auth.uid())));
create policy payment_promises_admin_write on public.payment_promises for insert to authenticated
  with check (public.is_admin());
create policy payment_promises_admin_update on public.payment_promises for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy payment_promise_events_select on public.payment_promise_events for select to authenticated
  using (public.is_admin() or exists (
    select 1 from public.payment_promises p join public.bookings b on b.id = p.booking_id
    where p.id = promise_id and b.client_id = (select auth.uid())));

create policy media_assets_select on public.media_assets for select to authenticated
  using (public.is_admin()
         or (client_id = (select auth.uid()) and visibility = 'shared_with_client'));
create policy media_assets_admin on public.media_assets for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy calendar_integrations_admin on public.calendar_integrations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- Table privileges ----------
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

-- Read-only (or RPC-written) tables.
revoke insert, update, delete, truncate on
  public.user_roles, public.user_status_events, public.login_events, public.audit_log,
  public.bookings, public.booking_events, public.sessions, public.session_events,
  public.payment_promise_events, public.media_access_log, public.notifications
from authenticated;
revoke delete, truncate on public.profiles, public.payment_promises from authenticated;
revoke insert, delete, truncate on public.profiles from authenticated;

-- Users may edit only these profile columns; status, role and links are admin-only RPCs.
revoke update on public.profiles from authenticated;
grant update (full_name, phone, company, avatar_path, locale, marketing_opt_in, last_seen_at)
  on public.profiles to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ---------- RPCs ----------
create function public.setting_int(p_key text, p_default integer) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::integer from public.app_settings where key = p_key), p_default);
$$;

-- Records a sign-in or sign-out for the caller, with IP and user agent from the request.
create function public.log_auth_event(p_event public.login_event_kind) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_event not in ('signed_in', 'signed_out') then
    raise exception 'invalid_event';
  end if;
  insert into public.login_events (user_id, event, ip, user_agent)
  values ((select auth.uid()), p_event, public.request_ip(), public.request_user_agent());
  update public.profiles set last_seen_at = now() where id = (select auth.uid());
end $$;

create function public.admin_set_role(p_user_id uuid, p_role public.app_role, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_old public.app_role;
  v_admins integer;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select role into v_old from public.user_roles where user_id = p_user_id for update;
  if not found then raise exception 'user_not_found'; end if;
  if v_old = p_role then return; end if;
  if v_old = 'admin' then
    select count(*) into v_admins
      from public.user_roles r join public.profiles p on p.id = r.user_id
     where r.role = 'admin' and p.account_status = 'active';
    if v_admins <= 1 then raise exception 'last_admin'; end if;
  end if;
  update public.user_roles
     set role = p_role, assigned_by = (select auth.uid()), assigned_at = now()
   where user_id = p_user_id;
  insert into public.user_status_events (user_id, actor_id, kind, from_value, to_value, reason)
  values (p_user_id, (select auth.uid()), 'role_changed', v_old::text, p_role::text, p_reason);
end $$;

create function public.admin_set_account_status(
  p_user_id uuid, p_status public.account_status, p_reason text default null, p_until timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_old public.account_status;
  v_kind public.user_status_event_kind;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user_id = (select auth.uid()) then raise exception 'cannot_change_self'; end if;
  if p_status = 'pending' then raise exception 'invalid_status'; end if;
  select account_status into v_old from public.profiles where id = p_user_id for update;
  if not found then raise exception 'user_not_found'; end if;
  if v_old = p_status then return; end if;
  v_kind := (case p_status
    when 'rejected' then 'rejected'
    when 'banned' then 'banned'
    when 'deleted' then 'deleted'
    else case v_old when 'banned' then 'unbanned' when 'pending' then 'approved' else 'reactivated' end
  end)::public.user_status_event_kind;
  update public.profiles
     set account_status = p_status,
         status_reason = case when p_status = 'active' then null else p_reason end,
         status_until = case when p_status = 'active' then null else p_until end
   where id = p_user_id;
  insert into public.user_status_events (user_id, actor_id, kind, from_value, to_value, reason)
  values (p_user_id, (select auth.uid()), v_kind, v_old::text, p_status::text, p_reason);
end $$;

-- Internal: move every open session of a booking to a new status and log it.
create function public._set_sessions_status(p_booking_id uuid, p_to public.session_status, p_actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  for r in
    select id, status from public.sessions
     where booking_id = p_booking_id and status in ('scheduled', 'in_progress')
  loop
    update public.sessions set status = p_to where id = r.id;
    insert into public.session_events (session_id, actor_id, from_status, to_status)
    values (r.id, p_actor, r.status, p_to);
  end loop;
end $$;

-- Internal: create the scheduled session for a confirmed booking.
create function public._create_session(p_booking public.bookings, p_actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  insert into public.sessions (booking_id, starts_at, ends_at, status)
  values (p_booking.id, p_booking.starts_at, p_booking.ends_at, 'scheduled')
  returning id into v_id;
  insert into public.session_events (session_id, actor_id, to_status)
  values (v_id, p_actor, 'scheduled');
end $$;

-- Slot availability rules (weekly hours, blocked dates) are enforced once
-- get-available-slots lands; for now only notice, horizon and overlap are checked.
create function public.create_booking(
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

  select role into v_role from public.user_roles where user_id = v_uid;
  insert into public.booking_events (booking_id, actor_id, actor_role, kind, to_status, payload)
  values (v_booking.id, v_uid, v_role, 'created', v_booking.status, jsonb_build_object('source', v_booking.source));

  if v_booking.status = 'confirmed' then
    perform public._create_session(v_booking, v_uid);
  end if;
  return v_booking.id;
end $$;

create function public.update_booking_status(
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

  select role into v_role from public.user_roles where user_id = v_uid;
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

-- ---------- Function privileges ----------
revoke execute on all functions in schema public from public, anon;
revoke execute on function
  public.handle_new_user(), public.set_updated_at(), public.audit_row_change(),
  public.log_promise_change(), public.promote_first_booking(),
  public._set_sessions_status(uuid, public.session_status, uuid),
  public._create_session(public.bookings, uuid),
  public.setting_int(text, integer)
from authenticated;
grant execute on function
  public.is_admin(), public.is_active_user(),
  public.log_auth_event(public.login_event_kind),
  public.admin_set_role(uuid, public.app_role, text),
  public.admin_set_account_status(uuid, public.account_status, text, timestamptz),
  public.create_booking(uuid, timestamptz, text, uuid),
  public.update_booking_status(uuid, public.booking_status, text)
to authenticated;
