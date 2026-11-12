import type { WorkspaceUser } from "../../src/shared/access";
import { canEditCollection } from "../../src/shared/access";
import type { Workspace } from "../../src/shared/types";
import { HttpError } from "../database";
import { ownsEvent } from "./scope";

/**
 * Deleting is the one thing the workspace PATCH refuses for every record, so a
 * draft proposal has its own narrow rule: only a Draft that nothing else
 * points to (no message, no automation) can go. Sent, accepted or otherwise
 * kept revisions are records and are never deleted.
 */
export function deleteDraftProposal(
  workspace: Workspace,
  proposalId: string,
  user: WorkspaceUser,
): Workspace {
  if (!canEditCollection(user, "proposals"))
    throw new HttpError(403, "Tu rol no puede eliminar propuestas.");
  const proposal = workspace.proposals.find((p) => p.id === proposalId);
  // A person who cannot see a proposal gets the same answer as for a missing one.
  if (!proposal || (proposal.eventId && !ownsEvent(user, proposal.eventId)))
    throw new HttpError(404, "No se encontró la propuesta.");
  if (proposal.status !== "Draft")
    throw new HttpError(
      422,
      "Solo se pueden eliminar borradores. Las versiones enviadas o aceptadas se conservan.",
    );
  if (
    workspace.conversations.some(
      (c) =>
        c.proposalId === proposal.id ||
        c.messages.some((m) => m.proposalId === proposal.id),
    ) ||
    workspace.automations.some((a) => a.proposalId === proposal.id)
  )
    throw new HttpError(
      422,
      "Este borrador ya tiene mensajes o tareas asociadas y no se puede eliminar.",
    );
  return {
    ...workspace,
    proposals: workspace.proposals.filter((p) => p.id !== proposal.id),
  };
}
