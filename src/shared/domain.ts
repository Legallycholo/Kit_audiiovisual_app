import type {
  CrewShift,
  Equipment,
  EventOperations,
  Layout,
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
      (r.source || "Owned") === "Owned" &&
      (r.substituteEquipmentId || r.equipmentId) === item.id &&
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
  if ((candidate.source || "Owned") === "Supplier") {
    if (!candidate.supplier?.trim())
      throw new Error("Enter the supplier for an external rental.");
    return;
  }
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

export interface InventoryConflict {
  equipmentId: string;
  at: string;
  reserved: number;
  capacity: number;
  eventIds: string[];
}
export function inventoryConflicts(workspace: Workspace): InventoryConflict[] {
  const conflicts: InventoryConflict[] = [];
  for (const item of workspace.equipment) {
    const reservations = workspace.reservations.filter(
      (reservation) =>
        (reservation.source || "Owned") === "Owned" &&
        (reservation.substituteEquipmentId || reservation.equipmentId) ===
          item.id &&
        !["Returned", "Cancelled"].includes(reservation.status),
    );
    for (const at of [
      ...new Set(reservations.map((reservation) => reservation.start)),
    ]) {
      const active = reservations.filter(
        (reservation) => reservation.start <= at && reservation.end >= at,
      );
      const reserved = active.reduce(
        (sum, reservation) => sum + reservation.quantity,
        0,
      );
      const capacity = Math.max(0, item.quantity - item.maintenance);
      if (reserved > capacity)
        conflicts.push({
          equipmentId: item.id,
          at,
          reserved,
          capacity,
          eventIds: [
            ...new Set(active.map((reservation) => reservation.eventId)),
          ],
        });
    }
  }
  return conflicts;
}

export function crewShiftConflicts(
  operations: EventOperations[],
  candidate: CrewShift,
  eventId: string,
) {
  if (candidate.status === "Cancelled") return [];
  const identity = candidate.memberId || candidate.person.trim().toLowerCase();
  return operations
    .flatMap((operation) =>
      operation.crewShifts
        .filter((shift) => {
          const otherIdentity =
            shift.memberId || shift.person.trim().toLowerCase();
          return (
            shift.id !== candidate.id &&
            shift.status !== "Cancelled" &&
            otherIdentity === identity &&
            shift.start < candidate.end &&
            shift.end > candidate.start
          );
        })
        .map((shift) => ({ eventId: operation.eventId, shift })),
    )
    .filter(
      (conflict) =>
        conflict.eventId !== eventId || conflict.shift.id !== candidate.id,
    );
}

export function actualEventCosts(workspace: Workspace, eventId: string) {
  const operation = workspace.operations.find(
    (item) => item.eventId === eventId,
  );
  const recorded = (operation?.costs || []).reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  const crew = (operation?.crewShifts || [])
    .filter((shift) => shift.status !== "Cancelled")
    .reduce((sum, shift) => sum + shift.cost, 0);
  const transport = (operation?.transports || [])
    .filter((assignment) => assignment.status !== "Cancelled")
    .reduce((sum, assignment) => sum + assignment.cost, 0);
  const supplierRentals = workspace.reservations
    .filter(
      (reservation) =>
        reservation.eventId === eventId &&
        reservation.source === "Supplier" &&
        reservation.status !== "Cancelled",
    )
    .reduce(
      (sum, reservation) =>
        sum + (reservation.unitCost || 0) * reservation.quantity,
      0,
    );
  const reservationIds = new Set(
    workspace.reservations
      .filter((reservation) => reservation.eventId === eventId)
      .map((reservation) => reservation.id),
  );
  const repairs = workspace.maintenanceRecords
    .filter(
      (record) =>
        record.reservationId && reservationIds.has(record.reservationId),
    )
    .reduce((sum, record) => sum + record.cost, 0);
  return {
    recorded,
    crew,
    transport,
    supplierRentals,
    repairs,
    total: recorded + crew + transport + supplierRentals + repairs,
  };
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
  const allocationConflict = inventoryConflicts(workspace).find((conflict) =>
    conflict.eventIds.includes(eventId),
  );
  if (allocationConflict) {
    const equipment = workspace.equipment.find(
      (item) => item.id === allocationConflict.equipmentId,
    );
    blockers.push(
      `Resuelve el conflicto de inventario de ${equipment?.name || allocationConflict.equipmentId}: ${allocationConflict.reserved} asignados para ${allocationConflict.capacity} disponibles.`,
    );
  }

  const eventReservations = workspace.reservations.filter(
    (reservation) => reservation.eventId === eventId,
  );
  const closeoutBlockers: string[] = [];
  const operation = workspace.operations.find(
    (item) => item.eventId === eventId,
  );
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
  if (operation?.crewShifts.some((shift) => shift.status === "Scheduled"))
    closeoutBlockers.push("Completa o cancela todos los turnos de personal.");
  if (operation?.cues.some((cue) => cue.status === "Pending"))
    closeoutBlockers.push("Completa u omite todos los cues del run of show.");
  if (
    operation?.transports.some((transport) =>
      ["Planned", "In transit"].includes(transport.status),
    )
  )
    closeoutBlockers.push("Completa o cancela todos los transportes.");

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

export function validateLayoutGeometry(layout: Layout): string[] {
  const errors: string[] = [];
  for (const object of layout.objects) {
    if (object.x + object.width > layout.width + 0.001)
      errors.push(`${object.label} excede el ancho del espacio.`);
    if (object.y + object.depth > layout.depth + 0.001)
      errors.push(`${object.label} excede la profundidad del espacio.`);
    if (object.equipmentQuantity && !object.equipmentId)
      errors.push(`${object.label} tiene una cantidad sin equipo vinculado.`);
  }
  if (
    layout.verified &&
    (!layout.verifiedAt || !layout.verificationNote?.trim())
  )
    errors.push(
      "La verificación requiere fecha y una nota sobre la fuente de las medidas.",
    );
  const cameraIds = new Set<string>();
  for (const camera of layout.cameras || []) {
    if (cameraIds.has(camera.id))
      errors.push("Las vistas de cámara deben tener identidades únicas.");
    cameraIds.add(camera.id);
    const distance = Math.hypot(
      camera.position.x - camera.target.x,
      camera.position.y - camera.target.y,
      camera.position.z - camera.target.z,
    );
    if (distance < 0.1)
      errors.push(`${camera.name} tiene una posición de cámara inválida.`);
  }
  return errors;
}

export interface LayoutEquipmentReconciliation {
  proposal?: Proposal;
  rows: {
    equipmentId: string;
    name: string;
    required: number;
    mapped: number;
    difference: number;
  }[];
  complete: boolean;
}

export function reconcileLayoutEquipment(
  workspace: Workspace,
  layout: Layout,
): LayoutEquipmentReconciliation {
  const proposal = workspace.proposals
    .filter(
      (item) => item.eventId === layout.eventId && item.status !== "Superseded",
    )
    .sort((a, b) => {
      const accepted =
        Number(b.status === "Accepted") - Number(a.status === "Accepted");
      return accepted || b.version - a.version;
    })[0];
  const required = new Map<string, number>();
  for (const line of proposal?.lines || [])
    if (line.equipmentId)
      required.set(
        line.equipmentId,
        (required.get(line.equipmentId) || 0) + line.quantity,
      );
  const mapped = new Map<string, number>();
  for (const object of layout.objects)
    if (object.equipmentId)
      mapped.set(
        object.equipmentId,
        (mapped.get(object.equipmentId) || 0) + (object.equipmentQuantity || 1),
      );
  const ids = new Set([...required.keys(), ...mapped.keys()]);
  const rows = [...ids]
    .map((equipmentId) => {
      const requiredQuantity = required.get(equipmentId) || 0;
      const mappedQuantity = mapped.get(equipmentId) || 0;
      return {
        equipmentId,
        name:
          workspace.equipment.find((item) => item.id === equipmentId)?.name ||
          equipmentId,
        required: requiredQuantity,
        mapped: mappedQuantity,
        difference: mappedQuantity - requiredQuantity,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    proposal,
    rows,
    complete: Boolean(proposal) && rows.every((row) => row.difference === 0),
  };
}

const xml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character]!,
  );

export function layoutSvg(layout: Layout, equipment: Equipment[]): string {
  const scale = 40;
  const margin = 80;
  const width = layout.width * scale + margin * 2;
  const height = layout.depth * scale + margin * 2 + 50;
  const colors: Record<string, string> = {
    Stage: "#667c70",
    Table: "#c7d4bd",
    Chair: "#c6d3dc",
    Booth: "#d3c9e1",
    "LED wall": "#7599b0",
    Speaker: "#606777",
    Light: "#e2c883",
    Truss: "#a8afb2",
    Exit: "#b3d1bd",
    Screen: "#95bacb",
    Decoration: "#c7ad9b",
  };
  const objects = layout.objects
    .map((object) => {
      const x = margin + object.x * scale;
      const y = margin + object.y * scale;
      const w = object.width * scale;
      const h = object.depth * scale;
      const equipmentName = object.equipmentId
        ? equipment.find((item) => item.id === object.equipmentId)?.name
        : undefined;
      return `<g transform="rotate(${object.rotation} ${x + w / 2} ${y + h / 2})"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${object.surfaceColor || colors[object.kind] || "#d9dfd4"}" stroke="#526156"/><text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" dominant-baseline="middle" font-size="11" fill="#26372e">${xml(object.surfaceLabel || object.label)}</text>${equipmentName ? `<title>${xml(equipmentName)} × ${object.equipmentQuantity || 1}</title>` : ""}</g>`;
    })
    .join("");
  const reference = layout.reference
    ? `<image href="${layout.reference.dataUrl}" x="${margin}" y="${margin}" width="${layout.width * scale}" height="${layout.depth * scale}" opacity="${layout.reference.opacity}" preserveAspectRatio="none"/>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fff"/><text x="${margin}" y="32" font-family="sans-serif" font-size="18" font-weight="600">${xml(layout.name)} · v${layout.version}</text><text x="${margin}" y="52" font-family="sans-serif" font-size="11" fill="#59665d">${layout.width} m × ${layout.depth} m · ${layout.verified ? "Medidas verificadas" : "MEDIDAS NO VERIFICADAS"}</text><rect x="${margin}" y="${margin}" width="${layout.width * scale}" height="${layout.depth * scale}" fill="#fff" stroke="#405348" stroke-width="2"/>${reference}${objects}<text x="${width / 2}" y="${margin - 12}" text-anchor="middle" font-family="sans-serif" font-size="11">${layout.width} m</text><text x="18" y="${margin + (layout.depth * scale) / 2}" text-anchor="middle" font-family="sans-serif" font-size="11" transform="rotate(-90 18 ${margin + (layout.depth * scale) / 2})">${layout.depth} m</text></svg>`;
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
    creativeAssetIds: proposal.creativeAssetIds
      ? [...proposal.creativeAssetIds]
      : undefined,
    visuals: proposal.visuals?.map((visual) => ({ ...visual, id: id() })),
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
