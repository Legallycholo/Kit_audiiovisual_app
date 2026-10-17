import type express from "express";
import { z } from "zod";
import { HttpError } from "../database";
import { userOf } from "../security";
import { acceptConversation } from "../../src/shared/domain";
import type { RouteContext } from "./context";

export function mountConversationRoutes(
  app: express.Express,
  { repo, response }: RouteContext,
) {
  app.post("/api/conversations/:id/accept", (req, res) => {
    const user = userOf(res);
    if (!user.isOwner)
      throw new HttpError(403, "Only the owner can confirm client acceptance.");
    const revision = z
      .object({ revision: z.number().int().nonnegative() })
      .strict()
      .parse(req.body).revision;
    repo.transaction(() => {
      const current = repo.read();
      if (revision !== current.revision)
        throw new HttpError(
          409,
          "The offer or conversation changed. Reload it before confirming.",
        );
      const next = acceptConversation(current.workspace, String(req.params.id));
      const confirmed = next.conversations.find(
        (conversation) => conversation.id === req.params.id,
      );
      if (confirmed?.acceptanceEvidence)
        confirmed.acceptanceEvidence.ownerId = user.id;
      repo.save(next, revision);
      const conversation = next.conversations.find(
        (c) => c.id === req.params.id,
      )!;
      repo.audit(
        user.id,
        "Owner confirmed client acceptance",
        `${user.name} · ${conversation.proposalId} · revision ${conversation.proposalVersion}`,
        conversation.eventId,
      );
    });
    res.json(response(res));
  });
}
