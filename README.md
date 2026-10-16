# KIT — Production workspace

An audiovisual event-production app connecting clients, events, venues, proposals, equipment, layouts, and production. Implementation is in progress; the full requirements remain in [the implementation plan](docs/IMPLEMENTATION_PLAN.md) and remaining work is tracked in [implementation progress](docs/IMPLEMENTATION_PROGRESS.md).

The local layout showcase supports calibrated image references, verified measurement notes, reusable templates, equipment-quantity reconciliation, revision recovery, and dimensioned SVG exports. Layout mappings do not create reservations or change proposal scope.

The local Creative Studio accepts rights-confirmed event references and creates clearly labeled SVG concept drafts with revision, provenance, review, usage and proposal-selection records. It makes no external image or video call; live creative providers, billing and API credentials remain undecided.

Draft proposals can embed approved creative work and exact 2D/3D layout snapshots, keep editable client-facing captions, compare saved revisions, and produce a client-safe browser print/PDF view. Selected media is copied into the proposal revision so later source changes do not rewrite issued material.

The local operations showcase supports reusable equipment packages, owned and supplier allocations, buffered occupancy, substitutions, controlled dispatch/partial-return/damage reconciliation, maintenance quarantine, affected-event stock conflicts, dated crew shifts, timed cues, transport, onsite change history and actual production costs. These records use replaceable local persistence and server-enforced permissions; they do not connect to payroll, accounting, supplier ordering or serialized warehouse scanning.

The local reporting showcase documents and separates proposal pipeline, accepted scope, recorded operating costs, operating contribution, equipment utilization, workload and event execution. Administrator-reviewed automation suggestions use stable evidence keys, preserve decisions and failures, and can create a linked internal task only after approval. They never send client messages, accept proposals or contact an external integration. The calculations still require company reconciliation and approval before production use.

Spanish is the primary interface language. The Phase 1 shell, account entry, common controls, acceptance review, design controls, and proposal drafting/editing workflow use Spanish. Stored business content is preserved in its original language, while development documentation and internal record identifiers remain in English.

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

## AI proposal drafting

The local showcase includes a server-side OpenAI Responses adapter, but the company has not finalized its external tools or provider. When this adapter is intentionally selected for live validation, configure **both** `OPENAI_API_KEY` and `KIT_AI_MODEL` in the server environment or ignored `.env`, then restart the server. Use an account-authorized model supporting Responses Structured Outputs. No specific model is silently selected, and no credential belongs in a `VITE_` variable or browser code. Without these settings, the UI reports that AI is unconfigured and preserves manual drafting.

The owner workflow is: create/select a client and event, review the equipment catalog and rates, open **Propuestas → Redactar con IA**, enter requirements, generate a suggestion, review it, and create an editable proposal. The editor supports saving, reopening, preview/PDF printing, and further AI suggestions with explicit selection of which text or line items to replace.

The provider receives the entered brief, selected event summary, client name, and equipment catalog/rates. It does not receive unrelated conversations, contacts, passwords, or the entire workspace. Requests use strict structured output, a timeout, an output-token cap, and per-user/company request limits. Rates are copied from the server catalog; unknown or duplicate equipment and model-supplied prices are rejected. Quantities and rental days remain suggestions requiring business review. The current catalog context is limited to 500 products; larger catalogs need scoped retrieval before live use.

Generation produces a suggestion and audit entry; it does not mutate a proposal until the owner applies and saves it. Internal assumptions and unanswered questions persist with the draft and are omitted from client print views and client account responses. These notes are a review aid, not a claim that model-generated prose is factually guaranteed. The app's general AI sidebar remains unfinished. Creative generation currently uses a local provider-neutral showcase rather than a live image service.

**Live model generation has not been verified with a company credential.** Automated tests use an explicit substitute at the model boundary while exercising the real UI, API, database, and permission checks. No real client messages or model requests were sent during those tests.

## Access and workflow boundaries

Company mode includes hashed passwords, HTTP-only sessions, request-origin/CSRF checks, user creation/deactivation, server-side role/event scope, explicit client proposal sharing, revision conflict checks, server-authored audit entries, and transactional inventory validation. Technician task access uses account IDs; legacy tasks with display-name-only assignments must be reassigned through company accounts. Password recovery, account invitation delivery, and editing existing role/event grants are still pending.

Issued/accepted proposal revisions are immutable through ordinary edits. Acceptance uses a dedicated owner-only action tied to the exact issued revision and source message. Duplicate inbound IDs are ignored, while ambiguous responses require linking and cannot be accepted. Recording acceptance does not send an acknowledgment, reserve equipment, collect payment, or confirm production readiness. The production workspace separately requires accepted current scope, confirmed equipment coverage and assigned tasks before preparation or execution, and requires completed tasks plus returned/cancelled allocations before closeout. The local messaging showcase requires owner confirmation, records delivery and acceptance evidence through replaceable boundaries, and never contacts a real client. Real sending and receiving remain unavailable until an approved provider, authorized company channel and signed webhook are connected. Sample inbound messages are illustrative fixtures.

Commercial rules remain provisional: USD, daily catalog rates, cent rounding, and discount before tax. The business must validate pricing, taxes, deposits, and reservation buffers before live operation. The connected 2D/3D workspaces share meter-based geometry, selection, branding surfaces and versioned camera views; 3D equipment remains explicit geometric placeholders with no claim of engineering certification or calibrated lighting/acoustic simulation.

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
- `tests/browser/` — sample/company journeys, responsive/print and accessibility checks.
- `docs/` — product plan, technical decisions and implementation evidence.

No deployment, commits, pushes, real customer messages, or live AI calls were performed in this pass.
