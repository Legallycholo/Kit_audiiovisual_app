# Cleanup log

Execution record for [claude-cleanup.md](claude-cleanup.md). Work is committed directly on `main`, one commit or more per stage.

## Stage 0 — Baseline (October 17, 2026)

Environment: macOS (Darwin 25.6.0), Node v22.23.1, npm 10.9.8. Starting commit `852a162`.

| Check                  | Result                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| `npm ci`               | OK — 186 packages, 0 vulnerabilities                                                                     |
| `npm run typecheck`    | OK — no errors                                                                                           |
| `npm run build`        | OK — with a Vite warning: chunks `index` (619 kB) and `Scene` (525 kB) are larger than 500 kB            |
| `npm test`             | **11 files, 88 tests, all pass**. Node prints the expected SQLite `ExperimentalWarning`                  |
| `npm run test:browser` | **45 passed, 1 failed** (46 total, ~2.5 min). The failure is deterministic: rerunning it alone fails too |

### Pre-existing failure (fixed in `d694c0d`, see below)

`tests/browser/company.spec.ts:176` — "administrator previews, restores and rolls back a verified backup"

```
TypeError: Cannot set properties of undefined (setting 'name')
> 187 |   changed.clients[0].name = "Cliente cambiado después de la copia";
```

Cause: the test sets up a fresh company, and company setup creates an **empty** workspace (documented behavior), so `clients[0]` does not exist. The test was added in `852a162` together with the backup feature and appears never to have passed. This is a test bug, not an app regression. A likely fix is to create a client first (through the UI or `repo.save`) before taking the backup. The fix changes test code, so it waits for approval.

## Stage 1 — Repo hygiene

- Removed `pnpm-lock.yaml` and `pnpm-workspace.yaml`. CI and all docs use npm. The pnpm-only `minimumReleaseAgeExclude` entries (`@axe-core/playwright@4.14.0`, `@vitest/*@5.0.5`, `vitest@5.0.5`) have no npm equivalent and nothing else referenced them. `allowBuilds.esbuild` was an unfilled placeholder. `npm ci` succeeds from `package-lock.json` alone.
- Added `CLAUDE.md`: commands, rules, layout, architecture notes.
- `.gitignore` already covers `dist/`, `artifacts/`, `data/`, `*.tsbuildinfo`, and `git ls-files` shows none of them tracked. No change needed.
- Split the README (147 to about 75 lines). Setup, run, verification and source organization stay in it. The showcase, AI drafting and access-boundary prose moved verbatim to `docs/FEATURES.md`. The desktop phase 1–5 sections moved verbatim to `docs/DESKTOP.md`, which also links phases 6 and 7 (the README never mentioned them). The README adds a short AI configuration pointer and the `src-tauri/` and `native/` entries in Source organization.
- Added `docs/STATUS.md` (one page). `IMPLEMENTATION_PROGRESS.md` is unchanged and linked as the evidence log.

### Findings

- The cleanup plan was moved by the user from the root to `docs/claude-cleanup.md`. Links point there.
- The build warns about large chunks (`index` 619 kB, `Scene`/Three.js 525 kB). This is a candidate for later code-splitting, not part of this plan's no-behavior-change stages.
- `docs/` now has both `design.md` (desktop plan) and `IMPLEMENTATION_PLAN.md` (product plan). The names don't make that difference clear. Consider renaming `design.md` to `DESKTOP_PLAN.md` later, which would mean updating its inbound links.

### Baseline failure resolved (commit `d694c0d`)

With the user's go-ahead to finish the plan, the backup test was fixed in test code only. It had two problems:

1. It never seeded the repository. Every sibling test calls `repo.save(createSeed(), 0)` after `setup`.
2. Once seeded, `/api/backup` rejected the sample data. `src/shared/seed.ts` writes conversation message times without a UTC offset (for example `2026-10-16T14:00:00`), and the backup schema requires `z.string().datetime()`.

The test now normalizes those four timestamps before saving. **Finding:** the sample seed does not pass the server's backup validation. Real company records always use `toISOString()`, so production data is unaffected. Fixing the seed itself would change the displayed sample times, so it is left as a follow-up.

**New baseline: 46/46 browser tests expected to pass.**

## Stage 2 — CI

- Added `.github/workflows/ci.yml`: one Ubuntu job on pull requests and pushes to `main` that runs `npm ci`, typecheck, build and unit tests, with a 15-minute timeout and superseded runs cancelled. It uses the same `actions/checkout@v4` / `actions/setup-node@v4` versions as the desktop workflow, with no secrets and no deploy step.
- The desktop workflow is unchanged. It already runs unit, cargo and browser tests, and its build step type-checks.
- Validation: the YAML parses and passes Prettier. `actionlint` is not installed locally. **The workflow has not run on GitHub yet, so it is not proven green.**

## Stage 3 — Split the giant files

Method: moves only. Each split ran the typecheck, unit tests and the full browser suite (46/46) before its own commit. Every original line was checked to be present in the new files (with whitespace ignored where Prettier re-wrapped lines).

| Original (lines)                     | Now                                                                                                                                                                   |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/app.ts` (858)                | `app.ts` (middleware, services, error handler) + `server/routes/{auth,workspace,conversations,messaging,inventory,ai,users,backup}.ts`, mounted in the original order |
| `server/permissions.ts` (1,004)      | `server/policy/{scope,changes,validation,guards}.ts`; `permissions.ts` re-exports the same names                                                                      |
| `src/modules/Operations.tsx` (3,533) | `src/modules/operations/` — `Production`, `Reports`, `Creative`, `Settings` pages plus `helpers.ts`                                                                   |
| `src/modules/Inventory.tsx` (1,525)  | `src/modules/inventory/`                                                                                                                                              |
| `src/modules/Proposals.tsx` (1,490)  | `src/modules/proposals/`                                                                                                                                              |
| `src/modules/Design.tsx` (1,897)     | `src/modules/design/` (the single lazy `Scene` loader lives in `design/helpers.tsx`)                                                                                  |

The original module files remain as one-line re-exports, so `App.tsx` and all imports are unchanged. The four oversized components (`Production`, `Inventory`, the proposal `Editor`, `LayoutEditor`) were split with one pattern:

- The state and derived values (the statements before `return`) move verbatim into a `use…View()` hook. The component calls it once, so hooks keep the same order.
- Contiguous groups of JSX siblings (tab panels, dialog sets, editor columns) move verbatim into components that receive that view as `ctx`.

**Result:** no TypeScript source file is over 800 lines (the largest is `Events.tsx` at 782). `server/kit.ts` (780) and `server/search.ts` (694) were optional and already under the target, so they are unchanged. `native/file-index/src/lib.rs` (1,159, Rust) is outside this plan.

### Findings

- The main JS bundle grew by about 6 kB (618.6 → 624.3 kB) from the extra wrapper components. The `Scene` chunk is unchanged at 525.5 kB.
- `server/permissions.ts` imported `sameValue` without using it. The import was dropped.
- `ProposalEditor` reads `update`, `toast`, `user`, `mode`, `saving` and `navigate` without using them (pre-existing). They were left in place because the rule was moves only.
- Browser-suite flakiness:
  - The layout/3D test failed once under load and passed both alone and in the next full run.
  - Running a single Playwright test and then the full suite right after it can attach to a Vite server that is still shutting down (`reuseExistingServer: true`), which makes later tests fail with `ERR_CONNECTION_REFUSED`. Wait for the previous server to exit, or set `reuseExistingServer: !process.env.CI`.

## Stage 4 — Test safety nets (commit `a9d82a6`)

No production code changed. New tests:

- `server/policy/changes.test.ts` (9):
  - allocation status transitions; new allocations must start as Hold or Confirmed; equipment swaps require a recorded substitution
  - dispatch, partial return and damage reconciliation; completed allocations are immutable
  - overbooking at the exact free quantity; preparation and return buffers; cancellation blocked by active allocations
  - maintenance records: open on creation, origin immutable, quarantine cap
- `server/policy/scope.test.ts` (9): what each of the six roles can read (events, rates, budgets, conversations, maintenance, crew costs, tasks, client sharing without internal AI notes), plus the edit-permission matrix.
- `server/database.test.ts` (4): revision increments, a stale second session gets 409 without writing, client-supplied activity is never persisted, and legacy payload defaults are filled in.
- `src/shared/quote-totals.test.ts` (7): empty proposals, zero quantities, a 100% discount, discount rounding before tax, percentage bounds, cent precision across many lines.
- `server/ai-eval/`: an offline evaluation harness with 13 Spanish briefs and a scripted generator only (no network). It runs the real `proposalContext` and `materializeSuggestion`. It checks catalog rates and descriptions, rejection of unknown or duplicate items, injected prices, injected totals, invalid quantities and days, malformed output and missing-detail questions. It also flags prices mentioned in the narrative and confirms no client contact details reach the provider context.
  - To evaluate a real model later, pass any `ProposalGenerator` to `runProposalEval`, but only after the provider and data policy are approved.

Already covered before this stage and left unchanged: the backup → preview → restore → rollback round trip (`server/app.test.ts` and the browser suite) and checksum tampering (`server/backup.test.ts`).

### Findings

- **Half-cent rounding (not fixed).** `quoteTotals` rounds `quantity × rate × days × 100` with `Math.round` on a floating-point product. Some sub-cent rates round down: 1.005 → 1.00 and 0.285 → 0.28, while 2.675 → 2.68. The schema accepts any finite rate, so this can happen. Fixing it changes totals and needs a business decision on rounding rules. It is documented by an `it.fails` test, which should become `it` once fixed.

## Stage 5 — Data model proposal and scheduled backups (commit `0adf508`)

- [`DATA_MODEL_PROPOSAL.md`](DATA_MODEL_PROPOSAL.md) proposes:
  - one table per collection, with per-record `version` columns and indexes
  - a `record_changes` log
  - a mapping of audit, backup and recovery onto the new storage
  - a two-pass migration: storage first behind the unchanged `/api/workspace`, then per-record conflicts, with a dry run, checksum comparison and a rollback that keeps the original row
- **Awaiting approval. Nothing in the database format was changed.**
- `npm run backup` writes `kit-backup-<UTC stamp>-r<revision>.json` files in the existing export format to `KIT_BACKUP_DIR` (default `data/backups/`, mode 0600, never overwrites) and keeps the newest `KIT_BACKUP_KEEP` (default 14). It audits each run and exits 1 if no workspace exists yet. It was checked end to end against a throwaway database, not against `data/`. Scheduling it with cron, launchd or Task Scheduler is left to deployment.

## Stage 6 — Features without outside services

All items were built. Existing API routes and response shapes are unchanged; only new routes were added.

1. **Account lifecycle** (`14405c8`):
   - `POST /api/account/password`: verifies the current password and signs out the user's other sessions.
   - `POST /api/users/:id/reset-password`: an administrator-issued 16-character temporary password, shown once. It revokes all of that user's sessions. It cannot be used on the owner, on yourself or on an inactive account.
   - `PUT /api/users/:id/access`: edits the role, events and client sharing, with the same validation as account creation. It refuses changes that would strand the person's assigned tasks or crew shifts, and revokes their sessions.
   - All three have UI in Settings → Users & roles, with Spanish labels.
   - The temporary password is not single-use: making it so needs a new table, which counts as a database format change. Users are asked to change it after signing in.
2. **CSV import and export** for equipment (matched by SKU) and clients (matched by email, otherwise by name) (`b3b5195`):
   - Parsing handles the BOM, quotes, CRLF and semicolon-delimited files.
   - Export neutralizes formula cells.
   - Headers can be English or Spanish.
   - The preview shows row-numbered errors and blocks import while any error remains.
   - Imports are capped at 200 rows because the PATCH accepts at most 200 changes.
   - Imports save through the normal validated workspace update.
3. **Structured logging** (`73884ef`):
   - JSON-lines logger, with the level set by `KIT_LOG_LEVEL`.
   - `X-Request-Id` on every response, and one log line per API request (no query strings or bodies).
   - 500 errors are logged with the request ID and error name only.
   - Oversized bodies now return **413** instead of 500. The JSON error body format `{ error }` is unchanged.
4. **Seeded performance check** (`35fd598`): `npm run perf [-- --scale=N]`. Results (this Mac, Node 22.23, median of 3 runs):

   | Operation                                        | scale 0.1 (300 events) | scale 0.33 (~1,000 events) | scale 1 (3,000 events, 5.1 MB) |
   | ------------------------------------------------ | ---------------------: | -------------------------: | -----------------------------: |
   | Repository.read (parse payload)                  |                   1 ms |                       7 ms |                          15 ms |
   | validateWorkspace (full, runs on every PATCH)    |                  10 ms |                      92 ms |                     **524 ms** |
   | applyChanges, one reservation                    |                  15 ms |                     106 ms |                     **634 ms** |
   | Repository.save                                  |                   2 ms |                       9 ms |                          25 ms |
   | availability, all equipment                      |                   1 ms |                      10 ms |                          95 ms |
   | diffWorkspace, one edit (runs in the browser)    |                   4 ms |                      42 ms |                     **351 ms** |
   | reports (pipeline, financial, workload, quality) |                   4 ms |                      45 ms |                         226 ms |
   | automationCandidates                             |                   8 ms |                     145 ms |                   **3,596 ms** |

   **Finding:** validation, diffing and automation candidates grow roughly quadratically, from nested `find`/`some` lookups over whole collections. At one company's likely size (hundreds of events a year) everything is fast. At around 1,000 events, each save already blocks the server for about 0.1 s. Recommended before scaling: index lookups in `validateWorkspace` and `automationCandidates` by ID or event (`Map`), validate only the changed records' invariants, and diff only the edited collection on the client. The Stage 5 data model also addresses this.

5. **Procedural 3D shapes** (`f5d8053`): generic shapes for speakers (cabinet, woofer, tweeter), LED walls (frame, lit face, panel seams), screens, moving-head lights (base, yoke, head, lens) and box truss (chords, lacing).
   - Everything stays inside each object's measured box, verified by tests across sizes.
   - Selection, raycasting and 2D/3D geometry are unchanged.
   - These are still placeholders, not manufacturer models, and the status label continues to say so.

### Findings

- Some settings UI is still English. The settings navigation labels (for example "Users & roles", "Workspace data") and some text not passed through the shared components skip the Spanish dictionary. New Stage 6 strings, and the existing user-management strings I touched, were added to `src/shared/i18n.ts`.

## Final state (October 17, 2026)

| Check                  | Baseline            | Now                                                                |
| ---------------------- | ------------------- | ------------------------------------------------------------------ |
| `npm run typecheck`    | OK                  | OK                                                                 |
| `npm test`             | 11 files, 88 tests  | 21 files, **150 passed + 1 expected failure** (half-cent rounding) |
| `npm run test:browser` | 45 passed, 1 failed | **48 passed**                                                      |
| Largest TS source file | 3,533 lines         | 782 lines                                                          |

### Not done, and why

- **Data migration (Stage 5 implementation):** needs approval of `DATA_MODEL_PROPOSAL.md` because it changes the database format.
- **Single-use reset codes and email recovery:** the first needs a new table (a format change), the second an email provider.
- **The new CI workflow** has not run on GitHub, because nothing was pushed.
- **Half-cent rounding, the sample-seed timestamps and the performance hot spots:** documented above. Each fix changes behavior or needs a business decision.
- **Optional typecheck step in the desktop workflow:** skipped, because its build step already type-checks.
- Nothing was pushed or deployed, and no external service was called.
