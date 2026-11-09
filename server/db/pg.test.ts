import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HttpError, Repository, emptyWorkspace } from "../database";

// Runs the REAL production driver (node-postgres, the same code Vercel uses)
// over a TCP connection against an in-process Postgres. This is the one test
// that exercises server/db/pg.ts; everything else uses the PGlite driver directly.
let backend: PGlite;
let server: PGLiteSocketServer;
let repo: Repository;
const port = 54_000 + Math.floor(Math.random() * 1000);

beforeAll(async () => {
  backend = await PGlite.create();
  for (const file of [
    "20261107000012_kit_company_schema.sql",
    "20261109000013_kit_design.sql",
    "20261110000014_kit_design_chats_and_video.sql",
  ])
    await backend.exec(
      readFileSync(
        new URL(`../../supabase/migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
  await backend.exec("SET search_path = kit");
  server = new PGLiteSocketServer({ db: backend, port, host: "127.0.0.1" });
  await server.start();
  // The multiplexer serves connections one at a time, so use a single pooled connection.
  process.env.KIT_DATABASE_POOL_MAX = "1";
  repo = await Repository.open(
    `postgres://kit_server@127.0.0.1:${port}/postgres`,
  );
});
afterAll(async () => {
  await repo?.close();
  await server?.stop();
  await backend?.close();
  delete process.env.KIT_DATABASE_POOL_MAX;
});

describe("node-postgres driver (production path)", () => {
  it("verifies the schema and runs queries with ? placeholders", async () => {
    await repo.db
      .prepare(
        "INSERT INTO users(id,email,name,role,password_hash) VALUES(?,?,?,?,?)",
      )
      .run("u1", "Boss@Example.test", "Boss", "Administrator", "unused");
    expect((await repo.userByEmail("boss@example.test"))?.id).toBe("u1");
    expect(await repo.initialized()).toBe(true);
  });

  it("returns bigint columns and counts as numbers", async () => {
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

  it("commits a transaction (with its writer lock) and rolls one back", async () => {
    await repo.db
      .prepare("INSERT INTO workspace VALUES (1,0,?)")
      .run(JSON.stringify(emptyWorkspace("Production driver")));
    await repo.transaction(async () => {
      const { workspace, revision } = await repo.read();
      workspace.settings.company = "Committed";
      await repo.save(workspace, revision);
      await repo.audit("u1", "committed", "d");
    });
    expect((await repo.read()).workspace.settings.company).toBe("Committed");
    await expect(
      repo.transaction(async () => {
        await repo.audit("u1", "rolled back", "d");
        throw new HttpError(409, "stop");
      }),
    ).rejects.toThrow("stop");
    const titles = (await repo.read()).workspace.activity.map((a) => a.title);
    expect(titles).toContain("committed");
    expect(titles).not.toContain("rolled back");
  });

  it("keeps the revision guard: a stale save conflicts", async () => {
    const a = await repo.read();
    const b = await repo.read();
    await repo.save(a.workspace, a.revision);
    await expect(repo.save(b.workspace, b.revision)).rejects.toMatchObject({
      status: 409,
    });
  });

  it("handles the ON CONFLICT upserts the server relies on", async () => {
    for (let i = 0; i < 3; i++)
      await repo.db
        .prepare(
          "INSERT INTO login_attempts VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=login_attempts.count+1",
        )
        .run("login:1.2.3.4", Date.now() + 1000);
    const row = (await repo.db
      .prepare("SELECT count FROM login_attempts WHERE key=?")
      .get("login:1.2.3.4")) as { count: number };
    expect(row.count).toBe(3);
  });
});
