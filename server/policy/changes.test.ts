import { describe, expect, it } from "vitest";
import { createSeed } from "../../src/shared/seed";
import type { WorkspaceUser } from "../../src/shared/access";
import type {
  MaintenanceRecord,
  Reservation,
  Workspace,
} from "../../src/shared/types";
import { applyChanges } from "./changes";

const admin: WorkspaceUser = {
  id: "u-admin",
  name: "Administración",
  email: "admin@example.test",
  role: "Administrator",
  isOwner: true,
  active: true,
  eventIds: [],
  sharedProposalIds: [],
};
const shift = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const saveReservation = (workspace: Workspace, value: Reservation) =>
  applyChanges(
    workspace,
    [{ collection: "reservations", id: value.id, value }],
    admin,
  );
const saveMaintenance = (workspace: Workspace, value: MaintenanceRecord) =>
  applyChanges(
    workspace,
    [{ collection: "maintenanceRecords", id: value.id, value }],
    admin,
  );
const reservation = (workspace: Workspace, id: string) =>
  structuredClone(workspace.reservations.find((r) => r.id === id)!);

describe("allocation lifecycle rules", () => {
  it("allows only the documented status transitions", () => {
    const seed = createSeed();
    const held = reservation(seed, "res2");
    expect(() =>
      saveReservation(seed, { ...held, status: "Confirmed" }),
    ).not.toThrow();
    expect(() =>
      saveReservation(seed, { ...held, status: "Dispatched" }),
    ).toThrow("Allocation cannot move from Hold to Dispatched.");
    expect(() =>
      saveReservation(seed, { ...held, status: "Returned" }),
    ).toThrow("Allocation cannot move from Hold to Returned.");
  });

  it("requires new allocations to begin on hold or confirmed", () => {
    const seed = createSeed();
    const event = seed.events.find((e) => e.id === "e1")!;
    expect(() =>
      saveReservation(seed, {
        id: "res-new",
        eventId: "e1",
        equipmentId: "q2",
        quantity: 2,
        start: event.date,
        end: event.endDate,
        status: "Dispatched",
      }),
    ).toThrow("New allocations must begin on hold or confirmed.");
  });

  it("requires a recorded substitution instead of swapping equipment", () => {
    const seed = createSeed();
    expect(() =>
      saveReservation(seed, {
        ...reservation(seed, "res1"),
        equipmentId: "q2",
      }),
    ).toThrow("Change equipment through a recorded substitution.");
  });

  it("reconciles dispatched, returned and damaged quantities", () => {
    const seed = createSeed();
    const confirmed = reservation(seed, "res1");
    expect(() =>
      saveReservation(seed, {
        ...confirmed,
        status: "Dispatched",
        dispatchedQuantity: confirmed.quantity + 1,
      }),
    ).toThrow("Dispatched quantity exceeds the allocation.");

    const dispatched = saveReservation(seed, {
      ...confirmed,
      status: "Dispatched",
      dispatchedQuantity: 8,
    });
    const out = reservation(dispatched, "res1");
    expect(() =>
      saveReservation(dispatched, {
        ...out,
        status: "Returned",
        returnedQuantity: 6,
        damagedQuantity: 0,
      }),
    ).toThrow("A returned allocation must reconcile every dispatched unit.");
    expect(() =>
      saveReservation(dispatched, {
        ...out,
        status: "Returned",
        returnedQuantity: 7,
        damagedQuantity: 2,
      }),
    ).toThrow("Returned and damaged quantities exceed dispatch.");

    // A partial return with the remainder recorded as damaged reconciles.
    const returned = saveReservation(dispatched, {
      ...out,
      status: "Returned",
      returnedQuantity: 6,
      damagedQuantity: 2,
    });
    expect(reservation(returned, "res1").status).toBe("Returned");
    expect(() =>
      saveReservation(returned, {
        ...reservation(returned, "res1"),
        custodyNote: "Editado después del cierre",
      }),
    ).toThrow("Completed and cancelled allocations are immutable.");
  });

  it("rejects overbooking within the occupied window", () => {
    const seed = createSeed();
    const event = seed.events.find((e) => e.id === "e1")!;
    const q1 = seed.equipment.find((q) => q.id === "q1")!;
    // q1: 24 owned, 2 in maintenance, 8 already confirmed for e1.
    const free =
      q1.quantity - q1.maintenance - reservation(seed, "res1").quantity;
    const request = (quantity: number): Reservation => ({
      id: `res-q1-${quantity}`,
      eventId: "e1",
      equipmentId: "q1",
      quantity,
      start: event.date,
      end: event.endDate,
      status: "Hold",
    });
    expect(() => saveReservation(seed, request(free))).not.toThrow();
    expect(() => saveReservation(seed, request(free + 1))).toThrow(
      /Only \d+ units/,
    );
  });

  it("requires the occupied window to cover preparation and return buffers", () => {
    const seed = createSeed();
    const event = seed.events.find((e) => e.id === "e1")!;
    const base: Reservation = {
      id: "res-buffer",
      eventId: "e1",
      equipmentId: "q2",
      quantity: 2,
      start: event.date,
      end: event.endDate,
      status: "Hold",
      bufferBeforeDays: 1,
      bufferAfterDays: 1,
    };
    expect(() => saveReservation(seed, base)).toThrow(
      "The occupied window must include the event and its preparation/return buffers.",
    );
    expect(() =>
      saveReservation(seed, {
        ...base,
        start: shift(event.date, -1),
        end: shift(event.endDate, 1),
      }),
    ).not.toThrow();
  });

  it("blocks cancelling an event that still holds allocations", () => {
    const seed = createSeed();
    const event = seed.events.find((e) => e.id === "e1")!;
    expect(() =>
      applyChanges(
        seed,
        [
          {
            collection: "events",
            id: "e1",
            value: { ...event, status: "Cancelled" },
          },
        ],
        admin,
      ),
    ).toThrow("Release equipment allocations before cancelling the event.");
  });
});

describe("maintenance quarantine rules", () => {
  it("opens new records unresolved and keeps their origin immutable", () => {
    const seed = createSeed();
    const record = structuredClone(
      seed.maintenanceRecords.find((m) => m.id === "maint-q1")!,
    );
    expect(() =>
      saveMaintenance(seed, {
        ...record,
        id: "maint-new",
        status: "Resolved",
        resolvedAt: new Date().toISOString(),
      }),
    ).toThrow("New maintenance records must begin open or in repair.");
    expect(() =>
      saveMaintenance(seed, { ...record, quantity: record.quantity + 1 }),
    ).toThrow("Maintenance origin and quantity are immutable.");
    expect(() =>
      saveMaintenance(seed, { ...record, status: "Resolved" }),
    ).toThrow("Resolution time must match maintenance status.");
  });

  it("cannot quarantine more units than are marked unavailable", () => {
    const seed = createSeed();
    const q1 = seed.equipment.find((q) => q.id === "q1")!;
    expect(() =>
      saveMaintenance(seed, {
        id: "maint-extra",
        equipmentId: "q1",
        quantity: q1.maintenance,
        issue: "Bocina sin señal",
        status: "Open",
        openedAt: new Date().toISOString(),
        cost: 0,
      }),
    ).toThrow(
      "Open maintenance records exceed the equipment quantity marked unavailable.",
    );
  });
});
