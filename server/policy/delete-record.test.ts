import { describe, expect, it } from "vitest";
import { createSeed } from "../../src/shared/seed";
import { type Role, type WorkspaceUser } from "../../src/shared/access";
import type { Workspace } from "../../src/shared/types";
import { deleteRecord } from "./delete-record";

const userFor = (role: Role, eventIds: string[] = []) =>
  ({
    id: `u-${role}`,
    name: role,
    email: `${role.replace(/\W/g, "")}@example.test`,
    role,
    isOwner: role === "Administrator",
    active: true,
    eventIds,
    sharedProposalIds: [],
  }) satisfies WorkspaceUser;
const admin = userFor("Administrator");

/** Spare records nothing points to. */
const withSpares = (): Workspace => {
  const w = createSeed();
  w.venues.push({ ...w.venues[0], id: "v-spare", name: "Lugar libre" });
  w.equipment.push({
    ...w.equipment[0],
    id: "q-spare",
    name: "Equipo libre",
    sku: "SKU-LIBRE",
  });
  w.events.push({
    ...w.events[0],
    id: "e-spare",
    name: "Evento libre",
    clientId: "",
    venueId: "",
  });
  return w;
};

describe("deleting events, venues and equipment", () => {
  it("removes only the record, leaving the input untouched", () => {
    for (const [kind, id] of [
      ["events", "e-spare"],
      ["venues", "v-spare"],
      ["equipment", "q-spare"],
    ] as const) {
      const before = withSpares();
      const { workspace, label } = deleteRecord(before, kind, id, admin);
      expect(workspace[kind].some((r) => r.id === id)).toBe(false);
      expect(workspace[kind]).toHaveLength(before[kind].length - 1);
      expect(before[kind].some((r) => r.id === id)).toBe(true);
      expect(label).toBeTruthy();
    }
  });
  it("lets an event exist without a client and delete it", () => {
    const { workspace } = deleteRecord(
      withSpares(),
      "events",
      "e-spare",
      admin,
    );
    expect(workspace.events.some((e) => e.id === "e-spare")).toBe(false);
  });
  it("keeps anything something points to", () => {
    const w = withSpares();
    expect(() => deleteRecord(w, "venues", "v1", admin)).toThrowError(
      /se usa en eventos/,
    );
    expect(() => deleteRecord(w, "equipment", "q1", admin)).toThrowError(
      /se usa en eventos/,
    );
    expect(() => deleteRecord(w, "events", "e1", admin)).toThrowError(
      /ya tiene propuestas, tareas/,
    );
    // A nested reference counts too: a reservation on the spare event.
    const reserved = withSpares();
    reserved.reservations.push({
      ...reserved.reservations[0],
      id: "res-x",
      eventId: "e-spare",
    });
    expect(() =>
      deleteRecord(reserved, "events", "e-spare", admin),
    ).toThrowError(/ya tiene propuestas, tareas/);
  });
  it("refuses roles that cannot edit the list", () => {
    expect(() =>
      deleteRecord(withSpares(), "venues", "v-spare", userFor("Technician")),
    ).toThrowError(/rol no puede/);
    expect(() =>
      deleteRecord(withSpares(), "equipment", "q-spare", userFor("Technician")),
    ).toThrowError(/rol no puede/);
  });
  it("hides events a person does not own and reports missing records", () => {
    expect(() =>
      deleteRecord(
        withSpares(),
        "events",
        "e-spare",
        userFor("Production Manager", ["e1"]),
      ),
    ).toThrowError(/No se encontró/);
    expect(() =>
      deleteRecord(withSpares(), "venues", "nope", admin),
    ).toThrowError(/No se encontró/);
  });
});
