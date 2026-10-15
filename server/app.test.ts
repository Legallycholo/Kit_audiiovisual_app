import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./app";
import { Repository } from "./database";
import { createSeed } from "../src/shared/seed";
import type { WorkspaceResponse, WorkspaceChange } from "../src/shared/access";
import type { ProposalGenerator } from "./proposal-ai";

const origin = "http://localhost:5173";
const password = "only-for-automated-tests-123";
let repo: Repository;
let server: Server;
let url: string;
let owner: { cookie: string; csrf: string };
const generate = vi.fn<ProposalGenerator["generate"]>();
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  session = owner,
  headers: Record<string, string> = {},
) {
  const response = await fetch(`${url}/api${path}`, {
    method,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(session
        ? { Cookie: session.cookie, "x-csrf-token": session.csrf }
        : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = await response.json();
  return {
    status: response.status,
    json,
    cookie: response.headers.getSetCookie().at(-1)?.split(";")[0] || "",
    headers: response.headers,
  };
}
async function workspace(session = owner): Promise<WorkspaceResponse> {
  const result = await call("/workspace", "GET", undefined, session);
  expect(result.status).toBe(200);
  return result.json;
}
async function patch(
  changes: WorkspaceChange[],
  revision?: number,
  session = owner,
) {
  return call(
    "/workspace",
    "PATCH",
    { revision: revision ?? (await workspace(session)).revision, changes },
    session,
  );
}
async function account(role: string, extra: Record<string, unknown> = {}) {
  const email = `${role.replaceAll(/[^a-z]/gi, "")}@example.test`;
  const created = await call("/users", "POST", {
    name: "Test Person",
    email,
    password,
    role,
    ...extra,
  });
  expect(created.status).toBe(201);
  const login = await call(
    "/login",
    "POST",
    { email, password },
    undefined as never,
    { Cookie: "", "x-csrf-token": "" },
  );
  expect(login.status).toBe(200);
  return {
    cookie: login.cookie,
    csrf: login.json.csrf,
    id: created.json.user.id,
  };
}
beforeEach(async () => {
  repo = new Repository(":memory:");
  generate.mockReset();
  const app = createApp(repo, {
    origins: [origin],
    proposalGenerator: { model: "test-model", generate },
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const setup = await call(
    "/setup",
    "POST",
    {
      name: "Owner",
      company: "Test AV",
      email: "owner@example.test",
      password,
    },
    undefined as never,
    { Cookie: "", "x-csrf-token": "" },
  );
  expect(setup.status).toBe(201);
  owner = { cookie: setup.cookie, csrf: setup.json.csrf };
  const seed = createSeed();
  seed.conversations.forEach((c) =>
    c.messages.forEach((m) => {
      m.at = new Date(m.at).toISOString();
    }),
  );
  repo.save(seed, 0);
});
afterEach(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  repo.close();
});

describe("authenticated company workspace", () => {
  it("requires a session, origin and CSRF; stores no plaintext passwords; setup is single-use", async () => {
    expect(
      (await call("/workspace", "GET", undefined, owner, { Cookie: "" }))
        .status,
    ).toBe(401);
    expect(
      (await call("/workspace", "PATCH", {}, owner, { "x-csrf-token": "" }))
        .status,
    ).toBe(403);
    expect(
      (
        await call("/workspace", "PATCH", {}, owner, {
          Origin: "https://untrusted.test",
        })
      ).status,
    ).toBe(403);
    expect(repo.userByEmail("owner@example.test")?.password_hash).not.toContain(
      password,
    );
    expect((await call("/setup", "POST", {})).status).toBe(409);
    expect((await call("/users")).json.users[0]).not.toHaveProperty(
      "password_hash",
    );
  });
  it("protects records and client shares at the API boundary", async () => {
    const tech = await account("Technician", { eventIds: ["e1"] });
    const scoped = await workspace(tech);
    expect(scoped.workspace.events.map((e) => e.id)).toEqual(["e1"]);
    expect(scoped.workspace.proposals).toEqual([]);
    expect(scoped.workspace.conversations).toEqual([]);
    expect(scoped.workspace.equipment.every((q) => q.rate === 0)).toBe(true);
    const event = repo.read().workspace.events.find((e) => e.id === "e2")!;
    expect(
      (
        await patch(
          [{ collection: "events", id: event.id, value: event }],
          undefined,
          tech,
        )
      ).status,
    ).toBe(403);
    expect((await call("/export", "GET", undefined, tech)).status).toBe(403);
    const proposal = repo
      .read()
      .workspace.proposals.find((p) => p.id === "p1")!;
    const clientId = repo
      .read()
      .workspace.events.find((e) => e.id === proposal.eventId)!.clientId;
    const guest = await account("Client / Guest", {
      clientId,
      sharedProposalIds: [proposal.id],
    });
    const shared = await workspace(guest);
    expect(shared.workspace.proposals.map((p) => p.id)).toEqual(["p1"]);
    expect(shared.workspace.activity).toEqual([]);
    expect(shared.workspace.equipment).toEqual([]);
  });
  it("deactivation revokes existing sessions and cannot deactivate the owner", async () => {
    const tech = await account("Technician");
    expect(
      (await call(`/users/${tech.id}`, "PATCH", { active: false })).status,
    ).toBe(200);
    expect((await call("/workspace", "GET", undefined, tech)).status).toBe(401);
    const ownerId = (await workspace()).user.id;
    expect(
      (await call(`/users/${ownerId}`, "PATCH", { active: false })).status,
    ).toBe(422);
  });
  it("atomically rejects stale saves and overlapping reservations, including maintenance changes", async () => {
    const initial = await workspace();
    const item = initial.workspace.equipment[0];
    const value = {
      id: "test-reservation",
      eventId: "e1",
      equipmentId: item.id,
      quantity: item.quantity - item.maintenance,
      start: "2030-01-01",
      end: "2030-01-03",
      status: "Hold",
    };
    const results = await Promise.all([
      patch(
        [{ collection: "reservations", id: value.id, value }],
        initial.revision,
      ),
      patch(
        [
          {
            collection: "reservations",
            id: "other-reservation",
            value: { ...value, id: "other-reservation" },
          },
        ],
        initial.revision,
      ),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const revision = (await workspace()).revision;
    expect(
      (
        await patch(
          [
            {
              collection: "reservations",
              id: "third-reservation",
              value: { ...value, id: "third-reservation", quantity: 1 },
            },
          ],
          revision,
        )
      ).status,
    ).toBe(422);
    expect((await workspace()).revision).toBe(revision);
    expect(
      (
        await patch([
          {
            collection: "equipment",
            id: item.id,
            value: { ...item, maintenance: item.maintenance + 1 },
          },
        ])
      ).status,
    ).toBe(422);
  });
  it("only the owner can confirm exact issued revisions, without sending or reserving", async () => {
    const sales = await account("Sales Manager");
    const initial = await workspace();
    expect(
      (
        await call(
          "/conversations/m1/accept",
          "POST",
          { revision: initial.revision },
          sales,
        )
      ).status,
    ).toBe(403);
    const conversation = initial.workspace.conversations.find(
      (c) => c.id === "m1",
    )!;
    expect(
      (
        await patch([
          {
            collection: "conversations",
            id: "m1",
            value: { ...conversation, review: "Confirmed" },
          },
        ])
      ).status,
    ).toBe(403);
    const accepted = await call("/conversations/m1/accept", "POST", {
      revision: initial.revision,
    });
    expect(accepted.status).toBe(200);
    expect(
      accepted.json.workspace.proposals.find(
        (p: { id: string }) => p.id === "p1",
      ).status,
    ).toBe("Accepted");
    expect(accepted.json.workspace.reservations).toEqual(
      initial.workspace.reservations,
    );
    expect(
      accepted.json.workspace.conversations.find(
        (c: { id: string }) => c.id === "m1",
      ).messages,
    ).toEqual(conversation.messages);
    expect(
      (
        await call("/conversations/m1/accept", "POST", {
          revision: accepted.json.revision,
        })
      ).status,
    ).toBe(422);
    const proposal = accepted.json.workspace.proposals.find(
      (p: { id: string }) => p.id === "p1",
    );
    expect(
      (
        await patch([
          {
            collection: "proposals",
            id: "p1",
            value: { ...proposal, title: "Changed" },
          },
        ])
      ).status,
    ).toBe(403);
  });
  it("rejects forged incoming messages and audit writes", async () => {
    const initial = await workspace();
    const c = initial.workspace.conversations[0];
    expect(
      (
        await patch([
          {
            collection: "conversations",
            id: c.id,
            value: {
              ...c,
              messages: [
                ...c.messages,
                {
                  id: "forged",
                  direction: "in",
                  text: "yes",
                  at: new Date().toISOString(),
                  status: "Received",
                },
              ],
            },
          },
        ])
      ).status,
    ).toBe(422);
    expect(
      (
        await call("/workspace", "PATCH", {
          revision: initial.revision,
          changes: [{ collection: "activity", id: "fake", value: {} }],
        })
      ).status,
    ).toBe(422);
  });
});
describe("AI proposal drafting", () => {
  const suggestion = {
    title: "Conferencia audiovisual",
    introduction: "Propuesta preliminar para revisión.",
    items: [{ equipmentId: "q1", quantity: 2, days: 1 }],
    assumptions: ["Confirmar la duración."],
    questions: ["¿Se requiere personal técnico?"],
  };
  it("uses selected event context and catalog rates, returns a suggestion without mutating the proposal", async () => {
    generate.mockResolvedValue(suggestion);
    const before = await workspace();
    const result = await call("/ai/proposal-draft", "POST", {
      eventId: "e1",
      brief: "Dos altavoces para una conferencia de un día.",
    });
    expect(result.status).toBe(200);
    expect(result.json.suggestion.lines[0].rate).toBe(
      before.workspace.equipment.find((q) => q.id === "q1")!.rate,
    );
    expect(generate.mock.calls[0][0]).not.toHaveProperty("conversations");
    expect(generate.mock.calls[0][0].client).not.toHaveProperty("email");
    const after = await workspace();
    expect(after.workspace.proposals).toEqual(before.workspace.proposals);
    expect(after.revision).toBe(before.revision);
    const draft = before.workspace.proposals.find((p) => p.status === "Draft")!;
    expect(
      (
        await patch([
          {
            collection: "proposals",
            id: draft.id,
            value: { ...draft, ...result.json.suggestion },
          },
        ])
      ).status,
    ).toBe(200);
    expect(
      (await workspace()).workspace.proposals.find((p) => p.id === draft.id)
        ?.aiReview?.questions,
    ).toContain("¿Se requiere personal técnico?");
  });
  it("rejects unknown equipment, injected prices, and unauthorized roles before generating", async () => {
    const technician = await account("Technician", { eventIds: ["e1"] });
    expect(
      (
        await call(
          "/ai/proposal-draft",
          "POST",
          { eventId: "e1", brief: "Draft this proposal" },
          technician,
        )
      ).status,
    ).toBe(403);
    expect(generate).not.toHaveBeenCalled();
    generate.mockResolvedValue({
      ...suggestion,
      items: [{ equipmentId: "missing", quantity: 1, days: 1 }],
    });
    expect(
      (
        await call("/ai/proposal-draft", "POST", {
          eventId: "e1",
          brief: "Draft this proposal",
        })
      ).status,
    ).toBe(502);
    generate.mockResolvedValue({
      ...suggestion,
      items: [{ equipmentId: "q1", quantity: 1, days: 1, rate: 1 }],
    });
    expect(
      (
        await call("/ai/proposal-draft", "POST", {
          eventId: "e1",
          brief: "Draft this proposal",
        })
      ).status,
    ).toBe(502);
  });
  it("does not return a suggestion if records change while the provider is running", async () => {
    generate.mockImplementation(async () => {
      const current = repo.read();
      repo.save(current.workspace, current.revision);
      return suggestion;
    });
    expect(
      (
        await call("/ai/proposal-draft", "POST", {
          eventId: "e1",
          brief: "Draft this proposal",
        })
      ).status,
    ).toBe(409);
  });
});
it("persists company records across repository restarts", () => {
  const dir = mkdtempSync(join(tmpdir(), "kit-persistence-"));
  const file = join(dir, "workspace.sqlite");
  try {
    const first = new Repository(file);
    first.db
      .prepare("INSERT INTO workspace VALUES (1,0,?)")
      .run(JSON.stringify(createSeed()));
    const previous = first.read();
    first.save(
      {
        ...previous.workspace,
        settings: {
          ...previous.workspace.settings,
          company: "Persistent company",
        },
      },
      0,
    );
    first.close();
    const second = new Repository(file);
    expect(second.read().workspace.settings.company).toBe("Persistent company");
    expect(second.read().revision).toBe(1);
    second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("uses account identity for technician assignments, not a matching display name", async () => {
  const technician = await account("Technician", { eventIds: ["e1"] });
  const initial = await workspace();
  const task = initial.workspace.tasks.find((t) => t.eventId === "e1")!;
  const unrelated = {
    ...task,
    id: "unassigned-same-name",
    assignee: "Test Person",
  };
  const assigned = {
    ...task,
    assignee: "Test Person",
    assigneeId: technician.id,
  };
  expect(
    (
      await patch([
        { collection: "tasks", id: task.id, value: assigned },
        { collection: "tasks", id: unrelated.id, value: unrelated },
      ])
    ).status,
  ).toBe(200);
  const scoped = await workspace(technician);
  expect(scoped.workspace.tasks.map((t) => t.id)).toEqual([task.id]);
  expect(
    (
      await patch(
        [
          {
            collection: "tasks",
            id: task.id,
            value: { ...assigned, done: !task.done },
          },
        ],
        undefined,
        technician,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await patch(
        [
          {
            collection: "tasks",
            id: unrelated.id,
            value: { ...unrelated, done: true },
          },
        ],
        undefined,
        technician,
      )
    ).status,
  ).toBe(403);
});
