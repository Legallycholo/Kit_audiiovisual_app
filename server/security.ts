import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import type { Request, Response, NextFunction } from "express";
import { HttpError, publicUser, type Repository } from "./database";
import type { WorkspaceUser } from "../src/shared/access";
const derive = promisify(scrypt);
const SESSION_MS = 8 * 60 * 60 * 1000;
export const hashToken = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function passwordHash(password: string) {
  const salt = randomBytes(24).toString("hex");
  const key = (await derive(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}
export async function passwordMatches(password: string, encoded: string) {
  const [salt, hash] = encoded.split(":");
  if (!salt || !hash) return false;
  const key = (await derive(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return expected.length === key.length && timingSafeEqual(key, expected);
}
function sessionToken(req: Request) {
  const raw = req.headers.cookie
    ?.split(";")
    .find((s) => s.trim().startsWith("kit_session="))
    ?.trim()
    .slice(12);
  return raw && /^[a-f0-9]{64}$/.test(raw) ? raw : "";
}
export const currentSessionHash = (req: Request) =>
  hashToken(sessionToken(req));
export function createSession(
  repo: Repository,
  userId: string,
  res: Response,
  secure: boolean,
) {
  const token = randomBytes(32).toString("hex");
  const csrf = randomBytes(32).toString("hex");
  repo.db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  repo.db
    .prepare("INSERT INTO sessions VALUES (?,?,?,?)")
    .run(hashToken(token), userId, csrf, Date.now() + SESSION_MS);
  res.cookie("kit_session", token, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    maxAge: SESSION_MS,
    path: "/",
  });
  return csrf;
}
export function destroySession(
  repo: Repository,
  req: Request,
  res: Response,
  secure: boolean,
) {
  repo.db
    .prepare("DELETE FROM sessions WHERE token_hash=?")
    .run(hashToken(sessionToken(req)));
  res.clearCookie("kit_session", {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
  });
}
export function sessionMiddleware(repo: Repository) {
  return (req: Request, res: Response, next: NextFunction) => {
    const session = repo.db
      .prepare("SELECT * FROM sessions WHERE token_hash=? AND expires_at>?")
      .get(hashToken(sessionToken(req)), Date.now()) as
      { user_id: string; csrf_token: string } | undefined;
    if (session) {
      const row = repo.user(session.user_id);
      if (row?.active) {
        res.locals.user = publicUser(row);
        res.locals.csrf = session.csrf_token;
      }
    }
    next();
  };
}
export function userOf(res: Response): WorkspaceUser {
  if (!res.locals.user)
    throw new HttpError(401, "Sign in to access the workspace.");
  return res.locals.user;
}
export function requireAdmin(res: Response) {
  const user = userOf(res);
  if (user.role !== "Administrator")
    throw new HttpError(403, "Administrator access is required.");
  return user;
}
export function csrfMiddleware(origins: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const origin = req.get("origin");
    const host = req.get("host");
    const isSameOrigin =
      origin && host && (origin === `http://${host}` || origin === `https://${host}`);
    if (origin && !isSameOrigin && origins.length > 0 && !origins.includes(origin))
      return next(new HttpError(403, "Request origin is not allowed."));
    if (res.locals.user && req.get("x-csrf-token") !== res.locals.csrf)
      return next(
        new HttpError(
          403,
          "The request is missing a valid session confirmation. Refresh and try again.",
        ),
      );
    next();
  };
}
export function rateLimit(repo: Repository, key: string, limit = 10) {
  const now = Date.now();
  repo.db.prepare("DELETE FROM login_attempts WHERE reset_at < ?").run(now);
  const row = repo.db
    .prepare("SELECT * FROM login_attempts WHERE key=?")
    .get(key) as { count: number; reset_at: number } | undefined;
  if (row && row.count >= limit)
    throw new HttpError(429, "Too many attempts. Try again in 15 minutes.");
  repo.db
    .prepare(
      "INSERT INTO login_attempts VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
    )
    .run(key, now + 15 * 60_000);
}
