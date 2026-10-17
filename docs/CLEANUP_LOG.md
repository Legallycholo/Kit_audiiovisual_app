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

### Pre-existing failure (not fixed — needs approval)

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
