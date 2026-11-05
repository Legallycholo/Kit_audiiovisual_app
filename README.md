# KIT — Audiovisual Production Workspace

KIT is a Spanish-first workspace for an audiovisual event-production company. It connects **clients, events, venues, proposals, equipment inventory, 2D/3D layouts and day-of operations** in one app, with AI that _suggests_ and people that _decide_.

> Status: in active development, nothing deployed. Current state in one page: [docs/STATUS.md](docs/STATUS.md).

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
| Frontend         | React 19, TypeScript 5.9, Vite 7, React Router 7, Three.js, lucide-react                                                                                  |
| Company server   | Node ≥ 22.12, Express 5, built-in `node:sqlite`, Zod 4 for validation, `tsx` runner                                                                       |
| Auth             | Server-side sessions (HTTP-only cookies, CSRF, role/event scoping); reCAPTCHA hooks |
| AI               | Server-only provider adapter: Gemini (`@google/genai`), OpenAI, Anthropic; structured output validated against the catalog                                |
| Desktop          | Tauri 2 (Rust): shell, native file commands, OS keyring                                                                                                   |
| Local file index | Rust crate `native/file-index`: SQLCipher (rusqlite), file watching, PDF/Office text extraction                                                           |
| Testing          | Vitest (unit/API), Playwright (browser journeys), axe-core (accessibility)                                                                                |
| Tooling          | npm (only), Prettier, `tsc -b`                                                                                                                            |

## Two data modes

- **Sample mode** — runs in the browser only; data lives in local storage. Good for UI work.
- **Company mode** — data is persisted by the Express server in SQLite (`data/kit.sqlite`, git-ignored). The workspace is currently one JSON row guarded by a single global revision, so concurrent saves conflict. A per-record model is proposed in [docs/DATA_MODEL_PROPOSAL.md](docs/DATA_MODEL_PROPOSAL.md).

Both modes must keep working.

## Accounts and roles

There is no self-service sign-up: an administrator creates every account in
_Configuración › Usuarios_ and assigns one of the six roles in
`src/shared/access.ts`. Sign-in is by password (`/api/login`); the Express server issues its own
session and stays the authorization gate.

Administrators also get `/admin`, an overview of who holds each role and the
recent access history. Everyone sees their own role on the dashboard.

## Getting started

Requires Node ≥ 22.12 and npm (no pnpm/yarn). Node 22 prints an experimental warning for `node:sqlite`; this is expected.

```sh
npm ci
npm run dev          # sample workspace  → http://127.0.0.1:5173
npm run dev:server   # company server    → http://127.0.0.1:3001
```

In the app choose **Abrir espacio de empresa**. First run creates the owner account and an empty workspace (no sample import, no default credentials). Account setup is limited to connections from the server machine; both services bind to loopback.

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
server/            authenticated API, validation, SQLite persistence, authorization,
                   AI adapters, backups, tests
src-tauri/         Tauri 2 desktop shell and native file commands
native/file-index/ encrypted local file index (Rust, SQLCipher)
tests/browser/     Playwright journeys, responsive/print and accessibility checks
docs/              plan, technical decisions, status, desktop phases, cleanup plan
```

## Ground rules for contributors

- **No external calls.** No live AI, WhatsApp, cloud or provider requests in dev or tests; tests use fixtures at the model and messaging boundaries. Never add credentials.
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
