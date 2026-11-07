# CLAUDE.md

KIT is a Spanish-first audiovisual event-production workspace for one company: React + Vite frontend, Express + Node SQLite company server, and a Tauri 2 desktop shell. Read [docs/STATUS.md](docs/STATUS.md) for the current state.

## Commands

Node ≥ 22.12, **npm only** (no pnpm/yarn lockfiles).

```sh
npm ci                 # install
npm run dev            # sample workspace at http://127.0.0.1:5173
npm run dev:server     # company server at http://127.0.0.1:3001
npm run typecheck      # tsc -b
npm run build          # typecheck + vite build
npm test               # vitest (src + server)
npm run test:browser   # Playwright, isolated headless Chrome (~2.5 min)
npm run format         # prettier
npm run backup         # checksummed workspace backup to KIT_BACKUP_DIR (never run against data/ in tests)
npm run desktop:dev    # Tauri (needs Rust + Tauri prerequisites)
```

Before committing, run typecheck, `npm test` and `npm run test:browser`. Compare the results against the baseline in [docs/CLEANUP_LOG.md](docs/CLEANUP_LOG.md).

## Rules

- **No external calls.** Never make live AI, WhatsApp, cloud or provider requests, and never add credentials. Tests use explicit fixtures at the model and messaging boundaries.
  - **Exception (owner-approved 2026-11-06): the portal** (`src/portal/`, `supabase/`) may call the company's own Supabase project (`hgugkgbpsrbqusazmthb`) with the public publishable key only. The secret key stays in `.env` and Edge Function secrets, is never read by `vite.config.ts` and never reaches the browser. The company server may also call that same project, with the public key and the user's own token only, to verify a portal administrator on `POST /api/login/supabase` (single login for admins; added 2026-11-06 with owner approval). Everything else above still applies.
- **Never touch** `data/` (real company SQLite), `.env*`, or `node_modules/`. Supabase Postgres is a separate store from `data/`; the SQLite format is unchanged.
- **No push or deploy** without explicit user approval.
- **Refactors do not change behavior.** Moves and extractions keep exported names, API routes and response shapes identical. If a test must change, stop and explain.
- **Ask before** deleting files, changing an API route or response shape, or changing the on-disk database format.
- AI only suggests. Outgoing client messages, proposal acceptance, and mutations proposed by KIT Act mode always need an owner or user confirmation and a server-side authorization check. Do not weaken this.
- UI text is Spanish (labels in `src/shared/i18n.ts`). Code, identifiers and docs are English. Never translate stored business content.
- Match the surrounding style. Prettier is configured.

## Where things live

- `src/application/` — app frame, navigation, session entry, contextual assistant.
- `src/modules/` — business workspaces, proposal editor and AI suggestion review.
- `src/shared/` — domain records/calculations, access policy, API/store boundary, interface labels, sample data and common UI.
- `server/` — authenticated API, validation, SQLite persistence, authorization, proposal generation adapter and tests.
- `src-tauri/` — desktop shell and native file commands.
- `src/portal/` — Supabase booking portal (auth, roles, client/admin dashboards). Separate bundle (entry split in `src/main.tsx`), Tailwind + shadcn-style components with `k-` prefixed tokens. Plan: `docs/backend-dashboards/implementation_plan.md`.
- `supabase/` — SQL migrations (applied to the hosted project), see `supabase/README.md`.
- `native/file-index/` — encrypted local file index (Rust, SQLCipher).
- `tests/browser/` — sample/company journeys, responsive/print and accessibility checks.
- `docs/` — product plan, technical decisions and implementation evidence. Cleanup plan: `docs/claude-cleanup.md`.

## Architecture notes

- All company data is currently one JSON row (`workspace` table, `server/database.ts`) guarded by a single global revision. Saves conflict across sessions even when they touch different records. A migration is planned in Stage 5 of the cleanup plan, which needs approval before it starts.
- Sample mode keeps data in browser local storage. Company mode persists it on the server. Both modes must keep working.
