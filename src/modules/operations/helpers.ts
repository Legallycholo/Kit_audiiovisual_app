import { id } from "../../shared/domain";
import type { EventOperations, Workspace } from "../../shared/types";

export const emptyOperations = (eventId: string): EventOperations => ({
  id: id(),
  eventId,
  crewShifts: [],
  cues: [],
  transports: [],
  changes: [],
  costs: [],
});
export function changeOperations(
  workspace: Workspace,
  eventId: string,
  change: (record: EventOperations) => EventOperations,
) {
  const current = workspace.operations.find((item) => item.eventId === eventId);
  const next = change(
    current ? structuredClone(current) : emptyOperations(eventId),
  );
  return current
    ? workspace.operations.map((item) =>
        item.eventId === eventId ? next : item,
      )
    : [...workspace.operations, next];
}
export const dateTimeLabel = (value: string) =>
  new Intl.DateTimeFormat("es-PR", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
