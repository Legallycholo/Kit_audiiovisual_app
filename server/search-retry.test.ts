import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Repository } from "./database";
import { SearchGateway, type SearchProvider } from "./search";

let repo: Repository;
const provider: SearchProvider = {
  embed: async (texts) => texts.map(() => [1, 0]),
  replace: async () => {},
  query: async () => [],
  delete: async () => true,
};
const enabled = {
  provider,
  name: "Fixture",
  region: "test",
  retention: "delete immediately",
  monthlyBudgetCents: 100,
  embeddingCentsPerThousandCharacters: 1,
  encryptionKey: Buffer.alloc(32, 1),
};

beforeEach(async () => {
  repo = await Repository.open("memory://");
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(async () => {
  vi.useRealTimers();
  await repo.close();
});

describe("retry after search activity (replaces the 30 s timer)", () => {
  it("retries at most once a minute, then again after a minute", async () => {
    const gateway = new SearchGateway(repo, enabled);
    await gateway.ready;
    const retry = vi.spyOn(gateway, "retry").mockResolvedValue(undefined);
    gateway.kickRetry();
    gateway.kickRetry();
    gateway.kickRetry();
    expect(retry).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 61_000);
    gateway.kickRetry();
    expect(retry).toHaveBeenCalledTimes(2);
  });

  it("does nothing when cloud search is not configured", async () => {
    const gateway = new SearchGateway(repo);
    await gateway.ready;
    const retry = vi.spyOn(gateway, "retry");
    gateway.kickRetry();
    expect(retry).not.toHaveBeenCalled();
  });

  it("never throws into the request when a retry fails", async () => {
    const gateway = new SearchGateway(repo, enabled);
    await gateway.ready;
    vi.spyOn(gateway, "retry").mockRejectedValue(new Error("provider down"));
    expect(() => gateway.kickRetry()).not.toThrow();
    await Promise.resolve();
  });

  it("two instances starting together share one tenant", async () => {
    const [a, b] = [
      new SearchGateway(repo, enabled),
      new SearchGateway(repo, enabled),
    ];
    await Promise.all([a.ready, b.ready]);
    expect(a.tenant).toBe(b.tenant);
    expect(
      await repo.db.prepare("SELECT id FROM search_tenant").all(),
    ).toHaveLength(1);
  });
});
