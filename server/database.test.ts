import { afterEach, describe, expect, it } from "vitest";
import { HttpError, Repository, emptyWorkspace } from "./database";

describe("workspace repository revisions", () => {
  const repos: Repository[] = [];
  afterEach(async () => {
    for (const repo of repos.splice(0)) await repo.close();
  });
  const setup = async () => {
    const repo = await Repository.open("memory://");
    repos.push(repo);
    await repo.db
      .prepare("INSERT INTO workspace VALUES (1,0,?)")
      .run(JSON.stringify(emptyWorkspace("Producciones de prueba")));
    return repo;
  };

  it("increments the revision on each save", async () => {
    const repo = await setup();
    const first = await repo.read();
    await repo.save(
      {
        ...first.workspace,
        settings: { ...first.workspace.settings, timezone: "UTC" },
      },
      first.revision,
    );
    expect((await repo.read()).revision).toBe(first.revision + 1);
  });

  it("rejects a second session saving against a stale revision without writing", async () => {
    const repo = await setup();
    const sessionA = await repo.read();
    const sessionB = await repo.read();
    await repo.save(
      {
        ...sessionA.workspace,
        settings: { ...sessionA.workspace.settings, company: "A" },
      },
      sessionA.revision,
    );
    let error: unknown;
    try {
      await repo.save(
        {
          ...sessionB.workspace,
          settings: { ...sessionB.workspace.settings, company: "B" },
        },
        sessionB.revision,
      );
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(409);
    expect((await repo.read()).workspace.settings.company).toBe("A");
  });

  it("does not persist server-owned activity in the payload", async () => {
    const repo = await setup();
    const current = await repo.read();
    await repo.save(
      {
        ...current.workspace,
        activity: [
          {
            id: "forged",
            title: "Forged",
            detail: "Client-written",
            at: new Date().toISOString(),
          },
        ],
      },
      current.revision,
    );
    const stored = await repo.db
      .prepare("SELECT payload FROM workspace WHERE id=1")
      .get() as {
      payload: string;
    };
    expect(JSON.parse(stored.payload).activity).toEqual([]);
    expect((await repo.read()).workspace.activity).toEqual([]);
  });

  it("fills collections missing from older payloads", async () => {
    const repo = await setup();
    const legacy = emptyWorkspace("Legado") as unknown as Record<
      string,
      unknown
    >;
    for (const key of [
      "packages",
      "maintenanceRecords",
      "operations",
      "automations",
      "brandAssets",
      "creativeAssets",
    ])
      delete legacy[key];
    await repo.db
      .prepare("UPDATE workspace SET payload=? WHERE id=1")
      .run(JSON.stringify(legacy));
    const { workspace } = await repo.read();
    expect(workspace.packages).toEqual([]);
    expect(workspace.maintenanceRecords).toEqual([]);
    expect(workspace.operations).toEqual([]);
    expect(workspace.automations).toEqual([]);
    expect(workspace.brandAssets).toEqual([]);
    expect(workspace.creativeAssets).toEqual([]);
  });
});
