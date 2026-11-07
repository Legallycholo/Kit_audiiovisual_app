import { createServer as createViteServer } from "vite";
import type express from "express";
import { Repository } from "./server/database";
import { createApp } from "./server/app";
import { configFromEnv } from "./server/bootstrap";
import type { SearchGateway } from "./server/search";
import type { KitService } from "./server/kit";

const port = Number(process.env.PORT || 3000);
const isDev = process.env.NODE_ENV !== "production";

// Local database: a PGlite directory (default .kit-local/pglite), or a postgres://
// connection string in KIT_DATABASE. data/ is never opened.
const repo = await Repository.open(process.env.KIT_DATABASE);

// A fresh database can be seeded with a sample workspace for local work. The
// owner password is never hardcoded: without KIT_SEED_OWNER_PASSWORD the app
// shows its normal first-run setup screen and the owner is created there.
if (!(await repo.initialized())) {
  const seedPassword = process.env.KIT_SEED_OWNER_PASSWORD;
  const email = process.env.KIT_SEED_OWNER_EMAIL || "owner@kit.local";
  if (seedPassword) {
    const { createSeed } = await import("./src/shared/seed");
    const { passwordHash } = await import("./server/security");
    const adminId = "user-admin-seed";
    const hash = await passwordHash(seedPassword);
    await repo.transaction(async () => {
      await repo.db
        .prepare(
          "INSERT INTO users (id,email,name,role,owner,password_hash) VALUES (?,?,?,?,1,?)",
        )
        .run(
          adminId,
          email.toLowerCase(),
          process.env.KIT_SEED_OWNER_NAME || "Owner",
          "Administrator",
          hash,
        );
      await repo.db
        .prepare("INSERT INTO workspace VALUES (1,0,?)")
        .run(JSON.stringify(createSeed()));
      await repo.audit(adminId, "Espacio inicial creado", "KIT Audiovisual");
    });
    console.log("Seeded initial production workspace for:", email);
  } else {
    console.log(
      "Empty workspace. Open the app to create the owner account, or set KIT_SEED_OWNER_PASSWORD to seed sample data.",
    );
  }
}

let viteMiddleware: express.RequestHandler | undefined;
if (isDev) {
  const vite = await createViteServer({
    server: { middlewareMode: true, host: "0.0.0.0" },
    appType: "spa",
  });
  viteMiddleware = vite.middlewares;
}

const app = createApp(repo, {
  ...configFromEnv(
    process.env,
    "http://127.0.0.1:3000,http://localhost:3000,http://127.0.0.1:5173,http://localhost:5173",
  ),
  serveStatic: !isDev,
  viteMiddleware,
});
// Fail at startup (not on the first request) if the search policy or database is wrong.
await app.locals.ready;

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
    await repo.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
