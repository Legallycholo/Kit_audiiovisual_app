# KIT → Vercel migration: implementation plan

Status: **implemented in the working tree, not committed, pushed or deployed** · Written: 2026-11-07 · Owner: Dariel

Implementation notes are marked **(done)**, **(changed)** or **(open)** next to the checklist items. The owner's remaining steps are in [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md).

Goal: run KIT (the full AI dashboard: proposal drafting, KIT chat and Act mode, floor-plan reading, search, operations, reporting) on Vercel instead of Fly.io, with the same features, the same API routes and the same response shapes.

Nothing in this plan is applied until approved. Even after approval I will **not** push, deploy, touch `data/` or `.env*`, or apply anything to the hosted Supabase project. Those are manual steps for the owner (see [Manual steps](#manual-steps-for-the-owner)).

How this file is used: I tick each box as the step is done and verified. A step is not ticked until its check passes. Nothing is skipped; if a step turns out to be unnecessary I strike it through and say why.

---

## 1. Why this is more than a deploy config

KIT today is one long-lived Express process with an embedded SQLite file. Vercel runs short-lived serverless functions with no persistent disk and no background timers. Four things must change:

| Today (Fly.io) | On Vercel | Consequence |
|---|---|---|
| `node:sqlite` file on a mounted volume | Supabase Postgres | The whole data layer becomes async (≈110 raw SQL call sites, 16 transactions, 11 tables) |
| One process, in-memory state, `setInterval` search retry | Many short-lived instances | Retry becomes Vercel Cron; KIT's background AI jobs need `waitUntil`; no state may live only in memory |
| Express serves the built frontend and sets security headers | CDN serves static files | `vercel.json` must replicate the CSP and security headers |
| Single machine, `PORT`, `/data` volume | Functions behind Vercel's proxy | `trust proxy` must be set or every user shares one login rate-limit bucket |

## 2. Decisions (taken, with reasons)

| # | Decision | Why |
|---|---|---|
| D1 | **Database: Supabase Postgres**, tables in a private `kit` schema | The portal's project already has `public.sessions` and `public.audit_log`, so names would collide. A private schema also keeps `users.password_hash` and session hashes out of the Supabase Data API. |
| D2 | **Local dev and tests use PGlite** (in-process Postgres, WASM). `KIT_DATABASE` picks the driver. | `npm run dev` and every test keep working with no network and no Supabase connection, which the "no external calls" rule requires. Same SQL dialect as production, so no dual-dialect code. |
| D3 | **Keep SQL text; add a small async compat layer** (`db.prepare(sql).get/all/run`, `?` → `$n`) | Keeps the diff mechanical and reviewable: SQL stays, calls gain `await`. |
| D4 | **Keep all JSON payload columns as `TEXT`, not `jsonb`** | Recovery points verify a SHA-256 of the exact payload string. `jsonb` would reorder keys and break that check. |
| D5 | **Transactions take a Postgres advisory lock first** | Reproduces SQLite's `BEGIN IMMEDIATE` (one writer at a time) so the 16 read-then-write transactions behave the same. The revision-guarded `UPDATE … WHERE revision=?` stays the conflict guard. |
| D6 | **Request body limit 4 MB** (Vercel's platform cap is 4.5 MB) | A 6 MB limit cannot work on Vercel. Real payload sizes are checked in step 4.8. |
| D7 | **Search retry that works on the Hobby plan:** a once-a-day Vercel Cron as a safety net, plus an opportunistic, throttled retry triggered by search activity itself (via `waitUntil`). Per-minute cron is a Pro-only upgrade, or an optional free Supabase `pg_cron` job. | Vercel cannot run a 30 s interval on any plan, and Hobby cron is limited to daily runs. Search has no provider configured yet (STATUS.md), so retry is currently a no-op safety net, not a hot path. |
| D10 | **The plan is written to work on Hobby.** Pro is recommended for production (see Risks: Hobby is for personal, non-commercial use). | The owner is not on Pro. Nothing in the architecture needs Pro; only the retry frequency and function duration headroom differ. |
| D8 | **Remove Fly.io and Docker files** | They are dead code after the move. Git history keeps them. (Approved by the owner on 2026-11-07.) |
| D9 | **No commits unless the owner asks.** The working tree already holds ~25 uncommitted portal files on `feature/backend-dashboards`. | Keeps this migration reviewable as its own diff. |

## 3. Target architecture

```
Browser ──► Vercel CDN ──► static Vite build (dist/)      [vercel.json headers = CSP etc.]
   │
   └─ /api/* ──► api/index.ts (one serverless function, Express app, memoized per instance)
                    │  await app.locals.ready  (schema check, SearchGateway + KitService init)
                    ├─► Repository ──► pg Pool (Supabase pooler :6543, kit schema)   [production]
                    │             └──► PGlite (memory or ./.kit-local/pglite)         [dev + tests]
                    └─► AI/search providers (unchanged, env-configured)

Vercel Cron (every minute) ──► GET /api/cron/search-retry  (Bearer CRON_SECRET) ──► searchGateway.retry()
```

## 4. Checklist

### Phase 0: Baseline and safety

- [x] 0.1 Read `docs/CLEANUP_LOG.md` for the current test baseline; run `npm run typecheck` and `npm test` and record the starting counts here. **(done)** Baseline: typecheck clean; 27 files, 198 passed + 1 expected failure.
- [x] 0.2 Confirm `git status`: list the pre-existing uncommitted files so they are never mixed into this work.
- [ ] 0.3 Verify current Vercel limits against the Vercel docs (body size, cron frequency per plan, `maxDuration`, `waitUntil`, Node 22). Record the findings under "Verified platform facts" at the bottom. If any differs from this plan, stop and update the plan. **(open)** Partly confirmed (see "Verified platform facts"); the rest is confirmed at the first deploy.
- [x] 0.4 Install dependencies: `pg`, `@types/pg`, `@electric-sql/pglite`, `@vercel/functions`. Record exact versions. (npm only; no other lockfiles.)

### Phase 1: Rules and docs that must change first

- [x] 1.1 CLAUDE.md: add a dated carve-out under "No external calls": the company server may connect to the company's own Supabase Postgres (`hgugkgbpsrbqusazmthb`) with a dedicated least-privilege role (`kit_server`), connection string only in server env, never in the browser, never used by tests or local dev. Update the "Commands" and "Architecture notes" sections (SQLite → Postgres, PGlite locally).
- [x] 1.2 Note in CLAUDE.md that Fly/Docker are removed and Vercel is the deployment target.

### Phase 2: Schema (SQL file only; not applied to any hosted database)

File: `supabase/migrations/20261107000012_kit_company_schema.sql`. One canonical file, read by PGlite locally and applied by the owner to Supabase.

- [x] 2.1 `CREATE SCHEMA IF NOT EXISTS kit;` and create all 11 tables there, same columns and defaults as today:
  `workspace`, `users`, `sessions`, `audit`, `login_attempts`, `workspace_recovery`, `search_tenant`, `search_devices`, `search_sources` (including `policy`), `search_usage`, `kit_threads`, plus all indexes (`sessions_user`, `audit_time`, `workspace_recovery_time`, `kit_owner`).
- [x] 2.2 Documented deviations from SQLite, each with a comment in the SQL:
  - `audit.seq` and `workspace_recovery.seq`: `BIGINT GENERATED ALWAYS AS IDENTITY`. Replaces `rowid` ordering (3 queries + the recovery pruning).
  - `users.email` stays `TEXT` with `CREATE UNIQUE INDEX … ON users (lower(email))`. Replaces `COLLATE NOCASE`. `userByEmail` compares `lower(email)=lower(?)`.
  - Epoch-millisecond columns are `BIGINT` (`sessions.expires_at`, `login_attempts.reset_at`, `search_devices.expires`). Values are parsed back to JS numbers in the driver.
  - `owner` / `active` / `revoked` stay `INTEGER` 0/1 so `UserRow` and every caller keep the same types.
  - `workspace.id` keeps `CHECK (id = 1)`.
- [x] 2.3 Security: `ALTER TABLE … ENABLE ROW LEVEL SECURITY` on all 11 tables with **no policies**; `REVOKE ALL ON SCHEMA kit` and on all tables from `anon` and `authenticated`. These statements are guarded (`IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')`) so the same file also runs on PGlite.
- [x] 2.4 Role: create `kit_server` as `NOLOGIN` (guarded), grant `USAGE` on schema `kit` and `SELECT, INSERT, UPDATE, DELETE` on its tables, `ALTER ROLE kit_server SET search_path = kit`. **No password in the file.** The owner sets the password manually.
- [x] 2.5 Show the owner the final SQL as a diff for review before anything else depends on it. **(done)** The schema SQL and the diff are in the final report.

### Phase 3: Database layer (`server/db/`)

- [x] 3.1 `server/db/driver.ts`: `SqlDriver` interface (`query`, `transaction`, `close`).
- [x] 3.2 `server/db/pg.ts`: pg `Pool` adapter. Small pool (`max` 3), `ssl` for hosted hosts, int8 parsed to `number`, works through Supabase's transaction pooler (no session state, no named prepared statements). Each transaction: `BEGIN`, `SELECT pg_advisory_xact_lock(<constant>)`, run, `COMMIT`/`ROLLBACK`, release.
- [x] 3.3 `server/db/pglite.ts`: PGlite adapter (memory or directory). Applies the canonical migration file on open and sets `search_path = kit`. Int8 → number. Serialized by PGlite itself, so no advisory lock needed.
- [x] 3.4 `server/db/index.ts`: `Db` compat wrapper: `prepare(sql).get/all/run` (`run` returns `{ changes }` from `rowCount`), `exec(sql)`. Translates `?` → `$n`, **skipping quoted string literals**. Uses `AsyncLocalStorage` so every call made inside `repo.transaction(async () => …)` runs on that transaction's connection.
- [x] 3.5 Driver selection from `KIT_DATABASE`: `postgres://` or `postgresql://` → pg; `memory://` → PGlite in memory; anything else → PGlite directory. Default when unset: `.kit-local/pglite` (added to `.gitignore`). `data/` is never read or written.
- [x] 3.6 `Repository`: keep every public method name, argument list and result shape; each now returns a Promise: `open(url)` (replaces `new Repository(path)`), `close`, `transaction`, `initialized`, `user`, `userByEmail`, `users`, `upsertFederatedUser`, `read`, `save`, `replaceWorkspace`, `recoveryPoints`, `recoveryWorkspace`, `audit`. `HttpError`, `UserRow`, `publicUser`, `emptyWorkspace` exports are unchanged.
- [x] 3.7 `open()` no longer creates tables. It verifies all 11 tables exist (`to_regclass`) and fails fast with a clear message ("Run supabase/migrations/…_kit_company_schema.sql and set the kit_server search_path").
- [x] 3.8 Behavior parity details handled in SQL:
  - `ORDER BY name` becomes `ORDER BY name COLLATE "C"` (SQLite sorted bytewise; Postgres would sort "Álvaro" differently).
  - `ORDER BY rowid DESC` becomes `ORDER BY seq DESC`.
  - `LIKE` stays `LIKE` (all matched values are lowercase constants).
  - `PRAGMA table_info` / `ALTER TABLE … ADD COLUMN policy` in `SearchGateway` are removed (the column is in the schema).
- [x] 3.9 Unit tests for the `?` → `$n` translator (quotes, `?` inside strings, many params), the int8 parser, and driver selection.

### Phase 4: Convert every call site to async

Rule: after each file, run `npm run typecheck`, then grep that file for un-awaited calls (`repo.audit(`, `repo.save(`, `.run(`, `.exec(`, `repo.transaction(`). TypeScript does not flag a forgotten `await` on a statement, so the grep is mandatory.

- [x] 4.1 `server/security.ts`: `createSession`, `destroySession`, `sessionMiddleware`, `rateLimit` (12 call sites)
- [x] 4.2 `server/routes/auth.ts`
- [x] 4.3 `server/routes/account.ts`
- [x] 4.4 `server/routes/workspace.ts`
- [x] 4.5 `server/routes/conversations.ts`
- [x] 4.6 `server/routes/users.ts` (11 raw-SQL sites, 4 transactions)
- [x] 4.7 `server/routes/backup.ts` (incl. `validateRecovery`, 2 transactions)
- [x] 4.8 `server/routes/messaging.ts` (4 transactions, one around the external send; the send call itself stays outside the transaction as today). Also: measure the size of a real workspace payload and the largest single change request against the 4 MB limit (D6) and record it here. **(done, with a limit)** The real workspace size cannot be measured from here (`data/` is off limits). Individual images are capped at 1.5 MB, so normal saves fit. Whole-workspace backup export/restore is the exception; DEPLOY_VERCEL.md has the owner check the file size first.
- [x] 4.9 `server/routes/ai.ts`, `inventory.ts`, `integrations.ts`, `lookup.ts`
- [x] 4.10 `server/integrations.ts` (`monthlyCount`, `lastTest`, `integrationStatus` become async)
- [x] 4.11 `server/design.ts` (`DesignService.mount` handler)
- [x] 4.12 `server/kit.ts`: `read`, `save`, `list`, `create`, `update`, `delete`, `branch`, `stop`, `send`, `confirm`, `view`, `sources`, `assertFresh`, `validateAction`, `launch`, plus all `mount` handlers
- [x] 4.13 `server/search.ts` (60 raw-SQL sites, 1 transaction, device auth, `retry`, `drain`)
- [x] 4.14 `server/app.ts`: `response()` helper async; all handlers async-safe (Express 5 forwards rejected promises to the error middleware)
- [x] 4.15 `server/scheduled-backup.ts` (`runScheduledBackup` async; CLI opens the repo with `Repository.open`) and `server/perf/workspace-perf.ts`
- [x] 4.16 Global sweep: `grep -rn "repo\.\(audit\|save\|replaceWorkspace\|upsertFederatedUser\)(" server | grep -v await` returns nothing; same for `\.run(` and `\.exec(`. `grep -rn "repo\.db" server` shows only awaited calls.

### Phase 5: Startup lifecycle (replaces constructor-time DDL and boot-time work)

- [x] 5.1 `SearchGateway`: constructor becomes cheap and starts `this.ready = this.init()`. `init()` does tenant create/load and the provider-policy fingerprint check. The "drain and confirm deletion before changing provider/region/retention" error is preserved (now a rejected `ready`).
- [x] 5.2 `KitService`: same `ready` pattern. The boot-time "reset all busy threads" runs only when `resetBusyOnBoot` is true (long-lived server). On Vercel it is false, because a cold start on one instance must not clobber a job running on another.
- [x] 5.3 Stale-job reaping for serverless: a thread with `busy=true` whose `updated` is older than `KIT_JOB_STALE_MS` (default 330 s, just over the 300 s function limit) and with no live job in this instance is marked interrupted on read/list, with the same Spanish message the boot reset uses today.
- [x] 5.4 `createApp` exposes `app.locals.ready` and adds a first middleware that awaits it for `/api` requests (a failed init returns the standard 500, never hangs). `server.ts` and `server/index.ts` `await app.locals.ready` before `listen`, so a bad search-policy config still fails fast at startup.
- [x] 5.5 `KitService.launch`: wrap the background promise in `waitUntil()` from `@vercel/functions` when running on Vercel (guarded; no-op locally). Cancel (`stop`/`delete`) keeps working across instances because the job already refuses to save when `busy` was cleared in the database; the in-memory `AbortController` just stops the upstream call when it is on the same instance.

### Phase 6: Serverless entry and shared bootstrap

- [x] 6.1 `server/bootstrap.ts`: one `buildAppFromEnv(env, options)` containing the config block that is currently copy-pasted in `server.ts` and `server/index.ts` (integrations, Supabase verifier, reCAPTCHA, KIT generator, search config, proposal/plan models, origins, cookies). `server.ts` and `server/index.ts` call it. Behavior identical; this is a pure extraction.
- [x] 6.2 `api/index.ts`: builds the app once per instance (memoized promise), `serveStatic: false`, `trust proxy` on, `resetBusyOnBoot: false`; exports a handler that awaits `ready` then delegates to Express. Never imports `vite`.
- [x] 6.3 `app.set("trust proxy", …)` made configurable through `AppConfig` (`trustProxy`); enabled in `api/index.ts` so `req.ip` is the real client for login/setup rate limits.
- [x] 6.4 `express.json({ limit })` reads the 4 MB value (D6) from one constant; check `server/schema.ts` `dataUrl` size caps are consistent with it.
- [x] 6.5 Confirm Vercel's Node ESM runtime resolves the extensionless relative imports used across `server/` (e.g. `from "./database"`). **Fallback if not:** add an `esbuild` bundling step (`npm run build:api`) that produces the function bundle. Decide using `vercel build` locally (no upload) if the CLI is available; otherwise at the first preview deploy. **(changed)** Instead of hoping Vercel resolves extensionless imports, the function is now a single esbuild bundle (`server/vercel-entry.ts` → `api/index.mjs`, committed, with a freshness test and a plain-Node load test). See 6.6.
- [x] 6.6 **(added)** Bundle step: `scripts/api-bundle.ts` + `npm run build:api`, PGlite stubbed out of the bundle, `vercel.json` `buildCommand` runs it before the Vite build, and `server/api-bundle.test.ts` fails if `api/index.mjs` is stale. Also added `server/db/pg.test.ts`, which runs the real `pg` driver (the production path) against an in-process Postgres over TCP.

### Phase 7: Cron (replaces `setInterval`)

- [x] 7.1 New route `GET /api/cron/search-retry`, mounted **before** the session/CSRF middleware (like the device routes). Requires `Authorization: Bearer ${CRON_SECRET}` compared with `timingSafeEqual`; returns 401 if wrong and 503 if `CRON_SECRET` is unset (fail closed). Calls `searchGateway.retry()`; returns `{ ok: true }` only, never record data. (New API route, approved by approving this plan.)
- [x] 7.2 Local servers keep the in-process 30 s `setInterval` (`server.ts`, `server/index.ts`); it is not started on Vercel.
- [x] 7.3 `vercel.json` cron entry, **daily** (Hobby-compatible): `{ "path": "/api/cron/search-retry", "schedule": "0 5 * * *" }`. Changing it to `* * * * *` is a one-line edit if the account is later upgraded to Pro.
- [x] 7.4 Opportunistic retry: after a successful search write (device record/source upload, source delete, query), the handler schedules `searchGateway.retry()` through `waitUntil`, throttled to at most once per 60 s per instance (in-memory timestamp; harmless if several instances each run it, because `retry()` only touches rows still pending/failed with `attempts < 3`). No-op when search is not configured.
- [x] 7.5 Test: the throttle runs `retry()` once for many rapid calls and again after 60 s (fake timers); it never throws into the request.
- [x] 7.6 Document the optional per-minute upgrade in `docs/DEPLOY_VERCEL.md`: Supabase `pg_cron` + `pg_net` calling the cron route with the bearer secret from Supabase Vault (free, no Pro needed). Not enabled by default.

### Phase 8: `vercel.json` and frontend hosting

- [x] 8.1 `buildCommand` `npm run build`, `outputDirectory` `dist`, `framework` `vite`.
- [x] 8.2 Rewrites: `/api/(.*)` → the function; everything else that is not a file → `/index.html` (SPA, including `/portal/*`).
- [x] 8.3 `headers` for all non-API paths replicating what Express adds today: `Content-Security-Policy` (with the portal Supabase origin hardcoded: `https://hgugkgbpsrbqusazmthb.supabase.co` and its `wss://`), `X-Content-Type-Options`, `Referrer-Policy: same-origin`, `Permissions-Policy`. Long-cache `immutable` headers for `/assets/*`. `Cache-Control: no-store` for `index.html`.
- [x] 8.4 `functions` config: `maxDuration` for `api/index.ts` set to the **maximum the account's plan allows** (verified in step 0.3 and in the Vercel dashboard; I expect 300 s with Fluid Compute enabled, but that is not yet confirmed for Hobby). `KIT_JOB_STALE_MS` is derived from it (`maxDuration + 30 s`), so the stale-job reaping in 5.3 stays correct whatever the limit is. If the Hobby limit turns out to be as low as 60 s, AI jobs longer than that fail with the existing "interrupted" message; I will then report which features are at risk (floor-plan reading is the likeliest) before continuing. **(changed)** `maxDuration` is **not** set in `vercel.json` (an over-limit value could make the deploy fail). The owner checks Fluid Compute and the plan limit in the dashboard (DEPLOY_VERCEL.md 2.4); `KIT_JOB_STALE_MS` covers any limit.
- [x] 8.5 A test asserts `vercel.json` parses, the CSP matches the one in `server/app.ts` apart from the Supabase origin, and the cron path matches the real route.

### Phase 9: SQLite → Postgres importer (never run by me)

- [x] 9.1 `scripts/sqlite-to-postgres.ts` plus `npm run migrate:sqlite`. Reads the SQLite file **read-only**; target from `KIT_DATABASE`. Default is a **dry run** (counts and checks only); `--apply` writes.
- [x] 9.2 Copies, in foreign-key order and one transaction: `workspace` (same `revision`, byte-identical `payload`), `users`, `audit` (inserted in `rowid` order so `seq` keeps the same order), `workspace_recovery`, `search_tenant`, `search_devices`, `search_sources`, `search_usage`, `kit_threads`. Skips `sessions` (everyone signs in once) and `login_attempts` (ephemeral). Handles old files without the `policy` column.
- [x] 9.3 Refuses to run if the target `workspace` already has a row (no accidental overwrite) unless `--force` is passed.
- [x] 9.4 Verifies after copy: row counts per table, and SHA-256 of the workspace payload and of every recovery payload match the source. Exits non-zero on any mismatch.
- [x] 9.5 Test with a throwaway SQLite fixture built inside the test and PGlite in memory. It never opens `data/`.

### Phase 10: Tests

Approving this plan approves the **mechanical** changes below. If any **assertion** has to change, I stop and explain (CLAUDE.md rule).

- [x] 10.1 Mechanical: `new Repository(":memory:")` → `await Repository.open("memory://")`; `repo.read()/save()/audit()/db.prepare()` gain `await`. Files: `server/app.test.ts`, `database.test.ts`, `kit.test.ts`, `search.test.ts` (6 raw-db uses), `logging.test.ts`, `recaptcha.test.ts`, `scheduled-backup.test.ts`, `integrations.test.ts`, `server/testing/harness.ts`, `tests/browser/company.spec.ts`.
- [x] 10.2 `SearchGateway`/`KitService` construction in tests awaits `ready`; the provider-policy-change test asserts on the rejected `ready` instead of a constructor throw (same message).
- [x] 10.3 Playwright config: the company server uses an isolated in-memory or temp-dir PGlite database instead of a temp SQLite file.
- [x] 10.4 Test speed: if PGlite startup per `startCompany()` makes the suite noticeably slower, share a pre-migrated template and reset between tests. Record before/after timings.
- [x] 10.5 New tests:
  - revision conflict still returns 409 and writes nothing (two stale saves);
  - transaction rollback leaves no partial rows; nested `repo.*` calls inside a transaction use the same connection;
  - email lookup is case-insensitive and duplicate emails are rejected;
  - `users()` ordering matches the previous bytewise order for accented names;
  - cron route: 401 without/with a wrong secret, 503 with no secret configured, 200 with the right one, and it does not need a session or CSRF token;
  - stale `busy` thread is reaped on read; a fresh `busy` thread is not;
  - `rateLimit` uses the client IP when `trustProxy` is on;
  - importer (9.5);
  - `vercel.json` checks (8.5).

### Phase 11: Remove Fly.io and Docker

- [x] 11.1 Delete `fly.toml`, `Dockerfile`, `.dockerignore`.
- [x] 11.2 Remove Fly/Docker references: `grep -rniE "fly\.io|fly\.dev|fly deploy|dockerfile|docker" README.md docs .github src-tauri tests` and fix each (docs, CI, desktop server URL defaults).
- [x] 11.3 Keep `npm start` / `npm run dev:server` (still the local production-style and API-only servers). Note in README that Vercel is the hosted path.
- [x] 11.4 `.gitignore`: add `.kit-local/`, `.vercel/`.
- [x] 11.5 Remove SQLite-only wording from docs (`docs/STATUS.md`, `README.md`, `docs/DATA_MODEL_PROPOSAL.md` mentions where they describe the current store).

### Phase 12: Docs

- [x] 12.1 `docs/DEPLOY_VERCEL.md`: the manual runbook below, step by step, with the exact commands.
- [x] 12.2 Update `docs/STATUS.md` (hosting section, "Not verified" list), `supabase/README.md` (new migration, role setup), `.env.example` (new/changed vars below). **(partly done)** `docs/STATUS.md`, `supabase/README.md`, `README.md`, `CLAUDE.md` updated. `.env.example` was **not** edited because `.env*` is off limits; the new variables are listed in DEPLOY_VERCEL.md.
- [x] 12.3 Update `docs/CLEANUP_LOG.md` with the new baseline and the test timings from 10.4. **(done)** See `docs/CLEANUP_LOG.md`.

### Phase 13: Verification gate (all must pass before I report done)

- [x] 13.1 `npm run typecheck` clean. **(done)** Clean.
- [x] 13.2 `npm test` passes; compare counts with the Phase 0 baseline and explain any difference. **(done)** 37 files, 247 passed + 1 expected failure (baseline 27 files, 198 + 1; +49 new tests, no existing assertion changed).
- [x] 13.3 `npm run build` succeeds. **(done)** `npm run build` and `npm run build:api` succeed.
- [ ] 13.4 `npm run test:browser` passes (≈2.5 min), including the accessibility checks. **(open, pre-existing)** The browser suite cannot pass in a clean environment even at the last commit `4982a43` with the original SQLite backend: the specs still click "Abrir espacio de empresa", which the single-login change (`b95e656`) removed, so company and print/axe journeys time out at their first UI step. Confirmed by running the same specs on an untouched copy of `4982a43`. Not caused by this migration; needs the specs updated to the single-login flow (owner decision). Backend behavior is covered by the API journeys in `server/app.test.ts` and the real-driver test `server/db/pg.test.ts`.
- [x] 13.5 Phase 4.16 grep sweep clean again at the end. **(done)** Clean.
- [x] 13.6 `npm run dev` and `npm run dev:server` start with no env vars set and no network, create the owner on first run, and persist across restart (PGlite directory). **(done)** Verified `dev:server` with no env vars: creates `.kit-local/pglite`, owner setup works, data survives a restart. `npm run dev` uses the same code path plus Vite.
- [x] 13.7 `grep -rn "node:sqlite" server src` shows only the importer. **(done)** Only the importer (and a comment in `server/db/index.ts`).
- [ ] 13.8 `vercel build` locally, if the CLI is available (no deploy, no upload). Otherwise recorded as "verify at first preview". **(replaced)** No Vercel CLI login here. Instead `server/api-bundle.test.ts` loads the committed function bundle in plain Node and calls it over HTTP. The real Vercel build is confirmed at the first deploy.
- [x] 13.9 `git status` shows nothing under `data/` and no `.env*` changes from me; `git diff --stat` reviewed. **(done)** Nothing under `data/` or `.env*` changed.
- [x] 13.10 Final report to the owner: what changed, test results, anything not verified, and the manual steps. **(done)**

---

## 5. Environment variables

Move to **Vercel → Project Settings → Environment Variables**. Mark secrets as Sensitive.

| Variable | Action | Notes |
|---|---|---|
| `KIT_DATABASE` | **Changes meaning** | Was a file path (`/data/kit.sqlite`). Now the Supabase **pooler** connection string for the `kit_server` role (port 6543). Production only. |
| `KIT_ORIGINS` | **Changes value, still required** | The CSRF allow-list. Set to the Vercel URL(s) and custom domain, comma-separated. Was `https://kit-audiiovisual-app.fly.dev`. |
| `CRON_SECRET` | **New** | Random 32+ bytes. Vercel sends it as `Authorization: Bearer …` to the cron route. |
| `KIT_SECURE_COOKIES` | Move as-is | `true` |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Move as-is | Also needed at **build** time (`vite.config.ts` bakes them into the portal bundle). Enable for Build and Runtime. |
| `VITE_RECAPTCHA_SITE_KEY` | Move as-is | Build time. |
| `RECAPTCHA_PROJECT_ID`, `RECAPTCHA_API_KEY`, `RECAPTCHA_SITE_KEY` | Move as-is | |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `KIT_AI_PROVIDER`, `KIT_AI_MODEL`, `KIT_CHAT_MODEL`, `KIT_PLAN_MODEL` | Move as-is | Only the providers actually in use. |
| `SERPAPI_API_KEY`, `KIT_SERPAPI_MONTHLY_CAP` | Move as-is | |
| `KIT_SEARCH_*` (provider name/url/token, region, retention, budget, price, `KIT_SEARCH_ENCRYPTION_KEY`) | Move as-is | **`KIT_SEARCH_ENCRYPTION_KEY` must keep the exact same value** or existing encrypted search data becomes unreadable. |
| `KIT_EMAIL_*`, `WHATSAPP_*` | Move as-is | |
| `KIT_LOG_LEVEL` | Move as-is | |
| `KIT_JOB_STALE_MS` | New, optional | Default 330000. |
| `CALCOM_*` | **Verify, probably drop** | The booking domain was removed; I will check whether any code still reads these. |
| `KIT_BACKUP_DIR`, `KIT_BACKUP_KEEP` | **Local only** | Vercel's disk is read-only. They only affect a local `npm run backup`. Hosted backups come from Supabase. Do not set on Vercel. |
| `PORT`, `NODE_ENV` | **No longer apply** | Vercel provides `NODE_ENV`. No port. |
| `KIT_SEED_OWNER_*` | **No longer apply on Vercel** | Local dev seeding only. The owner is created on first run in the app. |
| Fly: `[[mounts]]`, `[http_service]`, `[[vm]]`, `/data` | **Removed** | |

Preview deployments: do **not** set `KIT_DATABASE` for Preview. The API then reports the database is not configured instead of touching production data.

## 6. Manual steps for the owner

These need your accounts or secrets, so I cannot do them. I will write exact commands in `docs/DEPLOY_VERCEL.md`.

**Before the first deploy**
1. Decide the Vercel plan. **Hobby works for building and testing** this migration. For the company's real use, **Pro is recommended** (Hobby is for personal, non-commercial use). Nothing in the code depends on the choice; switching later is a plan change in the dashboard plus, optionally, the one-line cron schedule edit in `vercel.json`. Also decide the Supabase tier (backups and pausing).
2. **Supabase:** apply `20261107000012_kit_company_schema.sql` (SQL editor or `supabase db push`). Then set a password for the server role: `ALTER ROLE kit_server WITH LOGIN PASSWORD '<new strong password>';`
3. **Supabase → Connect:** copy the **transaction pooler** connection string and substitute the `kit_server` user and password. Do not use the `postgres` superuser.
4. **Vercel:** import the GitHub repo as a new project (framework Vite, root `/`), or tell me to link it. Add the environment variables from section 5 for Production. Generate `CRON_SECRET` with `openssl rand -hex 32`.
5. **Supabase Auth → URL Configuration:** add the Vercel URL and custom domain to Site URL / Redirect URLs (password-reset and sign-in links break otherwise).
6. **Google reCAPTCHA Enterprise:** add the Vercel domain(s) to the allowed domains of the site key.

**Data (only if there is real data to keep)**
7. Get the data: from your machine copy `data/kit.sqlite` (do not modify it), and/or from Fly: `fly ssh sftp get /data/kit.sqlite`. Keep a copy somewhere safe.
8. Dry run: `KIT_DATABASE=<pooler url> npm run migrate:sqlite -- --from <path>`. Read the counts. Then add `--apply`. It checks counts and checksums itself.

**Deploy (needs your explicit go-ahead; I will not do these)**
9. Tell me to push. A push to the connected branch creates a Vercel build.
10. Deploy to **Production on the `*.vercel.app` URL first** (before attaching the domain) and smoke test: sign in, edit and save a record, reload, create a proposal draft with AI, send a KIT chat message and watch it complete, confirm an Act-mode action, run a search, export a backup. Check Vercel Logs → Cron shows `search-retry` returning 200.
11. Attach the custom domain, update `KIT_ORIGINS`, redeploy.
12. Update the desktop app's server URL if it points at the Fly address.

**After**
13. Enable Supabase backups / point-in-time recovery (your plan tier decides which). `npm run backup` now needs a connection string, so scheduled off-site backups are best done by Supabase.
14. Only after a few days of confirmed good use: `fly apps destroy kit-audiiovisual-app` (this deletes the volume and its data, so be sure the import is verified first). Cutover is one-way after the first write on Vercel: Fly will not receive new data.

**Rollback before step 11:** nothing changed for users; keep Fly running. After step 11: restore from the last Supabase backup or the pre-cutover `kit.sqlite`.

## 7. Risks and how they are handled

| Risk | Handling |
|---|---|
| A forgotten `await` silently drops a write (TypeScript does not flag it) | Per-file grep (Phase 4), final sweep (13.5), 150+ tests and the browser suite |
| Serverless instances freeze after the response while KIT generation runs | `waitUntil` + `maxDuration 300` + stale-job reaping (5.3, 5.5, 8.4) |
| Two requests interleave a read-then-write | Advisory lock per transaction (D5) + revision guard |
| Vercel's Node ESM cannot resolve extensionless imports | Detect early (6.5); esbuild bundle fallback |
| Supabase pooler quirks (transaction mode) | No session state, no named prepared statements; advisory **xact** lock only |
| Image uploads over the 4.5 MB platform cap | Limit lowered to 4 MB with a clear error; real sizes measured in 4.8 |
| Preview deploys touching production data | `KIT_DATABASE` is Production-only |
| PGlite is WASM, so tests may slow down | Measured in 10.4, template DB if needed |
| Postgres is stricter than SQLite on parameter types | Tests surface it; fixed at the call site, not by loosening the schema |
| **Hobby plan is for personal, non-commercial use** (Vercel's terms, as I understand them; confirm in their current terms). KIT is a company's production tool. | Build and test on Hobby. **Upgrade to Pro before the company relies on it**, to avoid suspension risk. This is a business/ToS decision, not a technical one. |
| Hobby function duration may be lower than the 300 s assumed | Verified in 0.3 and the dashboard; `maxDuration` and `KIT_JOB_STALE_MS` are derived from the real limit (8.4) |
| Hobby cron is daily only, so no per-minute retry | D7: daily cron + opportunistic throttled retry; optional Supabase `pg_cron` |
| Supabase free tier pauses inactive projects and has no point-in-time backups | Owner decision: use a paid Supabase tier for production, or accept the pause/backup limits. Not a code change. |
| Real behavior changes users could notice | Search retry is on-activity plus daily instead of every 30 s (search has no provider configured today); uploads capped at 4 MB; everyone signs in once after cutover; AI jobs that outlive the function limit are marked interrupted |

## 8. Verified platform facts

Checked 2026-11-07 against Vercel's documentation index (limited results):

- Confirmed: cron jobs are configured in `vercel.json` with a `path` and a `schedule`; Vercel sends `Authorization: Bearer $CRON_SECRET`; `functions.<path>.maxDuration` is configurable; `waitUntil` and `getDeadline` exist in `@vercel/functions`.
- **Not confirmed from the docs index (to verify in step 0.3, before relying on them):** Hobby cron frequency (I believe once per day), Hobby `maxDuration` ceiling with Fluid Compute (I believe 300 s), the 4.5 MB request-body cap (I am confident of this one), and the exact wording of the Hobby non-commercial restriction.

_(step 0.3 fills in the final answers)_

## 9. Open items I will confirm in the code (none block approval)

- Exact SQL in `search.ts` beyond what I've read (expected: same dialect-safe statements; the 60 sites are handled by the compat layer).
- How the Playwright server is started (config command) so 10.3 is exact.
- Whether the Tauri app hardcodes the Fly URL (11.2).
- Whether anything still reads `CALCOM_*`.
