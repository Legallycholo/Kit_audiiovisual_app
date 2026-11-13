import type { WorkspaceUser } from "../../src/shared/access";
import { canEditCollection } from "../../src/shared/access";
import type { Workspace } from "../../src/shared/types";
import { HttpError } from "../database";

/**
 * A client can go only when nothing else points to it: no event and no
 * message thread. A client that already has work behind it is a record and is
 * kept. Portal accounts linked to the client are checked by the route, which
 * can see the users table.
 */
export function deleteClient(
  workspace: Workspace,
  clientId: string,
  user: WorkspaceUser,
): Workspace {
  if (!canEditCollection(user, "clients"))
    throw new HttpError(403, "Tu rol no puede eliminar clientes.");
  const client = workspace.clients.find((c) => c.id === clientId);
  if (!client) throw new HttpError(404, "No se encontró el cliente.");
  if (
    workspace.events.some((e) => e.clientId === client.id) ||
    workspace.conversations.some((c) => c.clientId === client.id)
  )
    throw new HttpError(
      422,
      "Este cliente tiene eventos o mensajes asociados y no se puede eliminar.",
    );
  return {
    ...workspace,
    clients: workspace.clients.filter((c) => c.id !== client.id),
  };
}
