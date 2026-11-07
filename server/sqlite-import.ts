import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import type { Repository } from "./database";

/**
 * One-time import of a KIT SQLite file (the former company database) into the
 * Postgres-backed Repository. The source is opened read-only and never changed.
 *
 * Copied: workspace (same revision, byte-identical payload), users, audit (in
 * the original order), recovery points, search tenant/devices/sources/usage,
 * and KIT conversations. Not copied: sessions (everyone signs in once) and
 * login_attempts (short-lived rate-limit counters).
 */
export interface ImportReport {
  applied: boolean;
  revision: number;
  /** Rows found in the source, per table. */
  source: Record<string, number>;
  /** Rows present in the target after the copy (only when applied). */
  target?: Record<string, number>;
}

const sha = (value: string) => createHash("sha256").update(value).digest("hex");

const TABLES = [
  "workspace",
  "users",
  "audit",
  "workspace_recovery",
  "search_tenant",
  "search_devices",
  "search_sources",
  "search_usage",
  "kit_threads",
] as const;

type Row = Record<string, string | number | null>;

function readSource(path: string) {
  const db = new DatabaseSync(path, { readOnly: true });
  const has = (table: string) =>
    Boolean(
      db
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
        .get(table),
    );
  const all = (table: string, order = "") =>
    has(table)
      ? (db.prepare(`SELECT * FROM ${table} ${order}`).all() as Row[])
      : [];
  const data: Record<(typeof TABLES)[number], Row[]> = {
    workspace: all("workspace"),
    users: all("users"),
    audit: all("audit", "ORDER BY rowid"),
    workspace_recovery: all("workspace_recovery", "ORDER BY rowid"),
    search_tenant: all("search_tenant"),
    search_devices: all("search_devices"),
    // Older files predate the policy column.
    search_sources: all("search_sources").map((r) => ({
      ...r,
      policy: r.policy ?? "",
    })),
    search_usage: all("search_usage"),
    kit_threads: all("kit_threads"),
  };
  db.close();
  return data;
}

const insertSql: Record<(typeof TABLES)[number], [string, string[]]> = {
  workspace: [
    "INSERT INTO workspace (id,revision,payload) VALUES (?,?,?)",
    ["id", "revision", "payload"],
  ],
  users: [
    "INSERT INTO users (id,email,name,role,owner,active,password_hash,event_ids,client_id,shared_proposals) VALUES (?,?,?,?,?,?,?,?,?,?)",
    [
      "id",
      "email",
      "name",
      "role",
      "owner",
      "active",
      "password_hash",
      "event_ids",
      "client_id",
      "shared_proposals",
    ],
  ],
  audit: [
    "INSERT INTO audit (id,actor_id,action,detail,event_id,created_at) VALUES (?,?,?,?,?,?)",
    ["id", "actor_id", "action", "detail", "event_id", "created_at"],
  ],
  workspace_recovery: [
    "INSERT INTO workspace_recovery (id,actor_id,previous_revision,restored_revision,payload,payload_checksum,source_checksum,created_at) VALUES (?,?,?,?,?,?,?,?)",
    [
      "id",
      "actor_id",
      "previous_revision",
      "restored_revision",
      "payload",
      "payload_checksum",
      "source_checksum",
      "created_at",
    ],
  ],
  search_tenant: ["INSERT INTO search_tenant (id) VALUES (?)", ["id"]],
  search_devices: [
    "INSERT INTO search_devices (token_hash,user_id,name,expires,revoked) VALUES (?,?,?,?,?)",
    ["token_hash", "user_id", "name", "expires", "revoked"],
  ],
  search_sources: [
    "INSERT INTO search_sources (user_id,id,hash,payload,state,attempts,error,updated,policy) VALUES (?,?,?,?,?,?,?,?,?)",
    [
      "user_id",
      "id",
      "hash",
      "payload",
      "state",
      "attempts",
      "error",
      "updated",
      "policy",
    ],
  ],
  search_usage: [
    "INSERT INTO search_usage (month,user_id,cents) VALUES (?,?,?)",
    ["month", "user_id", "cents"],
  ],
  kit_threads: [
    "INSERT INTO kit_threads (id,owner,payload,updated) VALUES (?,?,?,?)",
    ["id", "owner", "payload", "updated"],
  ],
};

export async function importSqlite(options: {
  from: string;
  repo: Repository;
  /** Without apply nothing is written: the source is only checked and counted. */
  apply?: boolean;
  /** Replace data already in the target (otherwise a non-empty target is refused). */
  force?: boolean;
}): Promise<ImportReport> {
  const { repo } = options;
  const data = readSource(options.from);
  if (data.workspace.length !== 1)
    throw new Error("The SQLite file has no company workspace to import.");
  const workspace = data.workspace[0];
  // The source must be internally sound before anything is copied.
  JSON.parse(String(workspace.payload));
  for (const point of data.workspace_recovery)
    if (sha(String(point.payload)) !== point.payload_checksum)
      throw new Error(
        `Recovery point ${point.id} fails its own checksum in the SQLite file; not importing.`,
      );
  const source = Object.fromEntries(
    TABLES.map((t) => [t, data[t].length]),
  ) as Record<string, number>;
  const report: ImportReport = {
    applied: false,
    revision: Number(workspace.revision),
    source,
  };
  if (!options.apply) return report;

  const target = await repo.transaction(async () => {
    const existing = await repo.db
      .prepare("SELECT 1 FROM workspace LIMIT 1")
      .get();
    if (existing && !options.force)
      throw new Error(
        "The target database already has a company workspace. Refusing to overwrite it (pass --force to replace it).",
      );
    if (options.force)
      for (const table of [...TABLES].reverse())
        await repo.db.exec(`DELETE FROM ${table}`);
    // users first: sessions (not copied) are the only table that references them.
    for (const table of ["users", ...TABLES.filter((t) => t !== "users")] as (typeof TABLES)[number][]) {
      const [sql, columns] = insertSql[table];
      const statement = repo.db.prepare(sql);
      for (const row of data[table])
        await statement.run(...columns.map((c) => row[c] ?? null));
    }
    // Verify inside the transaction: any mismatch rolls everything back.
    const counts: Record<string, number> = {};
    for (const table of TABLES) {
      const row = (await repo.db
        .prepare(`SELECT count(*) count FROM ${table}`)
        .get()) as { count: number };
      counts[table] = row.count;
      if (row.count !== source[table])
        throw new Error(
          `Row count mismatch in ${table}: source ${source[table]}, target ${row.count}.`,
        );
    }
    const copied = (await repo.db
      .prepare("SELECT revision,payload FROM workspace WHERE id=1")
      .get()) as { revision: number; payload: string };
    if (
      copied.revision !== Number(workspace.revision) ||
      sha(copied.payload) !== sha(String(workspace.payload))
    )
      throw new Error("The copied workspace does not match the source.");
    for (const point of data.workspace_recovery) {
      const stored = (await repo.db
        .prepare("SELECT payload FROM workspace_recovery WHERE id=?")
        .get(point.id)) as { payload: string } | undefined;
      if (!stored || sha(stored.payload) !== point.payload_checksum)
        throw new Error(`Recovery point ${point.id} was not copied intact.`);
    }
    return counts;
  });
  return { ...report, applied: true, target };
}
