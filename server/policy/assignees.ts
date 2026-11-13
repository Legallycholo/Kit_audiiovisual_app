import type { WorkspaceChange } from "../../src/shared/access";
import type { Workspace } from "../../src/shared/types";
import { HttpError, type Repository } from "../database";

/**
 * People named on tasks and crew shifts must hold an active account with
 * access to the event. Shared by the workspace save route and KIT's actions.
 */
export async function assertTaskAssignees(
  repo: Repository,
  next: Workspace,
  changes: WorkspaceChange[],
) {
  for (const change of changes.filter((c) => c.collection === "tasks")) {
    const task = next.tasks.find((t) => t.id === change.id)!;
    if (task.assigneeId) {
      const assignee = await repo.user(task.assigneeId);
      if (
        !assignee?.active ||
        assignee.role === "Client / Guest" ||
        (assignee.role !== "Administrator" &&
          !JSON.parse(assignee.event_ids).includes(task.eventId)) ||
        assignee.name !== task.assignee
      )
        throw new HttpError(
          422,
          "La persona asignada debe tener una cuenta activa y acceso al evento.",
        );
    }
  }
}
export async function assertCrewMembers(
  repo: Repository,
  next: Workspace,
  changes: WorkspaceChange[],
) {
  for (const change of changes.filter((c) => c.collection === "operations")) {
    const operation = next.operations.find((item) => item.id === change.id)!;
    for (const shift of operation.crewShifts) {
      if (!shift.memberId) continue;
      const member = await repo.user(shift.memberId);
      if (
        !member?.active ||
        member.role === "Client / Guest" ||
        (member.role !== "Administrator" &&
          !JSON.parse(member.event_ids).includes(operation.eventId)) ||
        member.name !== shift.person
      )
        throw new HttpError(
          422,
          "La persona del turno debe tener una cuenta activa y acceso al evento.",
        );
    }
  }
}
