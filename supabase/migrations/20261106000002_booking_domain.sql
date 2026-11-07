-- Booking domain: services, availability, bookings, sessions, promises, media, notifications, audit.

create type public.booking_status as enum
  ('requested', 'confirmed', 'rejected', 'cancelled', 'completed', 'no_show');
create type public.session_status as enum
  ('scheduled', 'in_progress', 'completed', 'no_show', 'cancelled');
create type public.booking_source as enum ('portal', 'admin', 'calcom');
create type public.booking_event_kind as enum
  ('created', 'confirmed', 'rejected', 'rescheduled', 'reschedule_requested',
   'cancelled', 'completed', 'no_show', 'note_added', 'promise_updated');
create type public.promise_status as enum ('promised', 'partial', 'received', 'waived', 'overdue');
create type public.promise_method as enum ('cash', 'transfer', 'card_in_person', 'other');
create type public.media_visibility as enum ('internal', 'shared_with_client');
create type public.availability_exception_kind as enum ('blocked', 'extra');
create type public.notification_channel as enum ('in_app', 'email');

create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  duration_minutes integer not null check (duration_minutes > 0),
  buffer_before_minutes integer not null default 0 check (buffer_before_minutes >= 0),
  buffer_after_minutes integer not null default 0 check (buffer_after_minutes >= 0),
  display_price numeric(12, 2), -- informational only; nothing is charged online
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger services_updated_at before update on public.services
  for each row execute function public.set_updated_at();

create table public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references public.services (id) on delete cascade, -- null = all services
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  valid_from date,
  valid_to date,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create table public.availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  during tstzrange not null,
  kind public.availability_exception_kind not null default 'blocked',
  reason text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete restrict,
  service_id uuid not null references public.services (id) on delete restrict,
  status public.booking_status not null default 'requested',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  time_range tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  location text,
  notes_client text, -- visible to the client; admin notes live in booking_notes
  created_by uuid references auth.users (id) on delete set null,
  source public.booking_source not null default 'portal',
  external_id text, -- cal.com later
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- One live booking per time range; the database is the final guard against races.
  constraint bookings_no_overlap
    exclude using gist (time_range with &&) where (status in ('requested', 'confirmed'))
);
create index bookings_client_idx on public.bookings (client_id, starts_at desc);
create index bookings_status_idx on public.bookings (status, starts_at);
create index bookings_service_idx on public.bookings (service_id);
create trigger bookings_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();

create table public.booking_notes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index booking_notes_booking_idx on public.booking_notes (booking_id);

create table public.booking_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  actor_role public.app_role,
  kind public.booking_event_kind not null,
  from_status public.booking_status,
  to_status public.booking_status,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index booking_events_booking_idx on public.booking_events (booking_id, created_at);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.session_status not null default 'scheduled',
  run_by uuid references auth.users (id) on delete set null,
  summary text, -- visible to the client; private notes live in session_notes
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sessions_booking_idx on public.sessions (booking_id);
create index sessions_starts_idx on public.sessions (starts_at);
create trigger sessions_updated_at before update on public.sessions
  for each row execute function public.set_updated_at();

create table public.session_notes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index session_notes_session_idx on public.session_notes (session_id);

create table public.session_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.sessions (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  from_status public.session_status,
  to_status public.session_status,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index session_events_session_idx on public.session_events (session_id, created_at);

-- Payments are promises settled in person; no online payments.
create table public.payment_promises (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'MXN',
  due_on date,
  status public.promise_status not null default 'promised',
  received_at timestamptz,
  received_by uuid references auth.users (id) on delete set null,
  method public.promise_method,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payment_promises_booking_idx on public.payment_promises (booking_id);
create trigger payment_promises_updated_at before update on public.payment_promises
  for each row execute function public.set_updated_at();

create table public.payment_promise_events (
  id bigint generated always as identity primary key,
  promise_id uuid not null references public.payment_promises (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  from_status public.promise_status,
  to_status public.promise_status,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index payment_promise_events_promise_idx on public.payment_promise_events (promise_id);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.profiles (id) on delete set null,
  booking_id uuid references public.bookings (id) on delete set null,
  session_id uuid references public.sessions (id) on delete set null,
  bucket text not null,
  path text not null,
  kind text,
  mime text,
  size bigint,
  visibility public.media_visibility not null default 'internal',
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (bucket, path)
);
create index media_assets_client_idx on public.media_assets (client_id);
create index media_assets_booking_idx on public.media_assets (booking_id);
create index media_assets_session_idx on public.media_assets (session_id);

create table public.media_access_log (
  id bigint generated always as identity primary key,
  asset_id uuid references public.media_assets (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  action text not null check (action in ('view', 'download')),
  created_at timestamptz not null default now()
);

create index media_access_log_asset_idx on public.media_access_log (asset_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  channel public.notification_channel not null default 'in_app',
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.calendar_integrations (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('calcom')),
  status text not null default 'disconnected',
  config jsonb not null default '{}'::jsonb, -- non-secret settings only
  last_sync_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id text,
  actor_id uuid,
  action text not null,
  diff jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_table_idx on public.audit_log (table_name, created_at desc);

-- Generic audit trigger for configuration tables.
create function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_log (table_name, row_id, actor_id, action, diff)
  values (
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'key'),
    (select auth.uid()),
    tg_op,
    case tg_op
      when 'UPDATE' then jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
      else v_row
    end
  );
  return null;
end $$;

create trigger services_audit after insert or update or delete on public.services
  for each row execute function public.audit_row_change();
create trigger availability_rules_audit after insert or update or delete on public.availability_rules
  for each row execute function public.audit_row_change();
create trigger availability_exceptions_audit after insert or update or delete on public.availability_exceptions
  for each row execute function public.audit_row_change();
create trigger app_settings_audit after insert or update or delete on public.app_settings
  for each row execute function public.audit_row_change();

-- Payment-promise history, written by trigger.
create function public.log_promise_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.payment_promise_events (promise_id, actor_id, to_status, payload)
    values (new.id, (select auth.uid()), new.status, jsonb_build_object('amount', new.amount));
  elsif new.status is distinct from old.status or new.amount is distinct from old.amount then
    insert into public.payment_promise_events (promise_id, actor_id, from_status, to_status, payload)
    values (new.id, (select auth.uid()), old.status, new.status,
            jsonb_build_object('amount', new.amount, 'method', new.method));
  end if;
  return new;
end $$;
create trigger payment_promises_history after insert or update on public.payment_promises
  for each row execute function public.log_promise_change();

-- First submitted booking promotes a plain user to client.
create function public.promote_first_booking() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.user_roles
     set role = 'client', assigned_at = now()
   where user_id = new.client_id and role = 'user';
  if found then
    insert into public.user_status_events (user_id, actor_id, kind, from_value, to_value, reason)
    values (new.client_id, (select auth.uid()), 'role_changed', 'user', 'client', 'first_booking');
  end if;
  return new;
end $$;
create trigger bookings_promote_client after insert on public.bookings
  for each row execute function public.promote_first_booking();
