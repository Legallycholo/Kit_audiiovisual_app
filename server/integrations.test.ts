import { afterEach, describe, expect, it, vi } from "vitest";
import { startCompany } from "./testing/harness";
import { integrationsFromEnv, type IntegrationsConfig } from "./integrations";

const secrets = {
  ANTHROPIC_API_KEY: "sk-ant-test-secret-AAAA1111",
  SERPAPI_API_KEY: "serp-test-secret-BBBB2222",
  WHATSAPP_TOKEN: "wa-test-secret-CCCC3333",
  CALCOM_API_KEY: "cal_test_secret_DDDD4444",
};
const env = {
  KIT_AI_PROVIDER: "anthropic",
  ...secrets,
  WHATSAPP_PHONE_NUMBER_ID: "1234567890",
  CALCOM_BOOKING_URL: "https://cal.com/kit-audiovisual",
  KIT_SERPAPI_MONTHLY_CAP: "1000",
};
let company: Awaited<ReturnType<typeof startCompany>> | undefined;
afterEach(async () => {
  await company?.close();
  company = undefined;
});
async function start(config: IntegrationsConfig) {
  company = await startCompany({ integrations: config });
  return company;
}

describe("integrations status", () => {
  it("reads every service from the environment", () => {
    const config = integrationsFromEnv(env);
    expect(config.ai).toMatchObject({
      provider: "anthropic",
      proposalModel: "claude-opus-5-5",
    });
    expect(config.serpapi).toEqual({
      key: secrets.SERPAPI_API_KEY,
      monthlyCap: 1000,
    });
    expect(config.whatsapp?.phoneNumberId).toBe("1234567890");
    expect(config.calcom?.bookingUrl).toBe("https://cal.com/kit-audiovisual");
    expect(integrationsFromEnv({})).toEqual({
      ai: null,
      serpapi: null,
      whatsapp: null,
      calcom: null,
      email: null,
    });
  });

  it("lists status for the owner without exposing any key", async () => {
    const { call, owner } = await start(integrationsFromEnv(env));
    const result = await call("/integrations", "GET", undefined, owner);
    expect(result.status).toBe(200);
    for (const secret of Object.values(secrets))
      expect(result.text).not.toContain(secret);
    expect(result.json.canTest).toBe(true);
    const byId = Object.fromEntries(
      result.json.integrations.map((item: { id: string }) => [item.id, item]),
    );
    expect(Object.keys(byId)).toEqual([
      "ai",
      "whatsapp",
      "calcom",
      "serpapi",
      "search",
      "email",
    ]);
    expect(byId.ai).toMatchObject({
      configured: true,
      provider: "Claude (Anthropic)",
      keyHint: "…1111",
      models: { proposal: "claude-opus-5-5" },
    });
    expect(byId.serpapi.usage).toEqual({
      label: "searches",
      value: 0,
      cap: 1000,
    });
    expect(byId.calcom.bookingUrl).toBe("https://cal.com/kit-audiovisual");
    expect(byId.email.configured).toBe(false);
    expect(byId.email.env).toContain("KIT_EMAIL_API_KEY");
  });

  it("refuses people without administrator access", async () => {
    const { call, account } = await start(integrationsFromEnv(env));
    const sales = await account("Sales Manager");
    expect((await call("/integrations", "GET", undefined, sales)).status).toBe(
      403,
    );
    expect(
      (await call("/integrations/ai/test", "POST", {}, sales)).status,
    ).toBe(403);
  });
});

describe("connection tests", () => {
  it("are owner-only, audited and report the last success", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ id: "claude-opus-5-5" }));
    const { call, owner, account, repo } = await start({
      ...integrationsFromEnv(env),
      transport,
    });
    const admin = await account("Administrator");
    const denied = await call("/integrations/ai/test", "POST", {}, admin);
    expect(denied.status).toBe(403);
    const adminView = await call("/integrations", "GET", undefined, admin);
    expect(adminView.status).toBe(200);
    expect(adminView.json.canTest).toBe(false);

    const tested = await call("/integrations/ai/test", "POST", {}, owner);
    expect(tested.status).toBe(200);
    expect(tested.json).toMatchObject({ id: "ai", ok: true });
    expect(tested.text).not.toContain(secrets.ANTHROPIC_API_KEY);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0]).toBe(
      "https://api.anthropic.com/v1/models/claude-opus-5-5",
    );
    const audit = repo.db
      .prepare("SELECT detail FROM audit WHERE action=?")
      .all("Integration connection tested") as { detail: string }[];
    expect(audit.map((row) => row.detail)).toEqual(["ai · ok"]);
    const status = await call("/integrations", "GET", undefined, owner);
    const ai = status.json.integrations.find(
      (item: { id: string }) => item.id === "ai",
    );
    expect(ai.lastTestOk).toBe(true);
    expect(ai.lastSuccessAt).toEqual(expect.any(String));
  });

  it("reports a rejected key as a failed test without leaking it", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("{}", { status: 401 }));
    const { call, owner } = await start({
      ...integrationsFromEnv(env),
      transport,
    });
    const result = await call("/integrations/serpapi/test", "POST", {}, owner);
    expect(result.status).toBe(200);
    expect(result.json.ok).toBe(false);
    expect(result.json.message).toContain("rechazó la clave");
    expect(result.text).not.toContain(secrets.SERPAPI_API_KEY);
  });

  it("asks for configuration first and rejects unknown services", async () => {
    const { call, owner } = await start({ transport: vi.fn() });
    const missing = await call("/integrations/ai/test", "POST", {}, owner);
    expect(missing.status).toBe(409);
    expect(missing.json.error).toContain("Configura");
    expect(
      (await call("/integrations/email/test", "POST", {}, owner)).status,
    ).toBe(422);
    expect(
      (await call("/integrations/other/test", "POST", {}, owner)).status,
    ).toBe(422);
  });

  it("requires the session confirmation and limits repeated tests", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json({}));
    const { call, owner } = await start({
      ...integrationsFromEnv(env),
      transport,
    });
    const noCsrf = await call(
      "/integrations/ai/test",
      "POST",
      {},
      {
        cookie: owner.cookie,
        csrf: "",
      },
    );
    expect(noCsrf.status).toBe(403);
    for (let attempt = 0; attempt < 10; attempt++)
      expect(
        (await call("/integrations/ai/test", "POST", {}, owner)).status,
      ).toBe(200);
    expect(
      (await call("/integrations/ai/test", "POST", {}, owner)).status,
    ).toBe(429);
  });
});
