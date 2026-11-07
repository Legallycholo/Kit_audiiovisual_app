-- Foundation: enums, identity (profiles, roles), status/login history, settings, helpers.
-- Every table has RLS enabled in 20261106000003_rls_and_rpcs.sql.

create extension if not exists btree_gist with schema extensions;

create type public.app_role as enum ('user', 'client', 'admin');
create type public.account_status as enum ('active', 'pending', 'rejected', 'banned', 'deleted');
create type public.user_status_event_kind as enum
  ('signup', 'role_changed', 'approved', 'rejected', 'banned', 'unbanned', 'reactivated', 'deleted');
create type public.login_event_kind as enum ('signup', 'signed_in', 'signed_out');

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- App settings (no secrets here; readable by signed-in users, writable by admins).
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  company text,
  avatar_path text,
  locale text not null default 'es',
  account_status public.account_status not null default 'active',
  status_reason text,
  status_until timestamptz,
  marketing_opt_in boolean not null default false,
  workspace_client_id text, -- optional manual link to the internal workspace client
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Roles live apart from profiles so a profile edit can never change a role.
create table public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'user',
  assigned_by uuid references auth.users (id) on delete set null,
  assigned_at timestamptz not null default now()
);

-- Append-only history of role and account-status changes.
create table public.user_status_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  actor_id uuid references auth.users (id) on delete set null,
  kind public.user_status_event_kind not null,
  from_value text,
  to_value text,
  reason text,
  created_at timestamptz not null default now()
);
create index user_status_events_user_idx on public.user_status_events (user_id, created_at desc);

-- Append-only login history.
create table public.login_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  event public.login_event_kind not null,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index login_events_user_idx on public.login_events (user_id, created_at desc);
create index login_events_created_idx on public.login_events (created_at desc);

-- Helpers used by policies and RPCs. SECURITY DEFINER so they can read the
-- tables without being blocked by the policies that call them.
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.user_roles r
    join public.profiles p on p.id = r.user_id
    where r.user_id = (select auth.uid())
      and r.role = 'admin'
      and p.account_status = 'active'
  );
$$;

create function public.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.account_status = 'active'
  );
$$;

create function public.request_ip() returns text
language sql stable set search_path = '' as $$
  select nullif(split_part(coalesce(
    (nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for'), ''), ',', 1), '');
$$;

create function public.request_user_agent() returns text
language sql stable set search_path = '' as $$
  select nullif(nullif(current_setting('request.headers', true), '')::json ->> 'user-agent', '');
$$;

-- Sign-up bootstrap: profile + role 'user' + history. The role never comes from
-- user-supplied metadata.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_status public.account_status := 'active';
begin
  if coalesce((select value #>> '{}' from public.app_settings where key = 'require_account_approval'), 'false') = 'true' then
    v_status := 'pending';
  end if;

  insert into public.profiles (id, full_name, phone, account_status)
  values (
    new.id,
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

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
