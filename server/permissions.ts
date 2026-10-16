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
    layouts: guest
      ? []
      : workspace.layouts.filter((l) => allowed.has(l.eventId)),
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
      quoteTotals(p.lines, p.discount, p.tax);
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
          !same(snapshot.cameras, old.cameras),
        "A layout revision must preserve an exact snapshot of the prior geometry and measurement status.",
      );
    }
    if (collection === "layouts" && !before) {
      const layout = row as Workspace["layouts"][number];
      invalid(
        layout.version !== 1 || layout.history.length !== 0,
        "New layouts must begin at version one without revision history.",
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
  for (const r of next.reservations) {
    const event = requireEvent(r.eventId);
    const item = next.equipment.find((q) => q.id === r.equipmentId);
    invalid(!item, "Reserved equipment does not exist.");
    if (!["Returned", "Cancelled"].includes(r.status)) {
      invalid(
        event.status === "Cancelled",
        "Cancelled events cannot reserve equipment.",
      );
      validateReservation(item!, next.reservations, r);
    }
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
  }
  for (const t of next.tasks) requireEvent(t.eventId);
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
