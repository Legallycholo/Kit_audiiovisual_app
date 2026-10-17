import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { Repository } from "./database";
import {
  SearchGateway,
  redactSecrets,
  chunks,
  type SearchProvider,
} from "./search";
import { createApp } from "./app";
import { createSeed } from "../src/shared/seed";
let repo: Repository;
let gateway: SearchGateway;
let provider: SearchProvider;
const id = "a".repeat(64),
  other = "b".repeat(64);
beforeEach(() => {
  repo = new Repository(":memory:");
  for (const user of ["alice", "bob"])
    repo.db
      .prepare(
        "INSERT INTO users(id,email,name,role,password_hash) VALUES(?,?,?,?,?)",
      )
      .run(user, `${user}@example.test`, user, "Administrator", "unused");
  provider = {
    embed: vi.fn(async (texts) => texts.map(() => [1, 0])),
    replace: vi.fn(async () => {}),
    query: vi.fn(async () => [
      { source: id, score: 1 },
      { source: other, score: 0.9 },
    ]),
    delete: vi.fn(async () => true),
  };
  gateway = new SearchGateway(repo, {
    provider,
    name: "Fixture",
    region: "test",
    retention: "delete immediately",
    monthlyBudgetCents: 100,
    embeddingCentsPerThousandCharacters: 1,
    encryptionKey: Buffer.alloc(32, 1),
  });
});
afterEach(() => repo.close());
const source = (gateway: SearchGateway, sourceId = id) => ({
  id: sourceId,
  hash: "c".repeat(64),
  title: "Rolando proposal",
  mime: "text/plain",
  text: "Rolando audio. api_key=supersecret",
  policy: gateway.fingerprint,
});
describe("cloud search privacy boundary", () => {
  it("redacts before embedding, encrypts persisted chunks and deduplicates", async () => {
    await gateway.put("alice", source(gateway));
    await gateway.put("alice", source(gateway));
    expect(provider.embed).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(provider.embed).mock.calls)).not.toContain(
      "supersecret",
    );
    expect(
      JSON.stringify(repo.db.prepare("SELECT * FROM search_sources").all()),
    ).not.toContain("Rolando");
    expect((await gateway.search("alice", "Rolando")).results).toHaveLength(1);
  });
  it("never returns another user's source, even from a malicious provider", async () => {
    await gateway.put("alice", source(gateway));
    expect((await gateway.search("bob", "Rolando")).results).toEqual([]);
    await gateway.put("bob", source(gateway, other));
    expect((await gateway.search("alice", "Rolando")).results).toHaveLength(1);
    const namespaces = vi.mocked(provider.replace).mock.calls.map((c) => c[0]);
    expect(namespaces[0]).not.toBe(namespaces[1]);
    expect(gateway.source("alice", id)).toMatchObject({
      id,
      hash: "c".repeat(64),
      title: "Rolando proposal",
    });
    expect(() => gateway.source("bob", id)).toThrow("unavailable");
  });
  it("hides content immediately while deletion retries await confirmation", async () => {
    await gateway.put("alice", source(gateway));
    vi.mocked(provider.delete).mockResolvedValue(false);
    expect((await gateway.remove("alice")).confirmed).toBe(false);
    expect((await gateway.search("alice", "Rolando")).results).toEqual([]);
    expect(repo.db.prepare("SELECT payload FROM search_sources").get()).toEqual(
      { payload: "" },
    );
    vi.mocked(provider.delete).mockResolvedValue(true);
    await gateway.retry();
    expect(gateway.status("alice").sources).toHaveLength(0);
  });
  it("blocks stale consent, guests and disabled accounts", async () => {
    await expect(
      gateway.put("alice", { ...source(gateway), policy: "0".repeat(64) }),
    ).rejects.toThrow("policy changed");
    repo.db.prepare("UPDATE users SET active=0 WHERE id='alice'").run();
    await expect(gateway.search("alice", "Rolando")).rejects.toThrow(
      "unavailable",
    );
  });
  it("enforces a budget without disabling deletion", async () => {
    gateway.config.monthlyBudgetCents = 1;
    await gateway.put("alice", source(gateway));
    await expect(gateway.search("alice", "Rolando")).rejects.toThrow("budget");
    expect((await gateway.remove("alice")).confirmed).toBe(true);
  });
  it("revoked account sources are reconciled without another query", async () => {
    await gateway.put("alice", source(gateway));
    repo.db.prepare("UPDATE users SET active=0 WHERE id='alice'").run();
    await gateway.retry();
    expect(provider.delete).toHaveBeenCalled();
    expect(repo.db.prepare("SELECT * FROM search_sources").all()).toEqual([]);
  });
  it("fails closed without an approved provider and finite budget", async () => {
    gateway.config.monthlyBudgetCents = Infinity;
    expect(gateway.enabled()).toBe(false);
    await expect(gateway.put("alice", source(gateway))).rejects.toThrow(
      "configured",
    );
  });
  it("bounds chunk overlap and detects common secret formats", () => {
    const parts = chunks("x".repeat(4500));
    expect(parts.map((p) => p.length)).toEqual([2000, 2000, 900]);
    expect(redactSecrets("password=foo Bearer abc123").count).toBe(2);
  });
  it("requires a valid non-revoked bearer token on device endpoints", async () => {
    const app = createApp(repo, {
      origins: ["http://localhost:5173"],
      search: gateway.config,
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/search/device/status`;
    try {
      expect((await fetch(url)).status).toBe(401);
      const token = gateway.issue("alice", "fixture");
      expect(
        (await fetch(url, { headers: { Authorization: `Bearer ${token}` } }))
          .status,
      ).toBe(200);
      repo.db.exec("UPDATE search_devices SET revoked=1");
      expect(
        (await fetch(url, { headers: { Authorization: `Bearer ${token}` } }))
          .status,
      ).toBe(401);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it("requires confirmed deletion before switching providers", async () => {
    await gateway.put("alice", source(gateway));
    expect(
      () =>
        new SearchGateway(repo, { ...gateway.config, name: "Other provider" }),
    ).toThrow("previous search provider");
    await gateway.remove("alice");
    expect(
      () =>
        new SearchGateway(repo, { ...gateway.config, name: "Other provider" }),
    ).not.toThrow();
  });
  it("searches only role-scoped company records without uploading files", async () => {
    repo.db
      .prepare("INSERT INTO workspace(id,revision,payload) VALUES(1,0,?)")
      .run(JSON.stringify(createSeed()));
    const app = createApp(repo, { origins: [], search: gateway.config });
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/search/device/records`;
    const token = gateway.issue("alice", "fixture");
    const query = async () => {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: "Oceanfront" }),
      });
      expect(response.status).toBe(200);
      return response.json();
    };
    try {
      expect((await query()).results.length).toBeGreaterThan(0);
      repo.db
        .prepare(
          "UPDATE users SET role='Technician',event_ids='[]' WHERE id='alice'",
        )
        .run();
      expect((await query()).results).toEqual([]);
      expect(provider.embed).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
