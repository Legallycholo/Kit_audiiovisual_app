# KIT Portal — Backend & Dashboards Implementation Plan

Status: **Draft for approval. No code has been written.**
Date: 2026-11-05
Scope decision (confirmed): Supabase is the **public booking layer only**. The internal company workspace (proposals, inventory, operations, desktop app) stays on Express + SQLite and is not migrated. **Firebase has been removed from the repo (code, dependencies, CSP, env template)**; the workspace signs in with its local password login (`/api/login`) until a later project decides whether to move it to Supabase Auth.

---

## 0. How to read this plan

1. §1 lists what changes in the repo rules before any work starts (approval gates).
2. §2–§5 define the product: roles, pages, data, backend.
3. §6–§7 define UI/UX and branding so every new page stays on-brand.
4. §8 is the phased build order with acceptance criteria. §9–§12 cover testing, deploy, risks and open questions.

Terms used throughout:

- **Portal** = the new Supabase-backed app (auth, booking, dashboards), mounted under `/portal/*` in the existing Vite SPA.
- **Workspace** = the existing internal KIT app (`/`, `/events`, `/clients`, …). It is untouched.
- **Portal admin** = a user whose portal role is `admin`. Not the same record as the workspace `Administrator` role (see §10, risk R2).

---

## 1. Approval gates (must be settled before Phase 1)

The current repo rules conflict with this project. Each item needs an explicit yes from the owner.

| # | Rule today (CLAUDE.md / repo) | What this plan needs | Proposed resolution |
|---|---|---|---|
| G1 | "No external calls. Never add credentials." | A Supabase project (hosted) and its anon key in the frontend env. | Amend CLAUDE.md: _portal code may call the project's own Supabase instance only_. Tests run against a **local** Supabase stack (Docker), never the hosted project. Service-role key lives only in Supabase Edge Function secrets, never in the repo, `.env*` examples or the client bundle. |
| G2 | "Never touch `.env*`". | New `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. | Document the variables in a new `docs/backend-dashboards/ENV.md`; the owner sets real values by hand. |
| G3 | "Ask before changing the on-disk database format". | None — SQLite is untouched. | Confirm explicitly in CLAUDE.md that Supabase Postgres is a separate store from `data/`. |
| G4 | "Where things live" list. | New `src/portal/` and top-level `supabase/` folders. | Add both to CLAUDE.md "Where things live". |
| G5 | Commits happen on `main` (memory: work-on-main); no push without approval. | Same. | Each phase = one or more commits on `main`; no push/deploy until approved. |
| G6 | Commit `9ed9d10` removed Supabase auth; Firebase was then removed on your instruction (2026-11-05, uncommitted at time of writing). | Supabase becomes the only external auth provider. | Do **not** restore the old code. New work is a clean module. Note the reversal in `docs/TECHNICAL_DECISIONS.md` with the reason (public booking layer vs. workspace login). |

Also required: record the decision in `docs/TECHNICAL_DECISIONS.md` and add a "Portal" line to `docs/STATUS.md`.

---

## 2. Roles, account states and rules

### 2.1 Roles (portal)

| Role | How assigned | Can do |
| --- | --- | --- |
| `user` | Default on sign-up. | Manage own profile. Browse public pages. Start a booking (the first submitted booking promotes them). |
| `client` | **Automatic** when a `user` submits their first booking (DB trigger, see §4.4). Admin can also set it manually. | Everything `user` can, plus client dashboard, own bookings, own media, own payment promises (read-only). |
| `admin` | Manual only (SQL seed for the first admin, then admin UI). Never self-assigned. | Everything. Cannot demote or ban the **last** remaining admin. |

Future roles (not built now, schema supports them via the `app_role` enum): `staff` (a session-runner without full admin rights).

Rule from the request kept as written: _"if anything role should stay as user"_ → any failure, rejection or cancelled-before-submit leaves the role at `user`. A booking that is later rejected or cancelled does **not** demote a `client` (history of being a client is kept). Admin can demote manually.

### 2.2 Account status (separate from role)

| Status | Meaning | Effect |
| --- | --- | --- |
| `active` | Normal. | — |
| `rejected` | Admin declined this person (e.g. unverified, spam, out of service area). | Can log in and see a "your account was not approved" page; cannot create bookings; can be reactivated. Reason stored. |
| `banned` | Admin blocked access. | Cannot log in (Supabase auth ban + status check in RLS); active sessions revoked; open bookings auto-cancelled with a history entry; reason stored; optional expiry date. |
| `deleted` | Soft-deleted per user request / admin action. | PII scrubbed after retention window; history rows kept with the user id anonymised. |

Optional setting (default **off**): `require_account_approval` → new sign-ups start as `pending` and an admin must approve. Included in the schema, UI hidden behind Settings until you want it.

### 2.3 Hard rules (enforced in the database, not only the UI)

- A user can never change their own `role` or `account_status`.
- Only `admin` can change roles/status, and every change writes a history row with actor, old value, new value and reason.
- Banned or rejected users fail RLS checks on write tables even if they hold a still-valid JWT.
- History tables are **append-only**: no UPDATE/DELETE policies for anyone; `REVOKE UPDATE, DELETE` on the tables.

---

## 3. Pages and routes

All portal routes live under `/portal` to avoid collisions with the workspace routes (`/clients`, `/events`, …). Each is a **unique page with a slug**. Modals are used only for confirmations and small single-field edits (§6.2). UI copy is Spanish and goes in `src/shared/i18n.ts`; slugs stay English to match the existing router.

### 3.1 General (all visitors / any signed-in user)

| Route | Purpose | Notes |
| --- | --- | --- |
| `/portal` | Smart redirect: signed out → `/portal/login`; `user` → `/portal/book`; `client` → `/portal/client`; `admin` → `/portal/admin`. | No visible page. |
| `/portal/signup` | Create account (name, email, password, accept terms). | reCAPTCHA is already in the repo (workspace login); reuse it or Supabase CAPTCHA (decide in Phase 3). |
| `/portal/login` | Email + password. | Magic link optional later. |
| `/portal/forgot-password` | **Added.** Request reset email. | Required; passwords will be forgotten. |
| `/portal/reset-password` | **Added.** Set new password from email link. | |
| `/portal/auth/callback` | **Added.** Handles email verification / recovery redirects. | No UI beyond a spinner. |
| `/portal/profile` | Name, phone, company, language, avatar (bucket), change password, notification preferences, request account deletion. | Same page for every role; admin sees extra read-only role badge. |
| `/portal/account-status` | **Added.** Shown to `rejected`/`banned` users instead of the app, with reason and contact info. | Banned users are signed out; this page is reachable via the redirect. |
| `/portal/book` | **Added.** Public-facing booking start: choose service → pick slot → details → review. Reachable by `user`; guests are sent to login and returned. | Multi-step as separate slugs: `/portal/book/service`, `/portal/book/slot`, `/portal/book/details`, `/portal/book/review`. Draft kept in session storage. |

**Removed from your list:** a separate **Log out page**. Logging out is an action (menu item + confirmation not needed), after which the user lands on `/portal/login` with a toast. A dedicated page adds nothing.

### 3.2 Client pages (role `client`; `user` sees only `/portal/book` and `/portal/profile`)

| Route | Purpose |
| --- | --- |
| `/portal/client` | **Dashboard:** next confirmed session, pending requests, outstanding payment promises, latest media, "Book again" CTA. |
| `/portal/client/bookings` | **Booking management:** list with filters (status, date), search. |
| `/portal/client/bookings/:bookingId` | Detail: status timeline (from `booking_events`), reschedule request, cancel (modal confirm), payment promise status, files. |
| `/portal/client/media` | **Added.** Deliverables the admin published to this client (photos/video/docs) from the private bucket, with download via signed URLs. Include only if deliverables are shared through the app; otherwise drop. |

Reschedule is a **request** the admin approves (keeps admin in control of the calendar) — not an instant change.

### 3.3 Admin pages (role `admin`)

| Route | Purpose |
| --- | --- |
| `/portal/admin` | **Dashboard:** today's sessions, requests awaiting action, week utilisation, new sign-ups, promised-vs-collected summary, recent alerts (bans, failed actions). |
| `/portal/admin/bookings` | Table + calendar toggle; filters; bulk actions (confirm/reject). |
| `/portal/admin/bookings/:bookingId` | Detail: confirm / reject / reschedule / cancel (modal confirm with reason), client info, payment promise, internal notes, full event history. |
| `/portal/admin/bookings/new` | **Added.** Create a booking on behalf of a client (phone / walk-in). |
| `/portal/admin/sessions` | **Session management:** calendar + list of scheduled/completed sessions. |
| `/portal/admin/sessions/:sessionId` | Detail: status (scheduled → in progress → completed / no-show / cancelled), notes, attachments, deliverables upload, history. |
| `/portal/admin/availability` | **Added.** Weekly hours, exceptions, blackout dates, buffers. This is the page cal.com will later feed or replace (see §8 Phase 11). |
| `/portal/admin/clients` | Client list (users with role `client`) with totals. |
| `/portal/admin/clients/:userId` | Profile, bookings, sessions, media, payment promises, notes, login history, role/status controls. |
| `/portal/admin/users` | **Added.** All accounts including plain `user`s: role changes, reject, ban, reactivate. Separate from Clients because most sign-ups never book. |
| `/portal/admin/users/:userId` | **Added.** Account detail with moderation history (could share a component with the client detail; separate slug for clarity). |
| `/portal/admin/history` | **Added.** Read-only logs with filters and CSV export: logins, booking events, session events, role/status changes, settings changes. Tabs are query params (`?tab=logins`), not modals. |
| `/portal/admin/reports` | **Reporting:** bookings, conversion, cancellations/no-shows, utilisation, top clients, promised vs collected, sign-ups→clients. Date range + CSV export. |
| `/portal/admin/settings` | General business info, timezone, session types/services (name, duration, price shown, buffer), booking rules (min notice, max horizon, cancellation window), notification templates, `require_account_approval` toggle. Sub-slugs: `/settings/services`, `/settings/booking-rules`, `/settings/notifications`, `/settings/integrations` (cal.com later). |

### 3.4 Suggested to skip or defer

- Standalone **Log out** page — removed (above).
- Separate admin **Sign up** — not needed; admins are promoted by an existing admin.
- Client **payments** page — skipped. Payments are in-person promises; they appear inside booking detail (§4.2 `payment_promises`). A Stripe page comes later.
- In-app **chat/messaging** — not in scope; the workspace already has KIT chat and WhatsApp plans.

---

## 4. Data model (Supabase Postgres)

All tables in `public`, RLS **enabled on every table**, migrations in `supabase/migrations/` (versioned SQL, reviewed in PRs). IDs are `uuid`; timestamps are `timestamptz`; the business timezone is a setting (default assumption: the business's local zone, to be confirmed — see §11).

### 4.1 Identity and access

| Table | Key columns | Purpose |
| --- | --- | --- |
| `profiles` | `id` (= `auth.users.id`), `full_name`, `phone`, `company`, `avatar_path`, `locale` (default `es`), `account_status`, `status_reason`, `status_until`, `marketing_opt_in`, `created_at`, `last_seen_at` | One row per user, auto-created by trigger on sign-up. |
| `user_roles` | `user_id`, `role` (`app_role` enum), `assigned_by`, `assigned_at` | Roles live in their own table (never on `profiles`) so users cannot update their own role via a profile edit. Unique `(user_id)`. A Custom Access Token hook copies the role into the JWT for fast UI checks; **RLS still reads the table**. |
| `user_status_events` | `id`, `user_id`, `actor_id`, `kind` (`role_changed`, `rejected`, `banned`, `unbanned`, `reactivated`, `deleted`), `from_value`, `to_value`, `reason`, `created_at` | History of every role/status change. Append-only. |

### 4.2 Booking domain

| Table | Key columns | Purpose |
| --- | --- | --- |
| `services` | `id`, `name`, `slug`, `description`, `duration_minutes`, `buffer_before/after`, `display_price` (informational, not charged), `active`, `sort` | Session types the client chooses from. |
| `availability_rules` | `id`, `service_id` (nullable = all), `weekday`, `start_time`, `end_time`, `valid_from/to` | Recurring weekly hours. |
| `availability_exceptions` | `id`, `date_range`, `kind` (`blocked`, `extra`), `reason` | Holidays, blackout days, extra openings. |
| `bookings` | `id`, `client_id`, `service_id`, `status` (`requested`, `confirmed`, `rejected`, `cancelled`, `completed`, `no_show`), `starts_at`, `ends_at`, `time_range` (generated `tstzrange`), `location`, `notes_client`, `notes_internal`, `created_by`, `source` (`portal`, `admin`, `calcom`), `external_id` (cal.com later), `created_at`, `updated_at` | The client's reservation. **Exclusion constraint** (`btree_gist`) on `time_range` for `status IN ('requested','confirmed')` prevents double-booking at the database level. |
| `booking_events` | `id`, `booking_id`, `actor_id`, `actor_role`, `kind` (`created`, `confirmed`, `rejected`, `rescheduled`, `reschedule_requested`, `cancelled`, `completed`, `no_show`, `note_added`, `promise_updated`), `from_status`, `to_status`, `payload` jsonb, `created_at` | **Booking history**, written by the same transaction as every change (trigger/RPC). Append-only. |
| `sessions` | `id`, `booking_id`, `starts_at`, `ends_at`, `status` (`scheduled`, `in_progress`, `completed`, `no_show`, `cancelled`), `run_by`, `summary`, `private_notes`, `created_at` | The delivered work. One session is created automatically when a booking is confirmed; a booking may later have several (packages). |
| `session_events` | Same shape as `booking_events` for sessions | **Session history.** Append-only. |
| `payment_promises` | `id`, `booking_id`, `amount`, `currency`, `due_on`, `status` (`promised`, `received`, `partial`, `waived`, `overdue`), `received_at`, `received_by`, `method` (`cash`, `transfer`, `card_in_person`, `other`), `note` | Replaces online payments. Client promises, admin marks as received in person. Designed so a Stripe `payment_intent_id` column can be added later without reshaping. |
| `payment_promise_events` | Event rows per promise change | Money history, append-only. |

### 4.3 Media, communication, settings

| Table | Key columns | Purpose |
| --- | --- | --- |
| `media_assets` | `id`, `owner_id`, `client_id`, `booking_id`/`session_id` (nullable), `bucket`, `path`, `kind`, `mime`, `size`, `visibility` (`internal`, `shared_with_client`), `uploaded_by`, `created_at` | Index over storage objects, so RLS and listings are queries, not bucket scans. |
| `media_access_log` | `asset_id`, `user_id`, `action` (`view`, `download`), `created_at` | Who accessed deliverables. |
| `notifications` | `id`, `user_id`, `kind`, `channel` (`in_app`, `email`), `payload`, `read_at`, `sent_at`, `error` | In-app + email outbox. |
| `app_settings` | `key`, `value` jsonb, `updated_by`, `updated_at` | Business info, booking rules, feature toggles. Admin-write, public-read only for a whitelisted subset (via a view). |
| `calendar_integrations` | `id`, `provider` (`calcom`), `status`, `config` (non-secret), `last_sync_at` | Placeholder for cal.com; empty until Phase 11. |

### 4.4 Histories to track (what you asked for + suggestions)

| History | Table | Source | Priority |
| --- | --- | --- | --- |
| User login history | `login_events` (`user_id`, `event` = `signed_in`/`signed_out`/`token_refreshed`/`password_reset_requested`/`signup`, `ip`, `user_agent`, `created_at`) | Edge Function `log-auth-event` called by the client after sign-in/out, plus an Auth Hook for server-side confirmation of sign-ins | **Must** |
| Session history | `session_events` | DB trigger | **Must** |
| Booking history | `booking_events` | DB trigger/RPC | **Must** |
| Role/status changes | `user_status_events` | Admin Edge Function | **Must** |
| Payment-promise history | `payment_promise_events` | Trigger | **Should** |
| Settings and availability changes | `audit_log` (generic: `table`, `row_id`, `actor_id`, `action`, `diff` jsonb) | Generic audit trigger | **Should** |
| Media access | `media_access_log` | Signed-URL Edge Function | **Should** |
| Notification delivery | `notifications` (sent/error) | Edge Function | **Should** |
| Profile edits | `audit_log` | Generic trigger | **Could** |
| Failed login attempts | **Not stored in our DB.** Supabase keeps auth logs in its dashboard/log drain; we rely on its rate limiting. Revisit if needed. | — | Limitation, see R6 |

**Privacy:** IP and user-agent are personal data. Add a short notice on the sign-up page, restrict `login_events` to admins, and define a retention window (proposal: 12 months for login events, 7 years for booking/payment events). Needs owner confirmation (§11).

### 4.5 Row-Level Security summary

| Table | `user` | `client` | `admin` |
| --- | --- | --- | --- |
| `profiles` | read/update own (excluding status fields) | same | read/update all |
| `user_roles` | read own | read own | full |
| `bookings` | insert own (requested) | read own, update own limited (cancel, reschedule request) | full |
| `booking_events` / `session_events` | — | read own bookings' events | read all (insert via triggers only) |
| `sessions` | — | read own | full |
| `payment_promises` | — | read own | full |
| `media_assets` | — | read where `shared_with_client` and own | full |
| `login_events`, `audit_log`, `user_status_events` | — | — | read |
| `services`, public `app_settings` view | read active | read active | full |

Helper functions (`security definer`, stable, `search_path` fixed): `is_admin()`, `is_active_user()`, `has_role(...)`. Policies call these so rules stay in one place.

---

## 5. Backend (Supabase features)

### 5.1 Auth

- Email + password, email verification required before booking.
- Password policy and rate limits configured in Supabase Auth settings.
- Custom Access Token hook adds `app_role` and `account_status` claims.
- Ban = Supabase `ban_duration` set via Admin API **and** `profiles.account_status = 'banned'` (belt and braces; RLS reads the table).
- Sign-up trigger: create `profiles` row + `user_roles(role='user')` + `login_events(signup)`.
- Promotion trigger: on first `bookings` insert by a `user`, set role to `client` and write `user_status_events(role_changed, reason='first_booking')`. Runs `security definer` so users still cannot write roles.
- First admin: created by a one-time SQL statement documented in `ENV.md` (never through the UI).

### 5.2 Edge Functions (Deno, in `supabase/functions/`)

Business-critical writes go through functions or RPCs, not raw table writes from the browser.

| Function | Caller | Does |
| --- | --- | --- |
| `get-available-slots` | any signed-in user | Computes free slots from rules − exceptions − existing bookings − buffers. Later: merges cal.com availability. |
| `create-booking` | `user`/`client`, `admin` (on behalf) | Validates status, service, slot, min-notice; inserts booking + first event + payment promise; the exclusion constraint is the final guard against races. |
| `update-booking` | owner (limited) / admin | Cancel, reschedule request, confirm, reject, complete, no-show; each writes `booking_events`; confirm creates the `session`. |
| `admin-moderate-user` | admin | Change role, reject, ban, unban, reactivate; calls Auth Admin API; writes `user_status_events`; guards last-admin; revokes sessions on ban. |
| `log-auth-event` | client after sign-in/out | Writes `login_events` with IP and user-agent from request headers. |
| `signed-media-url` | client/admin | Checks RLS-equivalent access, returns short-lived signed URL, writes `media_access_log`. |
| `send-notification` | internal (triggered by DB webhook) | Email + in-app on booking changes. **Email provider is an open decision** (§11). |
| `report-export` | admin | Streams CSV for reports/histories. |
| `calcom-webhook` | cal.com (Phase 11) | Upserts bookings from cal.com events; verifies signature. |

Common to all: validate input with Zod, verify JWT, check role in the function **and** in RLS, return typed errors, no secrets in logs.

### 5.3 Storage buckets

| Bucket | Visibility | Contents | Limits |
| --- | --- | --- | --- |
| `avatars` | Public read | Profile photos | 2 MB, images only |
| `deliverables` | Private | Final media shared with clients | Per-file size cap (set to plan limits), signed URLs only |
| `session-attachments` | Private, admin-only | Briefs, references, internal files | Admin policies |

Path convention: `<bucket>/<client_id>/<booking_id>/<filename>`; storage policies mirror table RLS. Virus scanning is not available natively — restrict MIME types and sizes; flag as a known limitation.

### 5.4 Database jobs

- `pg_cron`: mark promises `overdue`, send reminders (24 h before session), purge expired signed upload rows, soft-delete scrubbing after retention.
- Reporting views/RPCs (`security invoker` or admin-checked) so the browser never aggregates raw rows.

---

## 6. UI / UX rules

### 6.1 Stack decision (needs approval)

The current app uses plain CSS with design tokens in `src/shared/tokens.css`, `lucide-react` icons and no Tailwind. shadcn/ui requires Tailwind and Radix primitives. Proposal:

- Add Tailwind v4 **without its global reset** (import only theme + utilities) so existing workspace styles are not affected, and load it only in the portal route chunk.
- Add shadcn/ui components into `src/portal/components/ui/` (copied source, as shadcn intends).
- Map shadcn's CSS variables (`--background`, `--primary`, `--radius`, …) to the existing KIT tokens in one file (`src/portal/portal-theme.css`) so there is **one source of truth**: `tokens.css`.
- Toasts with **Sonner** (shadcn's toast), positioned **top-left**.
- Forms: `react-hook-form` + `zod` (Zod is already a dependency).
- Data fetching: `@supabase/supabase-js` + TanStack Query for caching/optimistic updates. Tables: TanStack Table.
- Dates: `date-fns` with Spanish locale. Calendar UI: shadcn Calendar + a week/day grid for admin.
- The portal route tree is lazy-loaded from `main.tsx` before the workspace shell, so workspace bundle size and tests are unaffected.

### 6.2 Page vs modal vs toast

| Use | When |
| --- | --- |
| **Page with slug** | Anything with multiple fields, a list, a detail, a multi-step flow, or that a user may bookmark/share/reload (booking steps, booking detail, session detail, user detail, settings sections). |
| **Modal (Dialog)** | Confirmations (cancel/reject/ban/role change with required reason), single-field edits (rename, change a note, change one status, set promise as received). Keep to one decision per modal. |
| **Alert dialog** | Destructive confirmations; the destructive button is danger-colored and not the default focus. |
| **Sheet/drawer** | Not used for primary flows (you prefer pages). Only for filters on mobile. |
| **Toast (top-left)** | Result of every action: success, error, info. 4 s for success/info, persistent until dismissed for errors; max 3 stacked; `role="status"` (errors `role="alert"`); includes an Undo action only where the action is truly reversible. |
| **Inline message** | Validation errors under fields; page-level blockers (banned notice). |

The existing bottom-of-screen toast in the workspace stays as is; only portal toasts move top-left. (Optional later: unify.)

### 6.3 States every page must have

Loading (skeleton, not spinner), empty (explanation + primary action), error (what happened + retry), forbidden (redirect to the user's home with toast), offline/failed-save. Forms warn on unsaved changes using the existing `useUnsavedChanges` pattern.

### 6.4 Accessibility and language

WCAG 2.1 AA, keyboard-navigable, focus-visible ring using `--color-focus`, axe checks in Playwright like the existing journeys. All strings Spanish via i18n; dates/times in the business timezone with Spanish formats; no business content is translated.

### 6.5 Layout

- Public/auth pages: centered card on the glass background, wordmark above, max width 420 px.
- Client and admin: top bar + left nav (collapsible on mobile into a bottom sheet nav), content max-width 1200 px, 24 px gutters (desktop), 16 px (mobile).
- Mobile-first for client pages (most clients book from a phone); admin is desktop-first but must remain usable at tablet width.

---

## 7. Brand guide (derived from the app; stored in the repo as `docs/backend-dashboards/BRAND.md` in Phase 4)

The source of truth is `src/shared/tokens.css`. Portal code must reference tokens and shadcn aliases; it must not contain raw hex values.

### 7.1 Identity

- **Wordmark:** "kit" — **k red, i blue, t green**, the dot of the i is the mix of all three lights. Component: `Wordmark` in `src/shared/ui/Wordmark.tsx`. Brand red/green/blue (`--brand-red #e5484d`, `--brand-green #1fa971`, `--brand-blue #2f6bff`) are for **logo and decorative marks only, never body text or buttons**.
- **Tone:** Spanish-first, direct, calm, professional-production-company. Short sentences, verbs on buttons ("Confirmar reserva", not "Submit"). No exclamation marks except celebratory success on first booking.
- **Visual language:** "Liquid Glass / Crystal Pearl" — translucent surfaces over a cool light background, subtle blur, thin borders; dark mode supported through the same tokens.

### 7.2 Color roles

| Role | Token | Light value | Use |
| --- | --- | --- | --- |
| Primary (working color) | `--color-primary` | `#1f5bd8` | Primary buttons, links, active nav, focus ring |
| Primary hover | `--color-primary-hover` | `#1a4cb5` | Hover/pressed |
| Background | `--color-bg` | `#f3f6fa` | Page |
| Surface / elevated | `--color-surface`, `--color-elevated` | white 78% / 92% | Cards, tables, dialogs |
| Text / muted | `--color-text`, `--color-text-muted` | `#0f172a`, `#526075` | Body, secondary |
| Border | `--color-border`, `--color-border-strong` | 8% / 18% black | Dividers, inputs |
| Success / Warning / Danger / Info | `--color-success #0f7a55`, `--color-warning #9a5b00`, `--color-danger #c62828`, `--color-info #1f5bd8` | | Status, toasts, badges (use `*-subtle` tints for backgrounds, full color for text) |
| Ink surface | `--color-ink-surface` | `#141a26` | Hero cards, tooltips (dark in both themes) |

The user-selectable accent (`data-accent` blue/red/green) applies to the workspace; the **portal is fixed to blue** so clients always see one consistent brand.

### 7.3 shadcn → KIT token mapping (defined once in `portal-theme.css`)

| shadcn variable | KIT token |
| --- | --- |
| `--background` | `--color-bg` |
| `--foreground` | `--color-text` |
| `--card`, `--popover` | `--color-elevated` |
| `--primary` / `--primary-foreground` | `--color-primary` / `--color-on-primary` |
| `--secondary`, `--muted`, `--accent` | `--color-primary-subtle` / `--color-elevated` |
| `--muted-foreground` | `--color-text-muted` |
| `--destructive` | `--color-danger` |
| `--border`, `--input` | `--color-border-strong` |
| `--ring` | `--color-focus` |
| `--radius` | `--radius-md` (12 px) |

### 7.4 Typography, shape, spacing

- Headings: **Manrope Variable** (`--font-heading`); body/UI: **DM Sans Variable** (`--font-body`). Already installed via `@fontsource-variable`.
- Scale from tokens: `--text-h1`, `--text-h3`, `--text-body`, `--text-caption`. One `h1` per page.
- Radius: controls 8 px (`--radius-sm`), cards/dialogs 12–16 px, pills 999 px.
- Spacing: the 4 px scale (`--space-1…12`). Control height 36 px (`--control-height`), 44 px minimum touch target on mobile.
- Elevation: glass surfaces (`--glass-*`) with the blur token; avoid heavy drop shadows.
- Icons: `lucide-react` only, 16–18 px inline, 20 px in nav, with `aria-hidden` unless standalone.
- Motion: respect `data-motion`; transitions use `--dur-*` and `--ease-standard`; no motion when reduced.

### 7.5 Component conventions

| Element | Rule |
| --- | --- |
| Buttons | One primary per view. Variants: primary, secondary (outline), ghost, destructive. Icon + label; loading state disables and shows spinner. |
| Inputs | Label above, helper text below, error text in `--color-danger` with icon; never placeholder-only labels. |
| Badges (booking status) | `requested` warning, `confirmed` success, `rejected` danger, `cancelled` neutral, `completed` info, `no_show` danger-outline. Same mapping for sessions. |
| Tables | Sticky header, row hover, density follows `data-density`, actions in a trailing "⋯" menu, empty state inside the table. |
| Toasts | Top-left, glass elevated surface, status icon + one sentence + optional action; Spanish. |
| Dialogs | Title (question), one-sentence consequence, reason field when required, cancel left / confirm right. |
| Empty states | Icon, one-line explanation, one primary action. |

### 7.6 Do / don't

- Do use tokens and shadcn aliases only; do keep copy Spanish; do reuse `Wordmark`.
- Don't use brand red/green/blue as UI action colors; don't introduce new fonts or radii; don't use modals for multi-field forms; don't place toasts anywhere but top-left in the portal.

---

## 8. Build phases

Sizes are rough (S ≈ 1–2 days, M ≈ 3–5, L ≈ 1–2 weeks) for one developer with Claude. Each phase ends with the checks in §9 and a commit on `main`; no push without approval.

### Phase 0 — Decisions and rule changes (S)
- Resolve §11 open questions; apply G1–G6 to CLAUDE.md and `TECHNICAL_DECISIONS.md`.
- **Done when:** owner approves this plan and the rules text.

### Phase 1 — Supabase foundation (M)
- Install Supabase CLI, `supabase init`, local stack via Docker; `supabase/config.toml`, `seed.sql` (services, settings, one test admin for local only).
- Create the hosted Supabase project (owner action), enable extensions (`btree_gist`, `pg_cron`, `pgcrypto`), configure Auth (email confirm, password rules, redirect URLs including the Fly URL and `localhost:5173`).
- Add `ENV.md`; add `.env.example` entries (no values).
- CI-style script: `npm run db:start | db:reset | db:test | db:types`.
- **Done when:** `supabase start` + `db reset` runs clean; types generated into `src/portal/lib/database.types.ts`.

### Phase 2 — Schema, RLS and history (L)
- Migrations in order: enums → identity (`profiles`, `user_roles`, `user_status_events`) → catalog (`services`, availability) → bookings/sessions/events → payment promises → media → notifications/settings → audit triggers → RLS policies → helper functions.
- Triggers: sign-up bootstrap, first-booking promotion, event writers, `updated_at`, last-admin guard.
- pgTAP tests for **every policy** (user vs client vs admin vs banned), exclusion-constraint double-booking test, append-only enforcement, promotion rule, last-admin rule.
- **Done when:** `supabase test db` green; an RLS matrix test proves §4.5.

### Phase 3 — Auth and roles in the app (M)
- `src/portal/lib/supabase.ts` client; `AuthProvider`; route guards (`RequireAuth`, `RequireRole`, `RequireActive`); redirect logic in `/portal`.
- Pages: login, signup, forgot/reset password, callback, account-status.
- Edge Function `log-auth-event`; Custom Access Token hook; logout action with toast.
- Decide CAPTCHA (reuse existing reCAPTCHA vs Supabase CAPTCHA).
- **Done when:** a new user can sign up, verify, log in, log out; `login_events` rows appear; a banned user is blocked in browser and API.

### Phase 4 — UI foundation and brand (M)
- Tailwind v4 (no preflight) + shadcn init scoped to `src/portal/`; `portal-theme.css` mapping; Sonner top-left; base components (Button, Input, Form, Dialog, AlertDialog, Table, Badge, Calendar, Skeleton, DropdownMenu, Tabs, Select, Textarea, Avatar).
- Portal layouts (public, client, admin) with nav; i18n keys; empty/error/loading primitives.
- Write `BRAND.md`; add a hidden `/portal/_kit` styleguide page (dev only) showing every component in light/dark.
- **Done when:** the styleguide passes axe in both themes, the workspace UI is visually unchanged (existing browser tests green).

### Phase 5 — General user pages (S–M)
- Profile page (details, avatar upload, password change, notification prefs, delete request).
- Booking flow shell `/portal/book/*` with draft handling (without final submit if Phase 6 isn't ready).
- **Done when:** user can edit profile and see changes persisted; avatar bucket policy tested.

### Phase 6 — Booking engine and client pages (L)
- Edge Functions `get-available-slots`, `create-booking`, `update-booking`.
- Booking flow end-to-end → first booking promotes `user` → `client` and redirects to the client dashboard with a toast.
- Client dashboard, bookings list, booking detail (timeline, cancel modal, reschedule request), payment promise display.
- **Done when:** two simultaneous bookings for the same slot → exactly one succeeds; role promotion verified; cancellation window enforced.

### Phase 7 — Admin core: bookings, sessions, availability (L)
- Admin dashboard (live queries), bookings list/calendar/detail/new, sessions list/detail, availability editor.
- Confirm → auto-create session; reschedule approval; reject with reason; mark payment promise received (modal).
- **Done when:** the admin can run a request from `requested` to `completed` with a received promise; every step visible in history.

### Phase 8 — Admin users, clients and history (M)
- Clients list/detail, Users list/detail, role change / reject / ban / unban / reactivate through `admin-moderate-user`.
- History page with filters and CSV export (`report-export`).
- **Done when:** a ban revokes sessions immediately and cancels open bookings; last admin cannot be removed; all moderation actions appear in history with reasons.

### Phase 9 — Media and deliverables (M)
- Buckets, storage policies, upload from session detail, `signed-media-url`, client media page, access log.
- **Done when:** a client sees only their shared files; a different client gets 403 on the same path; expired links stop working.

### Phase 10 — Reporting and settings (M)
- Reports page (see §4.4 metric list), SQL views/RPCs, charts (use the existing design tokens; chart palette per the `dataviz` guidance), CSV export.
- Settings pages: business info, services, booking rules, notification templates, approval toggle.
- Notifications: in-app + email via the chosen provider; `pg_cron` reminders.
- **Done when:** report totals reconcile with raw rows in a seeded fixture; emails send from the **local** provider mock in tests.

### Phase 11 — cal.com integration (later, separate approval)
- `calendar_integrations` configuration page, `calcom-webhook`, two-way mapping of `bookings.external_id`, availability merge in `get-available-slots`.
- Decide source of truth: recommended is **our DB stays authoritative for bookings** and cal.com supplies availability and external bookings; conflicts resolved by the exclusion constraint.

### Phase 12 — Hardening and release (M)
- Security review (RLS, function auth, CORS, rate limits), performance (indexes on `bookings(client_id, starts_at)`, `booking_events(booking_id)`, `login_events(user_id, created_at)`), backups (Supabase PITR/daily + a documented restore test), privacy notice and retention jobs, monitoring (Edge Function logs, alerting for failed notifications).
- Deploy: frontend continues on Fly via the existing `Dockerfile`/`fly.toml`; add the Supabase URL/anon key as Fly secrets or build args; set `KIT_ORIGINS` and Supabase redirect URLs consistently. **Deploy requires explicit approval.**

### Later (not in this plan)
Stripe or other online payments (schema is ready via `payment_promises`); staff role; SMS/WhatsApp reminders using the existing messaging plan; client reviews; multi-location.

---

## 9. Testing and verification

- **Unit (vitest):** slot computation helpers, formatters, guards, form schemas.
- **Database (pgTAP via `supabase test db`):** every RLS policy for each role and for banned/rejected users; append-only history; exclusion constraint; promotion and last-admin triggers; storage policies.
- **Edge Functions:** Deno tests with the local stack; input validation and authorization negative cases.
- **Browser (Playwright):** against the **local** Supabase stack with seeded users. Journeys: signup→book→client dashboard; admin confirm→complete; ban blocks login; reschedule request; media access; axe on every page; mobile viewport for client pages.
- **Regression:** `npm run typecheck`, `npm test`, `npm run test:browser` must still match the baseline in `docs/CLEANUP_LOG.md` (the workspace must be unaffected).
- **No live calls in tests.** Email and cal.com are faked at the boundary, matching the repo convention.
- Add a `docs/backend-dashboards/PROGRESS.md` with evidence per phase, mirroring `docs/IMPLEMENTATION_PROGRESS.md`.

---

## 10. Risks

| # | Risk | Impact | Mitigation |
| --- | --- | --- | --- |
| R1 | Two backends (Express/SQLite and Supabase) diverge: the same person exists as a workspace client and a portal client. | Duplicate or inconsistent client data. | Phase 8+ adds an optional `workspace_client_id` text column on `profiles` and a manual "link to workspace client" action. Full sync is out of scope until the business decides. |
| R2 | Staff log in twice (workspace local password + Supabase portal admin). | Friction. | Accept for now; admins are few. Moving workspace auth to Supabase is a separate, approved project (the Express server would verify Supabase JWTs and keep issuing its own session, as it did with Firebase). |
| R3 | RLS mistakes expose data. | Severe. | Deny-by-default, policy tests for every table and role, security review in Phase 12. |
| R4 | Double-booking races. | Lost trust. | Database exclusion constraint + transactional function. |
| R5 | Tailwind/shadcn bleed into existing styles. | Visual regressions in the workspace. | No preflight, portal-only CSS entry, existing browser tests as a gate. |
| R6 | Failed-login history is not in our DB. | Gap in security audit. | Rely on Supabase auth logs and rate limiting; add a log drain later if needed. |
| R7 | `login_events` can be spoofed (client-triggered). | Inaccurate audit. | Pair with the server-side Auth Hook / `last_sign_in_at`; treat the table as informational, not forensic. |
| R8 | Personal data (IP, phone) and compliance. | Legal exposure. | Privacy notice, retention jobs, data-export/deletion path; confirm jurisdiction. |
| R9 | Scope growth (cal.com, email, media). | Delays. | Phases are independently shippable; cal.com and media are explicitly late. |
| R10 | Supabase availability / free-tier limits. | Downtime, throttling. | Choose a paid plan before launch; document a restore drill. |

---

## 11. Open questions and assumptions

Assumptions the plan uses unless you say otherwise:

1. **Booking vs session** (you left this to me): a client submits a **booking**; when an admin confirms it, a **session** is created automatically (one per booking for now, multiple possible later). Admins can also create bookings for clients.
2. Language is Spanish only; the business timezone is a setting (needs your value).
3. Clients can cancel up to a configurable window before the session (default 24 h) and request reschedules; admin approves.
4. Payments are recorded as **promises** and marked received in person by an admin. No card data anywhere.
5. Rejecting a **user** means "not approved to book"; banning means "cannot log in". Both reversible by an admin with a reason.
6. Retention: login events 12 months, booking/payment events 7 years (to confirm).

Questions that block specific phases:

| # | Question | Needed by |
| --- | --- | --- |
| Q1 | Which email provider for notifications and reminders (Resend is available in this environment; the repo has no provider yet)? we can use resend for notifications we later set it up or if you can via mcp go agead| Phase 10 |
| Q2 | Do you want sign-ups to require admin approval from day one, or only email verification? we want them to be approved by admin | Phase 3 |
| Q3 | Are deliverables (media) shared through the app, or only booking info? Pass on this question This decides whether `/portal/client/media` and the `deliverables` bucket are built. | Phase 9 |
| Q4 | Which services / session types and durations exist at launch? Any packages (multiple sessions per booking)? | Phase 6 |
| Q5 | Reuse the existing reCAPTCHA or use Supabase's CAPTCHA? use the supabase one for noe. everything on the backend should now be through supabase we can forget about firebase for now | Phase 3 |
| Q6 | OK to add Tailwind v4 + shadcn (scoped to the portal) alongside the existing plain-CSS workspace? your best suggestions | Phase 4 |
| Q7 | Jurisdiction for privacy rules and the retention windows above. | Phase 12 |
| Q8 | Should portal admins be a strict subset of workspace Administrators, or independent? administrators| Phase 7 |

---

## 12. Proposed repository layout (for approval)

```
supabase/
  config.toml
  migrations/            # versioned SQL, one concern per file
  functions/             # Edge Functions (Deno), one folder each + shared/
  tests/                 # pgTAP
  seed.sql
src/portal/
  PortalApp.tsx          # lazy entry mounted at /portal/*
  lib/                   # supabase client, auth, query hooks, database.types.ts
  components/ui/         # shadcn components (copied source)
  components/            # portal-specific compositions
  layouts/               # Public, Client, Admin
  pages/{auth,profile,book,client,admin}/
  portal-theme.css       # shadcn vars -> KIT tokens
docs/backend-dashboards/
  implementation_plan.md # this file
  BRAND.md, ENV.md, PROGRESS.md   # created during the phases
```

---

### Approval checklist

- [ ] Gates G1–G6 accepted
- [ ] Page list accepted (including added: book flow, forgot/reset, availability, users, history, account-status; removed: log-out page)
- [ ] Tailwind + shadcn scoped to the portal (Q6)
- [ ] Assumptions in §11 confirmed or corrected
- [ ] Start Phase 0
