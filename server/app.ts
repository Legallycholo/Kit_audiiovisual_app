import express from "express";
import { SearchGateway } from "./search";
import { KitService } from "./kit";
import { resolve } from "node:path";
import { z } from "zod";
import { Repository, HttpError } from "./database";
import { csrfMiddleware, sessionMiddleware, userOf } from "./security";
import { scopeWorkspace } from "./permissions";
import type { WorkspaceResponse } from "../src/shared/access";
import { DesignService } from "./design";
import type { AppConfig, RouteContext } from "./routes/context";
import { mountAuthRoutes } from "./routes/auth";
import { mountWorkspaceRoutes } from "./routes/workspace";
import { mountConversationRoutes } from "./routes/conversations";
import { mountMessagingRoutes } from "./routes/messaging";
import { mountInventoryRoutes } from "./routes/inventory";
import { mountAiRoutes } from "./routes/ai";
import { mountUserRoutes } from "./routes/users";
import { mountAccountRoutes } from "./routes/account";
import { mountBackupRoutes } from "./routes/backup";

export type { AppConfig } from "./routes/context";

export function createApp(repo: Repository, config: AppConfig) {
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "same-origin",
      "Content-Security-Policy":
        "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'",
      "Permissions-Policy":
        "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
      "Cache-Control": "no-store",
    });
    next();
  });
  app.use(express.json({ limit: "6mb" }));
  const searchGateway = new SearchGateway(repo, config.search);
  app.locals.searchGateway = searchGateway;
  // Native device requests carry revocable bearer tokens instead of browser cookies.
  searchGateway.mountDevice(app);
  app.use("/api", sessionMiddleware(repo), csrfMiddleware(config.origins));
  searchGateway.mountSession(app);
  const kit = new KitService(
    repo,
    config.kitGenerator,
    config.proposalGenerator,
    searchGateway,
  );
  app.locals.kit = kit;
  kit.mount(app);
  const design = new DesignService(repo, config.floorPlanExtractor);
  app.locals.design = design;
  design.mount(app);
  const response = (res: express.Response): WorkspaceResponse => {
    const user = userOf(res);
    const { workspace, revision } = repo.read();
    return { workspace: scopeWorkspace(workspace, user), revision, user };
  };
  const context: RouteContext = { repo, config, response };
  mountAuthRoutes(app, context);
  mountWorkspaceRoutes(app, context);
  mountConversationRoutes(app, context);
  mountMessagingRoutes(app, context);
  mountInventoryRoutes(app, context);
  mountAiRoutes(app, context);
  mountUserRoutes(app, context);
  mountAccountRoutes(app, context);
  mountBackupRoutes(app, context);
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
