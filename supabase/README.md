# Supabase (KIT portal and company database)

Project: `kit audiovisual` (`hgugkgbpsrbqusazmthb`, ca-central-1). The migrations in `migrations/` are the
source of truth. **All of them (1–14, plus the `fix_create_booking_status_cast` hotfix of 2026-11-06) are applied
to the hosted project**, and since 2026-11-11 the project's own migration history (`supabase_migrations.schema_migrations`)
lists every one of them; 10–14 were applied by hand through the SQL editor, so their ledger rows carry a note instead
of the SQL. Keep the two in step: apply new files with the connector's `apply_migration`, which records them. There is no
local stack on this machine (no Docker / Supabase CLI); changes are verified with rolled-back SQL transactions.
Still to do in the dashboard (not possible from SQL): delete the empty booking buckets `deliverables` and
`session-attachments`, and enable leaked-password protection (Authentication → Attack Protection).

## Create the first admin (manual, by design)

1. Add the user in the Supabase dashboard → Authentication → Users → Add user (tick "Auto Confirm User"),
   or let the person request an account at `/portal/signup` and approve it in `/portal/admin/users`.
2. In the SQL editor run (replace the email):

```sql
update public.profiles
   set role = 'admin'
 where email = 'you@example.com';
```

Every other role change is made in the `profiles` table or from `/portal/admin/users` (linked from the workspace sidebar, "Usuarios y accesos"), which calls `admin_set_role` and records who
changed what and why. The last admin cannot be demoted.

## Change a user's role from the dashboard

Table Editor → `profiles` → click the `role` cell of that person (the email is in the same row) → choose
`user` or `admin`. `account_status` (`active`, `rejected`, `banned`…) is in the same table. Both
changes are recorded in `user_status_events` as "changed in Supabase dashboard". The last-admin guard only
applies to changes made through the portal, so keep at least one admin yourself.

## Change anyone's password from the dashboard (migration 11)

Table Editor → `profiles` → the person's row (the email is in the same row) → type the new password
(8+ characters) in the `new_password` cell → save. A trigger hashes it into the real sign-in account
(`auth.users`), signs that person out everywhere, logs a `password_changed` event in `user_status_events`
and clears the cell. Passwords are never stored in `profiles`: the cell is always empty afterwards.
Works for every account, admins included. Signed-in users cannot write this column through the API.
Note: what you type travels as an SQL statement from the dashboard, so it can appear in the project's
query logs; use a one-time password and have the person change it, or use Authentication → Users →
"Send password recovery" instead.

## Dashboard settings to review (cannot be set from SQL)

- Authentication → URL Configuration: add `http://localhost:3001/portal/**` and the Vercel URL to Redirect URLs.
- Authentication → Sign In / Providers → Email: sign-ups stay on (the portal has a sign-up page; `app_settings.require_account_approval` keeps new accounts pending). Choose whether "Confirm email" is required.
- Authentication → Attack Protection: enable leaked-password protection (plan permitting).

## Never

- Put the secret key (`SUPABASE_SECRET_KEY`) in a `VITE_` variable, in the browser, or in git.

## The company database (migration 12, `kit` schema)

`20261107000012_kit_company_schema.sql` creates the company server's tables (workspace, users, sessions, audit,
login attempts, recovery points, search and KIT conversations) in a **private `kit` schema**, separate from the
portal's `public` tables and **not exposed through the Data API**. It enables row level security with no public
policy and creates the `kit_server` role (no password in the file) that the company server uses.
It is applied, and the `kit_server` role has its password set (see [../docs/DEPLOY_VERCEL.md](../docs/DEPLOY_VERCEL.md)).
The same file is what local development and the tests run on in-process PGlite, so the two cannot drift.

`20261109000013_kit_design.sql` (migration 13) adds KIT Design's tables (`design_projects`, `design_images`,
`design_versions`, `design_renders`, `design_messages`, `design_files`) to the same `kit` schema with the same
`kit_server` policies, and creates the **private** Storage bucket `kit-design` (no public policies; only the server's
secret key reads or writes it). Apply it after migration 12. PGlite runs both files in order.

`20261110000014_kit_design_chats_and_video.sql` (migration 14) lets an event keep many designs ("chats"): `design_projects.id`
becomes the key and the other design tables get a `design_id` (existing rows keep working: their design id is the old event
id). It adds `design_videos` and lets the `kit-design` bucket hold mp4 files up to 50 MB. Idempotent.

Why not `public`? The portal already owns `public.sessions` and `public.audit_log`, and `public` is what the Data API
publishes; password hashes must never be reachable that way.
