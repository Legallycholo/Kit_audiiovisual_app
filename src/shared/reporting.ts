import { actualEventCosts, productionReadiness, quoteTotals } from "./domain";
import type { AutomationRecord, Proposal, Workspace } from "./types";

const DAY = 86_400_000;
const utcDay = (value: string) =>
  new Date(`${value.slice(0, 10)}T00:00:00.000Z`).getTime();
export const inclusiveDays = (start: string, end: string) =>
  Math.max(0, Math.floor((utcDay(end) - utcDay(start)) / DAY) + 1);
const overlapDays = (
  start: string,
  end: string,
  rangeStart: string,
  rangeEnd: string,
) => {
  const overlapStart = Math.max(utcDay(start), utcDay(rangeStart));
  const overlapEnd = Math.min(utcDay(end), utcDay(rangeEnd));
  return overlapEnd < overlapStart
    ? 0
    : Math.floor((overlapEnd - overlapStart) / DAY) + 1;
};

export const metricDefinitions = [
  {
    name: "Alcance aceptado",
    formula:
      "Total de la última propuesta aceptada por evento, después de descuento e impuesto. No equivale a ingreso cobrado.",
  },
  {
    name: "Contribución operativa",
    formula:
      "Alcance aceptado menos costos operativos registrados. No incluye costos generales, nómina contable ni pagos.",
  },
  {
    name: "Utilización comprometida",
    formula:
      "Unidades-día confirmadas, despachadas o devueltas ÷ unidades-día propias disponibles en el periodo.",
  },
  {
    name: "Carga de trabajo",
    formula:
      "Tareas abiertas/completadas y horas de turnos no cancelados, agrupadas por el nombre o cuenta asignada.",
  },
  {
    name: "Ejecución del evento",
    formula:
      "Elementos completados entre tareas, cues, transportes y devoluciones que existen para el evento.",
  },
] as const;

export function currentProposals(workspace: Workspace) {
  const byNumber = new Map<string, Proposal>();
  for (const proposal of workspace.proposals) {
    const current = byNumber.get(proposal.number);
    if (!current || proposal.version > current.version)
      byNumber.set(proposal.number, proposal);
  }
  return [...byNumber.values()];
}

export function pipelineReport(workspace: Workspace) {
  const proposals = currentProposals(workspace);
  const statuses = [
    "Draft",
    "In review",
    "Ready to send",
    "Issued",
    "Accepted",
    "Declined",
  ] as const;
  return statuses.map((status) => {
    const records = proposals.filter((proposal) => proposal.status === status);
    return {
      status,
      count: records.length,
      value: records.reduce(
        (sum, proposal) =>
          sum +
          quoteTotals(proposal.lines, proposal.discount, proposal.tax).total,
        0,
      ),
    };
  });
}

export function financialReport(workspace: Workspace) {
  return workspace.events.map((event) => {
    const accepted = workspace.proposals
      .filter(
        (proposal) =>
          proposal.eventId === event.id && proposal.status === "Accepted",
      )
      .sort((a, b) => b.version - a.version)[0];
    const acceptedValue = accepted
      ? quoteTotals(accepted.lines, accepted.discount, accepted.tax).total
      : 0;
    const actual = actualEventCosts(workspace, event.id);
    const contribution = acceptedValue - actual.total;
    const newerRevision = Boolean(
      accepted &&
      workspace.proposals.some(
        (proposal) =>
          proposal.number === accepted.number &&
          proposal.version > accepted.version,
      ),
    );
    return {
      eventId: event.id,
      eventName: event.name,
      acceptedProposal: accepted,
      acceptedValue,
      actualCost: actual.total,
      contribution,
      marginPercent:
        acceptedValue > 0 ? (contribution / acceptedValue) * 100 : undefined,
      scopeStatus: accepted
        ? newerRevision
          ? ("Reconciliation required" as const)
          : ("Accepted current" as const)
        : ("No accepted scope" as const),
    };
  });
}

export function utilizationReport(
  workspace: Workspace,
  start: string,
  end: string,
) {
  const rangeDays = inclusiveDays(start, end);
  return workspace.equipment.map((equipment) => {
    const reservations = workspace.reservations.filter(
      (reservation) =>
        (reservation.source || "Owned") === "Owned" &&
        (reservation.substituteEquipmentId || reservation.equipmentId) ===
          equipment.id &&
        reservation.status !== "Cancelled",
    );
    const units = (status: "Hold" | "Committed") =>
      reservations
        .filter((reservation) =>
          status === "Hold"
            ? reservation.status === "Hold"
            : reservation.status !== "Hold",
        )
        .reduce(
          (sum, reservation) =>
            sum +
            reservation.quantity *
              overlapDays(reservation.start, reservation.end, start, end),
          0,
        );
    const capacityUnitDays =
      Math.max(0, equipment.quantity - equipment.maintenance) * rangeDays;
    const committedUnitDays = units("Committed");
    const holdUnitDays = units("Hold");
    return {
      equipmentId: equipment.id,
      name: equipment.name,
      capacityUnitDays,
      committedUnitDays,
      holdUnitDays,
      utilizationPercent:
        capacityUnitDays > 0
          ? (committedUnitDays / capacityUnitDays) * 100
          : undefined,
    };
  });
}

export function workloadReport(workspace: Workspace) {
  const people = new Map<
    string,
    {
      person: string;
      openTasks: number;
      completedTasks: number;
      scheduledHours: number;
      completedHours: number;
    }
  >();
  const person = (name: string) => {
    const key = name.trim().toLowerCase();
    if (!people.has(key))
      people.set(key, {
        person: name,
        openTasks: 0,
        completedTasks: 0,
        scheduledHours: 0,
        completedHours: 0,
      });
    return people.get(key)!;
  };
  for (const task of workspace.tasks) {
    const row = person(task.assignee);
    if (task.done) row.completedTasks += 1;
    else row.openTasks += 1;
  }
  for (const operation of workspace.operations)
    for (const shift of operation.crewShifts) {
      if (shift.status === "Cancelled") continue;
      const hours = Math.max(
        0,
        (new Date(shift.end).getTime() - new Date(shift.start).getTime()) /
          3_600_000,
      );
      const row = person(shift.person);
      row.scheduledHours += hours;
      if (shift.status === "Completed") row.completedHours += hours;
    }
  return [...people.values()].sort(
    (a, b) =>
      b.openTasks - a.openTasks ||
      b.scheduledHours - a.scheduledHours ||
      a.person.localeCompare(b.person),
  );
}

export function performanceReport(workspace: Workspace) {
  return workspace.events.map((event) => {
    const tasks = workspace.tasks.filter((item) => item.eventId === event.id);
    const reservations = workspace.reservations.filter(
      (item) => item.eventId === event.id && item.status !== "Cancelled",
    );
    const operation = workspace.operations.find(
      (item) => item.eventId === event.id,
    );
    const checks = [
      ...tasks.map((task) => task.done),
      ...(operation?.cues || []).map((cue) => cue.status !== "Pending"),
      ...(operation?.transports || []).map((transport) =>
        ["Complete", "Cancelled"].includes(transport.status),
      ),
      ...reservations.map((reservation) => reservation.status === "Returned"),
    ];
    const completed = checks.filter(Boolean).length;
    return {
      eventId: event.id,
      eventName: event.name,
      status: event.status,
      completed,
      total: checks.length,
      completionPercent:
        checks.length > 0 ? (completed / checks.length) * 100 : undefined,
      onsiteChanges: operation?.changes.length || 0,
    };
  });
}

export function dataQualityReport(workspace: Workspace) {
  const issues: { key: string; eventId?: string; message: string }[] = [];
  for (const event of workspace.events) {
    const accepted = workspace.proposals.some(
      (proposal) =>
        proposal.eventId === event.id && proposal.status === "Accepted",
    );
    if (event.status !== "Cancelled" && !accepted)
      issues.push({
        key: `accepted:${event.id}`,
        eventId: event.id,
        message: `${event.name}: no hay alcance aceptado para comparar.`,
      });
    if (
      ["Preparation", "In production", "Completed"].includes(event.status) &&
      !workspace.operations.some((operation) => operation.eventId === event.id)
    )
      issues.push({
        key: `operations:${event.id}`,
        eventId: event.id,
        message: `${event.name}: no tiene registro operativo detallado.`,
      });
  }
  for (const equipment of workspace.equipment) {
    const attributed = workspace.maintenanceRecords
      .filter(
        (record) =>
          record.equipmentId === equipment.id && record.status !== "Resolved",
      )
      .reduce((sum, record) => sum + record.quantity, 0);
    if (equipment.maintenance > attributed)
      issues.push({
        key: `maintenance:${equipment.id}`,
        message: `${equipment.name}: ${equipment.maintenance - attributed} unidades fuera de servicio sin registro de mantenimiento.`,
      });
  }
  return issues;
}

export type AutomationCandidate = Omit<
  AutomationRecord,
  | "id"
  | "status"
  | "createdAt"
  | "decidedAt"
  | "decidedBy"
  | "taskId"
  | "failureReason"
>;

export function automationCandidates(
  workspace: Workspace,
  now = new Date(),
): AutomationCandidate[] {
  const today = now.toISOString().slice(0, 10);
  const inDays = (value: string) =>
    Math.ceil((utcDay(value) - utcDay(today)) / DAY);
  const candidates: AutomationCandidate[] = [];
  for (const proposal of currentProposals(workspace)) {
    if (
      ["Ready to send", "Issued"].includes(proposal.status) &&
      inDays(proposal.validUntil) <= 3
    )
      candidates.push({
        key: `proposal-review:${proposal.id}:${proposal.version}`,
        proposalId: proposal.id,
        eventId: proposal.eventId,
        kind: "Proposal review",
        title: "Revisar propuesta próxima a vencer",
        detail: `${proposal.number} · versión ${proposal.version} vence ${proposal.validUntil}. Ningún mensaje se enviará automáticamente.`,
        dueAt: `${proposal.validUntil}T12:00:00.000Z`,
        action: "Review only",
      });
  }
  for (const event of workspace.events) {
    const days = inDays(event.date);
    if (
      !["Completed", "Cancelled"].includes(event.status) &&
      days >= 0 &&
      days <= 7
    ) {
      const readiness = productionReadiness(workspace, event.id);
      if (!readiness.ready)
        candidates.push({
          key: `preparation-risk:${event.id}:${event.date}`,
          eventId: event.id,
          kind: "Preparation risk",
          title: "Resolver preparación del evento",
          detail: `${event.name}: ${readiness.blockers[0] || "revisa la preparación operativa"}`,
          dueAt: `${event.date}T12:00:00.000Z`,
          action: "Create task",
        });
    }
  }
  for (const reservation of workspace.reservations) {
    if (reservation.status === "Dispatched" && reservation.end < today) {
      const equipment = workspace.equipment.find(
        (item) =>
          item.id ===
          (reservation.substituteEquipmentId || reservation.equipmentId),
      );
      candidates.push({
        key: `equipment-return:${reservation.id}:${reservation.end}`,
        eventId: reservation.eventId,
        kind: "Equipment return",
        title: "Reconciliar devolución vencida",
        detail: `${reservation.quantity} × ${equipment?.name || reservation.equipmentId} debía regresar ${reservation.end}.`,
        dueAt: `${reservation.end}T12:00:00.000Z`,
        action: "Create task",
      });
    }
  }
  for (const row of financialReport(workspace)) {
    if (row.acceptedValue > 0 && row.actualCost > row.acceptedValue)
      candidates.push({
        key: `cost-variance:${row.eventId}:${row.acceptedProposal!.id}`,
        eventId: row.eventId,
        proposalId: row.acceptedProposal!.id,
        kind: "Cost variance",
        title: "Revisar costo sobre alcance aceptado",
        detail: `${row.eventName}: costo real ${row.actualCost.toFixed(2)} supera alcance aceptado ${row.acceptedValue.toFixed(2)}.`,
        dueAt: now.toISOString(),
        action: "Review only",
      });
  }
  return candidates.slice(0, 100);
}
