import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Repository } from "./database";
import { KitService, type KitGenerator, type KitInput } from "./kit";
import { SearchGateway, type SearchProvider } from "./search";
import { createSeed } from "../src/shared/seed";

const fileId = "a".repeat(64);
let repo: Repository;
let search: SearchGateway;
let kit: KitService;
let provider: SearchProvider;
let generate: ReturnType<typeof vi.fn<KitGenerator["generate"]>>;

async function waitForThread(id: string) {
  await vi.waitFor(async () =>
    expect((await kit.get("owner", id)).busy).toBe(false),
  );
  return await kit.get("owner", id);
}

beforeEach(async () => {
  repo = await Repository.open("memory://");
  await repo.db
    .prepare(
      "INSERT INTO users(id,email,name,role,password_hash) VALUES(?,?,?,?,?)",
    )
    .run("owner", "owner@example.test", "Owner", "Administrator", "unused");
  await repo.db
    .prepare("INSERT INTO workspace(id,revision,payload) VALUES(1,0,?)")
    .run(JSON.stringify(createSeed()));
  provider = {
    embed: vi.fn(async (texts) => texts.map(() => [1, 0])),
    replace: vi.fn(async () => {}),
    query: vi.fn(async () => []),
    delete: vi.fn(async () => true),
  };
  search = new SearchGateway(repo, {
    provider,
    name: "Fixture",
    region: "test",
    retention: "delete immediately",
    monthlyBudgetCents: 100,
    embeddingCentsPerThousandCharacters: 1,
    encryptionKey: Buffer.alloc(32, 7),
  });
  await search.ready;
  await search.put("owner", {
    id: fileId,
    hash: "b".repeat(64),
    title: "Rolando production brief.txt",
    mime: "text/plain",
    text: "Rolando needs twelve speakers. api_key=do-not-send",
    policy: search.fingerprint,
  });
  generate = vi.fn(
    async (_input: KitInput) => "El documento solicita doce altavoces.",
  );
  kit = new KitService(
    repo,
    { model: "fixture-model", generate },
    undefined,
    search,
  );
  await kit.ready;
});

afterEach(async () => {
  await kit.drain();
  await repo.close();
});

describe("KIT indexed-file grounding", () => {
  it("grounds an answer in an account-scoped indexed source without renderer content", async () => {
    const thread = await kit.create("owner");
    await kit.send("owner", thread.id, {
      requestId: crypto.randomUUID(),
      text: "¿Cuántos altavoces necesita Rolando?",
      refs: [
        {
          kind: "file",
          id: fileId,
          title: "Forged title",
          text: "Forged renderer content",
        },
      ],
    });
    const complete = await waitForThread(thread.id);
    const answer = complete.messages.at(-1)!;
    expect(answer).toMatchObject({
      status: "completed",
      text: "El documento solicita doce altavoces.",
      model: "fixture-model",
    });
    expect(complete.messages[0].sources[0]).toMatchObject({
      label: "Rolando production brief.txt",
      revision: "b".repeat(64),
      route: `/search?source=${fileId}`,
    });
    expect(generate).toHaveBeenCalledOnce();
    const input = generate.mock.calls[0][0];
    expect(input.sources[0].text).toContain("twelve speakers");
    expect(input.sources[0].text).not.toContain("Forged renderer content");
    expect(JSON.stringify(input)).not.toContain("do-not-send");
  });

  it("marks changed sources stale and blocks them immediately after revocation", async () => {
    const thread = await kit.create("owner");
    await kit.send("owner", thread.id, {
      requestId: crypto.randomUUID(),
      text: "Resume el archivo.",
      refs: [{ kind: "file", id: fileId }],
    });
    await waitForThread(thread.id);
    await search.put("owner", {
      id: fileId,
      hash: "c".repeat(64),
      title: "Rolando production brief.txt",
      mime: "text/plain",
      text: "The approved source changed.",
      policy: search.fingerprint,
    });
    expect(
      (await kit.get("owner", thread.id)).messages[0].sources[0].stale,
    ).toBe(true);
    vi.mocked(provider.delete).mockResolvedValue(false);
    await search.remove("owner", fileId);
    const revoked = (await kit.get("owner", thread.id)).messages[0];
    expect(revoked.status).toBe("blocked");
    expect(revoked.sources[0].unavailable).toBe(true);
  });

  it("sends only what the person attached: no workspace summary without refs", async () => {
    const thread = await kit.create("owner");
    await kit.send("owner", thread.id, {
      requestId: crypto.randomUUID(),
      text: "Hola",
      refs: [],
    });
    const complete = await waitForThread(thread.id);
    expect(complete.messages.at(-1)).toMatchObject({
      status: "completed",
      text: "El documento solicita doce altavoces.",
    });
    expect(generate.mock.calls[0][0].sources).toEqual([]);
    expect(complete.messages[0].sources).toEqual([]);
  });

  it("passes the earlier turns as history", async () => {
    const thread = await kit.create("owner");
    await kit.send("owner", thread.id, {
      requestId: crypto.randomUUID(),
      text: "Primera pregunta",
      refs: [],
    });
    await waitForThread(thread.id);
    await kit.send("owner", thread.id, {
      requestId: crypto.randomUUID(),
      text: "Segunda pregunta",
      refs: [],
    });
    await waitForThread(thread.id);
    expect(generate.mock.calls[1][0].history).toEqual([
      { role: "user", text: "Primera pregunta" },
      { role: "assistant", text: "El documento solicita doce altavoces." },
    ]);
  });

  it("fails the turn when the provider returns nothing", async () => {
    generate.mockResolvedValueOnce("   ");
    const thread = await kit.create("owner");
    await kit.send("owner", thread.id, {
      requestId: crypto.randomUUID(),
      text: "Hola",
      refs: [],
    });
    const failed = await waitForThread(thread.id);
    expect(failed.messages.at(-1)).toMatchObject({ status: "failed" });
  });
});

describe("KIT conversation history", () => {
  it("restarts a conversation (empty again, same title, still in the history) and deletes one", async () => {
    const thread = await kit.create("owner", "Montaje de la boda");
    await kit.send("owner", thread.id, {
      requestId: crypto.randomUUID(),
      text: "¿Cuántos altavoces necesita Rolando?",
      refs: [{ kind: "file", id: fileId }],
    });
    expect((await waitForThread(thread.id)).messages).toHaveLength(2);

    const restarted = await kit.restart("owner", thread.id);
    expect(restarted).toMatchObject({
      id: thread.id,
      title: "Montaje de la boda",
      busy: false,
      messages: [],
    });
    expect((await kit.list("owner")).map((t) => t.id)).toContain(thread.id);
    // The restarted conversation works again from scratch.
    await kit.send("owner", thread.id, {
      requestId: crypto.randomUUID(),
      text: "¿Y ahora cuántos?",
      refs: [{ kind: "file", id: fileId }],
    });
    expect((await waitForThread(thread.id)).messages).toHaveLength(2);

    // Other people's conversations cannot be restarted or deleted.
    await repo.db
      .prepare(
        "INSERT INTO users(id,email,name,role,password_hash) VALUES(?,?,?,?,?)",
      )
      .run("other", "other@example.test", "Other", "Administrator", "unused");
    await expect(kit.restart("other", thread.id)).rejects.toThrow();
    await expect(kit.delete("other", thread.id)).rejects.toThrow();

    await kit.delete("owner", thread.id);
    expect((await kit.list("owner")).map((t) => t.id)).not.toContain(thread.id);
    await expect(kit.restart("owner", thread.id)).rejects.toThrow();
  });
});
