import type { Workspace } from "../../src/shared/types";
import {
  productionReadiness,
  validateLayoutGeometry,
  validateReservation,
} from "../../src/shared/domain";
import { invalid } from "./guards";

export function validateWorkspace(next: Workspace, before: Workspace) {
  const requireEvent = (id: string) => {
    const event = next.events.find((e) => e.id === id);
    invalid(!event, "The linked event does not exist.");
    return event!;
  };
  for (const event of next.events) {
    invalid(
      !next.clients.some((c) => c.id === event.clientId),
      "The event client does not exist.",
    );
    invalid(
      Boolean(event.venueId) &&
        !next.venues.some((v) => v.id === event.venueId),
      "The event venue does not exist.",
    );
    const old = before.events.find((e) => e.id === event.id);
    const allocations = next.reservations.filter(
      (r) =>
        r.eventId === event.id && !["Returned", "Cancelled"].includes(r.status),
    );
    invalid(
      event.status === "Cancelled" && allocations.length > 0,
      "Release equipment allocations before cancelling the event.",
    );
    invalid(
      Boolean(
        old && (old.date !== event.date || old.endDate !== event.endDate),
      ) && allocations.length > 0,
      "Reconcile or release reservations before changing event dates.",
    );
    if (old && old.status !== event.status) {
      const readiness = productionReadiness(next, event.id);
      invalid(
        event.status === "In production" && old.status !== "Preparation",
        "Confirm preparation before starting production.",
      );
      invalid(
        event.status === "Completed" && old.status !== "In production",
        "Only an event in production can be closed out.",
      );
      invalid(
        ["Preparation", "In production"].includes(event.status) &&
          !readiness.ready,
        `Production readiness is incomplete: ${readiness.blockers.join(" ")}`,
      );
      invalid(
        event.status === "Completed" && !readiness.closeoutReady,
        `Production closeout is incomplete: ${readiness.closeoutBlockers.join(" ")}`,
      );
    }
  }
  const sku = new Set<string>();
  for (const item of next.equipment) {
    invalid(sku.has(item.sku.toLowerCase()), "Equipment SKU must be unique.");
    sku.add(item.sku.toLowerCase());
  }
  const damageEquipment = new Set(
    next.maintenanceRecords
      .filter(
        (record) =>
          record.reservationId &&
          !before.maintenanceRecords.some((stored) => stored.id === record.id),
      )
      .map((record) => record.equipmentId),
  );
  for (const r of next.reservations) {
    const event = requireEvent(r.eventId);
    const item = next.equipment.find(
      (q) => q.id === (r.substituteEquipmentId || r.equipmentId),
    );
    invalid(!item, "Reserved equipment does not exist.");
    invalid(
      Boolean(
        r.substituteEquipmentId && r.substituteEquipmentId === r.equipmentId,
      ),
      "A substitution must identify different equipment.",
    );
    invalid(
      r.source === "Supplier" && !r.supplier?.trim(),
      "Supplier rentals require a supplier.",
    );
    const beforeDate = new Date(`${event.date}T00:00:00Z`);
    beforeDate.setUTCDate(beforeDate.getUTCDate() - (r.bufferBeforeDays || 0));
    const afterDate = new Date(`${event.endDate}T00:00:00Z`);
    afterDate.setUTCDate(afterDate.getUTCDate() + (r.bufferAfterDays || 0));
    invalid(
      (r.bufferBeforeDays !== undefined || r.bufferAfterDays !== undefined) &&
        (r.start > beforeDate.toISOString().slice(0, 10) ||
          r.end < afterDate.toISOString().slice(0, 10)),
      "The occupied window must include the event and its preparation/return buffers.",
    );
    if (!["Returned", "Cancelled"].includes(r.status)) {
      invalid(
        event.status === "Cancelled",
        "Cancelled events cannot reserve equipment.",
      );
      try {
        validateReservation(item!, next.reservations, r);
      } catch (error) {
        const wasAlreadyAllocated = before.reservations.some(
          (reservation) => reservation.id === r.id,
        );
        if (!wasAlreadyAllocated || !damageEquipment.has(item!.id)) throw error;
      }
    }
  }
  const packageNames = new Set<string>();
  for (const equipmentPackage of next.packages) {
    invalid(
      packageNames.has(equipmentPackage.name.toLowerCase()),
      "Equipment package names must be unique.",
    );
    packageNames.add(equipmentPackage.name.toLowerCase());
    const packageItems = new Set<string>();
    for (const item of equipmentPackage.items) {
      invalid(
        packageItems.has(item.equipmentId),
        "Package equipment must be unique.",
      );
      packageItems.add(item.equipmentId);
      invalid(
        !next.equipment.some((equipment) => equipment.id === item.equipmentId),
        "Package equipment does not exist.",
      );
    }
  }
  for (const record of next.maintenanceRecords) {
    const equipment = next.equipment.find(
      (item) => item.id === record.equipmentId,
    );
    invalid(!equipment, "Maintenance equipment does not exist.");
    invalid(
      Boolean(record.reservationId) &&
        !next.reservations.some(
          (reservation) =>
            reservation.id === record.reservationId &&
            (reservation.substituteEquipmentId || reservation.equipmentId) ===
              record.equipmentId,
        ),
      "Maintenance custody reference does not match the equipment.",
    );
  }
  for (const item of next.equipment) {
    const activeMaintenance = next.maintenanceRecords
      .filter(
        (record) =>
          record.equipmentId === item.id && record.status !== "Resolved",
      )
      .reduce((sum, record) => sum + record.quantity, 0);
    invalid(
      activeMaintenance > item.maintenance,
      "Open maintenance records exceed the equipment quantity marked unavailable.",
    );
  }
  const operationEvents = new Set<string>();
  const activeShifts: {
    eventId: string;
    identity: string;
    start: string;
    end: string;
  }[] = [];
  for (const operation of next.operations) {
    requireEvent(operation.eventId);
    invalid(
      operationEvents.has(operation.eventId),
      "An event can have only one operations record.",
    );
    operationEvents.add(operation.eventId);
    for (const key of [
      "crewShifts",
      "cues",
      "transports",
      "changes",
      "costs",
    ] as const) {
      const ids = new Set<string>();
      for (const entry of operation[key]) {
        invalid(ids.has(entry.id), `Duplicate ${key} identity.`);
        ids.add(entry.id);
      }
    }
    for (const shift of operation.crewShifts) {
      if (shift.status === "Cancelled") continue;
      const identity = shift.memberId || shift.person.trim().toLowerCase();
      invalid(
        activeShifts.some(
          (other) =>
            other.identity === identity &&
            other.start < shift.end &&
            other.end > shift.start,
        ),
        `${shift.person} has an overlapping crew shift.`,
      );
      activeShifts.push({
        eventId: operation.eventId,
        identity,
        start: shift.start,
        end: shift.end,
      });
    }
  }
  const automationKeys = new Set<string>();
  for (const automation of next.automations) {
    invalid(
      automationKeys.has(automation.key),
      "Automation trigger keys must be unique.",
    );
    automationKeys.add(automation.key);
    if (automation.eventId) requireEvent(automation.eventId);
    if (automation.proposalId) {
      const proposal = next.proposals.find(
        (item) => item.id === automation.proposalId,
      );
      invalid(
        !proposal ||
          Boolean(
            automation.eventId && proposal.eventId !== automation.eventId,
          ),
        "Automation proposal scope does not match its event.",
      );
    }
    if (
      automation.status === "Approved" &&
      automation.action === "Create task"
    ) {
      const task = next.tasks.find((item) => item.id === automation.taskId);
      invalid(
        !task || !automation.eventId || task.eventId !== automation.eventId,
        "An approved task automation must link one task for the same event.",
      );
    }
    invalid(
      automation.status === "Approved" &&
        automation.action === "Review only" &&
        Boolean(automation.taskId),
      "Review-only automations cannot create tasks.",
    );
  }
  const revisions = new Set<string>();
  for (const p of next.proposals) {
    requireEvent(p.eventId);
    const key = `${p.number}:${p.version}`;
    invalid(revisions.has(key), "Proposal revision already exists.");
    revisions.add(key);
    for (const line of p.lines)
      invalid(
        Boolean(line.equipmentId) &&
          !next.equipment.some((q) => q.id === line.equipmentId),
        "Proposal equipment reference does not exist.",
      );
    const creativeIds = new Set<string>();
    for (const assetId of p.creativeAssetIds || []) {
      invalid(
        creativeIds.has(assetId),
        "Proposal creative assets must be unique.",
      );
      creativeIds.add(assetId);
      const asset = next.creativeAssets.find((item) => item.id === assetId);
      invalid(
        !asset || asset.eventId !== p.eventId || asset.status !== "Approved",
        "Proposal creative assets must be approved and belong to the same event.",
      );
    }
    const visualIds = new Set<string>();
    for (const visual of p.visuals || []) {
      invalid(
        visualIds.has(visual.id),
        "Proposal visual identities must be unique.",
      );
      visualIds.add(visual.id);
      if (visual.sourceType === "Creative") {
        const asset = next.creativeAssets.find(
          (item) => item.id === visual.sourceId,
        );
        invalid(
          !asset ||
            asset.eventId !== p.eventId ||
            asset.status !== "Approved" ||
            asset.revision !== visual.sourceRevision ||
            asset.dataUrl !== visual.dataUrl ||
            !(p.creativeAssetIds || []).includes(asset.id),
          "Proposal creative snapshots must match an approved selected asset from the same event.",
        );
      } else {
        const layout = next.layouts.find(
          (item) => item.id === visual.sourceId && item.eventId === p.eventId,
        );
        const revisionVerified = layout
          ? layout.version === visual.sourceRevision
            ? layout.verified
            : layout.history.find(
                (item) => item.version === visual.sourceRevision,
              )?.verified
          : undefined;
        invalid(
          !layout ||
            revisionVerified === undefined ||
            visual.measurementStatus !==
              (revisionVerified ? "Verified" : "Unverified"),
          "Proposal layout snapshots must identify an existing same-event revision and its measurement status.",
        );
      }
    }
  }
  for (const t of next.tasks) requireEvent(t.eventId);
  for (const reference of next.brandAssets) requireEvent(reference.eventId);
  const creativeIds = new Set<string>();
  for (const asset of next.creativeAssets) {
    requireEvent(asset.eventId);
    invalid(
      creativeIds.has(asset.id),
      "Creative asset identities must be unique.",
    );
    creativeIds.add(asset.id);
    const referenceIds = new Set<string>();
    for (const referenceId of asset.referenceIds) {
      invalid(
        referenceIds.has(referenceId),
        "Creative references must be unique.",
      );
      referenceIds.add(referenceId);
      const reference = next.brandAssets.find(
        (item) => item.id === referenceId,
      );
      invalid(
        !reference || reference.eventId !== asset.eventId,
        "Creative references must belong to the same event.",
      );
    }
    if (asset.parentId) {
      const parent = next.creativeAssets.find(
        (item) => item.id === asset.parentId,
      );
      invalid(
        !parent ||
          parent.eventId !== asset.eventId ||
          parent.kind !== asset.kind ||
          asset.revision !== parent.revision + 1,
        "Creative revisions must follow a concept from the same event and type.",
      );
    } else
      invalid(
        asset.revision !== 1,
        "New creative concepts begin at revision one.",
      );
  }
  for (const event of next.events)
    invalid(
      next.creativeAssets.filter(
        (asset) =>
          asset.eventId === event.id && asset.provider === "Local showcase",
      ).length > 20,
      "The local creative showcase is limited to 20 concepts per event.",
    );
  for (const l of next.layouts) {
    requireEvent(l.eventId);
    const geometryErrors = validateLayoutGeometry(l);
    invalid(geometryErrors.length > 0, geometryErrors.join(" "));
    const ids = new Set<string>();
    for (const object of l.objects) {
      invalid(ids.has(object.id), "Layout object identities must be unique.");
      ids.add(object.id);
      invalid(
        Boolean(object.equipmentId) &&
          !next.equipment.some((q) => q.id === object.equipmentId),
        "Layout equipment reference does not exist.",
      );
    }
  }
  for (const c of next.conversations) {
    const event = requireEvent(c.eventId);
    invalid(
      c.clientId !== event.clientId,
      "Conversation client must match the event client.",
    );
    if (c.proposalId) {
      const p = next.proposals.find((p) => p.id === c.proposalId);
      invalid(
        !p || p.eventId !== event.id || p.version !== c.proposalVersion,
        "Conversation proposal revision does not match.",
      );
    }
    const ids = new Set<string>();
    for (const m of c.messages) {
      invalid(ids.has(m.id), "Duplicate message identity.");
      ids.add(m.id);
    }
    if (c.reviewMessageId) {
      const source = c.messages.find((m) => m.id === c.reviewMessageId);
      invalid(
        !source || source.direction !== "in",
        "Review evidence must reference an inbound message.",
      );
    }
    if (c.acceptanceEvidence) {
      const evidence = c.acceptanceEvidence;
      const source = c.messages.find((m) => m.id === evidence.messageId);
      invalid(
        c.review !== "Confirmed" ||
          !source ||
          source.direction !== "in" ||
          evidence.proposalId !== c.proposalId ||
          evidence.proposalVersion !== c.proposalVersion,
        "Acceptance evidence must preserve the reviewed message and exact proposal revision.",
      );
    }
  }
}
