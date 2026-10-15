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

export function createApp(
  repo: Repository,
  config: {
    origins: string[];
    secureCookies?: boolean;
    serveStatic?: boolean;
    proposalGenerator?: ProposalGenerator;
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
