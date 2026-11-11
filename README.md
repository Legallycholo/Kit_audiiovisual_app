# KIT — Audiovisual Production Workspace

KIT is a Spanish-first workspace for an audiovisual event-production company. It connects **clients, events, venues, proposals, equipment inventory, 2D/3D layouts and day-of operations** in one app, with AI that _suggests_ and people that _decide_.

> Status: in active development and **deployed on Vercel** (every push to `main` is a production deploy). Current state in one page: [docs/STATUS.md](docs/STATUS.md).

## What it does

- **Sales** — clients, events, proposals with catalog-priced line items, AI-assisted drafting, owner-confirmed messaging and acceptance.
- **Design** — 2D venue layouts with a lazy-loaded 3D preview built from the same geometry.
- **Operations** — inventory, reservations, crew tasks, fulfilment, returns and reporting.
- **Search and files** — universal search, CSV import, and an encrypted local file index (desktop).
- **KIT chat / Act mode** — a contextual assistant; any mutation it proposes needs user confirmation and a server-side authorization check.

Feature details: [docs/FEATURES.md](docs/FEATURES.md). Product plan: [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).

## Tech stack

| Layer            | Technology                                                                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend         | React 19, TypeScript 5.9, Vite 7, React Router 7, lucide-react                                                                                            |
| Company server   | Node ≥ 22.12, Express 5, Postgres (Supabase in production, PGlite locally), Zod 4 for validation, `tsx` runner                                           |
| Auth             | Server-side sessions (HTTP-only cookies, CSRF, role/event scoping); reCAPTCHA hooks |
| AI               | Server-only provider adapter (`server/ai-provider.ts`): Anthropic, OpenAI, Gemini over `fetch`; structured output validated against the catalog           |
| Desktop          | Tauri 2 (Rust): shell, native file commands, OS keyring                                                                                                   |
| Local file index | Rust crate `native/file-index`: SQLCipher (rusqlite), file watching, PDF/Office text extraction                                                           |
| Testing          | Vitest (unit/API), Playwright (browser journeys), axe-core (accessibility)                                                                                |
| Tooling          | npm (only), Prettier, `tsc -b`                                                                                                                            |

## Data

All data is persisted by the Express server in Postgres: the company's Supabase project in production (private `kit` schema), and an in-process PGlite database in `.kit-local/` (git-ignored) for local work. The workspace is currently one JSON row guarded by a single global revision, so concurrent saves conflict. A per-record model is proposed in [docs/DATA_MODEL_PROPOSAL.md](docs/DATA_MODEL_PROPOSAL.md). The former browser-only sample mode no longer exists; `src/shared/seed.ts` is used by tests and by the optional `KIT_SEED_OWNER_PASSWORD` local seed.

## Accounts and roles

Sign-in goes through the Supabase portal (`/portal/login`, with account requests at `/portal/signup`
that an administrator approves). A verified portal administrator enters the workspace through
`POST /api/login/supabase`; the Express server issues its own session and stays the authorization gate.
Workspace roles (six, in `src/shared/access.ts`) are managed in _Configuración › Usuarios_. The
password login (`/api/login`, `/api/setup`) remains for local runs without a configured portal.

Administrators also get `/admin`, an overview of who holds each role and the
recent access history. Everyone sees their own role on the dashboard.

## Hosting

Production runs on **Vercel**: the Vite build is served as static files and the API runs as one serverless function (`api/index.mjs`, bundled from `server/vercel-entry.ts` by `npm run build:api`) against the company's Supabase Postgres. See [docs/DEPLOY_VERCEL.md](docs/DEPLOY_VERCEL.md) for the setup and the owner's manual steps. Search retries run from a Vercel Cron job and after search activity instead of an in-process timer.

## Getting started

Requires Node ≥ 22.12 and npm (no pnpm/yarn). Local runs need no database setup and no network: `KIT_DATABASE` is unset, so a PGlite database is created in `.kit-local/pglite`.

```sh
npm ci
npm run dev          # sample workspace  → http://127.0.0.1:5173
npm run dev:server   # company server    → http://127.0.0.1:3001
```

Without a configured portal the first run shows the local owner setup and creates an empty workspace (no sample import, no default credentials). Set `KIT_SEED_OWNER_PASSWORD` to start from the sample data instead. Both services bind to loopback.

Copy `.env.example` to `.env` for optional settings (AI keys and models, reCAPTCHA, backup dir, search provider). Provider secrets are read by the server only. Never put credentials in a `VITE_` variable.

### Commands

```sh
npm run typecheck      # tsc -b
npm run build          # typecheck + vite build
npm test               # vitest (src + server)
npm run test:browser   # Playwright, isolated headless Chrome (~2.5 min)
npm run format         # prettier
npm run backup         # checksummed backup to KIT_BACKUP_DIR (keeps KIT_BACKUP_KEEP newest)
npm run desktop:dev    # Tauri (needs Rust + Tauri prerequisites)
npm run desktop:build
```

Serve a production build from the API process: `npm run build && NODE_ENV=production npm start` → http://127.0.0.1:3001.

Before committing, run typecheck, `npm test` and `npm run test:browser`, and compare with the baseline in [docs/CLEANUP_LOG.md](docs/CLEANUP_LOG.md).

## Repository layout

```
src/application/   app frame, navigation, session entry, contextual assistant
src/modules/       business workspaces, proposal editor, AI suggestion review
src/shared/        domain records and calculations, access policy, API/store boundary,
                   i18n labels (i18n.ts), sample data, common UI
server/            authenticated API, validation, Postgres persistence (server/db), authorization,
                   AI adapters, backups, tests
api/               Vercel Function entry (the same Express app); vercel.json routes /api here
src-tauri/         Tauri 2 desktop shell and native file commands
native/file-index/ encrypted local file index (Rust, SQLCipher)
tests/browser/     Playwright journeys, responsive/print and accessibility checks
docs/              plan, technical decisions, status, desktop phases, cleanup plan
```

## Ground rules for contributors

- **External services are allowed in production, never in dev or tests.** Tests and local runs use fixtures at the provider boundaries and PGlite. Keys live only in server environment variables. Never add credentials.
- **AI only suggests.** Outgoing client messages, proposal acceptance and Act-mode mutations always need confirmation plus a server-side authorization check. Do not weaken this.
- **Refactors don't change behavior.** Keep exported names, API routes and response shapes identical; if a test must change, stop and explain.
- **Ask first** before deleting files, changing an API route/response shape, or changing the on-disk database format.
- **Don't touch** `data/` (real company SQLite), `.env*` or `node_modules/`.
- **Language:** UI text is Spanish (labels in `src/shared/i18n.ts`). Code, identifiers and docs are English. Never translate stored business content.
- Match surrounding style; Prettier is configured.
- No push or deploy without explicit approval.

## Known gaps

Not yet verified: live AI quality, WhatsApp/webhooks, business formulas (pricing, tax, deposits), Windows desktop launch and signing, off-site backups and email account recovery.

The sign-in screen keeps one escape hatch, "Entrar sin servidor", for working without a backend. It is gated on `import.meta.env.DEV` (`src/shared/store.tsx`), so it is absent from a production build.

## Further reading

- [docs/STATUS.md](docs/STATUS.md) — current state and next priorities
- [docs/TECHNICAL_DECISIONS.md](docs/TECHNICAL_DECISIONS.md) — why the stack looks like this
- [docs/DESKTOP.md](docs/DESKTOP.md) — desktop phases and release gates
- [docs/IMPLEMENTATION_PROGRESS.md](docs/IMPLEMENTATION_PROGRESS.md) — per-requirement evidence
- [docs/claude-cleanup.md](docs/claude-cleanup.md) — engineering cleanup plan
