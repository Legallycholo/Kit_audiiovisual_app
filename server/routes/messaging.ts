import type express from "express";
import { z } from "zod";
import { HttpError } from "../database";
import { userOf } from "../security";
import { identifier } from "../schema";
import { ingestInboundMessage } from "../messaging";
import type { RouteContext } from "./context";

export function mountMessagingRoutes(
  app: express.Express,
  { repo, config, response }: RouteContext,
) {
  app.get("/api/messaging/status", (_req, res) => {
    const user = userOf(res);
    if (!["Administrator", "Sales Manager"].includes(user.role))
      throw new HttpError(403, "No tienes acceso a mensajes de clientes.");
    res.json({
      configured: Boolean(config.messageTransport),
      label: config.messageTransport?.label || null,
    });
  });
  app.post("/api/messaging/showcase/inbound", (req, res) => {
    const user = userOf(res);
    if (!user.isOwner)
      throw new HttpError(
        403,
        "Solo el propietario puede agregar mensajes de demostración.",
      );
    const input = z
      .object({
        externalId: z.string().trim().min(1).max(500),
        channel: z.string().trim().min(1).max(200),
        conversationId: identifier,
        text: z.string().trim().min(1).max(20_000),
        receivedAt: z.string().datetime(),
        acceptanceSignal: z.boolean(),
        proposalId: identifier.optional(),
        proposalVersion: z.number().int().positive().optional(),
      })
      .strict()
      .refine(
        (value) => Boolean(value.proposalId) === Boolean(value.proposalVersion),
        "La propuesta y su versión deben proporcionarse juntas.",
      )
      .parse(req.body);
    let duplicate = false;
    let needsLinking = false;
    repo.transaction(() => {
      const current = repo.read();
      const result = ingestInboundMessage(current.workspace, input);
      duplicate = result.duplicate;
      needsLinking = result.needsLinking;
      if (duplicate) return;
      repo.save(result.workspace, current.revision);
      const conversation = result.workspace.conversations.find(
        (item) => item.id === input.conversationId,
      )!;
      repo.audit(
        user.id,
        needsLinking
          ? "Inbound response needs linking"
          : "Inbound message recorded",
        `${input.channel} · ${input.externalId}`,
        conversation.eventId,
      );
    });
    res.status(duplicate ? 200 : 201).json({
      ...response(res),
      intake: { duplicate, needsLinking },
    });
  });
  app.post(
    "/api/conversations/:conversationId/messages/:messageId/send",
    async (req, res) => {
      const user = userOf(res);
      if (!user.isOwner)
        throw new HttpError(
          403,
          "Solo el propietario puede confirmar mensajes para envío.",
        );
      const revision = z
        .object({ revision: z.number().int().nonnegative() })
        .strict()
        .parse(req.body).revision;
      const transport = config.messageTransport;
      if (!transport)
        throw new HttpError(
          503,
          "El canal de mensajes no está conectado. El borrador permanece disponible.",
        );
      let outgoing!: {
        recipient: string;
        text: string;
        proposalId?: string;
        proposalVersion?: number;
      };
      repo.transaction(() => {
        const current = repo.read();
        if (current.revision !== revision)
          throw new HttpError(
            409,
            "La conversación cambió. Actualiza antes de confirmar el envío.",
          );
        const next = structuredClone(current.workspace);
        const conversation = next.conversations.find(
          (item) => item.id === req.params.conversationId,
        );
        if (!conversation)
          throw new HttpError(404, "No se encontró la conversación.");
        const message = conversation.messages.find(
          (item) => item.id === req.params.messageId,
        );
        if (!message || message.direction !== "out")
          throw new HttpError(404, "No se encontró el mensaje saliente.");
        if (message.status !== "Draft")
          throw new HttpError(422, "Este mensaje ya fue procesado.");
        const client = next.clients.find(
          (item) => item.id === conversation.clientId,
        );
        if (!client?.phone.trim())
          throw new HttpError(
            422,
            "El cliente necesita un número de teléfono antes del envío.",
          );
        if (
          conversation.proposalId &&
          (message.proposalId !== conversation.proposalId ||
            message.proposalVersion !== conversation.proposalVersion)
        )
          throw new HttpError(
            422,
            "El mensaje debe conservar la propuesta y versión exactas de la conversación.",
          );
        const linkedProposal = message.proposalId
          ? next.proposals.find((item) => item.id === message.proposalId)
          : undefined;
        if (
          linkedProposal &&
          !["Ready to send", "Issued", "Accepted"].includes(
            linkedProposal.status,
          )
        )
          throw new HttpError(
            422,
            "La propuesta debe completar la revisión interna antes del envío.",
          );
        const approvedAt = new Date().toISOString();
        Object.assign(message, {
          status: "Queued" as const,
          channel: transport.label,
          approvedBy: user.id,
          approvedAt,
          failureReason: undefined,
        });
        outgoing = {
          recipient: client.phone,
          text: message.text,
          proposalId: message.proposalId,
          proposalVersion: message.proposalVersion,
        };
        repo.save(next, revision);
        repo.audit(
          user.id,
          "Owner approved outgoing message",
          `${user.name} · ${message.id} · ${transport.label}`,
          conversation.eventId,
        );
      });
      try {
        const result = await transport.send({
          idempotencyKey: String(req.params.messageId),
          conversationId: String(req.params.conversationId),
          ...outgoing,
        });
        repo.transaction(() => {
          const current = repo.read();
          const next = structuredClone(current.workspace);
          const conversation = next.conversations.find(
            (item) => item.id === req.params.conversationId,
          )!;
          const message = conversation.messages.find(
            (item) => item.id === req.params.messageId,
          )!;
          if (message.status !== "Queued")
            throw new HttpError(409, "El estado del mensaje cambió.");
          Object.assign(message, {
            status: result.status,
            sentAt: new Date().toISOString(),
            providerMessageId: result.externalId,
          });
          const linkedProposal = message.proposalId
            ? next.proposals.find((item) => item.id === message.proposalId)
            : undefined;
          if (linkedProposal?.status === "Ready to send")
            linkedProposal.status = "Issued";
          repo.save(next, current.revision);
          repo.audit(
            user.id,
            "Outgoing message delivered to transport",
            `${message.id} · ${result.status} · ${transport.label}`,
            conversation.eventId,
          );
        });
      } catch (error) {
        repo.transaction(() => {
          const current = repo.read();
          const next = structuredClone(current.workspace);
          const conversation = next.conversations.find(
            (item) => item.id === req.params.conversationId,
          )!;
          const message = conversation.messages.find(
            (item) => item.id === req.params.messageId,
          )!;
          if (message.status === "Queued") {
            message.status = "Failed";
            message.failureReason =
              "El canal no confirmó la entrega. Revisa la conexión antes de reintentar.";
            repo.save(next, current.revision);
            repo.audit(
              user.id,
              "Outgoing message failed",
              `${message.id} · ${transport.label}`,
              conversation.eventId,
            );
          }
        });
        if (error instanceof HttpError) throw error;
        throw new HttpError(
          502,
          "El canal no confirmó el envío. El mensaje quedó marcado como fallido.",
        );
      }
      res.json(response(res));
    },
  );
}
