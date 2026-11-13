import type { WorkspaceUser } from "../../src/shared/access";
import { canEditCollection } from "../../src/shared/access";
import type { Collection } from "../../src/shared/access";
import type { Workspace } from "../../src/shared/types";
import { HttpError } from "../database";
import { ownsEvent } from "./scope";

/** Records that can be deleted from their own list, and what points to them. */
export const deletable = {
  events: { field: "eventId", noun: "el evento", plural: "eventos" },
  venues: { field: "venueId", noun: "el lugar", plural: "lugares" },
  equipment: { field: "equipmentId", noun: "el equipo", plural: "equipos" },
} as const;
export type DeletableKind = keyof typeof deletable;

/** True when any record outside `skip` carries `field: id`, however deeply nested. */
function referenced(
  workspace: Workspace,
  skip: Collection,
  field: string,
  id: string,
): boolean {
  const seen = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(seen);
    if (!value || typeof value !== "object") return false;
    return Object.entries(value).some(
      ([key, v]) => (key === field && v === id) || seen(v),
    );
  };
  return (Object.keys(workspace) as Array<keyof Workspace>).some(
    (key) =>
      key !== skip &&
      key !== "activity" &&
      key !== "settings" &&
      key !== "schema" &&
      seen(workspace[key]),
  );
}

/**
 * Deleting is the one thing the workspace PATCH refuses for every record, so
 * each list has its own narrow rule: the role may edit that list, and nothing
 * else (event, proposal, task, reservation, layout, message...) points to the
 * record. Records that already have work behind them are kept.
 */
export function deleteRecord(
  workspace: Workspace,
  kind: DeletableKind,
  id: string,
  user: WorkspaceUser,
): { workspace: Workspace; label: string } {
  const meta = deletable[kind];
  if (!canEditCollection(user, kind))
    throw new HttpError(403, `Tu rol no puede eliminar ${meta.plural}.`);
  const list = workspace[kind] as Array<{ id: string; name: string }>;
  const record = list.find((r) => r.id === id);
  // A person who cannot see an event gets the same answer as for a missing one.
  if (!record || (kind === "events" && !ownsEvent(user, id)))
    throw new HttpError(404, `No se encontró ${meta.noun}.`);
  if (referenced(workspace, kind, meta.field, id))
    throw new HttpError(
      422,
      kind === "events"
        ? "Este evento ya tiene propuestas, tareas, reservas o mensajes asociados y no se puede eliminar."
        : `Este ${kind === "venues" ? "lugar" : "equipo"} se usa en eventos, propuestas o reservas y no se puede eliminar.`,
    );
  return {
    workspace: { ...workspace, [kind]: list.filter((r) => r.id !== id) },
    label: record.name,
  };
}
