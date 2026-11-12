# Phase 1 audit — KIT cleanup, UX simplification and KIT Classic proposals

> **Phase 2 progress (November 11, 2026):** stages 1–10 of §12 are done and committed on `main` (test harness, cleanup, Spanish-only interface, dashboard, proposal data model, KIT Classic renderer and print, document-first editor, immediate creation, KIT assistant with change review, versions and list). Live project: workspace row cleaned (1 MB → 4.5 KB), migration ledger completed. Items 11 (KIT Design renders enter the document by reference, from the editor or from the design's "añadir a la propuesta" dialog) and 12 (search source chips, sample-mode wording removed) are done too. Still open: §12 item 13 (later approvals: Minimal/Editorial/Spotlight consolidation, stored layout/creative data removal, per-record data model) and the `kit-store.tsx` dead sample-mode branches (code only, no user-facing text). Owner actions pending: delete the two booking buckets and enable leaked-password protection in the Supabase dashboard; add `ANTHROPIC_API_KEY` (recommended provider) and `SUPABASE_SECRET_KEY` to Vercel.

Date: November 10, 2026. Audit only: no files deleted, no refactors, no database changes, no push, no deploy.
Verified this session: `npm run typecheck` OK; `npm test` 39 files, 279 passed + 1 expected failure (half-cent rounding); `vite build` OK; `npm run test:browser` **cannot run as configured** (`playwright.config.ts` waits on port 5173 while `npm run dev` serves port 3000); run against a manually started in-memory server on 5173 it finished **1 passed, 67 failed** in 23 minutes, every failure being "Execution context was destroyed, most likely because of a navigation": unauthenticated pages now redirect to `/portal/login`, and the specs still assume the removed sample workspace / "Abrir espacio de empresa" flow. The 48-green baseline in `CLEANUP_LOG.md` predates the single-login change.
Live systems were inspected through the Supabase and Vercel connectors, not from the docs.

## 1. Current architecture

- **Two browser bundles from one Vite build.** `src/main.tsx` picks `src/portal/entry` for `/portal/*` (Supabase auth, Tailwind + shadcn-style, `sonner`, Radix) and `src/workspace-entry.tsx` for everything else (the company workspace, plain CSS, lucide icons). Workspace routes are lazy-loaded in `src/application/App.tsx`; `src/modules/{Proposals,Design,Inventory,Operations}.tsx` are one-line barrels that those lazy imports depend on.
- **Navigation model** lives in `src/application/navigation.ts`: six destinations (Inicio, Eventos, Ventas, Diseño, Recursos, KIT) plus Configuración, filtered by `canSeeModule`. Proposals sit under Ventas with Mensajes and Clientes. Command palette (⌘K) exposes "Nueva propuesta" and "Redactar propuesta con IA" as `/proposals?new=manual|ai`.
- **Server** is one Express 5 app (`server/app.ts` → `createApp`) with per-domain routers in `server/routes/`, plus three services that mount their own routes: `KitService` (`/api/kit/*`), `SearchGateway` (`/api/search/*`), `DesignAIService` (`/api/design/*`). Validation is Zod (`server/schema.ts`), authorization in `server/policy/*`, re-exported by `server/permissions.ts`.
- **Persistence**: `server/db/` runs the same SQL on `pg` (Supabase) and PGlite (local/tests). All business records are one JSON row (`kit.workspace`, global revision); users, sessions, audit, search, KIT threads and KIT Design have real tables. `Repository.read()` also loads the newest 1,000 audit rows into `workspace.activity` on every read.
- **Hosting**: Vercel. `vercel.json` rewrites `/api/*` to `api/index.mjs`, a committed esbuild bundle generated from `server/vercel-entry.ts` by `npm run build:api` (the build command regenerates it). Vercel Cron hits `/api/cron/search-retry`.
- **AI**: `server/ai-provider.ts` is a provider-neutral structured-output transport (OpenAI, Anthropic, Gemini, all via `fetch`). Three consumers: proposal drafting (`server/proposal-ai.ts`), KIT chat (`server/kit.ts`), KIT Design spec (`server/design-ai/designer.ts`). Renders/videos go through `RenderProvider` (Higgsfield or fixture).
- **Auth**: Supabase Auth owns identity (`public.profiles.role`, `account_status`); `POST /api/login/supabase` verifies the token server-side and mints KIT's own cookie session. A legacy password path (`/api/setup`, `/api/login`, reCAPTCHA hooks) remains for runs without Supabase. Six workspace roles in `src/shared/access.ts`.
- **"Sample mode" no longer exists.** `src/shared/store.tsx` types `mode` as `"company"` only; `createSeed()` is used by tests and the optional `KIT_SEED_OWNER_PASSWORD` seed. CLAUDE.md and README still describe two modes.

### What is actually live (not what the docs say)

| Fact | Evidence |
| --- | --- |
| **The app is deployed and auto-deploys from GitHub `main`.** Three production deployments on Nov 9–10 (`51fa8d7`, `a391f01`, `30f2458`), project `kit-audiiovisual-app`, URL `kit-audiiovisual-app.vercel.app`. | Vercel `list_deployments` |
| Production env has `KIT_DATABASE`, `KIT_ORIGINS`, `KIT_SECURE_COOKIES`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `CRON_SECRET`, `KIT_LOG_LEVEL` and **nothing else**: no AI key, no Higgsfield key, no `SUPABASE_SECRET_KEY`, no SerpAPI, no WhatsApp. AI drafting, KIT chat and renders are therefore disabled or fixtures in production. | Vercel `filter_project_envs` |
| `kit.workspace` holds revision 5, about 1.06 MB: 1 client, 1 event, 0 venues, 0 equipment, **0 proposals**, 1 layout, 1 creative asset. 1,052,659 bytes of that row is one base64 `layouts[].reference.dataUrl` from the removed floor-plan editor. | SQL on the project |
| KIT Design tables hold 2 projects, 1 image, 1 version, 1 render, 1 video, 4 messages, 3 files (1.7 MB in `design_files` because there is no `SUPABASE_SECRET_KEY`, so images are stored in the database). | `list_tables` |
| `STATUS.md` says "Nothing is deployed" and "the old owner-setup screen remains"; README still says "choose Abrir espacio de empresa". | docs vs. Vercel |

## 2. Confirmed cleanup candidates

Evidence method: an import graph over `src/`, `server/`, `api/`, `scripts/`, `tests/` (static and dynamic imports, CSS `@import`/`url()`), plus grep for every `package.json` dependency, route table, build config and test references.

| Verdict | Item | Evidence |
| --- | --- | --- |
| **DELETE** | `src/application/Hubs.tsx` | Not imported by any file (graph). It only re-exports two names from `navigation.ts` "to keep old imports valid"; no such import exists. Docs mention hubs only historically. |
| **DELETE** | `three`, `@types/three` dependencies and the `manualChunks` rule in `vite.config.ts` | Zero imports of `three` in `src/`, `server/`, `tests/` (grep). The 3D `Scene` was removed in `36d38b5`; the chunk rule matches nothing (build output has no `three-engine` chunk). README "Tech stack" still lists Three.js. |
| **DELETE** | `import { GoogleGenAI } from "@google/genai"` in `server/ai-provider.ts`, then the `@google/genai` dependency | The only reference is the import line; `gemini()` uses `fetch`. The package is traced into the Vercel function for nothing. |
| **DELETE** | `metadata.json` (root) | AI Studio artifact (`MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API`); nothing reads it (grep). |
| **CONSOLIDATE** | `.env.example` | Lists removed `CALCOM_*` (integration removed in `c95c478`); misses variables the server reads: `HIGGSFIELD_*`, `KIT_DESIGN_*`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `CRON_SECRET`, `KIT_JOB_STALE_MS`, `KIT_DATABASE_POOL_MAX`, `KIT_DATABASE_CA`. |
| **CONSOLIDATE** | Sample-mode remnants | `store.tsx` is company-only, but `kit-store.tsx`, `KitChat.tsx`, `CloudSearchSettings.tsx` keep "Modo de ejemplo" branches and local-storage thread code; CLAUDE.md/README describe two modes. |
| **CONSOLIDATE** | `src/desktop.css` (145 lines), `src/desktop-modules.css` (8 lines), `src/file-search.css` (612 lines) | All loaded globally; 4 of 66 classes unused (`assistant-context`, `kit-landing`, `kit-role-user`, `sample-banner`). Fold into `shell.css`/module CSS later; no behavior change. |
| **CONSOLIDATE** | Proposal "Visuals" pickers in `src/modules/proposals/EditorWorkspace.tsx` | They offer "Conceptos creativos aprobados" (Estudio creativo, removed) and "Diseños del evento" 2D/3D (floor-plan editor, removed) and link to `/design?event=`, which no longer opens an editor. Rendering of already-saved visuals must stay. |
| **KEEP (data), INVESTIGATE (later removal)** | `layouts`, `creativeAssets`, `brandAssets` collections, their types, schema and `proposal-visuals.ts` | Live row still contains 1 layout (1 MB) and 1 creative asset; `scopeWorkspace`, backup and validation reference them. Removal is a database-format decision. |
| **INVESTIGATE** | `src/shared/creative.ts` | Imported only by `domain.test.ts` and `server/app.test.ts` (fixture builder for the removed studio). Deleting it changes tests, so it waits for approval. |
| **INVESTIGATE** | reCAPTCHA (`src/shared/recaptcha.ts`, `server/recaptcha.ts`, `RECAPTCHA_*`) | Still wired into the local password login; unused in production (Supabase login, no RECAPTCHA env on Vercel). Keep until the local login path's future is decided. |
| **INVESTIGATE** | Committed `api/index.mjs` (7,423 lines) | Regenerated by the Vercel build command; committing it is redundant and creates noisy diffs. Could be git-ignored once the owner confirms Vercel builds succeed without it. |
| **INVESTIGATE** | `docs/design.md`, `docs/design_stage2.md`, `docs/DESKTOP_PHASE_6.md` | Describe the removed 2D/3D editor and the design pipeline as planned; candidates for an `docs/archive/`. |
| **KEEP** | `src/modules/Proposals.tsx`, `Design.tsx`, `Inventory.tsx`, `Operations.tsx` barrels | Each is the target of a lazy `import()` in `App.tsx`. |
| **KEEP** | `tsx` (runtime dep), `@electric-sql/pglite-socket` (dev), `@tauri-apps/api`, `@vercel/functions`, `sonner`, Radix, `clsx`, `tailwind-merge`, `class-variance-authority` | All have live imports (portal bundle, desktop, `waitUntil`). |
| **KEEP** | `server/ai-eval/`, `server/perf/`, `server/testing/harness.ts`, `server/scheduled-backup.ts` | Test-only or script-only by design (`npm run perf`, `npm run backup`). |

No npm dependency is fully unused except `three`, `@types/three` and `@google/genai`.

## 3. Supabase / database findings

- **Migration drift.** `supabase_migrations` records only 1–9 plus a hotfix `fix_create_booking_status_cast` that is **not in the repo**. Yet the database state shows migrations 10–14 applied: booking tables gone, `app_role` is `user,admin`, `profiles.new_password` exists, `kit.*` tables and `kit_server` role (`LOGIN`, `search_path=kit`) exist, `kit-design` bucket exists. They were applied through the SQL editor/connector, so `supabase/README.md` ("10 and 11 NOT yet applied", "no sign-up page") is wrong and the migration ledger cannot be trusted for future diffs.
- **Leftover storage buckets** `deliverables` and `session-attachments` from the removed booking domain (plus `avatars`, `kit-design`).
- **Security advisor**: five `SECURITY DEFINER` functions executable by `authenticated` (`admin_set_role`, `admin_set_account_status`, `is_admin`, `is_active_user`, `log_auth_event`). The admin ones check `is_admin()` internally, so this is a hardening note, not an exposure. Leaked-password protection is off.
- **Performance advisor**: unindexed FK `kit.design_videos.version_id`; `public.app_settings` has two permissive SELECT policies; 12 never-used indexes (expected at this data size).
- **`kit` schema is private** (no grants to `anon`/`authenticated`, RLS on, policies only for `kit_server`) as designed.
- **Workspace row**: single JSON blob, revision 5, 1 MB dominated by a dead layout image; `Repository.read` parses it and 1,000 audit rows per request. The approved-but-unimplemented per-record model (`docs/DATA_MODEL_PROPOSAL.md`) is still the right medium-term fix; KIT Classic does not need it first.
- **Company settings** are `company, currency, timezone, email, notifications` only: no slogan, address, phone, website or logo. Adding them is a payload-shape change (defaults in `emptyWorkspace`, `Repository.read`, `server/schema.ts`), not a SQL migration.

## 4. UI/UX findings

- **Language leaks.** `uiLabel()` falls back to the English key, so any untranslated string ships in English. Found literal English in `Dashboard.tsx` ("All clear. Keep creating.", "There are no client acceptance requests…", panel titles), `Events.tsx` ("Prepare a proposal", "proposal revisions", "Open proposals", "Event schedule…"), `UserManagement.tsx`, `Inbox.tsx` ("Awaiting owner review"), and every `<Badge>{status}</Badge>` that prints raw enum values (`Draft`, `Issued`, `Planning`). Theme toggle says "Liquid Glass / Obsidian Glass". `EditorWorkspace` icon buttons use `aria-label="Remove …"`.
- **Help guide is stale**: "Diseño — Planos 2D, vista 3D y estudio creativo."
- **Proposal creation friction**: "Nueva propuesta" opens a modal that requires an event; with zero events `createDraft` returns silently (the live workspace has one event and zero equipment, so the first real user hits exactly this).
- **Editor feels like a form**: four-section outline (Introduction / Equipment & services / Visuals / Terms), labelled fields, template selector buried under "Visuals", preview in a modal, AI in a second modal, versions compare in a third.
- **Proposal numbering** `KIT-YYYY-NNN` uses `proposals.length + 1`; numbers collide after a deletion and across revisions it is only unique by (number, version).
- **Status vocabulary** in the list tabs mixes internal keys (`Draft`, `Issued`) rendered through `uiLabel` and raw badges.
- **Mobile**: shell has a drawer and 899 px breakpoint; the proposal editor's three-column layout has no drawer pattern for the summary/AI.

## 5. Dashboard recommendations

- Keep the "next event" hero and the owner's desk; translate everything; drop "Your access" for administrators (duplicates `/admin`) and keep it only for scoped roles.
- Replace "Equipment in catalog" (sums quantities) and "Open production tasks" (all events, all time) with proposal pipeline value (`quoteTotals` over Draft/In review/Issued) and "this week" tasks.
- Add one row of primary actions: Nueva propuesta, Nuevo evento, Abrir KIT Design, Preguntar a KIT.
- Show 8–10 activity rows with Spanish titles (audit actions are stored in English: "Proposal saved"); map them through `uiLabel` or a dedicated label table rather than translating stored data.
- Defer any chart until the per-record model exists; the data needed is computed client-side today.

## 6. Search recommendation

Four search surfaces exist: palette record search (`src/shared/search.ts`, in-memory), `/search` page (`UniversalSearch.tsx`, combines app records, desktop local index, personal cloud semantic index via `SearchGateway`), WebLookup (SerpAPI, owner-only, in the equipment/venue/event forms, capped and audited) and the desktop `FileLibrary`. Recommendation: **KEEP all four, CONSOLIDATE the presentation**: one `/search` page with explicit source chips (KIT, Este equipo, Nube, Web), and move the cloud-index settings out of `FileLibrary` into Configuración › Integraciones. Do not merge SerpAPI into universal search (it costs money per query and is deliberately form-scoped). Nothing in the search stack blocks KIT Classic.

## 7. KIT AI recommendation

- Keep `structuredResponse()` as the single transport and the "AI returns structured data, server validates with Zod, app renders" rule; it already holds for proposals (`suggestionSchema` + `materializeSuggestion`: unknown/duplicate equipment rejected, prices copied from the catalog) and for KIT chat (`kitAnswer`, act-mode actions confirmed with a token and `applyChanges`).
- There are **two AI UXs**: `ProposalAI.tsx` (brief → suggestion → checkbox apply) and `KitChat.tsx` (threads, sources, act mode). For KIT Classic, reuse the KitChat visual language (composer, `LightMix`, Sparkles icon) in a proposal-scoped panel, but keep calling the proposal endpoint, not the chat threads: the proposal panel is stateless per proposal and must return a full structured proposal, which `kitAnswer` cannot carry.
- Extend `suggestionSchema` additively: `scope`, `terms`, `notes`, `discount`, `tax`, `customLines[{description, quantity, days}]` with **no rate** (materialized at rate 0 and listed under "Información pendiente"), and an edit input `{existing: Proposal, instruction}` so the same route can rewrite. Financial fields come back as proposals, never applied without the change review.
- Production has no AI key; the "Mejorar con IA" button correctly shows `ConnectNotice`. The owner decides provider/key before any live test.

## 8. Proposal workspace recommendation

Evolve, don't fork. Everything KIT Classic needs already has a home:

| Capability | Existing code to extend |
| --- | --- |
| Record + versions + statuses | `Proposal` in `src/shared/types.ts`; `createProposalRevision` in `domain.ts`; lock rule in `editor-view.tsx` (`Issued/Accepted/Declined/Superseded` are read-only, "Nueva versión" clones) |
| Money | `quoteTotals()` (single source of truth; already used by list, inbox, reports, server policy) |
| Save / conflict / unsaved guard | `useEditorView().save`, `useWorkspace().update` (diff → `PATCH /api/workspace`), `useUnsavedChanges` |
| Send | `prepareOutgoingMessage()` → conversation draft → owner review in Mensajes (second confirmation, `POST /api/messaging/...`) |
| AI | `ProposalAI` + `POST /api/ai/proposal-draft` |
| Print | `.print-proposal` CSS, `@media print` blocks in `styles.css`, browser test "proposal print preview contains only the client review document" |
| Brand | `Wordmark` component (`src/shared/ui/Wordmark.tsx`), `/kit-logo.png`, slogan already in `index.html` |

Concrete plan:

1. **Data (additive, backward compatible)**: `ProposalTemplate = "Classic" | "Minimal" | "Editorial" | "Spotlight"`; new optional fields `documentType` (default `"PROPUESTA"`), `scope`, `notes`, `paymentTerms`, `salesperson`, `clientSnapshot {name, contact, email, phone, company?, address?}`, `eventSnapshot {name, type, venue, start, end, attendees}`; settings gain `slogan`, `address`, `phone`, `website`, `logo?`. Defaults applied in `emptyWorkspace`, `Repository.read` and `server/schema.ts`. Existing proposals without `presentationTemplate` keep rendering as Editorial (today's fallback); only **new** proposals default to Classic.
2. **Renderer**: `src/modules/proposals/templates/KitClassicProposal.tsx`, `ProposalDocument.tsx`, `proposal-document.css` (own stylesheet, imported by the Proposals chunk, not `styles.css`). Pure props → DOM; `mode: "edit" | "preview"`; in edit mode each text node is a controlled input/textarea styled as document text. Totals come from `quoteTotals`. Snapshots are rendered when present, else the linked client/event.
3. **Editor**: `EditorWorkspace` becomes `ProposalDocument` in a two-pane layout (document + collapsible right panel); the outline/summary asides go; the summary totals live in the document footer. `editor-view.tsx` keeps every handler. Preview becomes a mode toggle, not a modal; print uses the same tree.
4. **Creation**: `Proposals` "Nueva propuesta" creates and opens a draft immediately, pre-filled from `?event=` when present; a small "Vincular evento" selector in the document header. Requires the decision in §15 on event-less proposals.
5. **AI panel**: `ProposalAssistant` (new, in `proposals/`) using the KitChat composer styling; drafts into a `pending` suggestion; `ChangeReview` lists `+ ~ −` lines with a mandatory confirm when any of `lines, discount, tax` change. Non-financial text edits may apply inline with undo.
6. **History**: a "Versiones" list built from the existing `family` array (number + version), replacing the compare modal's selector; comparison table stays.
7. **List**: columns Propuesta / Cliente / Evento / Total / Estado / Actualizada; filters Todos / Borradores / Revisión / Enviadas / Aceptadas mapped to existing enums (needs `updatedAt`: additive field, filled on save).
8. **Later**: once Classic is default and verified, propose folding Minimal/Editorial/Spotlight into Classic variants; never silently.

The AI never emits HTML or styling: it fills the structured fields above, KIT renders them.

## 9. Integrations / missing connections

| Integration | Code | Production |
| --- | --- | --- |
| AI provider (Anthropic/OpenAI/Gemini) | wired, tested with stubs | **not configured** (no key) |
| Higgsfield renders/videos | wired, fixtures | not configured |
| Supabase Storage for design files | `supabaseStorage` | not configured → files in DB |
| SerpAPI lookup | wired, capped | not configured |
| WhatsApp | status/test only; outbound transport is the showcase fixture | not configured |
| Email | status only, no sender | not configured |
| Cloud search provider | `httpSearchProvider` | not configured |
| Vercel Cron | `/api/cron/search-retry` | configured (`CRON_SECRET`) |
| reCAPTCHA | legacy login only | not configured |

`.env.example` and `docs/DEPLOY_VERCEL.md §2.3` need a reconciliation pass against `server/bootstrap.ts`.

## 10. Performance opportunities

- **1 MB workspace payload on every load and every PATCH response**, 99% a dead layout image. Removing or externalising `layouts[].reference` (owner decision) is the single biggest win for the live workspace.
- `Repository.read` loads 1,000 audit rows per request; the dashboard shows 3. Cap or lazy-load activity.
- Build: shared chunk 311 kB (named `Wordmark-*.js`: React, Router, lucide, shared UI), workspace entry 140 kB, portal entry 354 kB (supabase-js + Radix), one 136 kB CSS file for all pages (`styles.css` is 4,447 lines). Proposals chunk 39.5 kB. Split `styles.css` per module and give KIT Classic its own CSS.
- Fonts: Manrope ships Vietnamese/Greek/Cyrillic subsets (about 32 kB) that Spanish UI never uses; import only `latin`/`latin-ext`.
- Known quadratic hot spots (`validateWorkspace`, `diffWorkspace`, `automationCandidates`) are documented in `CLEANUP_LOG.md`; not a blocker at current size.
- Drop `@google/genai` from the function bundle.

## 11. Risks

1. **Every push to `main` deploys to production** (Vercel GitHub integration). The "no push without approval" rule is now also the "no deploy" rule; branches would deploy previews.
2. **The browser suite is not a safety net today**: `playwright.config.ts` waits on `http://127.0.0.1:5173` while `npm run dev` serves port 3000, and `company.spec.ts` still clicks the removed "Abrir espacio de empresa" button. UI stages need the suite repaired first (test-code change, needs approval).
3. **Single JSON row**: any concurrent editor conflicts; KIT Classic autosave patterns must stay coarse (save on blur/explicit) until the per-record model lands.
4. **Migration ledger drift** in Supabase: future schema work must start by recording what is applied.
5. **Proposal numbering collisions** and the half-cent rounding issue (documented `it.fails`) become client-visible once PDFs go out.
6. **No AI key in production**: the "describe → generate" promise cannot be demoed live until the owner configures a provider.
7. Event-less proposals interact with scoping (`server/policy/scope.ts` filters proposals by event for scoped roles and guests); schema currently requires `eventId`.

## 12. Recommended implementation order

1. **Test harness repair** (approval needed: test code): Playwright port/flow, login via `/api/login` seed path; re-baseline counts in `CLEANUP_LOG.md`.
2. **Zero-risk cleanup**: delete `Hubs.tsx`, `three`/`@types/three`, `GoogleGenAI` import + `@google/genai`, `metadata.json`; fix `vite.config.ts` chunk rule; `.env.example`; docs truth pass (STATUS, README, CLAUDE.md, supabase/README, help guide).
3. **Language pass**: every status badge through `uiLabel`; translate the literals in Dashboard, Events, UserManagement, Inbox, EditorWorkspace aria-labels; add keys.
4. **Dashboard simplification** (§5).
5. **Proposal data additions** (§8 step 1) + settings fields + Configuración › General inputs for company info.
6. **KIT Classic renderer + print stylesheet** (Letter, A4 fallback), used first by the existing preview modal so it ships behind no new UI.
7. **Document-first editor** replacing the section layout; preview mode toggle; mobile drawer.
8. **Immediate creation flow** ("Nueva propuesta" → draft; "Vincular evento").
9. **AI panel + structured edit endpoint + change review**.
10. **Revision list, proposal list columns/filters, `updatedAt`.**
11. **Visuals section** fed by KIT Design renders (already linked via `/api/design/designs/:id/apply`), hide dead pickers.
12. **Search presentation consolidation** and sample-mode remnant removal.
13. **Later / separate approvals**: template consolidation, layout/creative data removal, per-record data model, committed `api/index.mjs`.

## 13. Files expected to change per stage

1. `playwright.config.ts`, `tests/browser/company.spec.ts`, `docs/CLEANUP_LOG.md`.
2. `src/application/Hubs.tsx` (delete), `package.json`, `package-lock.json`, `vite.config.ts`, `server/ai-provider.ts`, `metadata.json` (delete), `.env.example`, `README.md`, `CLAUDE.md`, `docs/STATUS.md`, `supabase/README.md`, `src/application/App.tsx` (help text).
3. `src/shared/i18n.ts`, `src/modules/Dashboard.tsx`, `src/modules/Events.tsx`, `src/modules/UserManagement.tsx`, `src/modules/Inbox.tsx`, `src/modules/proposals/*.tsx`, `src/shared/ui/primitives.tsx` (Badge).
4. `src/modules/Dashboard.tsx`, `src/styles.css` (dashboard rules), `src/shared/reporting.ts` if pipeline value is reused.
5. `src/shared/types.ts`, `src/shared/empty.ts`, `server/database.ts` (read defaults), `server/schema.ts`, `src/shared/domain.ts`, `src/modules/operations/Settings.tsx`, tests in `server/app.test.ts` / `src/shared/domain.test.ts` (additive).
6. `src/modules/proposals/templates/{KitClassicProposal,ProposalDocument}.tsx`, `proposal-document.css`, `src/modules/proposals/EditorDialogs.tsx` (preview uses renderer), `tests/browser/accessibility.spec.ts` (print check).
7. `src/modules/proposals/{Editor,EditorWorkspace,editor-view}.tsx`, `src/styles.css` (remove `.proposal-workspace` rules), `src/shared/ui/overlays.tsx` if a drawer primitive is added.
8. `src/modules/proposals/ProposalList.tsx`, `src/application/App.tsx` (palette actions), `src/modules/Events.tsx` (links), `server/schema.ts` + `server/policy/scope.ts` if event-less proposals are approved.
9. `server/proposal-ai.ts`, `server/routes/ai.ts`, `server/proposal-ai.test.ts`, `server/ai-eval/*`, `src/modules/ProposalAI.tsx` → `src/modules/proposals/ProposalAssistant.tsx`, `ChangeReview.tsx`.
10. `src/modules/proposals/ProposalList.tsx`, `EditorDialogs.tsx`, `editor-view.tsx`.
11. `src/modules/proposals/EditorWorkspace.tsx` (visuals), `src/modules/design-ai/DesignPage.tsx`.
12. `src/modules/UniversalSearch.tsx`, `src/modules/FileLibrary.tsx`, `src/modules/CloudSearchSettings.tsx`, `src/shared/kit-store.tsx`, `src/modules/KitChat.tsx`.

## 14. Files that should probably be removed (not yet)

- `src/application/Hubs.tsx`
- `metadata.json`
- `src/shared/creative.ts` (after its two test usages are replaced by inline fixtures)
- `src/desktop-modules.css` (8 lines, fold into `shell.css`)
- `docs/design.md`, `docs/design_stage2.md`, `docs/DESKTOP_PHASE_6.md` → archive folder rather than delete
- `.env.example` entries `CALCOM_*`
- Dependencies: `three`, `@types/three`, `@google/genai`
- Supabase storage buckets `deliverables`, `session-attachments` (owner, in the dashboard)

## 15. Questions that truly need the product owner

1. **Proposals without an event.** The plan says creation must not block on an event, but `eventId` is required by the schema and drives role scoping. Options: (a) allow `eventId: null` and show such proposals only to Administrators/Sales Managers until linked (recommended); (b) auto-create a placeholder event. Which?
2. **Company header data.** Confirm the values for name, slogan ("La gente de los eventos"), address, phone, email, website to seed Configuración, and whether the logo is `/kit-logo.png` as used in the sidebar.
3. **Default tax.** KIT Classic shows "Impuestos"; should new proposals default to 0% or Puerto Rico IVU (11.5%)? Not inferable from the plan.
4. **The 1 MB layout image** in the live workspace row (from the removed editor) and the stored creative asset: keep as-is, or allow a one-time cleanup write to the company row (database content change, so it needs explicit approval)?
5. **Auto-deploy from `main`.** Keep GitHub → Vercel production auto-deploy during this work, or switch production to a protected branch/manual promote?
6. **Browser-test repair** changes test code (port and login flow). Approve before stage 1.
7. **Supabase hygiene**: record migrations 10–14 in the project's migration history, apply the missing `fix_create_booking_status_cast` file to the repo, enable leaked-password protection, drop the two booking buckets. Each is a live-project change.
8. **AI provider for production** (key, model) so stage 9 can be verified live, and whether KIT Design should get `SUPABASE_SECRET_KEY` so files leave the database.
