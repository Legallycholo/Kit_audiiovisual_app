import { afterEach, describe, expect, it } from "vitest";
import { startCompany } from "./testing/harness";

let company: Awaited<ReturnType<typeof startCompany>> | undefined;
afterEach(async () => {
  await company?.close();
  company = undefined;
});

const attemptKeys = async (c: NonNullable<typeof company>) =>
  (
    (await c.repo.db.prepare("SELECT key FROM login_attempts").all()) as {
      key: string;
    }[]
  ).map((row) => row.key);

describe("client address for rate limits", () => {
  it("uses the forwarded client address when a trusted proxy is configured", async () => {
    company = await startCompany({ trustProxy: 1 });
    await company.call("/login", "POST", { email: "x@example.test", password: "wrong-password-1" }, undefined, {
      "X-Forwarded-For": "203.0.113.7",
    });
    expect(await attemptKeys(company)).toContain("login:203.0.113.7");
  });

  it("ignores a forwarded address when no proxy is trusted (a client cannot choose its own bucket)", async () => {
    company = await startCompany({});
    await company.call("/login", "POST", { email: "x@example.test", password: "wrong-password-1" }, undefined, {
      "X-Forwarded-For": "203.0.113.7",
    });
    const keys = await attemptKeys(company);
    expect(keys.some((key) => key.includes("203.0.113.7"))).toBe(false);
    expect(keys.some((key) => key.startsWith("login:"))).toBe(true);
  });
});
