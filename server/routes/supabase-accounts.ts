import type express from "express";
import { z } from "zod";
import { HttpError } from "../database";
import { requireAdmin } from "../security";
import { supabaseAccessSchema } from "../schema";
import type { RouteContext } from "./context";

const identifier = z.string().uuid();

/**
 * Administrator review of Supabase registrations. Signing up creates a pending
 * account with no role; access is granted only here, by an authenticated
 * administrator, and every decision is recorded in the KIT audit trail.
 */
export function mountSupabaseAccountRoutes(
  app: express.Express,
  { repo, config }: RouteContext,
) {
  const directory = () => {
    if (!config.supabaseDirectory)
      throw new HttpError(404, "Supabase sign-in is not configured.");
    return config.supabaseDirectory;
  };

  app.get("/api/supabase/accounts", async (_req, res) => {
    requireAdmin(res);
    try {
      res.json({ accounts: await directory().list() });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(503, "The account directory is unavailable.");
    }
  });

  app.patch("/api/supabase/accounts/:id", async (req, res) => {
    const actor = requireAdmin(res);
    const userId = identifier.parse(req.params.id);
    const patch = supabaseAccessSchema.parse(req.body);
    if (actor.id === userId)
      throw new HttpError(
        422,
        "Your own role and access cannot be changed here.",
      );
    const accounts = await directory()
      .list()
      .catch(() => {
        throw new HttpError(503, "The account directory is unavailable.");
      });
    const account = accounts.find((row) => row.id === userId);
    if (!account) throw new HttpError(404, "Account not found.");
    if (account.isOwner)
      throw new HttpError(422, "The owner account cannot be changed here.");
    try {
      await directory().setAccess(userId, { ...patch, approvedBy: actor.id });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(503, "The account directory is unavailable.");
    }
    // A revoked account loses any KIT session it still holds.
    if (patch.status && patch.status !== "active") {
      repo.transaction(() => {
        repo.db.prepare("UPDATE users SET active=0 WHERE id=?").run(userId);
        repo.db.prepare("DELETE FROM sessions WHERE user_id=?").run(userId);
      });
    }
    repo.audit(
      actor.id,
      patch.status === "active"
        ? "Supabase account approved"
        : patch.status
          ? "Supabase account access changed"
          : "Supabase account role changed",
      `${account.email}: ${patch.role ?? account.role ?? "sin rol"}/${
        patch.status ?? account.status
      }`,
    );
    res.json({ ok: true });
  });
}
