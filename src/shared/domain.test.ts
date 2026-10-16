import { describe, expect, it } from "vitest";
import {
  acceptConversation,
  actualEventCosts,
  availableStock,
  crewShiftConflicts,
  createProposalRevision,
  layoutSvg,
  inventoryConflicts,
  productionReadiness,
  quoteTotals,
  reconcileLayoutEquipment,
  reviseProposal,
  validateLayoutGeometry,
  validateReservation,
} from "./domain";
import { createSeed } from "./seed";
import { createShowcaseCreativeAsset } from "./creative";
import {
  createCreativeProposalVisual,
  createLayoutProposalVisual,
  createVisualNarrative,
} from "./proposal-visuals";
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
  it("does not consume owned stock for supplier rentals and reserves substitute stock", () => {
    const supplier = {
      ...allocation("supplier", "2026-10-01", "2026-10-05", 10),
      source: "Supplier" as const,
      supplier: "Rental partner",
    };
    expect(availableStock(item, [supplier], "2026-10-01", "2026-10-05")).toBe(
      8,
    );
    const substitute = {
      ...allocation("substitute", "2026-10-01", "2026-10-05", 3),
      equipmentId: "requested-item",
      substituteEquipmentId: "gear",
    };
    expect(availableStock(item, [substitute], "2026-10-01", "2026-10-05")).toBe(
      5,
    );
  });
  it("identifies the events affected when maintenance reduces committed capacity", () => {
    const workspace = createSeed();
    const equipment = workspace.equipment.find((item) => item.id === "q1")!;
    equipment.maintenance = equipment.quantity - 4;
    const conflict = inventoryConflicts(workspace).find(
      (item) => item.equipmentId === "q1",
    );
    expect(conflict).toMatchObject({ reserved: 8, capacity: 4 });
    expect(conflict?.eventIds).toContain("e1");
  });
});

describe("advanced production operations", () => {
  it("detects crew overlaps across events and ignores cancelled shifts", () => {
    const workspace = createSeed();
    const existing = workspace.operations[0].crewShifts[0];
    const conflict = {
      ...existing,
      id: "new-shift",
      start: existing.start,
      end: existing.end,
    };
    expect(
      crewShiftConflicts(workspace.operations, conflict, "e2"),
    ).toHaveLength(1);
    expect(
      crewShiftConflicts(
        workspace.operations,
        { ...conflict, status: "Cancelled" },
        "e2",
      ),
    ).toEqual([]);
  });

  it("reconciles crew, transport, supplier, repair, and entered actual costs", () => {
    const workspace = createSeed();
    const operation = workspace.operations[0];
    operation.transports.push({
      id: "transport-cost",
      kind: "Outbound",
      provider: "KIT",
      vehicle: "Truck 1",
      driver: "Ana",
      departureAt: operation.crewShifts[0].start,
      arrivalAt: operation.crewShifts[0].end,
      status: "Complete",
      cost: 125,
      notes: "",
    });
    operation.costs.push({
      id: "other-cost",
      category: "Other",
      description: "Consumables",
      amount: 25,
      incurredAt: workspace.events.find((event) => event.id === "e3")!.date,
    });
    workspace.reservations.push({
      id: "supplier-cost",
      eventId: "e3",
      equipmentId: "q2",
      quantity: 2,
      start: workspace.events[2].date,
      end: workspace.events[2].endDate,
      status: "Confirmed",
      source: "Supplier",
      supplier: "Rental partner",
      unitCost: 50,
    });
    expect(actualEventCosts(workspace, "e3")).toMatchObject({
      crew: 480,
      transport: 125,
      supplierRentals: 100,
      recorded: 25,
      total: 730,
    });
  });

  it("requires operational cues, shifts, and transport to reconcile before closeout", () => {
    const workspace = createSeed();
    workspace.events.find((event) => event.id === "e3")!.status =
      "In production";
    workspace.tasks
      .filter((task) => task.eventId === "e3")
      .forEach((task) => (task.done = true));
    const readiness = productionReadiness(workspace, "e3");
    expect(readiness.closeoutBlockers).toContain(
      "Completa o cancela todos los turnos de personal.",
    );
    expect(readiness.closeoutBlockers).toContain(
      "Completa u omite todos los cues del run of show.",
    );
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
    layout.cameras = [
      {
        id: "camera-1",
        name: "Vista 1",
        position: { x: 1, y: 1, z: 1 },
        target: { x: 1, y: 1, z: 1 },
        createdAt: new Date().toISOString(),
      },
      {
        id: "camera-1",
        name: "Vista duplicada",
        position: { x: 5, y: 5, z: 5 },
        target: { x: 0, y: 0, z: 0 },
        createdAt: new Date().toISOString(),
      },
    ];
    expect(validateLayoutGeometry(layout)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("identidades únicas"),
        expect.stringContaining("posición de cámara inválida"),
      ]),
    );
  });

  it("exports a self-contained dimensioned SVG with escaped labels", () => {
    const workspace = createSeed();
    const layout = structuredClone(workspace.layouts[0]);
    layout.objects[0].label = "Stage <Main>";
    layout.objects[0].surfaceColor = "#123456";
    layout.objects[0].surfaceLabel = "KIT & Partners";
    const svg = layoutSvg(layout, workspace.equipment);
    expect(svg).toContain("<svg");
    expect(svg).toContain("24 m × 26 m");
    expect(svg).toContain("KIT &amp; Partners");
    expect(svg).toContain("#123456");
    expect(svg).toContain("MEDIDAS NO VERIFICADAS");
  });
});

describe("creative concept provenance", () => {
  it("creates labeled local revisions without losing references or the source brief", () => {
    const first = createShowcaseCreativeAsset({
      id: "concept-1",
      eventId: "e2",
      eventName: "Northstar Annual Conference",
      kind: "Stage concept",
      brief: "A warm keynote stage with layered screens and amber light.",
      referenceIds: ["brand-1", "brand-1"],
      referenceNames: ["northstar-logo.png"],
      generatedAt: "2026-10-15T12:00:00.000Z",
    });
    const revision = createShowcaseCreativeAsset({
      id: "concept-2",
      eventId: "e2",
      eventName: "Northstar Annual Conference",
      kind: "Stage concept",
      brief: "Keep the warm keynote stage and add a centered logo treatment.",
      referenceIds: ["brand-1"],
      referenceNames: ["northstar-logo.png"],
      generatedAt: "2026-10-15T12:05:00.000Z",
      parent: first,
    });
    expect(first).toMatchObject({
      revision: 1,
      status: "In review",
      provider: "Local showcase",
      model: "local-concept-v1",
      referenceIds: ["brand-1"],
      estimatedCost: 0,
    });
    expect(first.dataUrl).toContain("LOCAL%20SHOWCASE");
    expect(revision).toMatchObject({ revision: 2, parentId: "concept-1" });
    expect(revision.brief).toContain("centered logo treatment");

    const edited = createShowcaseCreativeAsset({
      id: "concept-3",
      eventId: "e2",
      eventName: "Northstar Annual Conference",
      kind: "Image edit",
      brief: "Apply the event palette over this authorized reference image.",
      referenceIds: ["brand-1"],
      referenceNames: ["northstar-logo.png"],
      referenceDataUrls: ["data:image/png;base64,c291cmNl"],
      generatedAt: "2026-10-15T12:10:00.000Z",
    });
    expect(decodeURIComponent(edited.dataUrl)).toContain(
      'href="data:image/png;base64,c291cmNl"',
    );
  });
});

describe("proposal visual snapshots", () => {
  it("captures exact approved creative and layout revisions for client output", () => {
    const workspace = createSeed();
    const concept = createShowcaseCreativeAsset({
      id: "approved-concept",
      eventId: "e1",
      eventName: "Oceanfront Partner Summit",
      kind: "Event concept",
      brief: "A warm coastal visual direction with an elegant keynote stage.",
      referenceIds: [],
      referenceNames: [],
      generatedAt: "2026-10-15T12:00:00.000Z",
    });
    concept.status = "Approved";
    concept.reviewedAt = "2026-10-15T12:01:00.000Z";
    const creative = createCreativeProposalVisual({
      id: "proposal-creative",
      asset: concept,
      addedAt: "2026-10-15T12:02:00.000Z",
    });
    const plan = createLayoutProposalVisual({
      id: "proposal-plan",
      layout: workspace.layouts[0],
      view: "Layout plan",
      addedAt: "2026-10-15T12:03:00.000Z",
    });
    const scene = createLayoutProposalVisual({
      id: "proposal-scene",
      layout: workspace.layouts[0],
      view: "Layout 3D",
      addedAt: "2026-10-15T12:04:00.000Z",
    });
    const savedPlan = plan.dataUrl;
    workspace.layouts[0].objects[0].label = "Changed after capture";
    expect(creative.dataUrl).toBe(concept.dataUrl);
    expect(plan).toMatchObject({
      sourceType: "Layout plan",
      sourceRevision: 1,
      measurementStatus: "Unverified",
    });
    expect(decodeURIComponent(plan.dataUrl)).toContain("PLANO 2D");
    expect(decodeURIComponent(scene.dataUrl)).toContain("VISTA 3D");
    expect(plan.dataUrl).toBe(savedPlan);
    expect(decodeURIComponent(plan.dataUrl)).not.toContain(
      "Changed after capture",
    );
    expect(
      createVisualNarrative("Oceanfront Partner Summit", [
        creative,
        plan,
        scene,
      ]),
    ).toContain("la dirección creativa aprobada, la distribución propuesta y");
  });

  it("carries selected visuals into a new draft with distinct identities", () => {
    const workspace = createSeed();
    const proposal = workspace.proposals[0];
    proposal.visuals = [
      createLayoutProposalVisual({
        id: "old-visual",
        layout: workspace.layouts[0],
        view: "Layout plan",
        addedAt: "2026-10-15T12:00:00.000Z",
      }),
    ];
    const revision = reviseProposal(proposal);
    expect(revision.visuals).toHaveLength(1);
    expect(revision.visuals?.[0].id).not.toBe("old-visual");
    expect(revision.visuals?.[0].dataUrl).toBe(proposal.visuals[0].dataUrl);
  });
});
