# KIT — Production workspace

An audiovisual event-production app connecting clients, events, venues, proposals, equipment, layouts, and production. Implementation is in progress; the full requirements remain in [the implementation plan](docs/IMPLEMENTATION_PLAN.md) and remaining work is tracked in [implementation progress](docs/IMPLEMENTATION_PROGRESS.md).

Spanish is the primary interface language. Development documentation and internal record identifiers remain in English.

- **Current state in one page:** [docs/STATUS.md](docs/STATUS.md)
- **Feature showcases, AI drafting, access and workflow boundaries:** [docs/FEATURES.md](docs/FEATURES.md)
- **Desktop app phases:** [docs/DESKTOP.md](docs/DESKTOP.md)

## Run locally

Use Node.js 22.12 or newer and npm. The current server uses Node's built-in SQLite module, which emits an experimental-feature warning under Node 22.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173** for the isolated sample workspace. In a second terminal, start the company server:

```sh
npm run dev:server
```

Choose **Abrir espacio de empresa** in the app. First setup creates the owner account and an empty company workspace; it does not import sample records. No default credentials are supplied. Subsequent visits use sign-in. Account setup is restricted to connections originating on the server machine. Both development services bind to loopback.

The server reads an optional local `.env`; `.env.example` documents its settings. The default database is `data/kit.sqlite`, excluded from Git. Company data is stored on this server; sample data stays in browser local storage. A browser refresh or sign-out does not erase company records. The settings page offers an administrator JSON export, not a complete backup/restore service.

To serve a built local app from the API process:

```sh
npm run build
NODE_ENV=production npm start
```

Open **http://127.0.0.1:3001**. Public deployment still requires HTTPS, operational backups, account recovery, deployment hardening, and business acceptance; none has been deployed here.

### Scheduled backups

```sh
npm run backup
```

Writes a checksummed backup of the company workspace (the same format as the administrator export) to `KIT_BACKUP_DIR` (default `data/backups/`) and keeps the newest `KIT_BACKUP_KEEP` files (default 14). Schedule it with cron, launchd or Task Scheduler. Backups stay on this machine. Copying them off-site is a deployment decision.

### Desktop app

With the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) installed:

```sh
npm run desktop:dev
npm run desktop:build
```

The bundled window runs the local sample workspace. To use the company service from the desktop shell, see [docs/DESKTOP.md](docs/DESKTOP.md).

### AI configuration

AI features stay disabled until a provider is approved. `OPENAI_API_KEY` with `KIT_AI_MODEL` (proposal drafting) or `KIT_CHAT_MODEL` (KIT chat) are read by the server only — never put credentials in a `VITE_` variable. Details and data boundaries: [docs/FEATURES.md](docs/FEATURES.md#ai-proposal-drafting).

## Verification

```sh
npm run build
npm test
npm run test:browser
```

Browser tests use isolated headless Google Chrome through Playwright, without an existing browser profile. They start/reuse the local Vite server and write ignored screenshots/traces to `artifacts/`. Company workflow tests start isolated API instances with in-memory databases; no actual company account is created by the test suite.

## Source organization

- `src/application/` — app frame, navigation, session entry, contextual assistant.
- `src/modules/` — business workspaces, proposal editor and AI suggestion review.
- `src/shared/` — domain records/calculations, access policy, API/store boundary, interface labels, sample data and common UI.
- `server/` — authenticated API, validation, SQLite persistence, authorization, proposal generation adapter and tests.
- `src-tauri/` — desktop shell (Tauri 2) and native file access.
- `native/file-index/` — encrypted local file index (Rust).
- `tests/browser/` — sample/company journeys, responsive/print and accessibility checks.
- `docs/` — product plan, technical decisions and implementation evidence.
