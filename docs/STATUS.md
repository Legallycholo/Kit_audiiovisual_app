# KIT — Status

Updated: November 7, 2026. One-page summary. Detailed evidence per requirement: [IMPLEMENTATION_PROGRESS.md](IMPLEMENTATION_PROGRESS.md).

## Current state

- **Web/company app:** Phase 1 and the Phase 3A–9 local showcases are complete. Sales (AI-assisted proposal drafting and editing, owner-confirmed messaging and acceptance), 2D/3D design, creative studio, operations/fulfilment and reporting all run locally against sample data or a local company server.
- **Desktop app (Tauri):** milestones 1–2 (shell, hubs, tabs) and 5 (shared KIT conversations) are implemented. Milestones 3–4 (local file index, search) are implemented with release gates outstanding. Milestone 6 (design pipeline) has a provider-neutral foundation. Milestone 7 (sync and recovery) has started. See [DESKTOP.md](DESKTOP.md).
- **Nothing is deployed.** No live AI call, WhatsApp message, or cloud upload has been made.
- **Hosting (Vercel):** the code is ready to deploy on Vercel with the company database in Supabase Postgres (private `kit` schema). The Fly.io and Docker files are removed. It has not been pushed or deployed; the owner's remaining steps (apply the schema, set environment variables, import data, deploy, smoke test) are in [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md). Local `npm run dev` / `dev:server` use an in-process PGlite database and need no account.

- **Sign-in (Supabase):** one entry page, `/portal/login`, with **Iniciar sesión** and **Crear cuenta** (`/portal/signup`). New accounts get the `user` role and, with `app_settings.require_account_approval = true`, wait as *pending* until an administrator approves them in `/portal/admin/users` ("Aprobar"). Only active portal **administrators** enter the workspace for now (`POST /api/login/supabase`); approved non-admins see "Sin acceso al espacio de trabajo" until employee roles are decided. On an empty company database the **first** verified administrator to sign in becomes the owner and an empty workspace ("KIT audiovisual", renamable in Configuración) is created; the old owner-setup screen remains only for local runs without Supabase. No client role and no booking scheduling.

## What is verified

- Automated: typecheck, 150 unit/API tests (plus 1 expected failure documenting a half-cent rounding issue), 48 Playwright browser journeys including axe accessibility checks, and an offline AI-drafting evaluation harness. Details in [CLEANUP_LOG.md](CLEANUP_LOG.md).
- Server-enforced authentication, CSRF, role/event scope, revision conflicts, audit, AI output validation (catalog prices only, unknown items rejected).
- macOS native binary builds.

## Not verified

- Live AI quality with a company credential; live WhatsApp/webhooks.
- Business metric formulas, pricing/tax/deposit rules, reservation buffers.
- Windows launch, code signing, OS-vault prompts, real OCR, real embedding provider.
- Production hosting on Vercel (code ready, never deployed: serverless bundling, function duration and cron on the owner's plan are confirmed at the first deploy), off-site backups (Supabase backups), email-based account recovery.

## Next five priorities

1. Reconcile reporting formulas with representative company data and get named business-owner approval.
2. Record the approved external tools and API policies; validate AI drafting with real proposals; connect the messaging channel and signed webhook.
3. Validate operations against real inventory, concurrent events, crew, supplier, damage and return cases; decide on serialized stock and equipment-only rentals.
4. Approve and implement the per-record data model ([DATA_MODEL_PROPOSAL.md](DATA_MODEL_PROPOSAL.md)) for safe concurrent editing and faster saves at scale. Schedule `npm run backup` and copy backups off-site. Password change, admin-issued temporary passwords and grant editing are done; email recovery awaits a provider.
5. Desktop release gates: Windows launch, signing, native acceptance checklist ([DESKTOP_PHASES_3_4.md](DESKTOP_PHASES_3_4.md#release-gates-not-claimed-complete)).

Engineering cleanup is tracked separately in [claude-cleanup.md](claude-cleanup.md).

## Open business decisions

- Separate equipment-only rental bookings.
- Pricing periods, discounts/tax treatment, deposits, signatures/PO requirements, preparation and return buffers.
- Team identities, detailed role grants, client approval authority, data retention and recovery targets.
- Editor source formats, measurement tolerance, export formats, representative venue plans.
- AI and messaging providers, models, credentials, data-use policies, WhatsApp company number/account, recipient matching, reminders.
