import { describe, expect, it } from "vitest";
import {
  checkDesignInventory,
  designToProposal,
  eventDays,
  guestsFrom,
  sampleRefineSpec,
  sampleSpec,
  type DesignSpec,
} from "./kit-design";
import type {
  Equipment,
  ProductionEvent,
  Proposal,
  Reservation,
} from "./types";

const gear = (id: string, category: string, quantity = 10): Equipment => ({
  id,
  name: `${category} ${id}`,
  category,
  sku: id,
  quantity,
  maintenance: 0,
  rate: 100,
  description: "",
});
const catalog = [
  gear("a1", "Audio"),
  gear("a2", "Audio"),
  gear("l1", "Lighting"),
  gear("s1", "Staging"),
  gear("w1", "LED walls"),
  gear("c1", "Cables"),
];
let n = 0;
const newId = () => `id-${++n}`;

const event: ProductionEvent = {
  id: "e1",
  name: "Boda García",
  clientId: "c1",
  venueId: "v1",
  date: "2026-12-10",
  endDate: "2026-12-12",
  status: "Planning" as ProductionEvent["status"],
  type: "Boda",
  manager: "",
  budget: 0,
  attendees: 120,
  notes: "Notas",
  timezone: "America/Mexico_City",
};

const reservation = (
  eventId: string,
  equipmentId: string,
  quantity: number,
): Reservation => ({
  id: `r-${eventId}-${equipmentId}`,
  eventId,
  equipmentId,
  quantity,
  start: "2026-12-09",
  end: "2026-12-13",
  status: "Confirmed",
});

describe("KIT Design sample designer", () => {
  it("reads the guest count from the brief", () => {
    expect(guestsFrom("Boda para 120 invitados")).toBe(120);
    expect(guestsFrom("Cena de gala")).toBeUndefined();
  });

  it("builds a spec from catalog items, one view per image, with estimated measurements", () => {
    const spec = sampleSpec(
      "Boda para 120, escenario al fondo",
      [{ id: "img-1" }, { id: "img-2" }],
      catalog,
      newId,
    );
    expect(spec.room.measured).toBe("estimated");
    expect(spec.views.map((v) => v.sourceImageId)).toEqual(["img-1", "img-2"]);
    const ids = spec.items.flatMap((i) =>
      i.equipmentId ? [i.equipmentId] : [],
    );
    expect(ids).toEqual(["s1", "w1", "l1", "a1"]);
    const tables = spec.items.at(-1)!;
    expect(tables.equipmentId).toBeUndefined();
    expect(tables.quantity).toBe(12);
  });

  it("never asks for more units than the catalog has", () => {
    const spec = sampleSpec(
      "Conferencia",
      [{ id: "img-1" }],
      [gear("a1", "Audio", 1)],
      newId,
    );
    expect(spec.items).toEqual([
      expect.objectContaining({ equipmentId: "a1", quantity: 1 }),
    ]);
  });

  it("keeps items when refining and records the change on every view", () => {
    const spec = sampleSpec("Boda para 80", [{ id: "img-1" }], catalog, newId);
    const next = sampleRefineSpec(spec, "Más luz cálida");
    expect(next.items).toEqual(spec.items);
    expect(next.style.lighting).toBe("Más luz cálida");
    expect(next.views[0].prompt).toContain("Change: Más luz cálida");
    expect(spec.views[0].prompt).not.toContain("Change");
  });
});

describe("KIT Design business links", () => {
  const spec: DesignSpec = {
    room: { measured: "estimated", notes: "" },
    style: { mood: "", palette: [], lighting: "" },
    items: [
      { equipmentId: "a1", label: "Audio", quantity: 4, placement: "" },
      { equipmentId: "l1", label: "Luces", quantity: 6, placement: "" },
      { label: "Mesas redondas", quantity: 12, placement: "" },
      { equipmentId: "a1", label: "Audio extra", quantity: 2, placement: "" },
    ],
    views: [],
  };

  it("counts event days including both ends", () => {
    expect(eventDays("2026-12-10", "2026-12-12")).toBe(3);
    expect(eventDays("2026-12-10", "2026-12-10")).toBe(1);
    expect(eventDays("2026-12-10", "bad")).toBe(1);
  });

  it("flags shortages against other events' reservations, ignoring this event's own", () => {
    const checks = checkDesignInventory(spec, event, catalog, [
      reservation("e2", "a1", 7),
      reservation("e1", "l1", 9),
    ]);
    expect(checks).toEqual([
      expect.objectContaining({
        equipmentId: "a1",
        needed: 6,
        available: 3,
        short: 3,
      }),
      expect.objectContaining({
        equipmentId: "l1",
        needed: 6,
        available: 10,
        short: 0,
      }),
    ]);
  });

  it("creates a draft when the event has none, priced from the catalog for the event's days", () => {
    const plan = designToProposal({
      spec,
      event,
      proposals: [],
      equipment: catalog,
      newId,
      versionNumber: 1,
    });
    expect(plan.created).toBe(true);
    expect(plan.proposal).toMatchObject({ eventId: "e1", status: "Draft" });
    expect(plan.proposal.lines).toEqual([
      expect.objectContaining({
        equipmentId: "a1",
        quantity: 6,
        rate: 100,
        days: 3,
      }),
      expect.objectContaining({ equipmentId: "l1", quantity: 6, days: 3 }),
    ]);
    expect(plan.skipped).toEqual(["Mesas redondas"]);
  });

  it("updates the newest draft: adds missing lines and only ever raises quantities", () => {
    const draft = (version: number, lines: Proposal["lines"]): Proposal => ({
      id: `p${version}`,
      number: "KIT-1",
      eventId: "e1",
      version,
      title: "",
      introduction: "",
      terms: "",
      lines,
      discount: 0,
      tax: 0,
      status: "Draft",
      validUntil: "2026-12-10",
    });
    const older = draft(1, []);
    const newer = draft(2, [
      {
        id: "x",
        equipmentId: "a1",
        description: "Audio",
        quantity: 10,
        rate: 90,
        days: 1,
      },
      {
        id: "y",
        equipmentId: "l1",
        description: "Luces",
        quantity: 2,
        rate: 90,
        days: 1,
      },
    ]);
    const issued = { ...draft(3, []), status: "Issued" as const };
    const plan = designToProposal({
      spec,
      event,
      proposals: [older, newer, issued],
      equipment: catalog,
      newId,
      versionNumber: 2,
    });
    expect(plan.created).toBe(false);
    expect(plan.proposal.id).toBe("p2");
    expect(plan.changes).toEqual([
      { label: "Lighting l1", before: 2, after: 6 },
    ]);
    expect(
      plan.proposal.lines.find((l) => l.equipmentId === "a1")!.quantity,
    ).toBe(10);
    // The stored proposal is not mutated before the person confirms.
    expect(newer.lines[1].quantity).toBe(2);
  });
});
