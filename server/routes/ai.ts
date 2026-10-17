import type express from "express";
import { z } from "zod";
import { HttpError } from "../database";
import { rateLimit, userOf } from "../security";
import { identifier } from "../schema";
import { scopeWorkspace } from "../permissions";
import { proposalContext, materializeSuggestion } from "../proposal-ai";
import type { RouteContext } from "./context";

export function mountAiRoutes(
  app: express.Express,
  { repo, config }: RouteContext,
) {
  app.get("/api/ai/status", (_req, res) => {
    const user = userOf(res);
    if (!["Administrator", "Sales Manager"].includes(user.role))
      throw new HttpError(403, "No tienes acceso a la redacción comercial.");
    res.json({
      configured: Boolean(config.proposalGenerator),
      model: config.proposalGenerator?.model || null,
    });
  });
  app.post("/api/ai/proposal-draft", async (req, res) => {
    const user = userOf(res);
    if (!["Administrator", "Sales Manager"].includes(user.role))
      throw new HttpError(403, "No tienes acceso a la redacción comercial.");
    const input = z
      .object({
        eventId: identifier,
        brief: z.string().trim().min(10).max(6000),
      })
      .strict()
      .parse(req.body);
    const generator = config.proposalGenerator;
    if (!generator)
      throw new HttpError(
        503,
        "La IA no está configurada. Puedes crear y editar una propuesta manualmente.",
      );
    rateLimit(repo, `ai:user:${user.id}`, 10);
    rateLimit(repo, "ai:company", 30);
    const { workspace, revision } = repo.read();
    const context = proposalContext(
      scopeWorkspace(workspace, user),
      input.eventId,
      input.brief,
    );
    const raw = await generator.generate(context);
    // Long-running provider calls must not outlive revoked access or changed source data.
    const currentUser = repo.user(user.id);
    if (!currentUser?.active || currentUser.role !== user.role)
      throw new HttpError(403, "Tu acceso cambió durante la generación.");
    if (repo.read().revision !== revision)
      throw new HttpError(
        409,
        "Los datos cambiaron durante la generación. Actualiza el espacio antes de generar otra sugerencia.",
      );
    const suggestion = materializeSuggestion(raw, context, generator.model);
    repo.audit(
      user.id,
      "AI proposal suggestion generated",
      `${user.name} · ${generator.model} · pending review`,
      input.eventId,
    );
    res.json({ suggestion });
  });
}
