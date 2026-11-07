# Supabase (KIT portal)

Project: `kit audiovisual` (`hgugkgbpsrbqusazmthb`, ca-central-1). The migrations in `migrations/` are the
source of truth and have all been applied to the hosted project (in order). There is no local stack on this
machine (no Docker / Supabase CLI), so changes are applied with the Supabase connector and verified with
rolled-back SQL transactions.

## Create the first admin (manual, by design)

1. Sign up at `/portal/signup` (or add the user in the Supabase dashboard → Authentication).
2. In the SQL editor run (replace the email):

```sql
update public.user_roles
   set role = 'admin'
 where user_id = (select id from auth.users where email = 'you@example.com');
```

Every other role change is made from `/portal/admin/users`, which calls `admin_set_role` and records who
changed what and why. The last admin cannot be demoted.

## Change a user's role from the dashboard

Table Editor → `user_roles` → click the `role` cell of that user → choose `user`, `client` or `admin`.
(Find the user by `user_id`; the same id is in Authentication → Users and in `profiles` next to the email.)
The change is recorded in `user_status_events` as "changed in Supabase dashboard". The last-admin guard only
applies to changes made through the portal, so keep at least one admin yourself.

## Dashboard settings to review (cannot be set from SQL)

- Authentication → URL Configuration: add `http://localhost:3001/portal/**` and the Fly URL to Redirect URLs.
- Authentication → Sign In / Providers → Email: choose whether "Confirm email" is required.
- Authentication → Attack Protection: enable leaked-password protection (plan permitting).

## Never

- Put the secret key (`SUPABASE_SECRET_KEY`) in a `VITE_` variable, in the browser, or in git.
