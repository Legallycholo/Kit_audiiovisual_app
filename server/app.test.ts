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
import type { MessageTransport } from "./messaging";

const origin = "http://localhost:5173";
const password = "only-for-automated-tests-123";
let repo: Repository;
let server: Server;
let url: string;
let owner: { cookie: string; csrf: string };
const generate = vi.fn<ProposalGenerator["generate"]>();
const sendMessage = vi.fn<MessageTransport["send"]>();
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
  sendMessage.mockReset();
  sendMessage.mockResolvedValue({
    externalId: "provider-message-1",
    status: "Delivered",
  });
  const app = createApp(repo, {
    origins: [origin],
    proposalGenerator: { model: "test-model", generate },
    messageTransport: { label: "Test channel", send: sendMessage },
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
  it("rejects invalid layout geometry and missing revision snapshots", async () => {
    const initial = await workspace();
    const layout = initial.workspace.layouts[0];
    const withoutSnapshot = await patch(
      [
        {
          collection: "layouts",
          id: layout.id,
          value: { ...layout, version: layout.version + 1, width: 25 },
        },
      ],
      initial.revision,
    );
    expect(withoutSnapshot.status).toBe(422);
    expect(withoutSnapshot.json.error).toContain("exact snapshot");

    const snapshot = {
      version: layout.version,
      objects: structuredClone(layout.objects),
      savedAt: new Date().toISOString(),
      width: layout.width,
      depth: layout.depth,
      verified: layout.verified,
      verifiedAt: layout.verifiedAt,
      verificationNote: layout.verificationNote,
    };
    const invalidGeometry = await patch(
      [
        {
          collection: "layouts",
          id: layout.id,
          value: {
            ...layout,
            version: layout.version + 1,
            objects: layout.objects.map((object, index) =>
              index === 0 ? { ...object, x: layout.width } : object,
            ),
            history: [...layout.history, snapshot],
          },
        },
      ],
      initial.revision,
    );
    expect(invalidGeometry.status).toBe(422);
    expect(invalidGeometry.json.error).toContain("excede el ancho");
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
  it("enforces readiness and closeout gates for event production states", async () => {
    const initial = await workspace();
    const accepted = await call("/conversations/m1/accept", "POST", {
      revision: initial.revision,
    });
    expect(accepted.status).toBe(200);
    const event = accepted.json.workspace.events.find(
      (item: { id: string }) => item.id === "e1",
    );
    const blocked = await patch(
      [
        {
          collection: "events",
          id: event.id,
          value: { ...event, status: "Preparation" },
        },
      ],
      accepted.json.revision,
    );
    expect(blocked.status).toBe(422);
    expect(blocked.json.error).toContain("Production readiness is incomplete");

    const reservations = accepted.json.workspace.reservations;
    const q3 = reservations.find(
      (reservation: { id: string }) => reservation.id === "res2",
    );
    const ready = await patch(
      [
        {
          collection: "reservations",
          id: q3.id,
          value: { ...q3, status: "Confirmed" },
        },
        {
          collection: "reservations",
          id: "res3",
          value: {
            id: "res3",
            eventId: "e1",
            equipmentId: "q4",
            quantity: 12,
            start: event.date,
            end: event.endDate,
            status: "Confirmed",
          },
        },
        {
          collection: "events",
          id: event.id,
          value: { ...event, status: "Preparation" },
        },
      ],
      accepted.json.revision,
    );
    expect(ready.status).toBe(200);
    expect(
      ready.json.workspace.events.find(
        (item: { id: string }) => item.id === "e1",
      ).status,
    ).toBe("Preparation");

    const preparedEvent = ready.json.workspace.events.find(
      (item: { id: string }) => item.id === "e1",
    );
    const started = await patch(
      [
        {
          collection: "events",
          id: preparedEvent.id,
          value: { ...preparedEvent, status: "In production" },
        },
      ],
      ready.json.revision,
    );
    expect(started.status).toBe(200);
    const activeEvent = started.json.workspace.events.find(
      (item: { id: string }) => item.id === "e1",
    );
    expect(
      (
        await patch(
          [
            {
              collection: "events",
              id: activeEvent.id,
              value: { ...activeEvent, status: "Completed" },
            },
          ],
          started.json.revision,
        )
      ).status,
    ).toBe(422);

    const closingChanges: WorkspaceChange[] = [
      ...started.json.workspace.tasks
        .filter((task: { eventId: string }) => task.eventId === "e1")
        .map((task: { id: string }) => ({
          collection: "tasks" as const,
          id: task.id,
          value: { ...task, done: true },
        })),
      ...started.json.workspace.reservations
        .filter(
          (reservation: { eventId: string }) => reservation.eventId === "e1",
        )
        .map((reservation: { id: string }) => ({
          collection: "reservations" as const,
          id: reservation.id,
          value: { ...reservation, status: "Returned" },
        })),
      {
        collection: "events",
        id: activeEvent.id,
        value: { ...activeEvent, status: "Completed" },
      },
    ];
    const closed = await patch(closingChanges, started.json.revision);
    expect(closed.status).toBe(200);
    expect(
      closed.json.workspace.events.find(
        (item: { id: string }) => item.id === "e1",
      ).status,
    ).toBe("Completed");
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
  it("requires the owner to send an immutable draft and records delivery", async () => {
    const initial = await workspace();
    const conversation = initial.workspace.conversations.find(
      (item) => item.id === "m1",
    )!;
    const draft = {
      id: "outgoing-test",
      direction: "out" as const,
      text: "Mensaje revisado para el cliente.",
      at: new Date().toISOString(),
      proposalId: conversation.proposalId,
      proposalVersion: conversation.proposalVersion,
      status: "Draft" as const,
    };
    const saved = await patch([
      {
        collection: "conversations",
        id: conversation.id,
        value: {
          ...conversation,
          messages: [...conversation.messages, draft],
        },
      },
    ]);
    expect(saved.status).toBe(200);
    const sales = await account("Sales Manager");
    expect(
      (
        await call(
          `/conversations/${conversation.id}/messages/${draft.id}/send`,
          "POST",
          { revision: saved.json.revision },
          sales,
        )
      ).status,
    ).toBe(403);
    const sent = await call(
      `/conversations/${conversation.id}/messages/${draft.id}/send`,
      "POST",
      { revision: (await workspace()).revision },
    );
    expect(sent.status).toBe(200);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: draft.id,
        text: draft.text,
        proposalId: conversation.proposalId,
        proposalVersion: conversation.proposalVersion,
      }),
    );
    const stored = sent.json.workspace.conversations
      .find((item: { id: string }) => item.id === conversation.id)
      .messages.find((item: { id: string }) => item.id === draft.id);
    expect(stored).toMatchObject({
      status: "Delivered",
      channel: "Test channel",
      providerMessageId: "provider-message-1",
    });
    expect(
      (
        await call(
          `/conversations/${conversation.id}/messages/${draft.id}/send`,
          "POST",
          { revision: sent.json.revision },
        )
      ).status,
    ).toBe(422);
  });
  it("keeps a failed provider attempt visible without changing its content", async () => {
    sendMessage.mockRejectedValueOnce(new Error("private provider failure"));
    const initial = await workspace();
    const conversation = initial.workspace.conversations.find(
      (item) => item.id === "m2",
    )!;
    const draft = {
      id: "failed-outgoing-test",
      direction: "out" as const,
      text: "Este texto debe conservarse.",
      at: new Date().toISOString(),
      status: "Draft" as const,
    };
    const saved = await patch([
      {
        collection: "conversations",
        id: conversation.id,
        value: {
          ...conversation,
          messages: [...conversation.messages, draft],
        },
      },
    ]);
    const result = await call(
      `/conversations/${conversation.id}/messages/${draft.id}/send`,
      "POST",
      { revision: saved.json.revision },
    );
    expect(result.status).toBe(502);
    const stored = repo
      .read()
      .workspace.conversations.find((item) => item.id === conversation.id)!
      .messages.find((item) => item.id === draft.id)!;
    expect(stored).toMatchObject({
      text: draft.text,
      status: "Failed",
      channel: "Test channel",
    });
    expect(stored.failureReason).not.toContain("private provider failure");
  });
  it("deduplicates inbound acceptance signals and preserves exact evidence", async () => {
    const current = repo.read();
    const conversation = current.workspace.conversations.find(
      (item) => item.id === "m1",
    )!;
    conversation.review = "None";
    conversation.reviewMessageId = undefined;
    repo.save(current.workspace, current.revision);
    const body = {
      externalId: "inbound-exact-1",
      channel: "Test channel",
      conversationId: "m1",
      text: "Aceptamos la versión 2.",
      receivedAt: new Date().toISOString(),
      acceptanceSignal: true,
      proposalId: "p1",
      proposalVersion: 2,
    };
    const first = await call("/messaging/showcase/inbound", "POST", body);
    expect(first.status).toBe(201);
    expect(first.json.intake).toEqual({
      duplicate: false,
      needsLinking: false,
    });
    const pending = first.json.workspace.conversations.find(
      (item: { id: string }) => item.id === "m1",
    );
    expect(pending.review).toBe("Pending");
    const source = pending.messages.find(
      (item: { providerMessageId?: string }) =>
        item.providerMessageId === body.externalId,
    );
    expect(pending.reviewMessageId).toBe(source.id);
    const duplicate = await call("/messaging/showcase/inbound", "POST", body);
    expect(duplicate.status).toBe(200);
    expect(duplicate.json.intake.duplicate).toBe(true);
    expect(
      duplicate.json.workspace.conversations.find(
        (item: { id: string }) => item.id === "m1",
      ).messages,
    ).toHaveLength(pending.messages.length);
    const accepted = await call("/conversations/m1/accept", "POST", {
      revision: duplicate.json.revision,
    });
    expect(accepted.status).toBe(200);
    expect(
      accepted.json.workspace.conversations.find(
        (item: { id: string }) => item.id === "m1",
      ).acceptanceEvidence,
    ).toMatchObject({
      messageId: source.id,
      proposalId: "p1",
      proposalVersion: 2,
      ownerId: (await workspace()).user.id,
    });
  });
  it("routes an acceptance signal without an exact offer to linking review", async () => {
    const sales = await account("Sales Manager");
    const body = {
      externalId: "inbound-ambiguous-1",
      channel: "Test channel",
      conversationId: "m2",
      text: "Sí, adelante.",
      receivedAt: new Date().toISOString(),
      acceptanceSignal: true,
    };
    expect(
      (await call("/messaging/showcase/inbound", "POST", body, sales)).status,
    ).toBe(403);
    const result = await call("/messaging/showcase/inbound", "POST", body);
    expect(result.status).toBe(201);
    expect(result.json.intake.needsLinking).toBe(true);
    const conversation = result.json.workspace.conversations.find(
      (item: { id: string }) => item.id === "m2",
    );
    expect(conversation.review).toBe("Needs linking");
    expect(conversation.reviewMessageId).toBeTruthy();
    expect(conversation.acceptanceEvidence).toBeUndefined();
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
