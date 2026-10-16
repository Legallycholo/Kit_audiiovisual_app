import express from "express";
import {
  proposalContext,
  materializeSuggestion,
  type ProposalGenerator,
} from "./proposal-ai";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";
import { Repository, HttpError, emptyWorkspace, publicUser } from "./database";
import {
  createSession,
  csrfMiddleware,
  destroySession,
  passwordHash,
  passwordMatches,
  rateLimit,
  requireAdmin,
  sessionMiddleware,
  userOf,
} from "./security";
import {
  changeSchema,
  identifier,
  loginSchema,
  setupSchema,
  userSchema,
  date,
} from "./schema";
import { applyChanges, scopeWorkspace } from "./permissions";
import { acceptConversation, availableStock } from "../src/shared/domain";
import type { WorkspaceResponse } from "../src/shared/access";
import { ingestInboundMessage, type MessageTransport } from "./messaging";

export function createApp(
  repo: Repository,
  config: {
    origins: string[];
    secureCookies?: boolean;
    serveStatic?: boolean;
    proposalGenerator?: ProposalGenerator;
    messageTransport?: MessageTransport;
  },
) {
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "same-origin",
      "Cache-Control": "no-store",
    });
    next();
  });
  app.use(express.json({ limit: "6mb" }));
  app.use("/api", sessionMiddleware(repo), csrfMiddleware(config.origins));
  const response = (res: express.Response): WorkspaceResponse => {
    const user = userOf(res);
    const { workspace, revision } = repo.read();
    return { workspace: scopeWorkspace(workspace, user), revision, user };
  };
  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, initialized: repo.initialized() }),
  );
  app.get("/api/session", (_req, res) =>
    res.json({
      initialized: repo.initialized(),
      user: res.locals.user || null,
      csrf: res.locals.csrf || null,
    }),
  );
  app.post("/api/setup", async (req, res) => {
    if (
      !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
        req.socket.remoteAddress || "",
      )
    )
      throw new HttpError(
        403,
        "Initial setup must be completed on the server machine.",
      );
    rateLimit(repo, `setup:${req.ip}`, 5);
    if (repo.initialized())
      throw new HttpError(
        409,
        "This workspace is already configured. Sign in instead.",
      );
    const input = setupSchema.parse(req.body);
    const encoded = await passwordHash(input.password);
    const id = randomUUID();
    repo.transaction(() => {
      if (repo.initialized())
        throw new HttpError(409, "Workspace setup was already completed.");
      repo.db
        .prepare(
          "INSERT INTO users (id,email,name,role,owner,password_hash) VALUES (?,?,?,?,1,?)",
        )
        .run(id, input.email, input.name, "Administrator", encoded);
      repo.db
        .prepare("INSERT INTO workspace VALUES (1,0,?)")
        .run(JSON.stringify(emptyWorkspace(input.company)));
      repo.audit(id, "Company workspace created", input.company);
    });
    const csrf = createSession(repo, id, res, Boolean(config.secureCookies));
    res.status(201).json({ user: publicUser(repo.user(id)!), csrf });
  });
  app.post("/api/login", async (req, res) => {
    const input = loginSchema.parse(req.body);
    rateLimit(repo, `login:${req.ip}`);
    const row = repo.userByEmail(input.email);
    const dummy = "f".repeat(48) + ":" + "0".repeat(128);
    const matches = await passwordMatches(
      input.password,
      row?.password_hash || dummy,
    );
    if (!row?.active || !matches)
      throw new HttpError(401, "Email or password is incorrect.");
    destroySession(repo, req, res, Boolean(config.secureCookies));
    const csrf = createSession(
      repo,
      row.id,
      res,
      Boolean(config.secureCookies),
    );
    repo.audit(row.id, "User signed in", row.email);
    res.json({ user: publicUser(row), csrf });
  });
  app.post("/api/logout", (req, res) => {
    destroySession(repo, req, res, Boolean(config.secureCookies));
    res.json({ ok: true });
  });
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
  app.get("/api/inventory/availability", (req, res) => {
    const user = userOf(res);
    if (user.role === "Client / Guest")
      throw new HttpError(403, "Inventory is not shared with clients.");
    const start = date.parse(req.query.start);
    const end = date.parse(req.query.end);
    if (end < start) throw new HttpError(422, "Invalid occupied window.");
    const { workspace } = repo.read();
    res.json({
      availability: Object.fromEntries(
        workspace.equipment.map((item) => [
          item.id,
          availableStock(item, workspace.reservations, start, end),
        ]),
      ),
    });
  });
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
  app.get("/api/team", (req, res) => {
    const actor = userOf(res);
    const eventId = identifier.parse(req.query.eventId);
    if (
      !["Administrator", "Production Manager"].includes(actor.role) ||
      (actor.role !== "Administrator" && !actor.eventIds.includes(eventId))
    )
      throw new HttpError(403, "No tienes acceso al equipo de este evento.");
    res.json({
      members: repo
        .users()
        .filter(
          (person) =>
            person.active &&
            person.role !== "Client / Guest" &&
            (person.role === "Administrator" ||
              person.eventIds.includes(eventId)),
        )
        .map(({ id, name, role }) => ({ id, name, role })),
    });
  });
  app.get("/api/users", (_req, res) => {
    requireAdmin(res);
    res.json({ users: repo.users() });
  });
  app.post("/api/users", async (req, res) => {
    const actor = requireAdmin(res);
    const input = userSchema.parse(req.body);
    const workspace = repo.read().workspace;
    if (input.eventIds.some((id) => !workspace.events.some((e) => e.id === id)))
      throw new HttpError(422, "An assigned event does not exist.");
    if (
      input.role === "Client / Guest" &&
      (!input.clientId ||
        !workspace.clients.some((c) => c.id === input.clientId))
    )
      throw new HttpError(
        422,
        "A client account requires a valid client profile.",
      );
    if (
      input.sharedProposalIds.some((id) => {
        const p = workspace.proposals.find((p) => p.id === id);
        return (
          !p ||
          workspace.events.find((e) => e.id === p.eventId)?.clientId !==
            input.clientId ||
          !["Issued", "Accepted", "Declined", "Superseded"].includes(p.status)
        );
      })
    )
      throw new HttpError(
        422,
        "Only issued revisions belonging to this client can be shared.",
      );
    if (repo.userByEmail(input.email))
      throw new HttpError(409, "A user with this email already exists.");
    const encoded = await passwordHash(input.password);
    const id = randomUUID();
    repo.transaction(() => {
      if (repo.userByEmail(input.email))
        throw new HttpError(409, "A user with this email already exists.");
      repo.db
        .prepare(
          "INSERT INTO users (id,email,name,role,password_hash,event_ids,client_id,shared_proposals) VALUES (?,?,?,?,?,?,?,?)",
        )
        .run(
          id,
          input.email,
          input.name,
          input.role,
          encoded,
          JSON.stringify(input.eventIds),
          input.clientId || null,
          JSON.stringify(input.sharedProposalIds),
        );
      repo.audit(actor.id, "User created", `${input.name} · ${input.role}`);
    });
    res.status(201).json({ user: publicUser(repo.user(id)!) });
  });
  app.patch("/api/users/:id", (req, res) => {
    const actor = requireAdmin(res);
    const userId = identifier.parse(req.params.id);
    const input = z.object({ active: z.boolean() }).strict().parse(req.body);
    const row = repo.user(userId);
    if (!row) throw new HttpError(404, "User not found.");
    if (row.owner || actor.id === userId)
      throw new HttpError(
        422,
        "The owner and your own account cannot be deactivated here.",
      );
    repo.transaction(() => {
      repo.db
        .prepare("UPDATE users SET active=? WHERE id=?")
        .run(input.active ? 1 : 0, userId);
      repo.db.prepare("DELETE FROM sessions WHERE user_id=?").run(userId);
      repo.audit(
        actor.id,
        input.active ? "User reactivated" : "User deactivated",
        row.email,
      );
    });
    res.json({ user: publicUser(repo.user(userId)!) });
  });
  app.get("/api/export", (_req, res) => {
    const user = requireAdmin(res);
    const current = repo.read();
    repo.audit(
      user.id,
      "Workspace exported",
      "Authenticated administrator export",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="kit-workspace-export.json"',
    );
    res.json({ ...current, exportedAt: new Date().toISOString() });
  });
  app.use("/api", (_req, _res, next) =>
    next(new HttpError(404, "API route not found.")),
  );
  if (config.serveStatic) {
    const dist = resolve("dist");
    app.use(express.static(dist, { index: false }));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(resolve(dist, "index.html")),
    );
  }
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof z.ZodError)
        return res.status(422).json({
          error: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        });
      if (error instanceof HttpError)
        return res.status(error.status).json({ error: error.message });
      if (error instanceof SyntaxError)
        return res.status(400).json({ error: "Malformed JSON request." });
      if (
        error instanceof Error &&
        /Only \d+ units|positive whole quantity|Return date|current issued|newer proposal|awaiting review/.test(
          error.message,
        )
      )
        return res.status(422).json({ error: error.message });
      console.error(
        "Request failed",
        error instanceof Error ? error.name : "Unknown error",
      );
      return res
        .status(500)
        .json({ error: "The server could not complete this request." });
    },
  );
  return app;
}
