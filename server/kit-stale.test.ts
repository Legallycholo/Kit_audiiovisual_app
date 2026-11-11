import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Repository } from "./database";
import { KitService } from "./kit";

let repo: Repository;
beforeEach(async () => {
  repo = await Repository.open("memory://");
  await repo.db
    .prepare(
      "INSERT INTO users(id,email,name,role,password_hash) VALUES(?,?,?,?,?)",
    )
    .run("owner", "owner@example.test", "Owner", "Administrator", "unused");
  await repo.db
    .prepare("INSERT INTO workspace(id,revision,payload) VALUES(1,0,?)")
    .run(
      JSON.stringify({
        settings: { company: "Test" },
        events: [],
        tasks: [],
        proposals: [],
        venues: [],
        clients: [],
      }),
    );
});
afterEach(async () => {
  delete process.env.KIT_JOB_STALE_MS;
  await repo.close();
});

async function busyThread(id: string, updatedAt: string) {
  const thread = {
    id,
    title: "Conversación",
    projectId: null,
    createdAt: updatedAt,
    updatedAt,
    busy: true,
    messages: [
      {
        id: `${id}-m`,
        role: "assistant",
        text: "",
        at: updatedAt,
        status: "pending",
        sources: [],
        citations: [],
      },
    ],
  };
  await repo.db
    .prepare("INSERT INTO kit_threads VALUES(?,?,?,?)")
    .run(id, "owner", JSON.stringify(thread), updatedAt);
}
const minutesAgo = (m: number) =>
  new Date(Date.now() - m * 60_000).toISOString();

describe("AI jobs cut off by the serverless platform", () => {
  it("frees a thread that has been busy longer than any function can run", async () => {
    await busyThread("old", minutesAgo(30));
    const kit = new KitService(repo, undefined, undefined, undefined, {
      resetBusyOnBoot: false,
    });
    await kit.ready;
    const thread = await kit.get("owner", "old");
    expect(thread.busy).toBe(false);
    expect(thread.messages[0].status).toBe("stopped");
    expect(thread.messages[0].error).toContain("interrumpió");
    // The release is saved, not just shown.
    const stored = JSON.parse(
      (
        (await repo.db
          .prepare("SELECT payload FROM kit_threads WHERE id='old'")
          .get()) as { payload: string }
      ).payload,
    );
    expect(stored.busy).toBe(false);
  });

  it("leaves a recently started job alone, so another instance's work is not clobbered", async () => {
    await busyThread("fresh", minutesAgo(1));
    const kit = new KitService(repo, undefined, undefined, undefined, {
      resetBusyOnBoot: false,
    });
    await kit.ready;
    expect((await kit.get("owner", "fresh")).busy).toBe(true);
    const listed = await kit.list("owner");
    expect(listed.find((t) => t.id === "fresh")?.busy).toBe(true);
  });

  it("frees stale threads when listing too", async () => {
    await busyThread("old", minutesAgo(30));
    const kit = new KitService(repo, undefined, undefined, undefined, {
      resetBusyOnBoot: false,
    });
    await kit.ready;
    expect((await kit.list("owner"))[0].busy).toBe(false);
  });

  it("honors KIT_JOB_STALE_MS", async () => {
    process.env.KIT_JOB_STALE_MS = "30000";
    await busyThread("short", minutesAgo(1));
    const kit = new KitService(repo, undefined, undefined, undefined, {
      resetBusyOnBoot: false,
    });
    await kit.ready;
    expect((await kit.get("owner", "short")).busy).toBe(false);
  });

  it("a long-lived server still interrupts every leftover job at startup", async () => {
    await busyThread("fresh", minutesAgo(1));
    const kit = new KitService(repo);
    await kit.ready;
    const thread = await kit.get("owner", "fresh");
    expect(thread.busy).toBe(false);
    expect(thread.messages[0].error).toContain("reiniciar");
  });
});
