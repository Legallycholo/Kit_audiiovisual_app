import { describe, expect, it } from "vitest";
import {
  acceptConversation,
  availableStock,
  createProposalRevision,
  layoutSvg,
  productionReadiness,
  quoteTotals,
  reconcileLayoutEquipment,
  reviseProposal,
  validateLayoutGeometry,
  validateReservation,
} from "./domain";
import { createSeed } from "./seed";
import type { Equipment, Reservation } from "./types";

describe("commercial calculations", () => {
  it("rounds line extensions to cents and applies discount before tax", () => {
    const totals = quoteTotals(
      [{ id: "1", description: "Rental", quantity: 3, rate: 19.995, days: 2 }],
      10,
      11.5,
    );
    expect(totals).toEqual({
      subtotal: 119.97,
      discount: 12,
      tax: 12.42,
      total: 120.39,
    });
  });
  it("rejects nonfinite, negative, and out-of-range commercial input", () => {
    expect(() => quoteTotals([], 101, 0)).toThrow();
    expect(() => quoteTotals([], 0, Number.NaN)).toThrow();
    expect(() =>
      quoteTotals(
        [{ id: "1", description: "Invalid", quantity: -1, rate: 10, days: 1 }],
        0,
        0,
      ),
    ).toThrow();
  });
  it("creates a distinct draft revision without changing accepted prices", () => {
    const original = createSeed().proposals[0];
    original.status = "Accepted";
    original.acceptedAt = "2026-10-15";
    const revised = reviseProposal(original);
    revised.lines[0].rate = 1;
    expect(original.lines[0].rate).toBe(85);
    expect(original.status).toBe("Accepted");
    expect(revised.version).toBe(3);
    expect(revised.status).toBe("Draft");
    expect(revised.acceptedAt).toBeUndefined();
    expect(revised.id).not.toBe(original.id);
  });
  it("preserves accepted history and reuses an existing newer draft", () => {
    const seed = createSeed();
    seed.proposals[0].status = "Accepted";
    const first = createProposalRevision(seed, "p1");
    expect(first.workspace.proposals.find((p) => p.id === "p1")?.status).toBe(
      "Accepted",
    );
    const second = createProposalRevision(first.workspace, "p1");
    expect(second.proposal.id).toBe(first.proposal.id);
    expect(second.workspace.proposals).toHaveLength(3);
  });
});
describe("time-window stock allocations", () => {
  const item: Equipment = {
    id: "gear",
    name: "Speaker",
    category: "Audio",
    sku: "A1",
    quantity: 10,
    maintenance: 2,
    rate: 80,
    description: "",
  };
  const allocation = (
    id: string,
    start: string,
    end: string,
    quantity: number,
    status: Reservation["status"] = "Confirmed",
  ): Reservation => ({
    id,
    equipmentId: "gear",
    eventId: "event",
    start,
    end,
    quantity,
    status,
  });
  it("counts holds and maintenance and includes both occupied boundary dates", () => {
    const reservations = [
      allocation("1", "2026-10-01", "2026-10-03", 3),
      allocation("2", "2026-10-03", "2026-10-05", 2, "Hold"),
    ];
    expect(availableStock(item, reservations, "2026-10-03", "2026-10-03")).toBe(
      3,
    );
  });
  it("does not add reservations which never overlap each other", () => {
    const reservations = [
      allocation("1", "2026-10-01", "2026-10-02", 5),
      allocation("2", "2026-10-03", "2026-10-05", 4),
    ];
    expect(availableStock(item, reservations, "2026-10-01", "2026-10-05")).toBe(
      3,
    );
  });
  it("ignores released allocations and prevents overbooking", () => {
    const reservations = [
      allocation("1", "2026-10-01", "2026-10-05", 8, "Returned"),
    ];
    expect(availableStock(item, reservations, "2026-10-01", "2026-10-05")).toBe(
      8,
    );
    expect(() =>
      validateReservation(
        item,
        reservations,
        allocation("2", "2026-10-01", "2026-10-05", 9),
      ),
    ).toThrow("Only 8");
  });
  it("rejects reversed windows and invalid quantities and excludes its own allocation during update", () => {
    const r = allocation("1", "2026-10-01", "2026-10-05", 8);
    expect(() => validateReservation(item, [r], r)).not.toThrow();
    expect(() =>
      validateReservation(item, [], { ...r, quantity: 1.5 }),
    ).toThrow();
    expect(() =>
      validateReservation(item, [], { ...r, end: "2026-09-30" }),
    ).toThrow();
  });
});
describe("owner acceptance review", () => {
  it("records acceptance against the exact issued revision without sending or allocating", () => {
    const before = createSeed();
    const after = acceptConversation(before, "m1");
    expect(before.proposals[0].status).toBe("Issued");
    expect(after.proposals[0].status).toBe("Accepted");
    expect(after.conversations[0].review).toBe("Confirmed");
    expect(after.conversations[0].acceptanceEvidence).toMatchObject({
      messageId: "msg2",
      proposalId: "p1",
      proposalVersion: 2,
    });
    expect(after.conversations[0].messages).toEqual(
      before.conversations[0].messages,
    );
    expect(after.reservations).toEqual(before.reservations);
    expect(after.events).toEqual(before.events);
    expect(after.activity[0].title).toBe("Owner confirmed client acceptance");
  });
  it("rejects a duplicate decision, old version, or draft instead of accepting it", () => {
    const before = createSeed();
    const after = acceptConversation(before, "m1");
    expect(() => acceptConversation(after, "m1")).toThrow("not awaiting");
    before.conversations[0].proposalVersion = 1;
    expect(() => acceptConversation(before, "m1")).toThrow(
      "current issued proposal",
    );
    before.conversations[0].proposalVersion = 2;
    before.proposals[0].status = "Draft";
    expect(() => acceptConversation(before, "m1")).toThrow(
      "current issued proposal",
    );
  });
  it("requires reconciliation when a newer draft exists", () => {
    const seed = createSeed();
    const next = createProposalRevision(seed, "p1");
    expect(() => acceptConversation(next.workspace, "m1")).toThrow(
      "newer proposal revision",
    );
  });
  it("rejects acceptance when the source message is not linked to the exact offer", () => {
    const seed = createSeed();
    seed.conversations[0].reviewMessageId = "msg4";
    expect(() => acceptConversation(seed, "m1")).toThrow(
      "exact proposal revision",
    );
  });
});

describe("production readiness and closeout", () => {
  it("keeps acceptance separate from confirmed equipment and crew gates", () => {
    const seed = createSeed();
    const accepted = acceptConversation(seed, "m1");
    const blocked = productionReadiness(accepted, "e1");
    expect(blocked.acceptedScopeReady).toBe(true);
    expect(blocked.equipmentReady).toBe(false);
    expect(blocked.crewReady).toBe(true);
    expect(blocked.ready).toBe(false);
    expect(accepted.events.find((event) => event.id === "e1")?.status).toBe(
      "Confirmed",
    );

    accepted.reservations = accepted.reservations.map((reservation) =>
      reservation.id === "res2"
        ? { ...reservation, status: "Confirmed" }
        : reservation,
    );
    const event = accepted.events.find((item) => item.id === "e1")!;
    accepted.reservations.push({
      id: "res3",
      eventId: "e1",
      equipmentId: "q4",
      quantity: 12,
      start: event.date,
      end: event.endDate,
      status: "Confirmed",
    });
    expect(productionReadiness(accepted, "e1").ready).toBe(true);
  });

  it("blocks a newer unreconciled revision and requires tasks and allocations to close", () => {
    const accepted = acceptConversation(createSeed(), "m1");
    const revision = createProposalRevision(accepted, "p1").workspace;
    expect(productionReadiness(revision, "e1").blockers).toContain(
      "Reconcilia el alcance aceptado con la versión más reciente de la propuesta.",
    );

    revision.events.find((event) => event.id === "e1")!.status =
      "In production";
    expect(productionReadiness(revision, "e1").closeoutReady).toBe(false);
    revision.tasks
      .filter((task) => task.eventId === "e1")
      .forEach((task) => (task.done = true));
    revision.reservations
      .filter((reservation) => reservation.eventId === "e1")
      .forEach((reservation) => (reservation.status = "Returned"));
    expect(productionReadiness(revision, "e1").closeoutReady).toBe(true);
  });
});

describe("structured layout production data", () => {
  it("reconciles represented equipment quantities without creating allocations", () => {
    const workspace = createSeed();
    const layout = workspace.layouts[0];
    const before = structuredClone(workspace.reservations);
    const initial = reconcileLayoutEquipment(workspace, layout);
    expect(initial.rows.find((row) => row.equipmentId === "q1")).toMatchObject({
      required: 8,
      mapped: 8,
      difference: 0,
    });
    expect(initial.rows.find((row) => row.equipmentId === "q4")).toMatchObject({
      required: 12,
      mapped: 0,
      difference: -12,
    });
    expect(initial.complete).toBe(false);

    const stage = layout.objects.find((object) => object.id === "stage1")!;
    stage.equipmentId = undefined;
    stage.equipmentQuantity = undefined;
    layout.objects.push({
      id: "lighting-package",
      kind: "Light",
      x: 1,
      y: 1,
      width: 1,
      depth: 1,
      height: 2,
      rotation: 0,
      label: "Lighting package",
      layer: "Lighting",
      equipmentId: "q4",
      equipmentQuantity: 12,
    });
    expect(reconcileLayoutEquipment(workspace, layout).complete).toBe(true);
    expect(workspace.reservations).toEqual(before);
  });

  it("rejects out-of-bounds geometry and incomplete measurement evidence", () => {
    const layout = structuredClone(createSeed().layouts[0]);
    layout.objects[0].x = layout.width;
    layout.verified = true;
    expect(validateLayoutGeometry(layout)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("excede el ancho"),
        expect.stringContaining("requiere fecha"),
      ]),
    );
  });

  it("exports a self-contained dimensioned SVG with escaped labels", () => {
    const workspace = createSeed();
    const layout = structuredClone(workspace.layouts[0]);
    layout.objects[0].label = "Stage <Main>";
    const svg = layoutSvg(layout, workspace.equipment);
    expect(svg).toContain("<svg");
    expect(svg).toContain("24 m × 26 m");
    expect(svg).toContain("Stage &lt;Main&gt;");
    expect(svg).toContain("MEDIDAS NO VERIFICADAS");
  });
});
