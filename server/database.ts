import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { Workspace } from "../src/shared/types";
import type { Role, WorkspaceUser } from "../src/shared/access";
import { emptyWorkspace } from "../src/shared/empty";
import { Db, openDb } from "./db";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: WorkspaceUser["role"];
  owner: number;
  active: number;
  password_hash: string;
  event_ids: string;
  client_id: string | null;
  shared_proposals: string;
}
export function publicUser(row: UserRow): WorkspaceUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isOwner: Boolean(row.owner),
    active: Boolean(row.active),
    eventIds: JSON.parse(row.event_ids),
    clientId: row.client_id || undefined,
    sharedProposalIds: JSON.parse(row.shared_proposals),
  };
}
export { emptyWorkspace };
/** Every table the company server needs; created by supabase/migrations/20261107000012_kit_company_schema.sql and 20261109000013_kit_design.sql. */
const TABLES = [
  "workspace",
  "users",
  "sessions",
  "audit",
  "login_attempts",
  "workspace_recovery",
  "search_tenant",
  "search_devices",
  "search_sources",
  "search_usage",
  "kit_threads",
  "design_projects",
  "design_images",
  "design_versions",
  "design_renders",
  "design_messages",
  "design_files",
  "design_videos",
];
export class Repository {
  /**
   * `url` is the KIT_DATABASE value: a postgres:// connection string, a local
   * PGlite directory, or `memory://` (see server/db). The schema is owned by the
   * SQL migration, so opening only verifies it exists.
   */
  static async open(url?: string) {
    const db = await openDb(url);
    try {
      const found = (await db
        .prepare(
          "SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='kit' AND c.relkind='r'",
        )
        .all()) as { relname: string }[];
      const missing = TABLES.filter(
        (t) => !found.some((row) => row.relname === t),
      );
      if (missing.length)
        throw new Error(
          `The KIT database schema is missing tables (${missing.join(", ")}). Apply the supabase/migrations/2026110*_kit_*.sql files in order.`,
        );
      const visible = await db
        .prepare("SELECT to_regclass('workspace') AS t")
        .get();
      if (!visible?.t)
        throw new Error(
          "The KIT tables exist but are not on this connection's search_path. Connect as the kit_server role (ALTER ROLE kit_server SET search_path = kit).",
        );
    } catch (error) {
      await db.close();
      throw error;
    }
    return new Repository(db);
  }
  constructor(readonly db: Db) {}
  close() {
    return this.db.close();
  }
  transaction<T>(fn: () => Promise<T> | T): Promise<T> {
    return this.db.transaction(fn);
  }
  async initialized() {
    return Boolean(await this.db.prepare("SELECT 1 FROM users LIMIT 1").get());
  }
  async user(id: string) {
    return (await this.db.prepare("SELECT * FROM users WHERE id=?").get(id)) as
      UserRow | undefined;
  }
  async userByEmail(email: string) {
    return (await this.db
      .prepare("SELECT * FROM users WHERE lower(email)=lower(?)")
      .get(email)) as UserRow | undefined;
  }
  async users() {
    // COLLATE "C" keeps SQLite's bytewise ordering of names.
    return (
      (await this.db
        .prepare('SELECT * FROM users ORDER BY name COLLATE "C"')
        .all()) as UserRow[]
    ).map(publicUser);
  }
  /**
   * Mirrors an externally approved account (an identity provider other than
   * KIT's own password login) into the local users table, so every existing
   * scope and authorization check keeps working on a normal user row. The
   * identity provider owns the role and approval status; KIT never stores a
   * usable password for these accounts.
   */
  async upsertFederatedUser(account: {
    id: string;
    email: string;
    name: string;
    role: Role;
    isOwner: boolean;
    clientId?: string | null;
    eventIds: string[];
    sharedProposalIds: string[];
  }): Promise<UserRow> {
    // No colon, so passwordMatches() rejects it before hashing anything.
    const noPassword = "external-identity-provider";
    await this.db
      .prepare(
        `INSERT INTO users (id,email,name,role,owner,active,password_hash,event_ids,client_id,shared_proposals)
         VALUES (?,?,?,?,?,1,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET
           email=excluded.email, name=excluded.name, role=excluded.role,
           owner=excluded.owner, active=1, event_ids=excluded.event_ids,
           client_id=excluded.client_id, shared_proposals=excluded.shared_proposals`,
      )
      .run(
        account.id,
        account.email,
        account.name,
        account.role,
        account.isOwner ? 1 : 0,
        noPassword,
        JSON.stringify(account.eventIds),
        account.clientId || null,
        JSON.stringify(account.sharedProposalIds),
      );
    return (await this.user(account.id))!;
  }
  async read(): Promise<{ workspace: Workspace; revision: number }> {
    const row = (await this.db
      .prepare("SELECT revision,payload FROM workspace WHERE id=1")
      .get()) as { revision: number; payload: string } | undefined;
    if (!row) throw new HttpError(409, "Create the company workspace first.");
    const workspace = JSON.parse(row.payload) as Workspace;
    workspace.brandAssets ||= [];
    workspace.creativeAssets ||= [];
    workspace.packages ||= [];
    workspace.maintenanceRecords ||= [];
    workspace.operations ||= [];
    workspace.automations ||= [];
    workspace.activity = (
      (await this.db
        .prepare("SELECT * FROM audit ORDER BY seq DESC LIMIT 1000")
        .all()) as {
        id: string;
        actor_id: string;
        action: string;
        detail: string;
        event_id: string | null;
        created_at: string;
      }[]
    ).map((a) => ({
      id: a.id,
      title: a.action,
      detail: a.detail,
      eventId: a.event_id || undefined,
      at: a.created_at,
    }));
    return { workspace, revision: row.revision };
  }
  async save(workspace: Workspace, expected: number) {
    const result = await this.db
      .prepare(
        "UPDATE workspace SET payload=?, revision=revision+1 WHERE id=1 AND revision=?",
      )
      .run(JSON.stringify({ ...workspace, activity: [] }), expected);
    if (result.changes !== 1)
      throw new HttpError(
        409,
        "The workspace changed in another session. Reload the latest records before saving.",
      );
  }
  async replaceWorkspace(
    workspace: Workspace,
    expected: number,
    actor: string,
    sourceChecksum: string,
  ) {
    const current = (await this.db
      .prepare("SELECT revision,payload FROM workspace WHERE id=1")
      .get()) as { revision: number; payload: string } | undefined;
    if (!current || current.revision !== expected)
      throw new HttpError(
        409,
        "The workspace changed after the recovery preview. Preview the backup again before restoring.",
      );
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const restoredRevision = current.revision + 1;
    const payloadChecksum = createHash("sha256")
      .update(current.payload)
      .digest("hex");
    await this.db
      .prepare(
        "INSERT INTO workspace_recovery (id,actor_id,previous_revision,restored_revision,payload,payload_checksum,source_checksum,created_at) VALUES (?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        actor,
        current.revision,
        restoredRevision,
        current.payload,
        payloadChecksum,
        sourceChecksum,
        createdAt,
      );
    const result = await this.db
      .prepare(
        "UPDATE workspace SET payload=?, revision=? WHERE id=1 AND revision=?",
      )
      .run(
        JSON.stringify({ ...workspace, activity: [] }),
        restoredRevision,
        expected,
      );
    if (result.changes !== 1)
      throw new HttpError(
        409,
        "The workspace changed while recovery was running. No records were replaced.",
      );
    await this.db.exec(`DELETE FROM workspace_recovery
      WHERE id NOT IN (
        SELECT id FROM workspace_recovery ORDER BY seq DESC LIMIT 10
      )`);
    return {
      id,
      createdAt,
      previousRevision: current.revision,
      restoredRevision,
    };
  }
  async recoveryPoints() {
    // Aliases are quoted: Postgres would otherwise fold them to lower case.
    return (await this.db
      .prepare(
        'SELECT id,created_at AS "createdAt",previous_revision AS "previousRevision",restored_revision AS "restoredRevision",source_checksum AS "sourceChecksum" FROM workspace_recovery ORDER BY seq DESC LIMIT 10',
      )
      .all()) as {
      id: string;
      createdAt: string;
      previousRevision: number;
      restoredRevision: number;
      sourceChecksum: string;
    }[];
  }
  async recoveryWorkspace(id: string) {
    const row = (await this.db
      .prepare(
        'SELECT payload,payload_checksum AS "payloadChecksum" FROM workspace_recovery WHERE id=?',
      )
      .get(id)) as { payload: string; payloadChecksum: string } | undefined;
    if (!row) throw new HttpError(404, "Recovery point not found.");
    const expected = Buffer.from(row.payloadChecksum, "hex");
    const actual = Buffer.from(
      createHash("sha256").update(row.payload).digest("hex"),
      "hex",
    );
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
      throw new HttpError(
        409,
        "The recovery point failed its integrity check and cannot be used.",
      );
    return JSON.parse(row.payload) as Workspace;
  }
  async audit(actor: string, action: string, detail: string, eventId?: string) {
    await this.db
      .prepare(
        "INSERT INTO audit (id,actor_id,action,detail,event_id,created_at) VALUES (?,?,?,?,?,?)",
      )
      .run(
        randomUUID(),
        actor,
        action,
        detail,
        eventId || null,
        new Date().toISOString(),
      );
  }
}
