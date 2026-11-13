import type express from "express";
import { HttpError } from "../database";
import { userOf } from "../security";
import { changeSchema } from "../schema";
import { applyChanges } from "../permissions";
import { deleteDraftProposal } from "../policy/delete-draft";
import { assertCrewMembers, assertTaskAssignees } from "../policy/assignees";
import { identifier } from "../schema";
import type { RouteContext } from "./context";

export function mountWorkspaceRoutes(
  app: express.Express,
  { repo, response }: RouteContext,
) {
  app.get("/api/workspace", async (_req, res) => res.json(await response(res)));
  app.patch("/api/workspace", async (req, res) => {
    const user = userOf(res);
    const input = changeSchema.parse(req.body);
    await repo.transaction(async () => {
      const current = await repo.read();
      if (input.revision !== current.revision)
        throw new HttpError(
          409,
          "Another session changed this workspace. Reload the latest data before saving.",
        );
      const next = applyChanges(current.workspace, input.changes, user);
      await assertTaskAssignees(repo, next, input.changes);
      await assertCrewMembers(repo, next, input.changes);
      await repo.save(next, input.revision);
      for (const c of input.changes) {
        const eventId =
          c.collection === "events"
            ? c.id
            : typeof c.value === "object" && c.value && "eventId" in c.value
              ? String(c.value.eventId)
              : undefined;
        await repo.audit(
          user.id,
          `${c.collection} record saved`,
          `${user.name} · ${c.id}`,
          eventId,
        );
      }
    });
    res.json(await response(res));
  });
  // Draft proposals are the only records that can be deleted (see policy/delete-draft).
  app.delete("/api/proposals/:id", async (req, res) => {
    const user = userOf(res);
    const id = identifier.parse(req.params.id);
    await repo.transaction(async () => {
      const current = await repo.read();
      const proposal = current.workspace.proposals.find((p) => p.id === id);
      const next = deleteDraftProposal(current.workspace, id, user);
      await repo.save(next, current.revision);
      await repo.audit(
        user.id,
        "Proposal draft deleted",
        `${user.name} · ${proposal!.number} · v${proposal!.version}`,
        proposal!.eventId || undefined,
      );
    });
    res.json(await response(res));
  });
}
