import {
  canEditCollection,
  type Collection,
  type WorkspaceChange,
  type WorkspaceUser,
} from "../../src/shared/access";
import type { Workspace, Proposal, Conversation } from "../../src/shared/types";
import { quoteTotals } from "../../src/shared/domain";
import { schemas } from "../schema";
import { ownsEvent } from "./scope";
import { forbid, invalid, same } from "./guards";
import { validateWorkspace } from "./validation";

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
