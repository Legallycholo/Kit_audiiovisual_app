# Data model proposal: from one workspace row to per-record tables

Status: **Proposal, awaiting approval.** Nothing in this document has been implemented. Stage 5 of [claude-cleanup.md](claude-cleanup.md) requires sign-off before any change to the on-disk database format.

## 1. Problem

All company records live in one row: `workspace(id=1, revision, payload TEXT)` in `server/database.ts`.

| Consequence                                                                                                                                                                        | Example                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **False conflicts.** Any save bumps the single `revision`, so a second session's unrelated save is rejected with 409.                                                              | A designer saves a layout while the owner edits a proposal, and the owner must reload. |
| **Whole-company rewrites.** Every save serializes and writes the entire payload (including embedded image `dataUrl`s in layouts, brand and creative assets, and proposal visuals). | Toggling one task writes megabytes once images are present.                            |
| **No queries or indexes.** Reporting, availability and search parse the full JSON in memory.                                                                                       | `/api/inventory/availability` reads every reservation of every event.                  |
| **Recovery points copy everything.** `workspace_recovery` stores full payloads (capped at 10).                                                                                     | Ten copies of every image.                                                             |

What already works well and should be kept:

- The client already sends **per-record change sets**: `PATCH /api/workspace { revision, changes: [{ collection, id, value }] }`. Validation is per collection (`server/schema.ts`), and every change is audited.
- `audit` is already a separate table, and `activity` is derived from it in `Repository.read()`.
- Users, sessions, KIT threads and search tables are already separate tables.

## 2. Proposed schema (first pass: one table per collection)

Each collection becomes a table that keeps the **validated record JSON** plus the columns needed for scoping, indexing and concurrency. This is deliberately not a full normalization. It keeps the existing zod schemas and domain functions as the single definition of a record, so the frontend and validation code do not change in the first pass.

```sql
-- One table per collection; identical shape.
CREATE TABLE rec_clients (
  id          TEXT PRIMARY KEY,
  version     INTEGER NOT NULL DEFAULT 1,      -- per-record optimistic concurrency
  payload     TEXT    NOT NULL,                -- zod-validated record JSON
  updated_at  TEXT    NOT NULL,
  updated_by  TEXT    NOT NULL REFERENCES users(id)
);
```

Extra indexed columns per collection. These are copied from the payload on write, and the payload stays authoritative.

| Table                     | Extra columns                                         | Indexes                                     |
| ------------------------- | ----------------------------------------------------- | ------------------------------------------- |
| `rec_clients`             | —                                                     | —                                           |
| `rec_venues`              | —                                                     | —                                           |
| `rec_events`              | `client_id`, `venue_id`, `status`, `date`, `end_date` | `client_id`, `(date, end_date)`             |
| `rec_equipment`           | `sku` (UNIQUE, case-insensitive)                      | `sku`                                       |
| `rec_proposals`           | `event_id`, `number`, `revision_no`, `status`         | `event_id`, UNIQUE(`number`, `revision_no`) |
| `rec_conversations`       | `event_id`, `client_id`, `proposal_id`                | `event_id`                                  |
| `rec_tasks`               | `event_id`, `assignee_id`                             | `event_id`, `assignee_id`                   |
| `rec_reservations`        | `event_id`, `equipment_id`, `status`, `start`, `end`  | `(equipment_id, start, end)`, `event_id`    |
| `rec_packages`            | `name` (UNIQUE, case-insensitive)                     | —                                           |
| `rec_maintenance_records` | `equipment_id`, `status`                              | `equipment_id`                              |
| `rec_operations`          | `event_id` (UNIQUE: one per event)                    | `event_id`                                  |
| `rec_automations`         | `key` (UNIQUE), `event_id`, `status`                  | `event_id`                                  |
| `rec_layouts`             | `event_id`                                            | `event_id`                                  |
| `rec_brand_assets`        | `event_id`                                            | `event_id`                                  |
| `rec_creative_assets`     | `event_id`, `status`                                  | `event_id`                                  |

Plus:

```sql
CREATE TABLE workspace_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  sequence INTEGER NOT NULL,     -- monotonically increasing change counter (replaces `revision`)
  settings TEXT NOT NULL,        -- Workspace.settings JSON
  settings_version INTEGER NOT NULL DEFAULT 1,
  schema_version INTEGER NOT NULL
);
CREATE TABLE record_changes (    -- change log: enables cheap recovery points and sync
  seq INTEGER PRIMARY KEY,       -- = workspace_meta.sequence after the change
  collection TEXT NOT NULL,
  record_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  before TEXT,                   -- previous payload (NULL on create)
  after TEXT,                    -- new payload (NULL on delete)
  actor_id TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX record_changes_record ON record_changes(collection, record_id);
```

**Later passes, not part of this proposal:** split large embedded arrays into child tables (`proposal_lines`, `conversation_messages`, `operation_crew_shifts`, …), and move image `dataUrl`s into a content-addressed `blobs(sha256, mime, bytes)` table referenced by hash. Each is a separate decision.

## 3. Concurrency model

- Each change carries the `version` it was based on: `{ collection, id, baseVersion, value }`. The server rejects with 409 **only if that record** changed (`version != baseVersion`). Unrelated records no longer conflict.
- **Cross-record invariants still hold.** Inventory availability, SKU uniqueness, shift overlaps, proposal families and readiness gates are checked inside the same `BEGIN IMMEDIATE` write transaction against the current committed state, exactly as `validateWorkspace` does today. SQLite serializes writers, so two sessions cannot both pass an availability check for the last unit.
- `workspace_meta.sequence` increases on every committed change and is returned to clients as `revision`. In the first pass it keeps its current meaning for reads, so the frontend still works unchanged (see §5).

## 4. Audit, backup and recovery mapping

| Today                                   | Proposed                                                                                                                                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audit` table                           | Unchanged. `record_changes` adds before/after payloads for record-level history.                                                                                                             |
| `activity` derived from `audit`         | Unchanged.                                                                                                                                                                                   |
| Backup export (`server/backup.ts`)      | Unchanged format (`kit-workspace-backup` v1). The server assembles the same `Workspace` object from tables before export, so existing backup files keep restoring.                           |
| `workspace_recovery` (full payload ×10) | Recovery point = a `sequence` number. Rollback replays `record_changes.before` in reverse back to that sequence. Keep full-snapshot recovery points only for restores of an uploaded backup. |
| Legacy `/api/export`                    | Unchanged response shape (assembled from tables).                                                                                                                                            |

## 5. Migration plan

**Pass 1: storage only, API unchanged.**

1. Add the new tables next to `workspace`, and keep the `workspace` row untouched.
2. Add `npm run db:migrate -- --dry-run`. It reads `workspace.payload`, validates it with the backup schema, and prints per-collection row counts and a checksum of the canonical JSON, without writing anything.
3. `npm run db:migrate` runs everything in one transaction: insert every record with `version = 1`, write `workspace_meta(sequence = old revision)`, then **re-assemble the `Workspace` from tables and compare its canonical-JSON checksum with the original payload**. On any mismatch it rolls back. On success it records `schema_version = 2`.
4. `Repository.read()` and `save()` switch to the tables when `schema_version = 2`. `/api/workspace` returns the same `{ workspace, revision, user }` shape.
5. Rollback path: the original `workspace.payload` row remains as written before migration. Reverting is setting `schema_version = 1`. That row is only dropped by a separate, later approval.

**Pass 2: per-record conflicts (frontend change).**

6. Add `baseVersion` to `changeSchema` (optional at first, so old clients keep the whole-revision check). Return per-record versions in `/api/workspace`.
7. Update `src/shared/store.tsx` and `sync-queue.ts` to send `baseVersion`, and to resolve a per-record 409 by reloading only that record.
8. Make `baseVersion` required, and drop the global-revision check for PATCH.

**Verification for each pass:** all existing unit, API and browser tests must pass unchanged. Add migration tests (empty workspace, the sample seed, a seed with images, a corrupt payload that must abort), a two-session test showing unrelated saves no longer conflict, and a test showing a last-unit reservation race still fails for one session.

## 6. Risks and open questions

- **Node `node:sqlite` is experimental.** The migration does not change that. Qualifying the runtime (or switching to `better-sqlite3`) remains a separate item.
- **Seed data validity:** `src/shared/seed.ts` writes message times without a UTC offset, and those fail the backup schema used by the dry run. Real company data is unaffected. Fix the seed before using it as a migration fixture.
- **Scale:** the first pass still loads the full workspace for validation and scoping. That is fine for one company. Scoped reads (for example per-event queries) are a later optimization the new indexes make possible.
- **Decision needed:** approve Pass 1 (storage only) on its own, or Pass 1 and Pass 2 together.

## 7. Scheduled backups (no format change; implemented separately)

`npm run backup` writes a timestamped, checksummed `kit-workspace-backup` file to a configurable folder (`KIT_BACKUP_DIR`, default `data/backups/`) and keeps the newest N files (`KIT_BACKUP_KEEP`, default 14). It uses the same backup format as the admin export and does not change the database. Schedule it with the OS scheduler (cron, launchd or Task Scheduler). See the cleanup log for its status.
