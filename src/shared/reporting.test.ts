import { describe, expect, it } from "vitest";
import { quoteTotals } from "./domain";
import {
  automationCandidates,
  financialReport,
  pipelineReport,
  utilizationReport,
  workloadReport,
} from "./reporting";
import { createSeed } from "./seed";

describe("permission-ready business reporting", () => {
  it("counts only the latest proposal revision in the commercial pipeline", () => {
    const workspace = createSeed();
    const issued = workspace.proposals.find(
      (proposal) => proposal.id === "p1",
    )!;
    workspace.proposals.push({
      ...issued,
      id: "p1-v3",
      version: issued.version + 1,
      status: "Draft",
    });

    const report = pipelineReport(workspace);
    expect(report.find((row) => row.status === "Issued")).toMatchObject({
      count: 0,
      value: 0,
    });
    expect(report.find((row) => row.status === "Draft")?.count).toBe(2);
  });

  it("keeps accepted scope and actual operating cost distinct", () => {
    const workspace = createSeed();
    const proposal = workspace.proposals.find((item) => item.id === "p1")!;
    proposal.eventId = "e3";
    proposal.status = "Accepted";
    workspace.proposals = [proposal];

    const row = financialReport(workspace).find(
      (item) => item.eventId === "e3",
    )!;
    const accepted = quoteTotals(
      proposal.lines,
      proposal.discount,
      proposal.tax,
    ).total;
    expect(row.acceptedValue).toBe(accepted);
    expect(row.actualCost).toBe(480);
    expect(row.contribution).toBe(accepted - 480);
    expect(row.scopeStatus).toBe("Accepted current");
  });

  it("calculates owned unit-days and separates holds from commitments", () => {
    const workspace = createSeed();
    const equipment = workspace.equipment.find((item) => item.id === "q1")!;
    equipment.quantity = 10;
    equipment.maintenance = 2;
    workspace.equipment = [equipment];
    workspace.reservations = [
      {
        id: "committed",
        eventId: "e1",
        equipmentId: "q1",
        quantity: 2,
        start: "2026-10-01",
        end: "2026-10-02",
        status: "Confirmed",
      },
      {
        id: "hold",
        eventId: "e1",
        equipmentId: "q1",
        quantity: 3,
        start: "2026-10-02",
        end: "2026-10-03",
        status: "Hold",
      },
      {
        id: "supplier",
        eventId: "e1",
        equipmentId: "q1",
        quantity: 20,
        start: "2026-10-01",
        end: "2026-10-03",
        status: "Confirmed",
        source: "Supplier",
        supplier: "Partner",
      },
    ];

    const row = utilizationReport(workspace, "2026-10-01", "2026-10-03")[0];
    expect(row).toMatchObject({
      equipmentId: "q1",
      name: equipment.name,
      capacityUnitDays: 24,
      committedUnitDays: 4,
      holdUnitDays: 6,
    });
    expect(row.utilizationPercent).toBeCloseTo(100 / 6);
  });

  it("groups task counts and completed shift hours by person", () => {
    const marco = workloadReport(createSeed()).find(
      (row) => row.person === "Marco Díaz",
    )!;
    expect(marco).toMatchObject({
      openTasks: 2,
      completedTasks: 0,
      scheduledHours: 12,
      completedHours: 0,
    });
  });
});

describe("observable automation suggestions", () => {
  it("uses stable keys for the same evidence and leaves execution to review", () => {
    const workspace = createSeed();
    const proposal = workspace.proposals.find((item) => item.id === "p1")!;
    proposal.validUntil = "2026-10-17";
    proposal.status = "Issued";
    const event = workspace.events.find((item) => item.id === "e1")!;
    event.date = "2026-10-18";
    event.status = "Confirmed";
    const reservation = workspace.reservations.find(
      (item) => item.id === "res1",
    )!;
    reservation.status = "Dispatched";
    reservation.end = "2026-10-14";
    const now = new Date("2026-10-15T10:00:00.000Z");

    const first = automationCandidates(workspace, now);
    const second = automationCandidates(workspace, now);
    expect(first.map((item) => item.key)).toEqual(
      second.map((item) => item.key),
    );
    expect(first).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: `proposal-review:${proposal.id}:${proposal.version}`,
          action: "Review only",
        }),
        expect.objectContaining({
          key: `preparation-risk:${event.id}:${event.date}`,
          action: "Create task",
        }),
        expect.objectContaining({
          key: `equipment-return:${reservation.id}:${reservation.end}`,
          action: "Create task",
        }),
      ]),
    );
  });
});
