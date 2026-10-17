import type express from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { HttpError, publicUser } from "../database";
import { passwordHash, requireAdmin, userOf } from "../security";
import { identifier, userSchema } from "../schema";
import type { RouteContext } from "./context";

export function mountUserRoutes(app: express.Express, { repo }: RouteContext) {
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
}
