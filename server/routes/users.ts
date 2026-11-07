import type express from "express";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { HttpError, publicUser } from "../database";
import { passwordHash, rateLimit, requireAdmin, userOf } from "../security";
import { accessSchema, identifier, userSchema } from "../schema";
import type { Workspace } from "../../src/shared/types";
import type { RouteContext } from "./context";

type Grants = z.infer<typeof accessSchema>;

// Role, event and client-sharing grants must reference existing records.
function validateGrants(workspace: Workspace, input: Grants) {
  if (input.eventIds.some((id) => !workspace.events.some((e) => e.id === id)))
    throw new HttpError(422, "An assigned event does not exist.");
  if (
    input.role === "Client / Guest" &&
    (!input.clientId || !workspace.clients.some((c) => c.id === input.clientId))
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
}

export function mountUserRoutes(app: express.Express, { repo }: RouteContext) {
  app.get("/api/team", async (req, res) => {
    const actor = userOf(res);
    const eventId = identifier.parse(req.query.eventId);
    if (
      !["Administrator", "Production Manager"].includes(actor.role) ||
      (actor.role !== "Administrator" && !actor.eventIds.includes(eventId))
    )
      throw new HttpError(403, "No tienes acceso al equipo de este evento.");
    res.json({
      members: (await repo.users())
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
  app.get("/api/users", async (_req, res) => {
    requireAdmin(res);
    res.json({ users: await repo.users() });
  });
  app.post("/api/users", async (req, res) => {
    const actor = requireAdmin(res);
    const input = userSchema.parse(req.body);
    validateGrants((await repo.read()).workspace, input);
    if (await repo.userByEmail(input.email))
      throw new HttpError(409, "A user with this email already exists.");
    const encoded = await passwordHash(input.password);
    const id = randomUUID();
    await repo.transaction(async () => {
      if (await repo.userByEmail(input.email))
        throw new HttpError(409, "A user with this email already exists.");
      await repo.db
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
      await repo.audit(actor.id, "User created", `${input.name} · ${input.role}`);
    });
    res.status(201).json({ user: publicUser((await repo.user(id))!) });
  });
  app.patch("/api/users/:id", async (req, res) => {
    const actor = requireAdmin(res);
    const userId = identifier.parse(req.params.id);
    const input = z.object({ active: z.boolean() }).strict().parse(req.body);
    const row = await repo.user(userId);
    if (!row) throw new HttpError(404, "User not found.");
    if (row.owner || actor.id === userId)
      throw new HttpError(
        422,
        "The owner and your own account cannot be deactivated here.",
      );
    await repo.transaction(async () => {
      await repo.db
        .prepare("UPDATE users SET active=? WHERE id=?")
        .run(input.active ? 1 : 0, userId);
      await repo.db.prepare("DELETE FROM sessions WHERE user_id=?").run(userId);
      await repo.audit(
        actor.id,
        input.active ? "User reactivated" : "User deactivated",
        row.email,
      );
    });
    res.json({ user: publicUser((await repo.user(userId))!) });
  });
  app.put("/api/users/:id/access", async (req, res) => {
    const actor = requireAdmin(res);
    const userId = identifier.parse(req.params.id);
    const parsed = accessSchema.parse(req.body);
    const client = parsed.role === "Client / Guest";
    const input: Grants = {
      role: parsed.role,
      eventIds: client ? [] : parsed.eventIds,
      clientId: client ? parsed.clientId : undefined,
      sharedProposalIds: client ? parsed.sharedProposalIds : [],
    };
    const row = await repo.user(userId);
    if (!row) throw new HttpError(404, "User not found.");
    if (row.owner)
      throw new HttpError(
        422,
        "El acceso del propietario no se puede cambiar.",
      );
    if (actor.id === userId)
      throw new HttpError(
        422,
        "No puedes cambiar el acceso de tu propia cuenta.",
      );
    await repo.transaction(async () => {
      const { workspace } = await repo.read();
      validateGrants(workspace, input);
      const keepsEvent = (eventId: string) =>
        input.role === "Administrator" ||
        (!client && input.eventIds.includes(eventId));
      const orphaned =
        workspace.tasks.some(
          (task) => task.assigneeId === userId && !keepsEvent(task.eventId),
        ) ||
        workspace.operations.some(
          (operation) =>
            !keepsEvent(operation.eventId) &&
            operation.crewShifts.some((shift) => shift.memberId === userId),
        );
      if (orphaned)
        throw new HttpError(
          422,
          "Reasigna sus tareas y turnos antes de quitarle acceso a esos eventos.",
        );
      await repo.db
        .prepare(
          "UPDATE users SET role=?, event_ids=?, client_id=?, shared_proposals=? WHERE id=?",
        )
        .run(
          input.role,
          JSON.stringify(input.eventIds),
          input.clientId || null,
          JSON.stringify(input.sharedProposalIds),
          userId,
        );
      // Open sessions may hold data scoped to the previous grants.
      await repo.db.prepare("DELETE FROM sessions WHERE user_id=?").run(userId);
      await repo.audit(
        actor.id,
        "User access changed",
        `${row.email} · ${input.role}`,
      );
    });
    res.json({ user: publicUser((await repo.user(userId))!) });
  });
  app.post("/api/users/:id/reset-password", async (req, res) => {
    const actor = requireAdmin(res);
    const userId = identifier.parse(req.params.id);
    z.object({})
      .strict()
      .parse(req.body ?? {});
    const row = await repo.user(userId);
    if (!row) throw new HttpError(404, "User not found.");
    if (actor.id === userId)
      throw new HttpError(
        422,
        "Usa Cambiar contraseña para actualizar tu propia cuenta.",
      );
    if (row.owner)
      throw new HttpError(
        403,
        "Solo el propietario puede cambiar su contraseña.",
      );
    if (!row.active)
      throw new HttpError(
        422,
        "Reactiva la cuenta antes de restablecer su contraseña.",
      );
    await rateLimit(repo, `password-reset:${actor.id}`, 10);
    const temporaryPassword = randomBytes(12).toString("base64url");
    const encoded = await passwordHash(temporaryPassword);
    await repo.transaction(async () => {
      await repo.db
        .prepare("UPDATE users SET password_hash=? WHERE id=?")
        .run(encoded, userId);
      await repo.db.prepare("DELETE FROM sessions WHERE user_id=?").run(userId);
      await repo.audit(actor.id, "User password reset by administrator", row.email);
    });
    res.json({ temporaryPassword });
  });
}
