import type { WorkspaceUser } from "../../src/shared/access";
import type { Workspace } from "../../src/shared/types";

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
