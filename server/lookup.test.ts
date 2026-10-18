import { afterEach, describe, expect, it, vi } from "vitest";
import { startCompany } from "./testing/harness";

const key = "serp-test-secret-key-9999";
let company: Awaited<ReturnType<typeof startCompany>> | undefined;
afterEach(async () => {
  await company?.close();
  company = undefined;
});

const shopping = {
  shopping_results: [
    {
      title: "Shure SM58 Micrófono vocal",
      source: "Tienda de audio",
      extracted_price: 99,
      product_link: "https://example.test/sm58",
    },
    { title: "Enlace inseguro", link: "http://example.test/x" },
    { title: "" },
  ],
};

describe("web lookup", () => {
  it("returns suggestions, spends one search and stores no query", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(shopping));
    company = await startCompany({
      integrations: { serpapi: { key, monthlyCap: 5 }, transport },
    });
    const { call, owner, repo } = company;
    const result = await call(
      "/lookup",
      "POST",
      { kind: "equipment", query: "micrófono SM58 confidencial" },
      owner,
    );
    expect(result.status).toBe(200);
    expect(result.json.results).toEqual([
      {
        title: "Shure SM58 Micrófono vocal",
        subtitle: "Tienda de audio",
        referencePrice: 99,
        link: "https://example.test/sm58",
      },
      { title: "Enlace inseguro" },
    ]);
    expect(result.json).toMatchObject({ used: 1, cap: 5, configured: true });
    expect(result.text).not.toContain(key);
    const url = new URL(String(transport.mock.calls[0][0]));
    expect(url.searchParams.get("engine")).toBe("google_shopping");
    const audit = repo.db
      .prepare("SELECT detail FROM audit WHERE action=?")
      .all("External lookup performed") as { detail: string }[];
    expect(audit).toEqual([{ detail: "equipment · 2" }]);
    expect(JSON.stringify(audit)).not.toContain("confidencial");
  });

  it("maps venues and events from their engines", async () => {
    const transport = vi.fn<typeof fetch>(async (input) => {
      const engine = new URL(String(input)).searchParams.get("engine");
      return Response.json(
        engine === "google_maps"
          ? {
              local_results: [
                {
                  title: "Centro de Convenciones",
                  address: "San Juan, PR",
                  phone: "+1 787 555 0100",
                  website: "https://example.test/cc",
                  type: "Centro de convenciones",
                },
              ],
            }
          : {
              events_results: [
                {
                  title: "Feria de producción",
                  date: { when: "Sáb, 14 nov" },
                  address: ["San Juan", "PR"],
                  link: "https://example.test/feria",
                },
              ],
            },
      );
    });
    company = await startCompany({
      integrations: { serpapi: { key, monthlyCap: 5 }, transport },
    });
    const venue = await company.call(
      "/lookup",
      "POST",
      { kind: "venue", query: "centro de convenciones" },
      company.owner,
    );
    expect(venue.json.results[0]).toEqual({
      title: "Centro de Convenciones",
      subtitle: "Centro de convenciones",
      address: "San Juan, PR",
      phone: "+1 787 555 0100",
      website: "https://example.test/cc",
    });
    const event = await company.call(
      "/lookup",
      "POST",
      { kind: "event", query: "feria" },
      company.owner,
    );
    expect(event.json.results[0]).toEqual({
      title: "Feria de producción",
      date: "Sáb, 14 nov",
      address: "San Juan, PR",
      link: "https://example.test/feria",
    });
    expect(
      new URL(String(transport.mock.calls[1][0])).searchParams.get("q"),
    ).toBe("feria Puerto Rico");
  });

  it("enforces the monthly cap on the server", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json(shopping));
    company = await startCompany({
      integrations: { serpapi: { key, monthlyCap: 2 }, transport },
    });
    const body = { kind: "equipment", query: "consola" };
    for (let i = 0; i < 2; i++)
      expect(
        (await company.call("/lookup", "POST", body, company.owner)).status,
      ).toBe(200);
    const capped = await company.call("/lookup", "POST", body, company.owner);
    expect(capped.status).toBe(429);
    expect(capped.json.error).toBe("Límite mensual alcanzado.");
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("is owner-only and explains when it is not connected", async () => {
    company = await startCompany({});
    const missing = await company.call(
      "/lookup",
      "POST",
      { kind: "venue", query: "salón" },
      company.owner,
    );
    expect(missing.status).toBe(503);
    expect(missing.json.error).toBe("Búsqueda externa no conectada.");
    const status = await company.call(
      "/lookup/status",
      "GET",
      undefined,
      company.owner,
    );
    expect(status.json).toEqual({ configured: false, used: 0, cap: 0 });
    const admin = await company.account("Administrator");
    expect(
      (await company.call("/lookup/status", "GET", undefined, admin)).status,
    ).toBe(403);
    expect(
      (
        await company.call(
          "/lookup",
          "POST",
          { kind: "venue", query: "salón" },
          admin,
        )
      ).status,
    ).toBe(403);
  });
});
