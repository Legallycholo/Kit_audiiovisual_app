# CLAUDE.md

KIT is a Spanish-first audiovisual event-production workspace for one company: React + Vite frontend, Express company server on Postgres (Supabase in production, PGlite locally), deployed on Vercel, and a Tauri 2 desktop shell. Read [docs/STATUS.md](docs/STATUS.md) for the current state.

## Commands

Node ≥ 22.12, **npm only** (no pnpm/yarn lockfiles).

```sh
npm ci                 # install
npm run dev            # sample workspace at http://127.0.0.1:5173
npm run dev:server     # company server at http://127.0.0.1:3001 (local PGlite database in .kit-local/, no network)
npm run typecheck      # tsc -b
npm run build          # typecheck + vite build
npm test               # vitest (src + server)
npm run test:browser   # Playwright: Vite on 5173 + one isolated in-process API server per test (~10 min)
npm run format         # prettier
npm run backup         # checksummed workspace backup to KIT_BACKUP_DIR (uses KIT_DATABASE)
npm run migrate:sqlite # one-time import of an old SQLite file into Postgres (dry run by default)
npm run desktop:dev    # Tauri (needs Rust + Tauri prerequisites)
```

Before committing, run typecheck, `npm test` and `npm run test:browser`. Compare the results against the baseline in [docs/CLEANUP_LOG.md](docs/CLEANUP_LOG.md).

## Rules

- **External services are allowed** (owner decision 2026-11-09: the app integrates with many APIs). The app may call AI providers (Anthropic, Higgsfield, others), the company's Supabase project (`hgugkgbpsrbqusazmthb`), messaging and other provider APIs. Guardrails:
  - Keys and secrets live only in server environment variables or Edge Function secrets. They are never committed, never logged, never read by `vite.config.ts` and never reach the browser. The browser may only hold public/publishable keys (for example the Supabase publishable key).
  - Every external call goes through a provider interface on the server (for example `server/ai-provider.ts`, KIT Design's `RenderProvider`) with a fixture implementation.
  - Tests and local development use those fixtures and PGlite, never live services, so `npm test` stays free, deterministic and offline. The company database (Supabase Postgres, role `kit_server`, `KIT_DATABASE`) is used only by the deployed server.
  - Calls that cost money (image renders, AI generations) need a visible quota or cap.
- **Never touch** `data/` (the original company SQLite file; it is only ever read by `npm run migrate:sqlite`, read-only, when the owner runs it), `.env*`, or `node_modules/`. The company database is Postgres in the `kit` schema of the Supabase project; tests and local development use in-process PGlite and never connect to it.
- **No push or deploy** without explicit user approval. The Vercel project builds every push to `main` into production, so a push is a deploy.
- **Refactors do not change behavior.** Moves and extractions keep exported names, API routes and response shapes identical. If a test must change, stop and explain.
- **Ask before** deleting files, changing an API route or response shape, or changing the on-disk database format.
- AI only suggests. Outgoing client messages, proposal acceptance, and mutations proposed by KIT Act mode always need an owner or user confirmation and a server-side authorization check. Do not weaken this.
- UI text is Spanish (labels in `src/shared/i18n.ts`). Code, identifiers and docs are English. Never translate stored business content.
- Match the surrounding style. Prettier is configured.

## Where things live

- `src/application/` — app frame, navigation, session entry, contextual assistant.
- `src/modules/` — business workspaces, proposal editor and AI suggestion review.
- `src/modules/design-ai/` — KIT Design (Diseño): room images in, realistic event renders out, refined by chat. Plan: `docs/kit_design_AI.md`. Shared records in `src/shared/kit-design.ts`.
- `src/shared/` — domain records/calculations, access policy, API/store boundary, interface labels, sample data and common UI.
- `server/` — authenticated API, validation, Postgres persistence (`server/db/`), authorization, proposal generation adapter and tests.
- `api/` — the Vercel Function entry (the same Express app); `vercel.json` routes `/api/*` to it and serves `dist/` statically.
- `src-tauri/` — desktop shell and native file commands.
- `src/portal/` — Supabase booking portal (auth, roles, client/admin dashboards). Separate bundle (entry split in `src/main.tsx`), Tailwind + shadcn-style components with `k-` prefixed tokens. Plan: `docs/backend-dashboards/implementation_plan.md`.
- `supabase/` — SQL migrations (applied to the hosted project), see `supabase/README.md`.
- `native/file-index/` — encrypted local file index (Rust, SQLCipher).
- `tests/browser/` — sample/company journeys, responsive/print and accessibility checks.
- `docs/` — product plan, technical decisions and implementation evidence. Cleanup plan: `docs/claude-cleanup.md`.

## Architecture notes

- The database layer is async (`server/db/`): the same SQL runs on `pg` (Supabase) and PGlite (local/tests). Schema: `supabase/migrations/20261107000012_kit_company_schema.sql`. Every transaction takes one global writer lock, which keeps SQLite's one-writer behavior.
- On Vercel there is no background timer or shared memory: search retries run from Vercel Cron (`/api/cron/search-retry`, bearer `CRON_SECRET`) and after search activity; KIT's background AI jobs run under `waitUntil`, and jobs left behind by a cut-off function are interrupted by age (`KIT_JOB_STALE_MS`).
- All company data is currently one JSON row (`workspace` table, `server/database.ts`) guarded by a single global revision. Saves conflict across sessions even when they touch different records. A migration is planned in Stage 5 of the cleanup plan, which needs approval before it starts.
- There is no browser-only sample mode any more: the store is company-only and every page needs a server session. `src/shared/seed.ts` feeds tests, the browser harness (`tests/browser/harness.ts`) and the optional `KIT_SEED_OWNER_PASSWORD` local seed.
