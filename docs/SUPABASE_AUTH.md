# Supabase sign-up, sign-in and roles

Status: **implemented, not yet exercised against the live project.** The schema
is applied to the `kit audio visual` project and the server and UI are in place,
but no real account has signed in yet — that needs the service-role key below.

Supabase Auth is the front door. It is **not** the authorization gate: the
Express server verifies the token, reads the approved role from Postgres and
issues its own KIT session, so every existing scope and permission check keeps
working unchanged. This mirrors the older `POST /api/login/firebase` exchange.

## How a sign-in flows

```
Browser
  └─ supabase.auth signUp / token?grant_type=password   (src/shared/supabase.ts)
       └─ access_token (ES256, discarded straight after)
            └─ POST /api/login/supabase                 (server/routes/auth.ts)
                 ├─ verify the JWT against the project JWKS
                 ├─ refuse an unconfirmed email
                 ├─ read public.profiles with the service-role key
                 ├─ refuse pending / disabled / unknown-role accounts
                 ├─ mirror the account into the local users table
                 └─ Set-Cookie: kit_session + CSRF token
```

Nothing about the role comes from the browser. A tampered or self-issued token
fails signature or issuer checks; a valid token for a pending account is still
refused with 403.

## Database objects

Applied as four migrations to project `shskkpnzevrzbnccdzyc`.

| Object | Purpose |
| --- | --- |
| `kit_role` enum | The six roles, spelled exactly as `src/shared/access.ts` |
| `kit_account_status` enum | `pending`, `active`, `disabled` |
| `profiles` | One row per `auth.users` row: role, status, owner flag, client link |
| `profile_event_grants` | Event scope, mirroring `WorkspaceUser.eventIds` |
| `profile_proposal_shares` | Client proposal sharing, mirroring `sharedProposalIds` |
| `auth_audit` | Sign-ups, approvals and role changes |
| `handle_new_user()` | Trigger on `auth.users`: creates the profile |
| `guard_profile_privileges()` | Blocks self-escalation |
| `log_profile_change()` | Records role and status changes |
| `is_admin()` | Used by the RLS policies |
| `kit_account(uuid)` | One call returns a full account for the server |

### The rules the database enforces

- **Signing up grants nothing.** `handle_new_user()` creates the profile with
  `status = 'pending'` and `role = null`.
- **Except the very first account.** When no active Administrator exists, the
  first account bootstraps as the active owner — the same rule as
  `POST /api/setup`. Once an administrator exists the exception is gone.
- **Nobody raises their own privileges.** `guard_profile_privileges()` rejects
  any change to `role`, `status`, `is_owner`, `email` or `client_id` unless the
  actor is an administrator or the KIT server's service role. A signed-in user
  can only ever edit their own display name.
- **Accounts are disabled, never deleted**, matching KIT's existing rule. There
  is no `INSERT` or `DELETE` policy for `authenticated`.
- **RLS is on for all four tables.** A user reads only their own rows;
  administrators read everything.

Verified by inserting two `auth.users` rows inside a transaction and rolling it
back: the first became `Administrator/active/owner`, the second
`null/pending/not owner`, and both produced an audit row.

## Approving an account

An administrator opens **Configuración › Usuarios** and sees *Solicitudes de
acceso*. Choosing a role and approving calls
`PATCH /api/supabase/accounts/:id`, which is administrator-only, refuses changes
to the owner or to the caller's own account, writes to Postgres with the
service-role key, revokes any KIT session on a disable, and records the decision
in the KIT audit trail. `/admin` shows the same queue plus role distribution and
access history.

The role is re-read from Postgres on **every** sign-in, so a change takes effect
the next time the person signs in rather than being cached in SQLite.

## Setup

1. Copy the Supabase block from `.env.example` into `.env`. The two `VITE_`
   values are published by design and already filled in.
2. Add `SUPABASE_SERVICE_ROLE_KEY` from Dashboard › Project Settings › API.
   It bypasses RLS: server-only, never a `VITE_` variable.
3. Leave `SUPABASE_JWT_SECRET` empty. This project signs with **ES256** and
   publishes a JWKS, which is verified without a shared secret.
4. Restart `npm run dev`. Without both server variables the sign-up tab still
   appears but `POST /api/login/supabase` answers 404.

### Email confirmation

The project currently has `mailer_autoconfirm: false`, so a new account must
click a link before it can sign in, and Supabase's built-in mailer is rate
limited. For testing, turn off **Confirm email** in Dashboard › Authentication ›
Providers › Email. The server independently refuses unconfirmed emails, so this
only changes how quickly an account becomes usable.

### The first administrator

`auth.users` already holds one account, `legallycholo3@gmail.com`, created
before the trigger existed, so it has **no profile** and cannot sign in. Pick
one:

- Delete that user in Dashboard › Authentication › Users, then sign up again
  through the app. The trigger bootstraps the first account as owner.
- Or sign up with a different email; that account becomes the owner, and the
  orphaned one can then be approved or removed.
- Or backfill a profile row for it by hand.

## Known gaps

- No real sign-in has been performed; the flow is covered by unit and API tests
  with local fixtures, not against the live project.
- `profile_event_grants` and `profile_proposal_shares` are created, enforced by
  RLS and read by `kit_account()`, but the approval UI does not edit them yet.
  Event scope is still assigned in the existing *Usuarios y roles* screen.
- Business records stay in SQLite. This work covers accounts and roles only;
  the per-record migration is [DATA_MODEL_PROPOSAL.md](DATA_MODEL_PROPOSAL.md).
- One security advisor warning remains by design: `is_admin()` is executable by
  `authenticated` because RLS policy expressions run as the querying role. It
  reports only on the caller's own account.
- Leaked-password protection is off in the Supabase project; it is a dashboard
  toggle worth enabling.
