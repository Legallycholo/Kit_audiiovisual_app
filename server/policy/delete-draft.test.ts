import { describe, expect, it } from "vitest";
import { createSeed } from "../../src/shared/seed";
import { roles, type Role, type WorkspaceUser } from "../../src/shared/access";
import type { Proposal, Workspace } from "../../src/shared/types";
import { deleteDraftProposal } from "./delete-draft";

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

const draft = (over: Partial<Proposal> = {}): Proposal => ({
  id: "p-draft",
  number: "KIT-2026-050",
  eventId: "e1",
  version: 1,
  title: "Borrador",
  introduction: "",
  terms: "",
  lines: [],
  discount: 0,
  tax: 0,
  status: "Draft",
  validUntil: "2026-12-01",
  ...over,
});
const workspaceWith = (proposal: Proposal): Workspace => {
  const workspace = createSeed();
  workspace.proposals.push(proposal);
  return workspace;
};

describe("deleting a draft proposal", () => {
  it("removes only that draft for administrators and sales managers", () => {
    for (const role of ["Administrator", "Sales Manager"] as const) {
      const before = workspaceWith(draft());
      const after = deleteDraftProposal(before, "p-draft", userFor(role));
      expect(after.proposals.map((p) => p.id)).toEqual(
        before.proposals.filter((p) => p.id !== "p-draft").map((p) => p.id),
      );
      // Nothing else is touched, and the input is not mutated.
      expect(before.proposals.some((p) => p.id === "p-draft")).toBe(true);
      expect(after.conversations).toEqual(before.conversations);
    }
  });

  it("can delete a draft that is not linked to an event", () => {
    const after = deleteDraftProposal(
      workspaceWith(draft({ eventId: "" })),
      "p-draft",
      userFor("Sales Manager"),
    );
    expect(after.proposals.some((p) => p.id === "p-draft")).toBe(false);
  });

  it("refuses every other role", () => {
    for (const role of roles.filter(
      (r) => r !== "Administrator" && r !== "Sales Manager",
    ))
      expect(
        () =>
          deleteDraftProposal(workspaceWith(draft()), "p-draft", userFor(role)),
        role,
      ).toThrowError(/rol no puede/);
  });

  it("refuses anything that is not a draft", () => {
    for (const status of [
      "In review",
      "Ready to send",
      "Issued",
      "Accepted",
      "Declined",
      "Superseded",
    ] as const)
      expect(
        () =>
          deleteDraftProposal(
            workspaceWith(draft({ status })),
            "p-draft",
            userFor("Administrator"),
          ),
        status,
      ).toThrowError(/Solo se pueden eliminar borradores/);
  });

  it("refuses a draft that a message or an automation points to", () => {
    const withMessage = workspaceWith(draft());
    withMessage.conversations[0].proposalId = "p-draft";
    expect(() =>
      deleteDraftProposal(withMessage, "p-draft", userFor("Administrator")),
    ).toThrowError(/mensajes o tareas/);
    const withAutomation = workspaceWith(draft());
    withAutomation.automations.push({
      id: "a1",
      key: "k",
      proposalId: "p-draft",
      kind: "Proposal review",
      title: "t",
      detail: "d",
      dueAt: "2026-12-01T00:00:00.000Z",
      action: "Review only",
      status: "Open",
      createdAt: "2026-11-01T00:00:00.000Z",
    });
    expect(() =>
      deleteDraftProposal(withAutomation, "p-draft", userFor("Administrator")),
    ).toThrowError(/mensajes o tareas/);
  });

  it("answers 'not found' for a missing proposal", () => {
    expect(() =>
      deleteDraftProposal(
        workspaceWith(draft()),
        "missing",
        userFor("Administrator"),
      ),
    ).toThrowError(/No se encontró/);
  });
});
