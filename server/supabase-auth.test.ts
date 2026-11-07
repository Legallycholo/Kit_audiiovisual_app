import { afterEach, describe, expect, it } from "vitest";
import { startCompany } from "./testing/harness";
import type { SupabaseIdentity, SupabaseVerifier } from "./supabase-auth";

const admin: SupabaseIdentity = {
  email: "Boss@Example.test",
  emailVerified: true,
  portalRole: "admin",
  accountStatus: "active",
  name: "Boss Person",
};
const token = "a".repeat(40);

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

async function start(verifier?: SupabaseVerifier) {
  const company = await startCompany({ supabaseVerifier: verifier });
  close = company.close;
  return company;
}
const stub =
  (identity: SupabaseIdentity | Error): SupabaseVerifier =>
  async () => {
    if (identity instanceof Error) throw identity;
    return identity;
  };

describe("portal administrator sign-in", () => {
  it("is not available unless configured", async () => {
    const { call } = await start();
    expect(
      (await call("/login/supabase", "POST", { accessToken: token })).status,
    ).toBe(404);
  });

  it("creates a workspace Administrator and starts a session", async () => {
    const { call, repo } = await start(stub(admin));
    const res = await call("/login/supabase", "POST", { accessToken: token });
    expect(res.status).toBe(200);
    expect(res.cookie).toMatch(/^kit_session=/);
    expect(res.json.user).toMatchObject({
      email: "Boss@Example.test",
      name: "Boss Person",
      role: "Administrator",
      isOwner: false,
    });
    const session = await call("/session", "GET", undefined, {
      cookie: res.cookie,
      csrf: res.json.csrf,
    });
    expect(session.json.user.role).toBe("Administrator");
    // The created account has no usable password.
    expect(repo.userByEmail("boss@example.test")?.password_hash).not.toContain(
      ":",
    );
  });

  it("signs in an existing workspace user as themselves, case-insensitively", async () => {
    const { call, owner } = await start(stub(admin));
    await call(
      "/users",
      "POST",
      {
        name: "Existing",
        email: "boss@example.test",
        password: "only-for-automated-tests-123",
        role: "Sales Manager",
      },
      owner,
    );
    const res = await call("/login/supabase", "POST", { accessToken: token });
    expect(res.status).toBe(200);
    // No silent change of role or name.
    expect(res.json.user).toMatchObject({
      name: "Existing",
      role: "Sales Manager",
    });
  });

  it.each([
    ["unverified email", { ...admin, emailVerified: false }],
    ["a client", { ...admin, portalRole: "client" as const }],
    ["a plain user", { ...admin, portalRole: "user" as const }],
    ["a banned account", { ...admin, accountStatus: "banned" }],
    ["a rejected account", { ...admin, accountStatus: "rejected" }],
  ])("refuses %s and creates nothing", async (_name, identity) => {
    const { call, repo } = await start(stub(identity));
    const res = await call("/login/supabase", "POST", { accessToken: token });
    expect(res.status).toBe(401);
    expect(res.cookie).toBe("");
    expect(repo.userByEmail("boss@example.test")).toBeUndefined();
  });

  it("refuses a token the verifier rejects", async () => {
    const { call } = await start(stub(new Error("bad token")));
    expect(
      (await call("/login/supabase", "POST", { accessToken: token })).status,
    ).toBe(401);
  });

  it("refuses an inactive workspace user", async () => {
    const { call, owner, repo } = await start(stub(admin));
    const created = await call(
      "/users",
      "POST",
      {
        name: "Gone",
        email: "boss@example.test",
        password: "only-for-automated-tests-123",
        role: "Administrator",
      },
      owner,
    );
    await call(
      `/users/${created.json.user.id}`,
      "PATCH",
      { active: false },
      owner,
    );
    const res = await call("/login/supabase", "POST", { accessToken: token });
    expect(res.status).toBe(401);
    expect(repo.userByEmail("boss@example.test")?.active).toBe(0);
  });

  it("rejects malformed bodies", async () => {
    const { call } = await start(stub(admin));
    expect(
      (await call("/login/supabase", "POST", { accessToken: "short" })).status,
    ).toBe(422);
    expect(
      (await call("/login/supabase", "POST", { accessToken: token, role: "x" }))
        .status,
    ).toBe(422);
  });
});
