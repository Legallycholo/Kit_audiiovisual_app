import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createApp } from "./app";
import { Repository } from "./database";
import type { FirebaseIdentity } from "./firebase-auth";

const origin = "http://localhost:5173";
let server: Server;
let url: string;

async function start(identity: FirebaseIdentity | Error) {
  const repo = new Repository(":memory:");
  const app = createApp(repo, {
    origins: [origin],
    firebaseVerifier: async () => {
      if (identity instanceof Error) throw identity;
      return identity;
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
const token = { idToken: "x".repeat(40) };
afterEach(() => server?.close());

describe("Firebase sign-in", () => {
  it("signs in an existing active user with a verified email", async () => {
    await start({
      uid: "u1",
      email: "Owner@example.test",
      emailVerified: true,
    });
    const res = await post("/login/firebase", token);
    expect(res.status).toBe(200);
    expect((await res.json()).user.email).toBe("owner@example.test");
    expect(res.headers.getSetCookie().join()).toContain("kit_session=");
  });
  it("rejects unverified emails and unknown users", async () => {
    await start({
      uid: "u1",
      email: "owner@example.test",
      emailVerified: false,
    });
    expect((await post("/login/firebase", token)).status).toBe(401);
    server.close();
    await start({
      uid: "u2",
      email: "stranger@example.test",
      emailVerified: true,
    });
    expect((await post("/login/firebase", token)).status).toBe(401);
  });
  it("rejects tokens the verifier refuses", async () => {
    await start(new Error("bad token"));
    expect((await post("/login/firebase", token)).status).toBe(401);
  });
});
