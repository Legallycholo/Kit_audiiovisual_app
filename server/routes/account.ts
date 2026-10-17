import type express from "express";
import { HttpError } from "../database";
import {
  currentSessionHash,
  passwordHash,
  passwordMatches,
  rateLimit,
  userOf,
} from "../security";
import { passwordChangeSchema } from "../schema";
import type { RouteContext } from "./context";

export function mountAccountRoutes(
  app: express.Express,
  { repo }: RouteContext,
) {
  app.post("/api/account/password", async (req, res) => {
    const user = userOf(res);
    const input = passwordChangeSchema.parse(req.body);
    rateLimit(repo, `password:${user.id}`, 5);
    const row = repo.user(user.id)!;
    // 422 rather than 401 so a mistyped password never looks like an expired session.
    if (!(await passwordMatches(input.currentPassword, row.password_hash)))
      throw new HttpError(422, "La contraseña actual no es correcta.");
    if (input.newPassword === input.currentPassword)
      throw new HttpError(
        422,
        "La nueva contraseña debe ser diferente de la actual.",
      );
    const encoded = await passwordHash(input.newPassword);
    repo.transaction(() => {
      repo.db
        .prepare("UPDATE users SET password_hash=? WHERE id=?")
        .run(encoded, user.id);
      // Sign out every other device; this session stays active.
      repo.db
        .prepare("DELETE FROM sessions WHERE user_id=? AND token_hash<>?")
        .run(user.id, currentSessionHash(req));
      repo.audit(user.id, "Password changed", row.email);
    });
    res.json({ ok: true });
  });
}
