import express from "express";
import { randomUUID } from "node:crypto";
import { SearchGateway } from "./search";
import { KitService } from "./kit";
import { resolve } from "node:path";
import { z } from "zod";
import { Repository, HttpError } from "./database";
import { csrfMiddleware, sessionMiddleware, userOf } from "./security";
import { scopeWorkspace } from "./permissions";
import type { WorkspaceResponse } from "../src/shared/access";
import { DesignService } from "./design";
import { jsonLogger } from "./logger";
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
import { mountIntegrationRoutes } from "./routes/integrations";
import { mountLookupRoutes } from "./routes/lookup";

export type { AppConfig } from "./routes/context";

export function createApp(repo: Repository, config: AppConfig) {
  const app = express();
  // Without a configured logger only failures are reported, as before.
  const logger = config.logger ?? jsonLogger("warn");
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const requestId = randomUUID();
    const started = performance.now();
    res.locals.requestId = requestId;
    if (req.path.startsWith("/api/"))
      res.on("finish", () =>
        logger.log("info", "http_request", {
          requestId,
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs: Math.round(performance.now() - started),
          userId: res.locals.user?.id,
        }),
      );
    res.set({
      "X-Request-Id": requestId,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "Content-Security-Policy":
        "default-src 'self' 'unsafe-inline' blob:; base-uri 'self'; form-action 'self'; object-src 'none'; img-src 'self' data: blob: https:; font-src 'self' data: https:; style-src 'self' 'unsafe-inline' https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://www.google.com https://www.gstatic.com https://apis.google.com; frame-src 'self' https://www.google.com https://*.firebaseapp.com https://accounts.google.com; connect-src 'self' blob: ws: wss: https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.google.com",
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
  mountIntegrationRoutes(app, context);
  mountLookupRoutes(app, context);
  app.use("/api", (_req, _res, next) =>
    next(new HttpError(404, "API route not found.")),
  );
  if (config.viteMiddleware) {
    app.use(config.viteMiddleware);
  } else if (config.serveStatic) {
    const dist = resolve("dist");
    app.use(express.static(dist, { index: false }));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(resolve(dist, "index.html")),
    );
  }
  app.use(
    (
      error: unknown,
      req: express.Request,
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
      // Body-parser and similar client errors (for example an oversized payload).
      const clientError = error as { status?: unknown; expose?: unknown };
      if (
        typeof clientError?.status === "number" &&
        clientError.status >= 400 &&
        clientError.status < 500 &&
        clientError.expose === true
      )
        return res.status(clientError.status).json({
          error:
            clientError.status === 413
              ? "La solicitud supera el tamaño permitido."
              : "La solicitud no es válida.",
        });
      // Only the error name is logged; messages may contain record data.
      logger.log("error", "request_failed", {
        requestId: res.locals.requestId,
        method: req.method,
        path: req.path,
        error: error instanceof Error ? error.name : "Unknown error",
      });
      return res
        .status(500)
        .json({ error: "The server could not complete this request." });
    },
  );
  return app;
}
