import { Repository } from "./database";
import { createApp } from "./app";
import { configFromEnv } from "./bootstrap";
import type { SearchGateway } from "./search";
import type { KitService } from "./kit";

const port = Number(process.env.PORT || 3001);
const repo = await Repository.open(process.env.KIT_DATABASE);
const app = createApp(repo, {
  ...configFromEnv(
    process.env,
    "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:3001",
  ),
  serveStatic: process.env.NODE_ENV === "production",
});
// Fail at startup (not on the first request) if the search policy or database is wrong.
await app.locals.ready;
const server = app.listen(port, "127.0.0.1", () =>
  console.log(`KIT API ready at http://127.0.0.1:${port}`),
);
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
