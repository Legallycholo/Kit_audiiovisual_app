import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { Workspace } from "../src/shared/types";
import type { WorkspaceUser } from "../src/shared/access";

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
export function emptyWorkspace(company: string): Workspace {
  return {
    schema: 1,
    clients: [],
    venues: [],
    events: [],
    equipment: [],
    proposals: [],
    conversations: [],
    tasks: [],
    reservations: [],
    packages: [],
    maintenanceRecords: [],
    operations: [],
    automations: [],
    layouts: [],
    brandAssets: [],
    creativeAssets: [],
    activity: [],
    settings: {
      company,
      currency: "USD",
      timezone: "America/Puerto_Rico",
      email: "",
      notifications: true,
    },
  };
}
export class Repository {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ":memory:") chmodSync(path, 0o600);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL, role TEXT NOT NULL, owner INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, password_hash TEXT NOT NULL, event_ids TEXT NOT NULL DEFAULT '[]', client_id TEXT, shared_proposals TEXT NOT NULL DEFAULT '[]');
      CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, csrf_token TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL, event_id TEXT, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS audit_time ON audit(created_at);
      PRAGMA user_version=1;`);
  }
  close() {
    this.db.close();
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = fn();
      this.db.exec("COMMIT");
      return value;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  initialized() {
    return Boolean(this.db.prepare("SELECT 1 FROM users LIMIT 1").get());
  }
  user(id: string) {
    return this.db
      .prepare("SELECT * FROM users WHERE id=?")
      .get(id) as unknown as UserRow | undefined;
  }
  userByEmail(email: string) {
    return this.db
      .prepare("SELECT * FROM users WHERE email=?")
      .get(email) as unknown as UserRow | undefined;
  }
  users() {
    return (
      this.db
        .prepare("SELECT * FROM users ORDER BY name")
        .all() as unknown as UserRow[]
    ).map(publicUser);
  }
  read(): { workspace: Workspace; revision: number } {
    const row = this.db
      .prepare("SELECT revision,payload FROM workspace WHERE id=1")
      .get() as { revision: number; payload: string } | undefined;
    if (!row) throw new HttpError(409, "Create the company workspace first.");
    const workspace = JSON.parse(row.payload) as Workspace;
    workspace.brandAssets ||= [];
    workspace.creativeAssets ||= [];
    workspace.packages ||= [];
    workspace.maintenanceRecords ||= [];
    workspace.operations ||= [];
    workspace.automations ||= [];
    workspace.activity = (
      this.db
        .prepare("SELECT * FROM audit ORDER BY rowid DESC LIMIT 1000")
        .all() as unknown as {
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
  save(workspace: Workspace, expected: number) {
    const result = this.db
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
  audit(actor: string, action: string, detail: string, eventId?: string) {
    this.db
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
