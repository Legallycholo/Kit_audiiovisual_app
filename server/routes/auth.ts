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
import { loginSchema, setupSchema, supabaseLoginSchema } from "../schema";
import type { AppConfig, RouteContext } from "./context";

/** Name of a workspace created by the first portal login; editable in Configuración. */
export const FIRST_COMPANY_NAME = "KIT audiovisual";

async function requireHuman(config: AppConfig, token?: string) {
  if (!config.recaptchaVerifier) return;
  let human = false;
  try {
    human = Boolean(token) && (await config.recaptchaVerifier(token!, "LOGIN"));
  } catch {
    // An unreachable verifier fails closed.
  }
  if (!human) throw new HttpError(403, "The security check failed. Try again.");
}

export function mountAuthRoutes(
  app: express.Express,
  { repo, config }: RouteContext,
) {
  app.get("/api/health", async (_req, res) =>
    res.json({ ok: true, initialized: await repo.initialized() }),
  );
  app.get("/api/session", async (_req, res) =>
    res.json({
      initialized: await repo.initialized(),
      user: res.locals.user || null,
      csrf: res.locals.csrf || null,
    }),
  );
  app.post("/api/setup", async (req, res) => {
    await rateLimit(repo, `setup:${req.ip}`, 10);
    if (await repo.initialized())
      throw new HttpError(
        409,
        "This workspace is already configured. Sign in instead.",
      );
    const input = setupSchema.parse(req.body);
    const encoded = await passwordHash(input.password);
    const id = randomUUID();
    await repo.transaction(async () => {
      if (await repo.initialized())
        throw new HttpError(409, "Workspace setup was already completed.");
      await repo.db
        .prepare(
          "INSERT INTO users (id,email,name,role,owner,password_hash) VALUES (?,?,?,?,1,?)",
        )
        .run(id, input.email, input.name, "Administrator", encoded);
      await repo.db
        .prepare("INSERT INTO workspace VALUES (1,0,?)")
        .run(JSON.stringify(emptyWorkspace(input.company)));
      await repo.audit(id, "Company workspace created", input.company);
    });
    const csrf = await createSession(
      repo,
      id,
      res,
      Boolean(config.secureCookies),
    );
    res.status(201).json({ user: publicUser((await repo.user(id))!), csrf });
  });
  app.post("/api/login", async (req, res) => {
    const input = loginSchema.parse(req.body);
    await rateLimit(repo, `login:${req.ip}`);
    await requireHuman(config, input.recaptchaToken);
    const row = await repo.userByEmail(input.email);
    // Unknown emails still run one full hash check so timing reveals nothing.
    const decoyHash = "f".repeat(48) + ":" + "0".repeat(128);
    const matches = await passwordMatches(
      input.password,
      row?.password_hash || decoyHash,
    );
    if (!row?.active || !matches)
      throw new HttpError(401, "Email or password is incorrect.");
    await destroySession(repo, req, res, Boolean(config.secureCookies));
    const csrf = await createSession(
      repo,
      row.id,
      res,
      Boolean(config.secureCookies),
    );
    await repo.audit(row.id, "User signed in", row.email);
    res.json({ user: publicUser(row), csrf });
  });
  app.post("/api/login/supabase", async (req, res) => {
    if (!config.supabaseVerifier)
      throw new HttpError(404, "Portal sign-in is not configured.");
    await rateLimit(repo, `login:${req.ip}`);
    const { accessToken } = supabaseLoginSchema.parse(req.body);
    let identity;
    try {
      identity = await config.supabaseVerifier(accessToken);
    } catch {
      throw new HttpError(401, "The sign-in could not be verified.");
    }
    // Supabase proves who signed in; the workspace still decides who may enter.
    // Only a verified, active portal administrator may.
    if (
      !identity.emailVerified ||
      identity.portalRole !== "admin" ||
      identity.accountStatus !== "active"
    )
      throw new HttpError(
        401,
        "This account does not have access to the workspace.",
      );
    // On an empty company database the first verified portal administrator
    // becomes the owner and an empty workspace is created, so /portal/login is
    // the only entry page. The re-check inside the transaction (which holds the
    // writer lock) makes two simultaneous first logins create one owner only.
    if (!(await repo.initialized())) {
      await repo.transaction(async () => {
        if (await repo.initialized()) return;
        const owner = await repo.upsertFederatedUser({
          id: randomUUID(),
          email: identity.email,
          name: identity.name || identity.email,
          role: "Administrator",
          isOwner: true,
          eventIds: [],
          sharedProposalIds: [],
        });
        await repo.db
          .prepare("INSERT INTO workspace VALUES (1,0,?)")
          .run(JSON.stringify(emptyWorkspace(FIRST_COMPANY_NAME)));
        await repo.audit(
          owner.id,
          "Company workspace created",
          `${FIRST_COMPANY_NAME} · first portal administrator`,
        );
      });
    }
    let row = await repo.userByEmail(identity.email);
    if (row && !row.active)
      throw new HttpError(
        401,
        "This account does not have access to the workspace.",
      );
    // An existing workspace user keeps their own role; a new one is an Administrator.
    row ??= await repo.upsertFederatedUser({
      id: randomUUID(),
      email: identity.email,
      name: identity.name || identity.email,
      role: "Administrator",
      isOwner: false,
      eventIds: [],
      sharedProposalIds: [],
    });
    await destroySession(repo, req, res, Boolean(config.secureCookies));
    const csrf = await createSession(
      repo,
      row.id,
      res,
      Boolean(config.secureCookies),
    );
    await repo.audit(row.id, "User signed in with the portal", row.email);
    res.json({ user: publicUser(row), csrf });
  });
  app.post("/api/logout", async (req, res) => {
    await destroySession(repo, req, res, Boolean(config.secureCookies));
    res.json({ ok: true });
  });
}
