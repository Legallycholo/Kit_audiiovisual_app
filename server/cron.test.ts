import { afterEach, describe, expect, it } from "vitest";
import { startCompany } from "./testing/harness";

const secret = "cron-secret-for-automated-tests-only";
let company: Awaited<ReturnType<typeof startCompany>> | undefined;
afterEach(async () => {
  await company?.close();
  company = undefined;
});

describe("GET /api/cron/search-retry", () => {
  it("runs for Vercel Cron's bearer secret without a session or CSRF token", async () => {
    company = await startCompany({ cronSecret: secret });
    const response = await company.call(
      "/cron/search-retry",
      "GET",
      undefined,
      undefined,
      { Authorization: `Bearer ${secret}` },
    );
    expect(response.status).toBe(200);
    expect(response.json).toEqual({ ok: true });
  });

  it("rejects a missing, wrong or differently sized secret", async () => {
    company = await startCompany({ cronSecret: secret });
    const attempts: Record<string, string>[] = [
      {},
      { Authorization: "Bearer wrong" },
      { Authorization: `Bearer ${secret}x` },
      { Authorization: secret },
    ];
    for (const headers of attempts) {
      const response = await company.call(
        "/cron/search-retry",
        "GET",
        undefined,
        undefined,
        headers,
      );
      expect(response.status).toBe(401);
    }
  });

  it("fails closed when no secret is configured, even if a header is sent", async () => {
    company = await startCompany({});
    const response = await company.call(
      "/cron/search-retry",
      "GET",
      undefined,
      undefined,
      { Authorization: "Bearer " },
    );
    expect(response.status).toBe(503);
  });

  it("is not reachable by an ordinary signed-in session", async () => {
    company = await startCompany({ cronSecret: secret });
    const response = await company.call(
      "/cron/search-retry",
      "GET",
      undefined,
      company.owner,
    );
    expect(response.status).toBe(401);
  });
});
