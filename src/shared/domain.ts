import type {
  Equipment,
  Proposal,
  QuoteLine,
  Reservation,
  Workspace,
} from "./types";

export const id = () => crypto.randomUUID();
export const money = (value: number) =>
  new Intl.NumberFormat("es-PR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
export const shortDate = (value: string) =>
  new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("es-PR", {
    month: "short",
    day: "numeric",
  });
export const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
export function quoteTotals(lines: QuoteLine[], discount: number, tax: number) {
  if (![discount, tax].every((n) => Number.isFinite(n) && n >= 0 && n <= 100))
    throw new Error("Discount and tax must be between 0 and 100.");
  const subtotal = lines.reduce((sum, line) => {
    if (
      ![line.quantity, line.rate, line.days].every(
        (n) => Number.isFinite(n) && n >= 0,
      )
    )
      throw new Error("Line values cannot be negative or invalid.");
    return sum + Math.round(line.quantity * line.rate * line.days * 100);
  }, 0);
  const discountAmount = Math.round((subtotal * discount) / 100);
  const taxAmount = Math.round(((subtotal - discountAmount) * tax) / 100);
  return {
    subtotal: subtotal / 100,
    discount: discountAmount / 100,
    tax: taxAmount / 100,
    total: (subtotal - discountAmount + taxAmount) / 100,
  };
}
export function availableStock(
  item: Equipment,
  reservations: Reservation[],
  start: string,
  end: string,
  excludeId?: string,
) {
  const overlaps = reservations.filter(
    (r) =>
      r.equipmentId === item.id &&
      r.id !== excludeId &&
      !["Returned", "Cancelled"].includes(r.status) &&
      r.start <= end &&
      r.end >= start,
  );
  // Maximum concurrent usage, rather than adding separate non-overlapping bookings.
  const checkpoints = [
    start,
    ...overlaps.map((r) => r.start).filter((d) => d >= start && d <= end),
  ];
  const reserved = Math.max(
    0,
    ...checkpoints.map((day) =>
      overlaps
        .filter((r) => r.start <= day && r.end >= day)
        .reduce((sum, r) => sum + r.quantity, 0),
    ),
  );
  return Math.max(0, item.quantity - item.maintenance - reserved);
}
export function validateReservation(
  item: Equipment,
  reservations: Reservation[],
  candidate: Reservation,
) {
  if (!Number.isInteger(candidate.quantity) || candidate.quantity < 1)
    throw new Error("Enter a positive whole quantity.");
  if (!candidate.start || !candidate.end || candidate.end < candidate.start)
    throw new Error("Return date must be on or after preparation date.");
  const available = availableStock(
    item,
    reservations,
    candidate.start,
    candidate.end,
    candidate.id,
  );
  if (candidate.quantity > available)
    throw new Error(`Only ${available} units are available for this window.`);
}

export interface ProductionReadiness {
  acceptedProposal?: Proposal;
  acceptedScopeReady: boolean;
  equipmentReady: boolean;
  crewReady: boolean;
  ready: boolean;
  blockers: string[];
  requirements: {
    equipmentId: string;
    required: number;
    confirmed: number;
  }[];
  closeoutReady: boolean;
  closeoutBlockers: string[];
}

/**
 * Evaluates the explicit gates between commercial acceptance and operations.
 * It never mutates the workspace or creates reservations or assignments.
 */
export function productionReadiness(
  workspace: Workspace,
  eventId: string,
): ProductionReadiness {
  const event = workspace.events.find((item) => item.id === eventId);
  if (!event) throw new Error("Event not found.");

  const accepted = workspace.proposals
    .filter(
      (proposal) =>
        proposal.eventId === eventId && proposal.status === "Accepted",
    )
    .sort(
      (a, b) =>
        (b.acceptedAt || "").localeCompare(a.acceptedAt || "") ||
        b.version - a.version,
    )[0];
  const hasNewerRevision = Boolean(
    accepted &&
    workspace.proposals.some(
      (proposal) =>
        proposal.number === accepted.number &&
        proposal.version > accepted.version,
    ),
  );
  const acceptedScopeReady = Boolean(accepted && !hasNewerRevision);

  const requiredByEquipment = new Map<string, number>();
  for (const line of accepted?.lines || []) {
    if (!line.equipmentId) continue;
    requiredByEquipment.set(
      line.equipmentId,
      (requiredByEquipment.get(line.equipmentId) || 0) + line.quantity,
    );
  }
  const requirements = [...requiredByEquipment].map(
    ([equipmentId, required]) => ({
      equipmentId,
      required,
      confirmed: workspace.reservations
        .filter(
          (reservation) =>
            reservation.eventId === eventId &&
            reservation.equipmentId === equipmentId &&
            ["Confirmed", "Dispatched"].includes(reservation.status) &&
            reservation.start <= event.date &&
            reservation.end >= event.endDate,
        )
        .reduce((sum, reservation) => sum + reservation.quantity, 0),
    }),
  );
  const equipmentReady =
    acceptedScopeReady &&
    requirements.every((item) => item.confirmed >= item.required);
  const tasks = workspace.tasks.filter((task) => task.eventId === eventId);
  const crewReady =
    tasks.length > 0 &&
    tasks.every((task) => Boolean(task.assignee.trim() && task.role.trim()));

  const blockers: string[] = [];
  if (!accepted)
    blockers.push(
      "Se requiere una propuesta aceptada y confirmada por el propietario.",
    );
  else if (hasNewerRevision)
    blockers.push(
      "Reconcilia el alcance aceptado con la versión más reciente de la propuesta.",
    );
  if (acceptedScopeReady)
    for (const item of requirements.filter(
      (requirement) => requirement.confirmed < requirement.required,
    )) {
      const equipment = workspace.equipment.find(
        (record) => record.id === item.equipmentId,
      );
      blockers.push(
        `Confirma ${item.required - item.confirmed} más × ${equipment?.name || item.equipmentId} para las fechas del evento.`,
      );
    }
  if (!tasks.length)
    blockers.push(
      "Agrega al menos una tarea de producción con una persona responsable.",
    );
  else if (!crewReady)
    blockers.push("Asigna una persona y un rol a cada tarea de producción.");
  if (["Cancelled", "Completed"].includes(event.status))
    blockers.push("Este evento no está en un estado de producción activo.");

  const eventReservations = workspace.reservations.filter(
    (reservation) => reservation.eventId === eventId,
  );
  const closeoutBlockers: string[] = [];
  if (!["In production", "Completed"].includes(event.status))
    closeoutBlockers.push("Mueve el evento a producción antes del cierre.");
  if (tasks.some((task) => !task.done))
    closeoutBlockers.push("Completa todas las tareas de producción.");
  if (
    eventReservations.some(
      (reservation) => !["Returned", "Cancelled"].includes(reservation.status),
    )
  )
    closeoutBlockers.push(
      "Devuelve o cancela todas las asignaciones de equipos.",
    );

  return {
    acceptedProposal: accepted,
    acceptedScopeReady,
    equipmentReady,
    crewReady,
    ready: blockers.length === 0,
    blockers,
    requirements,
    closeoutReady: closeoutBlockers.length === 0,
    closeoutBlockers,
  };
}
export function acceptConversation(
  workspace: Workspace,
  conversationId: string,
): Workspace {
  const conversation = workspace.conversations.find(
    (c) => c.id === conversationId,
  );
  if (!conversation || conversation.review !== "Pending")
    throw new Error("This response is not awaiting review.");
  const proposal = workspace.proposals.find(
    (p) => p.id === conversation.proposalId,
  );
  if (
    !proposal ||
    proposal.version !== conversation.proposalVersion ||
    proposal.status !== "Issued"
  )
    throw new Error(
      "This response does not reference the current issued proposal. Review the correct revision first.",
    );
  const sourceMessage = conversation.reviewMessageId
    ? conversation.messages.find(
        (message) => message.id === conversation.reviewMessageId,
      )
    : conversation.messages
        .filter((message) => message.direction === "in")
        .at(-1);
  if (
    !sourceMessage ||
    sourceMessage.direction !== "in" ||
    sourceMessage.proposalId !== conversation.proposalId ||
    sourceMessage.proposalVersion !== conversation.proposalVersion
  )
    throw new Error(
      "This response is not linked to the exact proposal revision under review.",
    );
  if (
    workspace.proposals.some(
      (p) => p.number === proposal.number && p.version > proposal.version,
    )
  )
    throw new Error(
      "A newer proposal revision exists. Reconcile this response with the correct offer before accepting.",
    );
  const now = new Date().toISOString();
  return {
    ...workspace,
    proposals: workspace.proposals.map((p) =>
      p.id === proposal.id ? { ...p, status: "Accepted", acceptedAt: now } : p,
    ),
    conversations: workspace.conversations.map((c) =>
      c.id === conversation.id
        ? {
            ...c,
            review: "Confirmed",
            reviewMessageId: sourceMessage.id,
            acceptanceEvidence: {
              messageId: sourceMessage.id,
              proposalId: proposal.id,
              proposalVersion: proposal.version,
              decidedAt: now,
            },
          }
        : c,
    ),
    activity: [
      {
        id: id(),
        title: "Owner confirmed client acceptance",
        detail: `${proposal.number} · revision ${proposal.version}. Resources still require confirmation.`,
        eventId: proposal.eventId,
        at: now,
      },
      ...workspace.activity,
    ],
  };
}
export function reviseProposal(proposal: Proposal): Proposal {
  return {
    ...proposal,
    id: id(),
    version: proposal.version + 1,
    status: "Draft",
    acceptedAt: undefined,
    lines: proposal.lines.map((l) => ({ ...l, id: id() })),
  };
}
export function createProposalRevision(
  workspace: Workspace,
  proposalId: string,
): { workspace: Workspace; proposal: Proposal } {
  const original = workspace.proposals.find((p) => p.id === proposalId);
  if (!original) throw new Error("Proposal not found.");
  const family = workspace.proposals.filter(
    (p) => p.number === original.number,
  );
  const existingDraft = family.find(
    (p) =>
      ["Draft", "In review", "Ready to send"].includes(p.status) &&
      p.version > original.version,
  );
  if (existingDraft) return { workspace, proposal: existingDraft };
  const next = {
    ...reviseProposal(original),
    version: Math.max(...family.map((p) => p.version)) + 1,
  };
  // A new draft cannot rewrite the historical acceptance of an earlier revision.
  return {
    workspace: { ...workspace, proposals: [...workspace.proposals, next] },
    proposal: next,
  };
}
export function downloadFile(
  filename: string,
  data: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
