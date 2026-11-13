import { describe, expect, it } from "vitest";
import { createSeed } from "../../src/shared/seed";
import { roles, type Role, type WorkspaceUser } from "../../src/shared/access";
import type { Client, Workspace } from "../../src/shared/types";
import { deleteClient } from "./delete-client";

const userFor = (role: Role) =>
  ({
    id: `u-${role}`,
    name: role,
    email: `${role.replace(/\W/g, "")}@example.test`,
    role,
    isOwner: role === "Administrator",
    active: true,
    eventIds: [],
    sharedProposalIds: [],
  }) satisfies WorkspaceUser;
const lonely: Client = {
  id: "c-lonely",
  name: "Sin eventos",
  contact: "",
  email: "",
  phone: "",
  industry: "Corporate",
  initials: "SE",
  color: "sage",
  notes: "",
};
const withLonely = (): Workspace => {
  const w = createSeed();
  w.clients.push(lonely);
  return w;
};

describe("deleting a client", () => {
  it("removes only that client for administrators and sales managers", () => {
    for (const role of ["Administrator", "Sales Manager"] as const) {
      const before = withLonely();
      const after = deleteClient(before, "c-lonely", userFor(role));
      expect(after.clients.some((c) => c.id === "c-lonely")).toBe(false);
      expect(after.clients).toHaveLength(before.clients.length - 1);
      expect(before.clients.some((c) => c.id === "c-lonely")).toBe(true);
    }
  });
  it("refuses roles that cannot edit clients", () => {
    for (const role of roles.filter(
      (r) => r !== "Administrator" && r !== "Sales Manager",
    ))
      expect(
        () => deleteClient(withLonely(), "c-lonely", userFor(role)),
        role,
      ).toThrowError(/rol no puede/);
  });
  it("keeps a client that has an event or a message thread", () => {
    const w = createSeed();
    const withEvent = w.events[0].clientId;
    expect(() =>
      deleteClient(w, withEvent, userFor("Administrator")),
    ).toThrowError(/eventos o mensajes/);
    const onlyThread = withLonely();
    onlyThread.conversations.push({
      ...onlyThread.conversations[0],
      id: "cv-x",
      clientId: "c-lonely",
    });
    expect(() =>
      deleteClient(onlyThread, "c-lonely", userFor("Administrator")),
    ).toThrowError(/eventos o mensajes/);
  });
  it("answers 'not found' for a missing client", () => {
    expect(() =>
      deleteClient(withLonely(), "nope", userFor("Administrator")),
    ).toThrowError(/No se encontró/);
  });
});
