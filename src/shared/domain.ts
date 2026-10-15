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
      c.id === conversation.id ? { ...c, review: "Confirmed" } : c,
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
