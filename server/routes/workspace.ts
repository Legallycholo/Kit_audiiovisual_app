import type express from "express";
import { HttpError } from "../database";
import { userOf } from "../security";
import { changeSchema } from "../schema";
import { applyChanges } from "../permissions";
import type { RouteContext } from "./context";

export function mountWorkspaceRoutes(
  app: express.Express,
  { repo, response }: RouteContext,
) {
  app.get("/api/workspace", (_req, res) => res.json(response(res)));
  app.patch("/api/workspace", (req, res) => {
    const user = userOf(res);
    const input = changeSchema.parse(req.body);
    repo.transaction(() => {
      const current = repo.read();
      if (input.revision !== current.revision)
        throw new HttpError(
          409,
          "Another session changed this workspace. Reload the latest data before saving.",
        );
      const next = applyChanges(current.workspace, input.changes, user);
      for (const change of input.changes.filter(
        (c) => c.collection === "tasks",
      )) {
        const task = next.tasks.find((t) => t.id === change.id)!;
        if (task.assigneeId) {
          const assignee = repo.user(task.assigneeId);
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
      for (const change of input.changes.filter(
        (c) => c.collection === "operations",
      )) {
        const operation = next.operations.find(
          (item) => item.id === change.id,
        )!;
        for (const shift of operation.crewShifts) {
          if (!shift.memberId) continue;
          const member = repo.user(shift.memberId);
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
      repo.save(next, input.revision);
      for (const c of input.changes) {
        const eventId =
          c.collection === "events"
            ? c.id
            : typeof c.value === "object" && c.value && "eventId" in c.value
              ? String(c.value.eventId)
              : undefined;
        repo.audit(
          user.id,
          `${c.collection} record saved`,
          `${user.name} · ${c.id}`,
          eventId,
        );
      }
    });
    res.json(response(res));
  });
}
