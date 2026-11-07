-- Users created before the sign-up trigger existed have no profile or role row.
insert into public.profiles (id, email, full_name, account_status)
select u.id, u.email, nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''), 'active'
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

insert into public.user_roles (user_id, role)
select u.id, 'user'
from auth.users u
where not exists (select 1 from public.user_roles r where r.user_id = u.id);

insert into public.user_status_events (user_id, kind, to_value, reason)
select u.id, 'signup', 'user', 'backfill'
from auth.users u
where not exists (select 1 from public.user_status_events e where e.user_id = u.id);
