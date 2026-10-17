import { describe, expect, it } from "vitest";
import { createSeed } from "../../src/shared/seed";
import {
  canEditCollection,
  collections,
  roles,
  type Role,
  type WorkspaceUser,
} from "../../src/shared/access";
import type { Workspace } from "../../src/shared/types";
import { scopeWorkspace } from "./scope";

// e1 belongs to client c1 and has issued proposal p1; e2 has draft p2.
const userFor = (role: Role, extra: Partial<WorkspaceUser> = {}) =>
  ({
    id: `u-${role}`,
    name: role,
    email: `${role.replace(/\W/g, "")}@example.test`,
    role,
    isOwner: false,
    active: true,
    eventIds: ["e1"],
    sharedProposalIds: [],
    ...extra,
  }) satisfies WorkspaceUser;

const seeded = (): Workspace => {
  const workspace = createSeed();
  workspace.tasks.push({
    id: "t-tech",
    eventId: "e1",
    title: "Probar micrófonos",
    assignee: "Technician",
    assigneeId: "u-Technician",
    role: "Audio",
    date: workspace.events[0].date,
    done: false,
    phase: "Preparation",
  });
  workspace.operations.push({
    id: "ops-e1",
    eventId: "e1",
    crewShifts: [
      {
        id: "s-tech",
        person: "Technician",
        memberId: "u-Technician",
        role: "Audio",
        start: `${workspace.events[0].date}T08:00:00.000Z`,
        end: `${workspace.events[0].date}T18:00:00.000Z`,
        status: "Scheduled",
        cost: 300,
      },
      {
        id: "s-other",
        person: "Otra persona",
        memberId: "u-other",
        role: "Luces",
        start: `${workspace.events[0].date}T08:00:00.000Z`,
        end: `${workspace.events[0].date}T18:00:00.000Z`,
        status: "Scheduled",
        cost: 280,
      },
    ],
    cues: [],
    transports: [],
    changes: [],
    costs: [
      {
        id: "cost1",
        category: "Other",
        description: "Parqueo",
        amount: 40,
        incurredAt: new Date().toISOString(),
      },
    ],
  });
  workspace.proposals[0].aiReview = {
    brief: "Nota interna",
    assumptions: ["Interna"],
    questions: [],
    generatedAt: new Date().toISOString(),
    model: "test",
  };
  return workspace;
};
const eventIds = (workspace: Workspace) => workspace.events.map((e) => e.id);

describe("read scoping by role", () => {
  it("returns the workspace unchanged for administrators", () => {
    const workspace = seeded();
    expect(scopeWorkspace(workspace, userFor("Administrator"))).toBe(workspace);
  });

  it("gives sales managers all events, rates and conversations but no maintenance or automations", () => {
    const scoped = scopeWorkspace(seeded(), userFor("Sales Manager"));
    expect(eventIds(scoped)).toEqual(["e1", "e2", "e3", "e4"]);
    expect(scoped.equipment.every((q) => q.rate > 0)).toBe(true);
    expect(scoped.conversations).toHaveLength(3);
    expect(scoped.events.find((e) => e.id === "e1")!.budget).toBeGreaterThan(0);
    expect(scoped.maintenanceRecords).toEqual([]);
    expect(scoped.automations).toEqual([]);
  });

  it("limits event designers to assigned events and hides rates, budgets and conversations", () => {
    const scoped = scopeWorkspace(seeded(), userFor("Event Designer"));
    expect(eventIds(scoped)).toEqual(["e1"]);
    expect(scoped.equipment.every((q) => q.rate === 0)).toBe(true);
    expect(scoped.events[0].budget).toBe(0);
    expect(scoped.conversations).toEqual([]);
    expect(scoped.proposals).toEqual([]);
    expect(scoped.layouts.map((l) => l.eventId)).toEqual(["e1"]);
    expect(scoped.settings.email).toBe("");
  });

  it("gives production managers rates, maintenance and full operations for assigned events", () => {
    const scoped = scopeWorkspace(seeded(), userFor("Production Manager"));
    expect(eventIds(scoped)).toEqual(["e1"]);
    expect(scoped.equipment.every((q) => q.rate > 0)).toBe(true);
    expect(scoped.maintenanceRecords).toHaveLength(1);
    expect(scoped.events[0].budget).toBe(0);
    const operation = scoped.operations.find((o) => o.eventId === "e1")!;
    expect(operation.crewShifts.map((s) => s.cost)).toEqual([300, 280]);
    expect(operation.costs).toHaveLength(1);
    expect(scoped.reservations.every((r) => r.eventId === "e1")).toBe(true);
  });

  it("shows technicians only their own tasks and shifts, without costs", () => {
    const scoped = scopeWorkspace(seeded(), userFor("Technician"));
    expect(scoped.tasks.map((t) => t.id)).toEqual(["t-tech"]);
    const operation = scoped.operations.find((o) => o.eventId === "e1")!;
    expect(operation.crewShifts).toEqual([
      expect.objectContaining({ id: "s-tech", cost: 0 }),
    ]);
    expect(operation.costs).toEqual([]);
    expect(operation.changes).toEqual([]);
    expect(scoped.conversations).toEqual([]);
    expect(scoped.equipment.every((q) => q.rate === 0)).toBe(true);
  });

  it("shows clients only explicitly shared, issued revisions without internal notes", () => {
    const shared = userFor("Client / Guest", {
      eventIds: [],
      clientId: "c1",
      sharedProposalIds: ["p1", "p2"],
    });
    const scoped = scopeWorkspace(seeded(), shared);
    // p2 is a draft of another client's event and must never be exposed.
    expect(scoped.proposals.map((p) => p.id)).toEqual(["p1"]);
    expect(scoped.proposals[0]).not.toHaveProperty("aiReview");
    expect(eventIds(scoped)).toEqual(["e1"]);
    expect(scoped.events[0]).toMatchObject({ budget: 0, notes: "" });
    expect(scoped.clients.map((c) => c.id)).toEqual(["c1"]);
    expect(scoped.clients[0]).toMatchObject({ email: "", notes: "" });
    for (const key of [
      "equipment",
      "venues",
      "tasks",
      "reservations",
      "packages",
      "operations",
      "layouts",
      "conversations",
      "activity",
    ] as const)
      expect(scoped[key], key).toEqual([]);
  });

  it("shows a client nothing until a revision is shared", () => {
    const scoped = scopeWorkspace(
      seeded(),
      userFor("Client / Guest", { eventIds: [], clientId: "c1" }),
    );
    expect(scoped.proposals).toEqual([]);
    expect(scoped.events).toEqual([]);
    expect(scoped.clients).toEqual([]);
  });
});

describe("edit permissions by role", () => {
  it("administrators edit everything and clients edit nothing", () => {
    for (const collection of [...collections, "settings" as const]) {
      expect(canEditCollection(userFor("Administrator"), collection)).toBe(
        true,
      );
      expect(canEditCollection(userFor("Client / Guest"), collection)).toBe(
        false,
      );
    }
  });

  it("technicians may only edit tasks, and no non-admin role edits settings or automations", () => {
    expect(
      collections.filter((c) => canEditCollection(userFor("Technician"), c)),
    ).toEqual(["tasks"]);
    for (const role of roles.filter((r) => r !== "Administrator")) {
      expect(canEditCollection(userFor(role), "settings"), role).toBe(false);
      expect(canEditCollection(userFor(role), "automations"), role).toBe(false);
    }
  });
});
