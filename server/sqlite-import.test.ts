import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Repository, emptyWorkspace } from "./database";
import { importSqlite } from "./sqlite-import";

// The former company database layout, as the SQLite version created it
// (before search_sources gained its policy column).
const OLD_SCHEMA = `
  CREATE TABLE workspace (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, payload TEXT NOT NULL);
  CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL, role TEXT NOT NULL, owner INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, password_hash TEXT NOT NULL, event_ids TEXT NOT NULL DEFAULT '[]', client_id TEXT, shared_proposals TEXT NOT NULL DEFAULT '[]');
  CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, csrf_token TEXT NOT NULL, expires_at INTEGER NOT NULL);
  CREATE TABLE audit (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL, event_id TEXT, created_at TEXT NOT NULL);
  CREATE TABLE login_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);
  CREATE TABLE workspace_recovery (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, previous_revision INTEGER NOT NULL, restored_revision INTEGER NOT NULL, payload TEXT NOT NULL, payload_checksum TEXT NOT NULL, source_checksum TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE search_tenant(id TEXT PRIMARY KEY);
  CREATE TABLE search_devices(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,name TEXT NOT NULL,expires INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE search_sources(user_id TEXT NOT NULL,id TEXT NOT NULL,hash TEXT NOT NULL,payload TEXT NOT NULL,state TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,error TEXT NOT NULL DEFAULT '',updated TEXT NOT NULL, PRIMARY KEY(user_id,id));
  CREATE TABLE search_usage(month TEXT NOT NULL,user_id TEXT NOT NULL,cents INTEGER NOT NULL, PRIMARY KEY(month,user_id));
  CREATE TABLE kit_threads(id TEXT PRIMARY KEY,owner TEXT NOT NULL,payload TEXT NOT NULL,updated TEXT NOT NULL);
`;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

let dir: string;
let file: string;
let target: Repository;
const payload = JSON.stringify(emptyWorkspace("Empresa de prueba"));
const recoveryPayload = JSON.stringify(emptyWorkspace("Antes de restaurar"));

function buildSource(corruptRecovery = false) {
  const db = new DatabaseSync(file);
  db.exec(OLD_SCHEMA);
  db.prepare("INSERT INTO workspace VALUES (1,7,?)").run(payload);
  db.prepare(
    "INSERT INTO users (id,email,name,role,owner,password_hash) VALUES (?,?,?,?,1,?)",
  ).run("u1", "Owner@Example.test", "Dueña", "Administrator", "salt:hash");
  db.prepare("INSERT INTO sessions VALUES (?,?,?,?)").run("t", "u1", "c", 9e12);
  db.prepare("INSERT INTO login_attempts VALUES (?,?,?)").run(
    "login:1",
    3,
    9e12,
  );
  for (const n of [1, 2, 3])
    db.prepare("INSERT INTO audit VALUES (?,?,?,?,?,?)").run(
      `a${n}`,
      "u1",
      `acción ${n}`,
      "detalle",
      null,
      "2026-11-01T00:00:00.000Z",
    );
  db.prepare("INSERT INTO workspace_recovery VALUES (?,?,?,?,?,?,?,?)").run(
    "r1",
    "u1",
    6,
    7,
    recoveryPayload,
    corruptRecovery ? "0".repeat(64) : sha(recoveryPayload),
    "src",
    "2026-11-01T00:00:00.000Z",
  );
  db.prepare("INSERT INTO search_tenant VALUES (?)").run("tenant-1");
  db.prepare("INSERT INTO search_devices VALUES (?,?,?,?,0)").run(
    "d",
    "u1",
    "Mac",
    9e12,
  );
  db.prepare("INSERT INTO search_sources VALUES (?,?,?,?,?,?,?,?)").run(
    "u1",
    "s1",
    "h",
    "enc",
    "ready",
    0,
    "",
    "2026-11-01T00:00:00.000Z",
  );
  db.prepare("INSERT INTO search_usage VALUES (?,?,?)").run("2026-11", "u1", 5);
  db.prepare("INSERT INTO kit_threads VALUES (?,?,?,?)").run(
    "k1",
    "u1",
    "{}",
    "2026-11-01T00:00:00.000Z",
  );
  db.close();
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "kit-import-"));
  file = join(dir, "kit.sqlite");
  target = await Repository.open("memory://");
});
afterEach(async () => {
  await target.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("SQLite → Postgres import", () => {
  it("a dry run reports the counts and writes nothing", async () => {
    buildSource();
    const report = await importSqlite({ from: file, repo: target });
    expect(report.applied).toBe(false);
    expect(report.revision).toBe(7);
    expect(report.source).toMatchObject({
      users: 1,
      audit: 3,
      workspace_recovery: 1,
      search_sources: 1,
    });
    expect(await target.initialized()).toBe(false);
    expect(
      await target.db.prepare("SELECT 1 FROM workspace").get(),
    ).toBeUndefined();
  });

  it("copies everything that matters, keeps the revision and payload byte-identical, and skips sessions", async () => {
    buildSource();
    const report = await importSqlite({
      from: file,
      repo: target,
      apply: true,
    });
    expect(report.applied).toBe(true);
    expect(report.target).toMatchObject({
      workspace: 1,
      users: 1,
      audit: 3,
      workspace_recovery: 1,
      search_tenant: 1,
      search_devices: 1,
      search_sources: 1,
      search_usage: 1,
      kit_threads: 1,
    });
    const { workspace, revision } = await target.read();
    expect(revision).toBe(7);
    expect(workspace.settings.company).toBe("Empresa de prueba");
    const stored = (await target.db
      .prepare("SELECT payload FROM workspace")
      .get()) as { payload: string };
    expect(sha(stored.payload)).toBe(sha(payload));
    // Audit keeps its original order (newest first on read).
    expect(workspace.activity.map((a) => a.title)).toEqual([
      "acción 3",
      "acción 2",
      "acción 1",
    ]);
    // Case-insensitive email lookup still works, and a recovery point is still verifiable.
    expect((await target.userByEmail("owner@example.test"))?.name).toBe(
      "Dueña",
    );
    expect((await target.recoveryWorkspace("r1")).settings.company).toBe(
      "Antes de restaurar",
    );
    // Old files without a policy column get the empty default.
    expect(
      (
        (await target.db
          .prepare("SELECT policy FROM search_sources")
          .get()) as { policy: string }
      ).policy,
    ).toBe("");
    // Sessions and rate-limit counters are not carried over.
    expect(
      await target.db.prepare("SELECT 1 FROM sessions").get(),
    ).toBeUndefined();
    expect(
      await target.db.prepare("SELECT 1 FROM login_attempts").get(),
    ).toBeUndefined();
  });

  it("refuses to overwrite an existing company unless forced", async () => {
    buildSource();
    await importSqlite({ from: file, repo: target, apply: true });
    await expect(
      importSqlite({ from: file, repo: target, apply: true }),
    ).rejects.toThrow("already has a company workspace");
    const again = await importSqlite({
      from: file,
      repo: target,
      apply: true,
      force: true,
    });
    expect(again.applied).toBe(true);
    expect((await target.read()).revision).toBe(7);
  });

  it("refuses a source whose recovery point fails its own checksum, before writing anything", async () => {
    buildSource(true);
    await expect(
      importSqlite({ from: file, repo: target, apply: true }),
    ).rejects.toThrow("fails its own checksum");
    expect(await target.initialized()).toBe(false);
  });

  it("refuses a file with no company workspace", async () => {
    const db = new DatabaseSync(file);
    db.exec(OLD_SCHEMA);
    db.close();
    await expect(importSqlite({ from: file, repo: target })).rejects.toThrow(
      "no company workspace",
    );
  });

  it("never modifies the source file", async () => {
    buildSource();
    const before = sha(JSON.stringify(readAll()));
    await importSqlite({ from: file, repo: target, apply: true });
    expect(sha(JSON.stringify(readAll()))).toBe(before);
  });
});

function readAll() {
  const db = new DatabaseSync(file, { readOnly: true });
  const rows = [
    "workspace",
    "users",
    "sessions",
    "audit",
    "search_sources",
  ].map((t) => db.prepare(`SELECT * FROM ${t}`).all());
  db.close();
  return rows;
}
