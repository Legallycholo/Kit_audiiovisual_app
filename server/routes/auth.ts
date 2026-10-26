import type express from "express";
import { randomUUID } from "node:crypto";
import { HttpError, emptyWorkspace, publicUser } from "../database";
import {
  createSession,
  destroySession,
  passwordHash,
  passwordMatches,
  rateLimit,
} from "../security";
import { firebaseLoginSchema, loginSchema, setupSchema } from "../schema";
import type { RouteContext } from "./context";

export function mountAuthRoutes(
  app: express.Express,
  { repo, config }: RouteContext,
) {
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
    // Unknown emails still run one full hash check so timing reveals nothing.
    const decoyHash = "f".repeat(48) + ":" + "0".repeat(128);
    const matches = await passwordMatches(
      input.password,
      row?.password_hash || decoyHash,
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
  app.post("/api/login/firebase", async (req, res) => {
    if (!config.firebaseVerifier)
      throw new HttpError(404, "Firebase sign-in is not configured.");
    rateLimit(repo, `login:${req.ip}`);
    const { idToken } = firebaseLoginSchema.parse(req.body);
    let identity;
    try {
      identity = await config.firebaseVerifier(idToken);
    } catch {
      throw new HttpError(401, "The sign-in could not be verified.");
    }
    // Firebase proves who signed in; KIT still decides who may enter.
    // Accounts are never created here: the email must belong to an active user.
    const row =
      identity.email && identity.emailVerified
        ? repo.userByEmail(identity.email)
        : undefined;
    if (!row?.active)
      throw new HttpError(
        401,
        "This account does not have access to the workspace.",
      );
    destroySession(repo, req, res, Boolean(config.secureCookies));
    const csrf = createSession(
      repo,
      row.id,
      res,
      Boolean(config.secureCookies),
    );
    repo.audit(row.id, "User signed in with Firebase", row.email);
    res.json({ user: publicUser(row), csrf });
  });
  app.post("/api/logout", (req, res) => {
    destroySession(repo, req, res, Boolean(config.secureCookies));
    res.json({ ok: true });
  });
}
