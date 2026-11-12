import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HttpError, Repository, emptyWorkspace } from "../database";

describe("Postgres-backed repository", () => {
  const repos: Repository[] = [];
  const dirs: string[] = [];
  afterEach(async () => {
    for (const repo of repos.splice(0)) await repo.close();
    for (const dir of dirs.splice(0))
      rmSync(dir, { recursive: true, force: true });
  });
  const open = async (url = "memory://") => {
    const repo = await Repository.open(url);
    repos.push(repo);
    return repo;
  };
  const addUser = (repo: Repository, id: string, email: string, name = id) =>
    repo.db
      .prepare(
        "INSERT INTO users(id,email,name,role,password_hash) VALUES(?,?,?,?,?)",
      )
      .run(id, email, name, "Administrator", "unused");
  const addWorkspace = (repo: Repository, company: string) =>
    repo.db
      .prepare("INSERT INTO workspace VALUES (1,0,?)")
      .run(JSON.stringify(emptyWorkspace(company)));

  it("returns bigint columns and counts as JavaScript numbers", async () => {
    const repo = await open();
    await addUser(repo, "u1", "a@example.test");
    await repo.db
      .prepare("INSERT INTO sessions VALUES (?,?,?,?)")
      .run("h", "u1", "c", Date.now() + 3_600_000);
    const session = (await repo.db.prepare("SELECT * FROM sessions").get()) as {
      expires_at: unknown;
    };
    expect(typeof session.expires_at).toBe("number");
    const count = (await repo.db
      .prepare("SELECT count(*) count FROM users")
      .get()) as { count: unknown };
    expect(count.count).toBe(1);
  });

  it("looks emails up case-insensitively and rejects case-variant duplicates", async () => {
    const repo = await open();
    await addUser(repo, "u1", "Boss@Example.test");
    expect((await repo.userByEmail("boss@example.TEST"))?.id).toBe("u1");
    await expect(addUser(repo, "u2", "BOSS@example.test")).rejects.toThrow();
  });

  it("orders users by name bytewise, as SQLite did", async () => {
    const repo = await open();
    await addUser(repo, "1", "1@example.test", "Zoe");
    await addUser(repo, "2", "2@example.test", "Álvaro");
    await addUser(repo, "3", "3@example.test", "alice");
    await addUser(repo, "4", "4@example.test", "Bob");
    expect((await repo.users()).map((u) => u.name)).toEqual([
      "Bob",
      "Zoe",
      "alice",
      "Álvaro",
    ]);
  });

  it("returns the newest audit entries first even when timestamps tie", async () => {
    const repo = await open();
    await addWorkspace(repo, "Audit test");
    for (const n of [1, 2, 3]) await repo.audit("actor", `action ${n}`, "d");
    const { workspace } = await repo.read();
    expect(workspace.activity.map((a) => a.title)).toEqual([
      "action 3",
      "action 2",
      "action 1",
    ]);
  });

  it("rolls a transaction back completely when it throws", async () => {
    const repo = await open();
    await expect(
      repo.transaction(async () => {
        await addUser(repo, "u1", "a@example.test");
        await repo.audit("u1", "inside", "d");
        throw new HttpError(409, "stop");
      }),
    ).rejects.toThrow("stop");
    expect(await repo.initialized()).toBe(false);
    expect(await repo.db.prepare("SELECT * FROM audit").all()).toEqual([]);
  });

  it("runs calls made inside a transaction on that transaction, nested helpers included", async () => {
    const repo = await open();
    const helper = async () => repo.audit("u", "from helper", "d");
    await repo.transaction(async () => {
      await helper();
      await repo.transaction(async () => helper());
    });
    expect(await repo.db.prepare("SELECT * FROM audit").all()).toHaveLength(2);
  });

  it("serializes concurrent read-modify-write transactions", async () => {
    const repo = await open();
    await addWorkspace(repo, "0");
    const bump = () =>
      repo.transaction(async () => {
        const { workspace, revision } = await repo.read();
        workspace.settings.company = String(
          Number(workspace.settings.company) + 1,
        );
        await repo.save(workspace, revision);
      });
    await Promise.all(Array.from({ length: 8 }, bump));
    const { workspace, revision } = await repo.read();
    expect(workspace.settings.company).toBe("8");
    expect(revision).toBe(8);
  });

  it("keeps a stale writer out: the second save against an old revision conflicts", async () => {
    const repo = await open();
    await addWorkspace(repo, "Conflict");
    const a = await repo.read();
    const b = await repo.read();
    await repo.save(a.workspace, a.revision);
    await expect(repo.save(b.workspace, b.revision)).rejects.toMatchObject({
      status: 409,
    });
    expect((await repo.read()).revision).toBe(1);
  });

  it("persists across restarts when given a directory", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kit-pglite-"));
    dirs.push(dir);
    const first = await Repository.open(join(dir, "db"));
    await addUser(first, "u1", "a@example.test");
    await first.close();
    const second = await open(join(dir, "db"));
    expect((await second.user("u1"))?.email).toBe("a@example.test");
  });
});

describe("KIT_DATABASE values left over from the SQLite setup", () => {
  it("never opens an existing file or anything in data/ as the local database", async () => {
    const { resolveDbTarget, DEFAULT_LOCAL_DB } = await import("./index");
    const { writeFileSync, readFileSync } = await import("node:fs");
    const dir = mkdtempSync(join(tmpdir(), "kit-target-"));
    try {
      const file = join(dir, "kit.sqlite");
      writeFileSync(file, "SQLite format 3");
      const old = resolveDbTarget("data/kit.sqlite", dir);
      expect(old.target).toBe(DEFAULT_LOCAL_DB);
      expect(old.warning).toContain("old SQLite file");
      const existing = resolveDbTarget(file, dir);
      expect(existing.target).toBe(DEFAULT_LOCAL_DB);
      expect(readFileSync(file, "utf8")).toBe("SQLite format 3");
      // Normal values are untouched.
      expect(resolveDbTarget(undefined, dir)).toEqual({
        target: DEFAULT_LOCAL_DB,
      });
      expect(resolveDbTarget("memory://", dir)).toEqual({
        target: "memory://",
      });
      expect(resolveDbTarget("postgres://u:p@h/db", dir)).toEqual({
        target: "postgres://u:p@h/db",
      });
      expect(resolveDbTarget(".kit-local/other", dir)).toEqual({
        target: ".kit-local/other",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
