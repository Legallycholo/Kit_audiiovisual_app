import { afterEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { createApp } from "./app";
import { Repository } from "./database";
import { recaptchaVerifier } from "./recaptcha";

const origin = "http://localhost:5173";
let server: Server;
afterEach(() => {
  server?.close();
  vi.unstubAllGlobals();
});

describe("reCAPTCHA", () => {
  it("accepts only valid, on-action, high-score assessments", async () => {
    const verify = recaptchaVerifier("p", "k", "s");
    const reply = (body: unknown, ok = true) =>
      vi.stubGlobal("fetch", async () => ({ ok, json: async () => body }));
    reply({
      tokenProperties: { valid: true, action: "LOGIN" },
      riskAnalysis: { score: 0.9 },
    });
    expect(await verify("t", "LOGIN")).toBe(true);
    reply({
      tokenProperties: { valid: true, action: "OTHER" },
      riskAnalysis: { score: 0.9 },
    });
    expect(await verify("t", "LOGIN")).toBe(false);
    reply({
      tokenProperties: { valid: true, action: "LOGIN" },
      riskAnalysis: { score: 0.1 },
    });
    expect(await verify("t", "LOGIN")).toBe(false);
    reply({}, false);
    expect(await verify("t", "LOGIN")).toBe(false);
  });
  it("blocks sign-in without a passing token, and still sets up", async () => {
    const check = vi.fn(async (token: string) => token === "good");
    const app = createApp(new Repository(":memory:"), {
      origins: [origin],
      recaptchaVerifier: check,
    });
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", r));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
    const post = (path: string, body: unknown) =>
      fetch(base + path, {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    const secret = "only-for-automated-tests-123";
    await post("/setup", {
      name: "O",
      company: "C",
      email: "o@example.test",
      password: secret,
    });
    const login = (recaptchaToken?: string) =>
      post("/login", {
        email: "o@example.test",
        password: secret,
        recaptchaToken,
      });
    expect((await login()).status).toBe(403);
    expect((await login("bad")).status).toBe(403);
    expect((await login("good")).status).toBe(200);
  });
});
