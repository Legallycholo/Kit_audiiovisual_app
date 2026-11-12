import type express from "express";
import { z } from "zod";
import { HttpError } from "../database";
import { rateLimit, userOf } from "../security";
import { identifier } from "../schema";
import { scopeWorkspace } from "../permissions";
import {
  proposalContext,
  proposalEditContext,
  materializeSuggestion,
} from "../proposal-ai";
import type { RouteContext } from "./context";

export function mountAiRoutes(
  app: express.Express,
  { repo, config }: RouteContext,
) {
  app.get("/api/ai/status", async (_req, res) => {
    const user = userOf(res);
    if (!["Administrator", "Sales Manager"].includes(user.role))
      throw new HttpError(403, "No tienes acceso a la redacción comercial.");
    res.json({
      configured: Boolean(config.proposalGenerator),
      model: config.proposalGenerator?.model || null,
    });
  });
  /**
   * One route for both flows: `eventId` drafts a new proposal for an event;
   * `proposalId` generates or rewrites the content of an existing proposal
   * (linked to an event or not). The answer is a suggestion the person
   * reviews; nothing is saved here.
   */
  app.post("/api/ai/proposal-draft", async (req, res) => {
    const user = userOf(res);
    if (!["Administrator", "Sales Manager"].includes(user.role))
      throw new HttpError(403, "No tienes acceso a la redacción comercial.");
    const input = z
      .object({
        eventId: identifier.optional(),
        proposalId: identifier.optional(),
        brief: z.string().trim().min(10).max(6000),
      })
      .strict()
      .parse(req.body);
    if (!input.eventId && !input.proposalId)
      throw new HttpError(422, "Indica el evento o la propuesta.");
    const generator = config.proposalGenerator;
    if (!generator)
      throw new HttpError(
        503,
        "La IA no está configurada. Puedes crear y editar una propuesta manualmente.",
      );
    await rateLimit(repo, `ai:user:${user.id}`, 10);
    await rateLimit(repo, "ai:company", 30);
    const { workspace, revision } = await repo.read();
    const scoped = scopeWorkspace(workspace, user);
    const context = input.proposalId
      ? proposalEditContext(scoped, input.proposalId, input.brief)
      : proposalContext(scoped, input.eventId!, input.brief);
    const raw = await generator.generate(context);
    // Long-running provider calls must not outlive revoked access or changed source data.
    const currentUser = await repo.user(user.id);
    if (!currentUser?.active || currentUser.role !== user.role)
      throw new HttpError(403, "Tu acceso cambió durante la generación.");
    if ((await repo.read()).revision !== revision)
      throw new HttpError(
        409,
        "Los datos cambiaron durante la generación. Actualiza el espacio antes de generar otra sugerencia.",
      );
    const suggestion = materializeSuggestion(raw, context, generator.model);
    const eventId =
      input.eventId ||
      scoped.proposals.find((p) => p.id === input.proposalId)?.eventId ||
      undefined;
    await repo.audit(
      user.id,
      "AI proposal suggestion generated",
      `${user.name} · ${generator.model} · pending review`,
      eventId,
    );
    res.json({ suggestion });
  });
}
