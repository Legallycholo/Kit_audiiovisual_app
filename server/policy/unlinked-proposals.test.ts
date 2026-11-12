import { describe, expect, it } from "vitest";
import { createSeed } from "../../src/shared/seed";
import { roles, type Role, type WorkspaceUser } from "../../src/shared/access";
import type { Proposal, Workspace } from "../../src/shared/types";
import { applyChanges } from "./changes";
import { scopeWorkspace } from "./scope";

const userFor = (role: Role, extra: Partial<WorkspaceUser> = {}) =>
  ({
    id: `u-${role}`,
    name: role,
    email: `${role.replace(/\W/g, "")}@example.test`,
    role,
    isOwner: role === "Administrator",
    active: true,
    eventIds: ["e1"],
    sharedProposalIds: [],
    ...extra,
  }) satisfies WorkspaceUser;

/** A KIT Classic draft that is not linked to an event yet. */
const unlinked = (workspace: Workspace): Proposal => ({
  id: "p-unlinked",
  number: "KIT-2026-099",
  eventId: "",
  version: 1,
  title: "Nueva propuesta",
  introduction: "",
  terms: "Sujeto a revisión.",
  lines: [],
  discount: 0,
  tax: 0,
  status: "Draft",
  validUntil: workspace.events[0].date,
  presentationTemplate: "Classic",
  clientSnapshot: { name: "Cliente nuevo", contact: "", email: "", phone: "" },
});
const withUnlinked = () => {
  const workspace = createSeed();
  workspace.proposals.push(unlinked(workspace));
  return workspace;
};
const ids = (workspace: Workspace) => workspace.proposals.map((p) => p.id);

describe("proposals that are not linked to an event", () => {
  it("are visible to administrators and sales managers only", () => {
    const workspace = withUnlinked();
    for (const role of roles) {
      const scoped = scopeWorkspace(workspace, userFor(role));
      expect(ids(scoped).includes("p-unlinked"), role).toBe(
        role === "Administrator" || role === "Sales Manager",
      );
    }
  });

  it("are never shown to a client, even when shared and issued", () => {
    const workspace = withUnlinked();
    workspace.proposals.at(-1)!.status = "Issued";
    for (const clientId of [undefined, "c1"]) {
      const scoped = scopeWorkspace(
        workspace,
        userFor("Client / Guest", {
          clientId,
          sharedProposalIds: ["p-unlinked"],
        }),
      );
      expect(ids(scoped)).not.toContain("p-unlinked");
    }
  });

  it("can be created by administrators and sales managers, not by other roles", () => {
    const base = createSeed();
    const draft = unlinked(base);
    const create = (role: Role) => () =>
      applyChanges(
        base,
        [{ collection: "proposals", id: draft.id, value: draft }],
        userFor(role),
      );
    for (const role of ["Administrator", "Sales Manager"] as const)
      expect(ids(create(role)()), role).toContain("p-unlinked");
    for (const role of [
      "Event Designer",
      "Production Manager",
      "Technician",
      "Client / Guest",
    ] as const)
      expect(create(role), role).toThrow();
  });

  it("keep the event they are linked to once they have one", () => {
    const base = withUnlinked();
    const linked = { ...base.proposals.at(-1)!, eventId: "e1" };
    const afterLink = applyChanges(
      base,
      [{ collection: "proposals", id: linked.id, value: linked }],
      userFor("Administrator"),
    );
    expect(afterLink.proposals.at(-1)!.eventId).toBe("e1");
    const moved = { ...linked, eventId: "e2" };
    expect(() =>
      applyChanges(
        afterLink,
        [{ collection: "proposals", id: moved.id, value: moved }],
        userFor("Administrator"),
      ),
    ).toThrow(/cannot be moved between events/);
  });
});
