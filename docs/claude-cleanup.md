# claude-cleanup.md — Cleanup & hardening plan

Purpose: improve structure, safety and maintainability of the KIT workspace **without changing behavior and without any external service, credential or business decision**. Each stage ends green (`npm run typecheck`, `npm test`, `npm run test:browser`) and gets its own commit.

## Ground rules for the implementer

1. **No behavior changes** in Stages 0–3. Refactors are moves and extractions only. If a test must change, stop and explain why.
2. **One stage per branch/commit series.** Never mix stages. Run the full check suite before every commit.
3. **Do not push, deploy, publish or call external services.** No live AI, WhatsApp, or cloud calls. Commit locally only after the user approves each stage.
4. **Never touch `data/`, `.env*`, or `node_modules/`.** Do not delete or migrate any real `kit.sqlite`.
5. **Stop and ask** before: deleting a file that is not listed here, changing any public API route/response shape, changing the on-disk database format (Stage 5 only, and only after the user approves the schema).
6. Match the surrounding code style (Prettier is configured: `npm run format`).
7. Record anything surprising in a short "Findings" note at the end of each stage rather than silently fixing it.

## Baseline facts (verified by reading the repo)

- CI ([.github/workflows/desktop.yml](.github/workflows/desktop.yml)) uses **npm** (`cache: npm`, `npm ci`) on Windows and macOS runners. It runs unit tests, cargo tests and Playwright, but **no typecheck/build step and no fast Linux job**.
- Both `package-lock.json` and `pnpm-lock.yaml` are committed. `pnpm-workspace.yaml` contains a placeholder (`esbuild: set this to true or false`), so pnpm is not actually configured.
- No `CLAUDE.md` exists.
- `any` usage is minimal (2 places: `server/kit.ts`, `src/shared/api.ts`). Type hygiene is not the problem.
- Very large files: `src/modules/Operations.tsx` (3,533 lines), `Design.tsx` (1,897), `Inventory.tsx` (1,525), `Proposals.tsx` (1,490), `server/permissions.ts` (1,004), `server/app.ts` (858), `server/kit.ts` (780).
- All company data is one JSON row in the `workspace` table (`server/database.ts`) with a single global revision.

---

## Stage 0 — Establish a safety baseline (no code changes)

- [x] Run `npm ci`, `npm run typecheck`, `npm test`, `npm run test:browser`. Record pass/fail counts and any pre-existing failures in `docs/CLEANUP_LOG.md`.
- [x] Note the Node version used. The repo requires Node ≥ 22.12.
- [x] If anything fails before changes, report it. Do not "fix" it as part of cleanup unless trivial and approved.

**Exit:** a written baseline. Every later stage must match or beat it.

## Stage 1 — Repo hygiene (low risk)

- [x] **One package manager: npm.** Remove `pnpm-lock.yaml` and `pnpm-workspace.yaml` (CI already uses npm). Check `package.json`/README for pnpm mentions. The `minimumReleaseAgeExclude` entries in the workspace file are pnpm-only; confirm nothing relies on them, and mention it in the log.
- [x] Add `CLAUDE.md` at the root: how to run, test and build; the "no behavior change / no external calls" rules; where things live (copy the Source organization list from the README).
- [x] Confirm `.gitignore` covers `dist/`, `artifacts/`, `data/`, `*.tsbuildinfo` (it does) and that none are tracked (`git ls-files` shows none).
- [x] Split the README: keep setup, run and verification at the top; move per-phase desktop notes and the long status prose into `docs/`. Preserve all content and link to it. Do not delete claims.
- [x] Docs consolidation: create `docs/STATUS.md` (one page: current state, what is verified, the next five priorities, open business decisions). Leave `IMPLEMENTATION_PROGRESS.md` in place but link it from STATUS as the detailed evidence log.

**Exit:** `npm ci` works from `package-lock.json` alone; all docs links resolve.

## Stage 2 — CI improvements

- [ ] Add `.github/workflows/ci.yml`: a **fast Ubuntu job** on PRs and pushes to `main`: `npm ci`, `npm run typecheck`, `npm run build`, `npm test`.
- [ ] Keep the heavy desktop workflow as is (Windows/macOS, Rust, Playwright, signing). Optionally add a `typecheck` step there too.
- [ ] Pin actions to the versions already used. Do not add secrets or deploy steps.

**Exit:** workflow YAML validated (use `actionlint` if available; otherwise careful review). It cannot be proven green until it runs on GitHub, so say so.

## Stage 3 — Split the giant files (no behavior change)

Order, smallest risk first. For each file: identify cohesive sections, extract to sibling files, re-export or import from the original entry point, and keep public names and routes identical.

1. **`server/app.ts` → per-domain routers** under `server/routes/`: `auth`, `workspace`, `conversations`, `messaging`, `inventory`, `ai`, `users`, `backup`. `app.ts` keeps wiring, middleware and `createApp`. Existing `server/app.test.ts` is the guard.
2. **`server/permissions.ts`** → split by concern (session/role policy, workspace-patch validation, scoping/redaction). Keep the exported surface identical via an `index`-style re-export.
3. **`src/modules/Operations.tsx`** → a folder `src/modules/operations/` with one file per sub-area (packages, allocations, dispatch/returns, maintenance, crew, cues/transport, costs, onsite changes) plus shared hooks/helpers. `Operations.tsx` stays as the entry that composes them.
4. **`Design.tsx`, `Inventory.tsx`, `Proposals.tsx`** → same pattern.
5. `server/kit.ts` and `server/search.ts` only if time remains.

Rules: no renamed exports; no logic edits; no CSS changes. After each file, run typecheck + unit + browser tests and commit separately.

**Exit:** no source file over ~800 lines (target, not a hard limit); all tests identical to baseline.

## Stage 4 — Test safety nets (additive only)

Add tests; do not change production code except to export something for testing, and flag any such change.

- [ ] Inventory availability and double-booking edge cases (overlapping dates, buffers, partial returns, damage quarantine).
- [ ] Permission matrix tests: each role × each protected route and workspace section; client-scoped proposal sharing; deactivated users; technician scope.
- [ ] Workspace revision conflict behavior (two sessions saving).
- [ ] Backup → preview → restore → recovery-point round trip with checksum verification.
- [ ] Proposal money math: rounding, discount-before-tax, zero/negative inputs.
- [ ] **AI evaluation harness (stub model only):** a fixtures folder of 10+ sample briefs (Spanish) and a checker that asserts structure rules the server already enforces (no unknown or duplicate equipment, model-supplied prices rejected, rates copied from catalog). It must run offline and make no network calls.

**Exit:** new tests pass; report coverage gaps that remain.

## Stage 5 — Data layer migration (DO NOT START without explicit approval)

Highest value, highest risk. Prepare a **design note first**, then wait for sign-off.

- [ ] Write `docs/DATA_MODEL_PROPOSAL.md`: proposed tables (clients, events, venues, proposals and revisions, equipment, allocations, tasks, crew shifts, messages), per-record `version` columns, indexes, and how audit/backup/recovery map onto them.
- [ ] Migration plan from the single `workspace.payload` row, with a dry-run command, row counts compared before and after, and a rollback path (original blob kept untouched until verified).
- [ ] Only after approval: implement behind the existing `/api/workspace` contract first (server assembles the same payload from tables), so the frontend does not change in the first pass. Then add per-record conflict handling as a second pass.
- [ ] Scheduled backups: a script/CLI that writes timestamped backups to a configurable folder with retention. No cloud destination.

**Exit:** approved proposal document. Implementation is a separate decision.

## Stage 6 — Missing features that need no outside services (optional, pick individually)

- [ ] Account lifecycle: change own password; admin can edit role/event grants; admin-issued one-time reset code shown in the UI (no email).
- [ ] CSV import/export for the equipment catalog and clients, with a validation preview and error report before commit.
- [ ] Structured server logging and consistent error shapes.
- [ ] A seeded performance check (a few thousand clients/events/products) with timings recorded in the log.
- [ ] Procedural 3D shapes for the most common equipment types.

Each item is its own task with its own tests.

---

## Final deliverables

- Passing typecheck, unit and browser tests at every commit.
- `docs/CLEANUP_LOG.md`: baseline, per-stage summary, deviations, findings.
- A short list of anything not done and why.

## Suggested model

- **Stages 0–2 and 4:** a faster mid-tier model is sufficient (Sonnet 5.5): mechanical and well-guarded by tests.
- **Stage 3 (big-file splits) and Stage 5 (data design):** use **Opus 5.5**. Splitting 1,500–3,500 line files without behavior drift and designing a safe migration benefit from stronger reasoning.
- Reasonable single-model choice: **Opus 5.5 for the whole plan**, run one stage at a time with a review between stages.
