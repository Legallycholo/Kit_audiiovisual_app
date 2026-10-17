import { sameValue } from "../src/shared/value";
import {
  canEditCollection,
  type Collection,
  type WorkspaceChange,
  type WorkspaceUser,
} from "../src/shared/access";
import type { Workspace, Proposal, Conversation } from "../src/shared/types";
import {
  productionReadiness,
  quoteTotals,
  validateLayoutGeometry,
  validateReservation,
} from "../src/shared/domain";
import { HttpError } from "./database";
import { schemas } from "./schema";

export function hasAllEvents(user: WorkspaceUser) {
  return ["Administrator", "Sales Manager"].includes(user.role);
}
export function ownsEvent(user: WorkspaceUser, eventId: string) {
  return hasAllEvents(user) || user.eventIds.includes(eventId);
}
export function scopeWorkspace(
  workspace: Workspace,
  user: WorkspaceUser,
): Workspace {
  if (user.role === "Administrator") return workspace;
  const guest = user.role === "Client / Guest";
  const commercial = user.role === "Sales Manager";
  const proposals = workspace.proposals.filter((p) =>
    guest
      ? user.sharedProposalIds.includes(p.id) &&
        workspace.events.find((e) => e.id === p.eventId)?.clientId ===
          user.clientId &&
        ["Issued", "Accepted", "Declined", "Superseded"].includes(p.status)
      : commercial && ownsEvent(user, p.eventId),
  );
  const events = workspace.events.filter((e) =>
    guest ? proposals.some((p) => p.eventId === e.id) : ownsEvent(user, e.id),
  );
  const allowed = new Set(events.map((e) => e.id));
  const company = commercial
    ? workspace.settings
    : { ...workspace.settings, email: "", notifications: false };
  return {
    ...workspace,
    settings: company,
    events: events.map((e) =>
      commercial ? e : { ...e, budget: 0, notes: guest ? "" : e.notes },
    ),
    clients: workspace.clients
      .filter((c) => commercial || events.some((e) => e.clientId === c.id))
      .map((c) =>
        commercial ? c : { ...c, notes: "", email: guest ? "" : c.email },
      ),
    venues: guest
      ? []
      : workspace.venues.filter(
          (v) =>
            ["Sales Manager", "Event Designer", "Production Manager"].includes(
              user.role,
            ) || events.some((e) => e.venueId === v.id),
        ),
    equipment: guest
      ? []
      : workspace.equipment.map((q) =>
          commercial || user.role === "Production Manager"
            ? q
            : { ...q, rate: 0 },
        ),
    proposals: guest
      ? proposals.map(({ aiReview: _internal, ...proposal }) => proposal)
      : proposals,
    conversations: commercial
      ? workspace.conversations.filter((c) => allowed.has(c.eventId))
      : [],
    tasks: guest
      ? []
      : workspace.tasks.filter(
          (t) =>
            allowed.has(t.eventId) &&
            (user.role !== "Technician" || t.assigneeId === user.id),
        ),
    reservations: guest
      ? []
      : workspace.reservations.filter((r) => allowed.has(r.eventId)),
    packages: guest ? [] : workspace.packages,
    maintenanceRecords:
      user.role === "Production Manager" ? workspace.maintenanceRecords : [],
    operations: guest
      ? []
      : workspace.operations
          .filter((operation) => allowed.has(operation.eventId))
          .map((operation) =>
            user.role === "Production Manager"
              ? operation
              : {
                  ...operation,
                  crewShifts:
                    user.role === "Technician"
                      ? operation.crewShifts
                          .filter(
                            (shift) =>
                              shift.memberId === user.id ||
                              (!shift.memberId && shift.person === user.name),
                          )
                          .map((shift) => ({ ...shift, cost: 0 }))
                      : operation.crewShifts.map((shift) => ({
                          ...shift,
                          cost: 0,
                        })),
                  transports: operation.transports.map((transport) => ({
                    ...transport,
                    cost: 0,
                  })),
                  changes: [],
                  costs: [],
                },
          ),
    automations: [],
    layouts: guest
      ? []
      : workspace.layouts.filter((l) => allowed.has(l.eventId)),
    brandAssets:
      user.role === "Event Designer"
        ? workspace.brandAssets.filter((asset) => allowed.has(asset.eventId))
        : [],
    creativeAssets: ["Event Designer", "Sales Manager"].includes(user.role)
      ? workspace.creativeAssets.filter(
          (asset) =>
            allowed.has(asset.eventId) &&
            (user.role === "Event Designer" || asset.status === "Approved"),
        )
      : [],
    activity: guest
      ? []
      : workspace.activity.filter(
          (a) =>
            Boolean(a.eventId && allowed.has(a.eventId)) &&
            (commercial ||
              !/proposal|acceptance|message|client response/i.test(a.title)),
        ),
  };
}
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
function forbid(condition: boolean, message: string) {
  if (condition) throw new HttpError(403, message);
}
function invalid(condition: boolean, message: string) {
  if (condition) throw new HttpError(422, message);
}

export function applyChanges(
  original: Workspace,
  changes: WorkspaceChange[],
  user: WorkspaceUser,
): Workspace {
  const next = structuredClone(original);
  const seen = new Set<string>();
  for (const change of changes) {
    const key = `${change.collection}:${change.id}`;
    invalid(seen.has(key), "A record can appear only once in a change set.");
    seen.add(key);
    forbid(
      !canEditCollection(user, change.collection),
      "Your role cannot change this record type.",
    );
    const value = schemas[change.collection].parse(change.value);
    if (change.collection === "settings") {
      next.settings = value as Workspace["settings"];
      continue;
    }
    const collection = change.collection as Collection;
    const row = value as Workspace[Collection][number];
    invalid(
      row.id !== change.id,
      "Record identity does not match the request.",
    );
    const before = original[collection].find((r) => r.id === change.id);
    const eventId =
      "eventId" in row
        ? row.eventId
        : collection === "events"
          ? row.id
          : undefined;
    if (eventId)
      forbid(
        !ownsEvent(user, eventId),
        "This event is outside your assigned scope.",
      );
    if (before && "eventId" in before)
      invalid(
        before.eventId !== eventId,
        "A record cannot be moved between events.",
      );
    if (
      collection === "events" &&
      before &&
      user.role === "Production Manager"
    ) {
      const a = before as Workspace["events"][number];
      const b = row as Workspace["events"][number];
      forbid(
        !same({ ...a, budget: 0, status: b.status }, b),
        "Production managers may update event production status; other event fields require sales or administrator access.",
      );
      b.budget = a.budget;
    }
    if (collection === "tasks" && user.role === "Technician") {
      const a = before as Workspace["tasks"][number] | undefined;
      const b = row as Workspace["tasks"][number];
      forbid(
        !a || a.assigneeId !== user.id || !same({ ...a, done: b.done }, b),
        "Technicians may only complete or reopen their own assigned tasks.",
      );
    }
    if (collection === "reservations") {
      const reservation = row as Workspace["reservations"][number];
      const old = before as Workspace["reservations"][number] | undefined;
      if (!old)
        invalid(
          !["Hold", "Confirmed"].includes(reservation.status),
          "New allocations must begin on hold or confirmed.",
        );
      if (old) {
        invalid(
          old.equipmentId !== reservation.equipmentId,
          "Change equipment through a recorded substitution.",
        );
        invalid(
          ["Returned", "Cancelled"].includes(old.status) &&
            !same(old, reservation),
          "Completed and cancelled allocations are immutable.",
        );
        const allowed: Record<string, string[]> = {
          Hold: ["Hold", "Confirmed", "Cancelled"],
          Confirmed: ["Confirmed", "Dispatched", "Returned", "Cancelled"],
          Dispatched: ["Dispatched", "Returned"],
          Returned: ["Returned"],
          Cancelled: ["Cancelled"],
        };
        invalid(
          !allowed[old.status].includes(reservation.status),
          `Allocation cannot move from ${old.status} to ${reservation.status}.`,
        );
      }
      const dispatched =
        reservation.dispatchedQuantity ??
        (["Dispatched", "Returned"].includes(reservation.status)
          ? reservation.quantity
          : 0);
      const returned =
        reservation.returnedQuantity ??
        (reservation.status === "Returned"
          ? dispatched - (reservation.damagedQuantity || 0)
          : 0);
      const damaged = reservation.damagedQuantity || 0;
      invalid(
        dispatched > reservation.quantity,
        "Dispatched quantity exceeds the allocation.",
      );
      invalid(
        returned + damaged > dispatched,
        "Returned and damaged quantities exceed dispatch.",
      );
      invalid(
        reservation.status === "Returned" && returned + damaged !== dispatched,
        "A returned allocation must reconcile every dispatched unit.",
      );
    }
    if (collection === "maintenanceRecords") {
      const record = row as Workspace["maintenanceRecords"][number];
      const old = before as Workspace["maintenanceRecords"][number] | undefined;
      if (!old)
        invalid(
          record.status === "Resolved" || Boolean(record.resolvedAt),
          "New maintenance records must begin open or in repair.",
        );
      else {
        invalid(
          old.equipmentId !== record.equipmentId ||
            old.quantity !== record.quantity ||
            old.issue !== record.issue ||
            old.openedAt !== record.openedAt ||
            old.reservationId !== record.reservationId,
          "Maintenance origin and quantity are immutable.",
        );
        invalid(
          old.status === "Resolved" && !same(old, record),
          "Resolved maintenance records are immutable.",
        );
      }
      invalid(
        record.status === "Resolved"
          ? !record.resolvedAt
          : Boolean(record.resolvedAt),
        "Resolution time must match maintenance status.",
      );
    }
    if (collection === "operations" && before) {
      const operation = row as Workspace["operations"][number];
      const old = before as Workspace["operations"][number];
      for (const entry of old.changes)
        invalid(
          !operation.changes.some((candidate) => same(candidate, entry)),
          "Recorded onsite changes cannot be rewritten or removed.",
        );
      for (const entry of old.costs)
        invalid(
          !operation.costs.some((candidate) => same(candidate, entry)),
          "Recorded actual costs cannot be rewritten or removed.",
        );
      for (const entry of operation.changes.filter(
        (candidate) =>
          !old.changes.some((stored) => stored.id === candidate.id),
      )) {
        entry.recordedAt = new Date().toISOString();
        entry.recordedBy = user.name;
      }
    }
    if (collection === "operations" && !before) {
      const operation = row as Workspace["operations"][number];
      for (const entry of operation.changes) {
        entry.recordedAt = new Date().toISOString();
        entry.recordedBy = user.name;
      }
    }
    if (collection === "automations") {
      const automation = row as Workspace["automations"][number];
      const old = before as Workspace["automations"][number] | undefined;
      if (!old)
        invalid(
          automation.status !== "Open" ||
            Boolean(
              automation.decidedAt ||
              automation.decidedBy ||
              automation.taskId ||
              automation.failureReason,
            ),
          "New automation suggestions must begin open without decision metadata.",
        );
      else {
        invalid(
          !same(
            {
              ...old,
              status: automation.status,
              decidedAt: automation.decidedAt,
              decidedBy: automation.decidedBy,
              taskId: automation.taskId,
              failureReason: automation.failureReason,
            },
            automation,
          ),
          "Automation trigger evidence is immutable.",
        );
        invalid(
          old.status !== "Open" && !same(old, automation),
          "A decided automation cannot be changed.",
        );
        invalid(
          automation.status === "Open" && !same(old, automation),
          "Use an explicit automation decision.",
        );
      }
      if (automation.status !== "Open") {
        automation.decidedAt = new Date().toISOString();
        automation.decidedBy = user.name;
      }
      invalid(
        automation.status === "Failed"
          ? !automation.failureReason
          : Boolean(automation.failureReason),
        "Failure details must be present only for a failed automation.",
      );
      invalid(
        automation.status !== "Approved" && Boolean(automation.taskId),
        "Only an approved automation can link an executed task.",
      );
    }
    if (collection === "proposals") {
      const p = row as Proposal;
      const old = before as Proposal | undefined;
      if (old) {
        forbid(
          ["Issued", "Accepted", "Declined", "Superseded"].includes(old.status),
          "Issued and accepted revisions are immutable. Create a new revision.",
        );
        invalid(
          p.number !== old.number || p.version !== old.version,
          "Proposal identity and revision cannot be changed.",
        );
      } else {
        invalid(
          p.status !== "Draft" || Boolean(p.acceptedAt),
          "New proposals must start as drafts.",
        );
        const family = original.proposals.filter((q) => q.number === p.number);
        invalid(
          family.some((q) => q.eventId !== p.eventId),
          "A proposal number belongs to one event.",
        );
        invalid(
          p.version !==
            (family.length ? Math.max(...family.map((q) => q.version)) + 1 : 1),
          "Use the next proposal revision number.",
        );
      }
      forbid(
        !["Draft", "In review", "Ready to send"].includes(p.status) ||
          Boolean(p.acceptedAt),
        "Issuing and acceptance require their dedicated reviewed actions.",
      );
      forbid(
        p.status === "Ready to send" &&
          !user.isOwner &&
          user.role !== "Administrator",
        "An administrator must approve proposals for sharing.",
      );
      if (old?.status === "Ready to send" && p.status === "Ready to send")
        invalid(
          !same(p, old),
          "Editing an approved draft requires renewed internal review.",
        );
      if (
        old &&
        (!same(old.creativeAssetIds, p.creativeAssetIds) ||
          !same(old.visuals, p.visuals))
      )
        invalid(
          p.status !== "Draft",
          "Visual assets can only be changed on a draft proposal.",
        );
      quoteTotals(p.lines, p.discount, p.tax);
    }
    if (collection === "brandAssets") {
      const asset = row as Workspace["brandAssets"][number];
      invalid(
        Boolean(before) && !same(before, asset),
        "Stored brand references are immutable. Add a new authorized file.",
      );
    }
    if (collection === "creativeAssets") {
      const asset = row as Workspace["creativeAssets"][number];
      const old = before as Workspace["creativeAssets"][number] | undefined;
      if (!old) {
        invalid(
          asset.status !== "In review" ||
            Boolean(asset.reviewedAt || asset.reviewNote),
          "Generated concepts must begin in review.",
        );
      } else {
        invalid(
          !same(
            {
              ...old,
              status: asset.status,
              reviewedAt: asset.reviewedAt,
              reviewNote: asset.reviewNote,
            },
            asset,
          ),
          "Creative provenance and generated content are immutable.",
        );
        invalid(
          old.status !== "In review" && !same(old, asset),
          "A completed creative review cannot be changed.",
        );
        invalid(
          asset.status !== "In review" && !asset.reviewedAt,
          "A completed creative review requires a review time.",
        );
        invalid(
          asset.status === "In review" &&
            Boolean(asset.reviewedAt || asset.reviewNote),
          "A pending creative review cannot contain a decision.",
        );
      }
    }
    if (collection === "conversations") {
      const c = row as Conversation;
      const old = before as Conversation | undefined;
      if (!old)
        invalid(
          c.review !== "None" ||
            c.messages.some(
              (m) => m.direction !== "out" || m.status !== "Draft",
            ),
          "New conversations may only contain outgoing drafts.",
        );
      if (old) {
        invalid(
          c.clientId !== old.clientId ||
            c.proposalId !== old.proposalId ||
            c.proposalVersion !== old.proposalVersion ||
            c.reviewMessageId !== old.reviewMessageId ||
            !same(c.acceptanceEvidence, old.acceptanceEvidence),
          "Conversation links cannot be changed by a draft edit.",
        );
        forbid(
          c.review !== old.review &&
            !(
              user.isOwner &&
              ["Clarification needed", "Not accepted"].includes(c.review)
            ),
          "Acceptance and review decisions require owner authority.",
        );
        for (const m of old.messages)
          invalid(
            !c.messages.some((n) => same(n, m)),
            "Stored messages cannot be rewritten or removed.",
          );
        for (const m of c.messages.filter(
          (m) => !old.messages.some((n) => n.id === m.id),
        )) {
          invalid(
            m.direction !== "out" || m.status !== "Draft",
            "Only outgoing drafts can be added here.",
          );
          invalid(
            Boolean(
              m.approvedBy ||
              m.approvedAt ||
              m.sentAt ||
              m.providerMessageId ||
              m.failureReason ||
              m.channel,
            ),
            "Delivery metadata is written by the messaging service.",
          );
          m.createdBy = user.id;
        }
      }
    }
    if (collection === "layouts" && before) {
      const old = before as Workspace["layouts"][number];
      const layout = row as Workspace["layouts"][number];
      invalid(
        layout.version !== old.version + 1,
        "Save layouts as the next revision.",
      );
      invalid(
        !old.history.every((h, i) => same(h, layout.history[i])),
        "Previous layout revisions are immutable.",
      );
      const snapshot = layout.history.at(-1);
      invalid(
        layout.history.length !== old.history.length + 1 ||
          !snapshot ||
          snapshot.version !== old.version ||
          !same(snapshot.objects, old.objects) ||
          snapshot.width !== old.width ||
          snapshot.depth !== old.depth ||
          snapshot.verified !== old.verified ||
          snapshot.verifiedAt !== old.verifiedAt ||
          snapshot.verificationNote !== old.verificationNote ||
          !same(snapshot.cameras, old.cameras) ||
          !same(snapshot.cameraPath, old.cameraPath) ||
          !same(snapshot.provenance, old.provenance),
        "A layout revision must preserve an exact snapshot of the prior geometry and measurement status.",
      );
      invalid(
        Boolean(layout.cameraPath) &&
          layout.cameraPath!.cameraIds.some(
            (id) => !layout.cameras?.some((camera) => camera.id === id),
          ),
        "A camera path can only reference saved cameras in the layout.",
      );
    }
    if (collection === "layouts" && !before) {
      const layout = row as Workspace["layouts"][number];
      invalid(
        layout.version !== 1 || layout.history.length !== 0,
        "New layouts must begin at version one without revision history.",
      );
      invalid(
        Boolean(layout.cameraPath) &&
          layout.cameraPath!.cameraIds.some(
            (id) => !layout.cameras?.some((camera) => camera.id === id),
          ),
        "A camera path can only reference saved cameras in the layout.",
      );
    }
    const index = next[collection].findIndex((r) => r.id === row.id);
    // The value is validated by the collection-specific schema above.
    const records = next[collection] as (typeof row)[];
    if (index < 0) records.push(row);
    else records[index] = row;
  }
  validateWorkspace(next, original);
  return next;
}

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
