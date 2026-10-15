import { describe, expect, it } from "vitest";
import {
  acceptConversation,
  availableStock,
  createProposalRevision,
  quoteTotals,
  reviseProposal,
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
});
