import { afterEach, describe, expect, it } from "vitest";
import { createHmac, generateKeyPairSync, createSign } from "node:crypto";
import type { Server } from "node:http";
import { createApp } from "./app";
import { Repository } from "./database";
import {
  supabaseAccountReader,
  supabaseVerifier,
  type SupabaseAccount,
} from "./supabase-auth";

const origin = "http://localhost:5173";
const projectUrl = "https://project.supabase.test";
const issuer = `${projectUrl}/auth/v1`;
const secret = "only-for-automated-tests-jwt-secret";
const b64 = (value: object | Buffer) =>
  (Buffer.isBuffer(value)
    ? value
    : Buffer.from(JSON.stringify(value), "utf8")
  ).toString("base64url");

/** Signs an HS256 token the way Supabase does on legacy-secret projects. */
function hs256(
  claims: Record<string, unknown> = {},
  header: Record<string, unknown> = {},
) {
  const now = Math.floor(Date.now() / 1000);
  const encodedHeader = b64({ alg: "HS256", typ: "JWT", ...header });
  const encodedPayload = b64({
    iss: issuer,
    aud: "authenticated",
    sub: "11111111-1111-4111-8111-111111111111",
    email: "crew@example.test",
    email_verified: true,
    role: "authenticated",
    iat: now,
    exp: now + 3600,
    ...claims,
  });
  const signature = createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  return `${encodedHeader}.${encodedPayload}.${b64(signature)}`;
}

const account = (over: Partial<SupabaseAccount> = {}): SupabaseAccount => ({
  id: "11111111-1111-4111-8111-111111111111",
  email: "crew@example.test",
  name: "Crew Member",
  role: "Technician",
  status: "active",
  isOwner: false,
  clientId: null,
  eventIds: ["event-1"],
  sharedProposalIds: [],
  ...over,
});

describe("Supabase token verification", () => {
  const verify = supabaseVerifier(projectUrl, { jwtSecret: secret });

  it("accepts a well-formed token and reports the identity", async () => {
    const identity = await verify(hs256());
    expect(identity.userId).toBe("11111111-1111-4111-8111-111111111111");
    expect(identity.email).toBe("crew@example.test");
    expect(identity.emailVerified).toBe(true);
  });

  it("reads email confirmation from a timestamp claim", async () => {
    const identity = await verify(
      hs256({ email_verified: undefined, email_confirmed_at: "2026-01-01T00:00:00Z" }),
    );
    expect(identity.emailVerified).toBe(true);
  });

  it("rejects a tampered payload", async () => {
    const [header, , signature] = hs256().split(".");
    const forged = b64({
      iss: issuer,
      aud: "authenticated",
      sub: "22222222-2222-4222-8222-222222222222",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    await expect(verify(`${header}.${forged}.${signature}`)).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const now = Math.floor(Date.now() / 1000);
    await expect(verify(hs256({ iat: now - 7200, exp: now - 3600 }))).rejects.toThrow(
      /expired/i,
    );
  });

  it("rejects a token issued by another project", async () => {
    await expect(
      verify(hs256({ iss: "https://other.supabase.co/auth/v1" })),
    ).rejects.toThrow(/another project/i);
  });

  it("rejects a token that is not an end-user session", async () => {
    await expect(verify(hs256({ aud: "service_role" }))).rejects.toThrow(
      /end-user/i,
    );
  });

  it("refuses alg: none and unsigned tokens", async () => {
    const header = b64({ alg: "none", typ: "JWT" });
    const payload = b64({ iss: issuer, aud: "authenticated", sub: "x" });
    await expect(verify(`${header}.${payload}.`)).rejects.toThrow(/not accepted/i);
  });

  it("refuses to treat an asymmetric token as a shared-secret one", async () => {
    // A project that signs with RS256 must be verified against its JWKS; the
    // secret path must never be used as a fallback.
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const now = Math.floor(Date.now() / 1000);
    const header = b64({ alg: "RS256", typ: "JWT", kid: "unknown-key" });
    const payload = b64({
      iss: issuer,
      aud: "authenticated",
      sub: "11111111-1111-4111-8111-111111111111",
      exp: now + 3600,
    });
    const signature = createSign("RSA-SHA256")
      .update(`${header}.${payload}`)
      .sign(privateKey);
    const offline = supabaseVerifier(projectUrl, {
      jwtSecret: secret,
      fetchImpl: async () =>
        new Response(JSON.stringify({ keys: [] }), {
          headers: { "content-type": "application/json" },
        }),
    });
    await expect(
      offline(`${header}.${payload}.${b64(signature)}`),
    ).rejects.toThrow(/unknown key/i);
  });

  it("rejects malformed tokens", async () => {
    await expect(verify("not-a-token")).rejects.toThrow(/malformed/i);
  });

  // The live project signs with ES256 and publishes a JWKS, so this is the
  // path real sign-ins take. ES256 JWT signatures are raw r||s, not DER.
  describe("ES256 against a published JWKS", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", {
      namedCurve: "P-256",
    });
    const kid = "713aae17-95ab-40f7-ac75-740ff0508f30";
    const jwk = { ...publicKey.export({ format: "jwk" }), kid, alg: "ES256" };
    let fetches = 0;
    const es256 = supabaseVerifier(projectUrl, {
      fetchImpl: async (input) => {
        fetches += 1;
        expect(String(input)).toBe(
          `${projectUrl}/auth/v1/.well-known/jwks.json`,
        );
        return new Response(JSON.stringify({ keys: [jwk] }), {
          headers: { "content-type": "application/json" },
        });
      },
    });
    const token = (claims: Record<string, unknown> = {}) => {
      const now = Math.floor(Date.now() / 1000);
      const header = b64({ alg: "ES256", typ: "JWT", kid });
      const payload = b64({
        iss: issuer,
        aud: "authenticated",
        sub: "11111111-1111-4111-8111-111111111111",
        email: "crew@example.test",
        email_verified: true,
        iat: now,
        exp: now + 3600,
        ...claims,
      });
      const signature = createSign("SHA256")
        .update(`${header}.${payload}`)
        .sign({ key: privateKey, dsaEncoding: "ieee-p1363" });
      return `${header}.${payload}.${b64(signature)}`;
    };

    it("verifies a token signed by the published key", async () => {
      const identity = await es256(token());
      expect(identity.userId).toBe("11111111-1111-4111-8111-111111111111");
      expect(identity.emailVerified).toBe(true);
    });

    it("caches the key set instead of refetching per sign-in", async () => {
      fetches = 0;
      await es256(token());
      await es256(token({ sub: "11111111-1111-4111-8111-111111111111" }));
      expect(fetches).toBe(0);
    });

    it("still rejects a tampered payload", async () => {
      const [header, , signature] = token().split(".");
      const forged = b64({
        iss: issuer,
        aud: "authenticated",
        sub: "99999999-9999-4999-8999-999999999999",
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      await expect(
        es256(`${header}.${forged}.${signature}`),
      ).rejects.toThrow(/signature/i);
    });
  });
});

describe("Supabase account reader", () => {
  it("sends the service-role key and returns the profile", async () => {
    const seen: { url?: string; headers?: Headers; body?: string } = {};
    const read = supabaseAccountReader(
      projectUrl,
      "service-role-test-key",
      async (input, init) => {
        seen.url = String(input);
        seen.headers = new Headers(init?.headers);
        seen.body = String(init?.body);
        return new Response(JSON.stringify(account()), {
          headers: { "content-type": "application/json" },
        });
      },
    );
    const profile = await read("11111111-1111-4111-8111-111111111111");
    expect(seen.url).toBe(`${projectUrl}/rest/v1/rpc/kit_account`);
    expect(seen.headers?.get("authorization")).toBe(
      "Bearer service-role-test-key",
    );
    expect(JSON.parse(seen.body!)).toEqual({
      account_id: "11111111-1111-4111-8111-111111111111",
    });
    expect(profile?.role).toBe("Technician");
  });

  it("returns null when the account does not exist", async () => {
    const read = supabaseAccountReader(
      projectUrl,
      "key",
      async () =>
        new Response("null", { headers: { "content-type": "application/json" } }),
    );
    expect(await read("missing")).toBeNull();
  });

  it("throws when the directory is unreachable", async () => {
    const read = supabaseAccountReader(
      projectUrl,
      "key",
      async () => new Response("denied", { status: 401 }),
    );
    await expect(read("any")).rejects.toThrow();
  });
});

describe("POST /api/login/supabase", () => {
  let server: Server;
  let url: string;
  let repo: Repository;

  async function start(profile: SupabaseAccount | null | Error) {
    repo = new Repository(":memory:");
    const app = createApp(repo, {
      origins: [origin],
      supabaseVerifier: supabaseVerifier(projectUrl, { jwtSecret: secret }),
      supabaseAccount: async () => {
        if (profile instanceof Error) throw profile;
        return profile;
      },
    });
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", r));
    url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const setup = await post("/setup", {
      name: "Owner",
      company: "Test AV",
      email: "owner@example.test",
      password: "only-for-automated-tests-123",
    });
    expect(setup.status).toBe(201);
  }
  const post = (path: string, body: unknown) =>
    fetch(`${url}/api${path}`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const login = (token = hs256()) =>
    post("/login/supabase", { accessToken: token });
  afterEach(() => server?.close());

  it("signs in an approved account and mirrors its role and scope", async () => {
    await start(account());
    const response = await login();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.user).toMatchObject({
      email: "crew@example.test",
      role: "Technician",
      isOwner: false,
      eventIds: ["event-1"],
    });
    expect(response.headers.getSetCookie().join()).toContain("kit_session=");
    // The mirrored row carries no usable password.
    expect(
      (await post("/login", {
        email: "crew@example.test",
        password: "external-identity-provider",
      })).status,
    ).toBe(401);
  });

  it("refuses an account still waiting for approval", async () => {
    await start(account({ status: "pending", role: null }));
    const response = await login();
    expect(response.status).toBe(403);
    expect((await response.json()).error).toMatch(/approve/i);
    expect(repo.userByEmail("crew@example.test")).toBeUndefined();
  });

  it("refuses a disabled account", async () => {
    await start(account({ status: "disabled" }));
    expect((await login()).status).toBe(403);
  });

  it("refuses an active account that has no role yet", async () => {
    await start(account({ role: null }));
    expect((await login()).status).toBe(403);
  });

  it("refuses a role KIT does not define", async () => {
    await start(account({ role: "Superuser" }));
    const response = await login();
    expect(response.status).toBe(403);
    expect(repo.userByEmail("crew@example.test")).toBeUndefined();
  });

  it("refuses an unconfirmed email before reading the directory", async () => {
    await start(new Error("the directory must not be consulted"));
    const response = await post("/login/supabase", {
      accessToken: hs256({ email_verified: false }),
    });
    expect(response.status).toBe(403);
  });

  it("refuses an unknown account", async () => {
    await start(null);
    expect((await login()).status).toBe(401);
  });

  it("reports an unavailable directory without signing anyone in", async () => {
    await start(new Error("unreachable"));
    expect((await login()).status).toBe(503);
  });

  it("re-reads the role on every sign-in", async () => {
    await start(account({ role: "Technician" }));
    expect((await login()).status).toBe(200);
    expect(repo.userByEmail("crew@example.test")?.role).toBe("Technician");
    server.close();
    // The administrator promotes the account in Supabase; the next sign-in
    // mirrors the new role rather than the cached one.
    await start(account({ role: "Sales Manager" }));
    expect((await login()).status).toBe(200);
    expect(repo.userByEmail("crew@example.test")?.role).toBe("Sales Manager");
  });

  it("is unavailable when Supabase is not configured", async () => {
    repo = new Repository(":memory:");
    const app = createApp(repo, { origins: [origin] });
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", r));
    url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    expect((await login()).status).toBe(404);
  });
});
