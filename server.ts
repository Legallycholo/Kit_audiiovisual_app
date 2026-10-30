import { createServer as createViteServer } from "vite";
import type express from "express";
import { resolve } from "node:path";
import { aiProposalGenerator } from "./server/proposal-ai";
import { integrationsFromEnv } from "./server/integrations";
import { aiFloorPlanExtractor } from "./server/design";
import { Repository } from "./server/database";
import { createApp } from "./server/app";
import { httpSearchProvider, type SearchGateway } from "./server/search";
import { aiKitGenerator, type KitService } from "./server/kit";
import { firebaseVerifier } from "./server/firebase-auth";
import { recaptchaVerifier } from "./server/recaptcha";
import { jsonLogger, parseLogLevel } from "./server/logger";

const port = Number(process.env.PORT || 3000);
const isDev = process.env.NODE_ENV !== "production";

const origins = (
  process.env.KIT_ORIGINS ||
  "http://127.0.0.1:3000,http://localhost:3000,http://127.0.0.1:5173,http://localhost:5173"
).split(",");

const repo = new Repository(
  resolve(process.env.KIT_DATABASE || "data/kit.sqlite"),
);

if (!repo.initialized()) {
  const { createSeed } = await import("./src/shared/seed");
  const { passwordHash } = await import("./server/security");
  const adminId = "user-admin-dariel";
  const email = "dariel@tanygrowth.com";
  const name = "Dariel";
  const hash = await passwordHash("Kit2026!Events");
  repo.db
    .prepare(
      "INSERT INTO users (id,email,name,role,owner,password_hash) VALUES (?,?,?,?,1,?)",
    )
    .run(adminId, email, name, "Administrator", hash);
  repo.db
    .prepare("INSERT INTO workspace VALUES (1,0,?)")
    .run(JSON.stringify(createSeed()));
  repo.audit(adminId, "Espacio inicial creado", "KIT Audiovisual");
  console.log("Seeded initial production workspace for:", email);
}

const integrations = integrationsFromEnv(process.env);
const ai = integrations.ai;

let viteMiddleware: express.RequestHandler | undefined;
if (isDev) {
  const vite = await createViteServer({
    server: { middlewareMode: true, host: "0.0.0.0" },
    appType: "spa",
  });
  viteMiddleware = vite.middlewares;
}

const app = createApp(repo, {
  logger: jsonLogger(parseLogLevel(process.env.KIT_LOG_LEVEL)),
  integrations,
  firebaseVerifier: process.env.FIREBASE_PROJECT_ID
    ? firebaseVerifier(process.env.FIREBASE_PROJECT_ID)
    : undefined,
  recaptchaVerifier:
    process.env.RECAPTCHA_PROJECT_ID &&
    process.env.RECAPTCHA_API_KEY &&
    process.env.RECAPTCHA_SITE_KEY
      ? recaptchaVerifier(
          process.env.RECAPTCHA_PROJECT_ID,
          process.env.RECAPTCHA_API_KEY,
          process.env.RECAPTCHA_SITE_KEY,
        )
      : undefined,
  kitGenerator: ai?.chatModel
    ? aiKitGenerator(ai.provider, ai.key, ai.chatModel)
    : undefined,
  search: {
    name: process.env.KIT_SEARCH_PROVIDER_NAME || "No configurado",
    providerIdentity: process.env.KIT_SEARCH_PROVIDER_URL || "",
    region: process.env.KIT_SEARCH_REGION || "",
    retention: process.env.KIT_SEARCH_RETENTION || "",
    monthlyBudgetCents: Number(
      process.env.KIT_SEARCH_MONTHLY_BUDGET_CENTS || 0,
    ),
    embeddingCentsPerThousandCharacters: Number(
      process.env.KIT_SEARCH_CENTS_PER_1000_CHARS || 0,
    ),
    encryptionKey: process.env.KIT_SEARCH_ENCRYPTION_KEY
      ? Buffer.from(process.env.KIT_SEARCH_ENCRYPTION_KEY, "hex")
      : undefined,
    provider:
      process.env.KIT_SEARCH_PROVIDER_URL &&
      process.env.KIT_SEARCH_PROVIDER_TOKEN
        ? httpSearchProvider(
            process.env.KIT_SEARCH_PROVIDER_URL,
            process.env.KIT_SEARCH_PROVIDER_TOKEN,
          )
        : undefined,
  },
  proposalGenerator: ai?.proposalModel
    ? aiProposalGenerator(ai.provider, ai.key, ai.proposalModel)
    : undefined,
  floorPlanExtractor: ai?.planModel
    ? aiFloorPlanExtractor(ai.provider, ai.key, ai.planModel)
    : undefined,
  origins,
  secureCookies: process.env.KIT_SECURE_COOKIES === "true",
  serveStatic: !isDev,
  viteMiddleware,
});

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`KIT server ready on http://0.0.0.0:${port}`);
});

const searchRetry = setInterval(() => {
  void (app.locals.searchGateway as SearchGateway)
    .retry()
    .catch(() => console.error("Search reconciliation failed"));
}, 30_000);
searchRetry.unref();

function shutdown() {
  clearInterval(searchRetry);
  server.close(async () => {
    await (app.locals.searchGateway as SearchGateway).drain();
    await (app.locals.kit as KitService).drain();
    repo.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
