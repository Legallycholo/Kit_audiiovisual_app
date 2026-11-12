# KIT — Status

Updated: November 11, 2026. One-page summary. Detailed evidence per requirement: [IMPLEMENTATION_PROGRESS.md](IMPLEMENTATION_PROGRESS.md).

## Current state

- **Web/company app:** Phase 1 and the Phase 3A–9 local showcases are complete. Sales (AI-assisted proposal drafting and editing, owner-confirmed messaging and acceptance), operations/fulfilment and reporting all run locally against sample data or a local company server.
- **Desktop app (Tauri):** milestones 1–2 (shell, hubs, tabs) and 5 (shared KIT conversations) are implemented. Milestones 3–4 (local file index, search) are implemented with release gates outstanding. Milestone 6 (design pipeline) has a provider-neutral foundation. Milestone 7 (sync and recovery) has started. See [DESKTOP.md](DESKTOP.md).
- **Diseño is now KIT Design** ([kit_design_AI.md](kit_design_AI.md)): drop room photos, get realistic renders of the event set up in that room, refine by chat with Aplicar / Descartar, check stock, add the equipment to the proposal (confirmed) and export a PDF. Phases 1–4 are implemented and stored on the server (migration 13). The old floor-plan/3D editor and Estudio creativo screens are removed; their stored records stay in the database. **Not verified live:** Claude (spec) and Higgsfield (renders) are wired but have never been called for real. Without keys the page shows sample images marked "MUESTRA". The live trial (Phase 0) needs the owner's keys and venue photos.
- **Deployed.** Production runs on Vercel (`kit-audiiovisual-app`, auto-deployed from GitHub `main`) against the company's Supabase project (private `kit` schema, migrations 1–14 applied). Production has no AI, Higgsfield, SerpAPI, WhatsApp or Supabase secret key yet, so AI drafting, KIT chat and renders are disabled or fixtures there and KIT Design files are stored in the database. No live AI call, WhatsApp message or paid render has been made. Local `npm run dev` / `dev:server` use an in-process PGlite database and need no account.
- **Proposals are the document-first KIT Classic workspace** (`docs/improvement_fable.md`, implemented 2026-11-11): "Nueva propuesta" opens a KIT-branded document at once (event optional, linked later), every field is edited in place, equipment lines come from the catalog or as custom services, totals use `quoteTotals()`, preview and print (US Letter) use the same tree, KIT sits beside the document and returns structured suggestions that are reviewed, with financial changes confirmed explicitly. Earlier Minimal/Editorial/Spotlight proposals keep their presentation. Remaining from the Phase 2 plan ([audit_phase1.md](audit_phase1.md)): simpler dashboard, search presentation, template consolidation.

- **Sign-in (Supabase):** one entry page, `/portal/login`, with **Iniciar sesión** and **Crear cuenta** (`/portal/signup`). New accounts get the `user` role and, with `app_settings.require_account_approval = true`, wait as _pending_ until an administrator approves them in `/portal/admin/users` ("Aprobar"). Only active portal **administrators** enter the workspace for now (`POST /api/login/supabase`); approved non-admins see "Sin acceso al espacio de trabajo" until employee roles are decided. On an empty company database the **first** verified administrator to sign in becomes the owner and an empty workspace ("KIT audiovisual", renamable in Configuración) is created; the local owner-setup screen remains only for runs without a configured portal (that is how the browser tests sign in). No client role and no booking scheduling.

## What is verified

- Automated: typecheck, 279 unit/API tests (plus 1 expected failure documenting a half-cent rounding issue), the Playwright browser journeys (each against its own in-process server, see `tests/browser/harness.ts`) including axe accessibility checks, and an offline AI-drafting evaluation harness. Details in [CLEANUP_LOG.md](CLEANUP_LOG.md).
- Server-enforced authentication, CSRF, role/event scope, revision conflicts, audit, AI output validation (catalog prices only, unknown items rejected).
- macOS native binary builds.

## Not verified

- Live AI quality with a company credential; live WhatsApp/webhooks.
- Business metric formulas, pricing/tax/deposit rules, reservation buffers.
- Windows launch, code signing, OS-vault prompts, real OCR, real embedding provider.
- Live AI, Higgsfield, messaging and SerpAPI on the deployed app (no keys configured yet), off-site backups (Supabase backups), email-based account recovery.

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
