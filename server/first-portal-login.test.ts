import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { Repository } from "./database";
import { FIRST_COMPANY_NAME } from "./routes/auth";
import type { SupabaseIdentity } from "./supabase-auth";

// An EMPTY company database (no owner, no workspace): /portal/login must be
// the only entry page, so the first verified portal administrator becomes the
// owner and the workspace is created then.
const admin: SupabaseIdentity = {
  email: "First@Example.test",
  emailVerified: true,
  portalRole: "admin",
  accountStatus: "active",
  name: "First Admin",
};
const origin = "http://localhost:5173";
let repo: Repository;
let server: Server;
afterEach(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await repo.close();
});

async function start(identities: Record<string, SupabaseIdentity>) {
  repo = await Repository.open("memory://");
  const app = createApp(repo, {
    origins: [origin],
    supabaseVerifier: async (token) => {
      const identity = identities[token];
      if (!identity) throw new Error("bad token");
      return identity;
    },
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  return (path: string, method = "GET", body?: unknown) =>
    fetch(url + path, {
      method,
      headers: { Origin: origin, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }).then(async (r) => ({ status: r.status, json: await r.json() }));
}
const token = (c: string) => c.repeat(40);

describe("first portal administrator on an empty company database", () => {
  it("becomes the owner and gets an empty workspace", async () => {
    const call = await start({ [token("a")]: admin });
    expect((await call("/session")).json.initialized).toBe(false);
    const res = await call("/login/supabase", "POST", { accessToken: token("a") });
    expect(res.status).toBe(200);
    expect(res.json.user).toMatchObject({
      email: "First@Example.test",
      role: "Administrator",
      isOwner: true,
    });
    expect(await repo.initialized()).toBe(true);
    const { workspace, revision } = await repo.read();
    expect(revision).toBe(0);
    expect(workspace.settings.company).toBe(FIRST_COMPANY_NAME);
    // Newest first: the sign-in, then the creation it triggered.
    expect(workspace.activity.map((a) => a.title)).toEqual([
      "User signed in with the portal",
      "Company workspace created",
    ]);
  });

  it("creates exactly one owner when two administrators arrive together", async () => {
    const second = { ...admin, email: "second@example.test", name: "Second" };
    const call = await start({ [token("a")]: admin, [token("b")]: second });
    const [a, b] = await Promise.all([
      call("/login/supabase", "POST", { accessToken: token("a") }),
      call("/login/supabase", "POST", { accessToken: token("b") }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const owners = (await repo.db
      .prepare("SELECT email FROM users WHERE owner=1")
      .all()) as { email: string }[];
    expect(owners).toHaveLength(1);
    expect(
      (await repo.db.prepare("SELECT count(*) count FROM workspace").get()).count,
    ).toBe(1);
  });

  it("does not create anything for someone who is not an approved administrator", async () => {
    const call = await start({
      [token("a")]: { ...admin, portalRole: "user" },
      [token("b")]: { ...admin, accountStatus: "pending" },
      [token("c")]: { ...admin, emailVerified: false },
    });
    for (const c of ["a", "b", "c"])
      expect(
        (await call("/login/supabase", "POST", { accessToken: token(c) })).status,
      ).toBe(401);
    expect(await repo.initialized()).toBe(false);
  });
});
