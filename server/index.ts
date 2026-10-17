import { openAIProposalGenerator } from "./proposal-ai";
import { resolve } from "node:path";
import { Repository } from "./database";
import { createApp } from "./app";
import { httpSearchProvider, type SearchGateway } from "./search";
import { openAIKitGenerator, type KitService } from "./kit";

const port = Number(process.env.PORT || 3001);
const origins = (
  process.env.KIT_ORIGINS ||
  "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:3001"
).split(",");
const repo = new Repository(
  resolve(process.env.KIT_DATABASE || "data/kit.sqlite"),
);
const app = createApp(repo, {
  kitGenerator:
    process.env.OPENAI_API_KEY && process.env.KIT_CHAT_MODEL
      ? openAIKitGenerator(
          process.env.OPENAI_API_KEY,
          process.env.KIT_CHAT_MODEL,
        )
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
  proposalGenerator:
    process.env.OPENAI_API_KEY && process.env.KIT_AI_MODEL
      ? openAIProposalGenerator(
          process.env.OPENAI_API_KEY,
          process.env.KIT_AI_MODEL,
        )
      : undefined,
  origins,
  secureCookies: process.env.KIT_SECURE_COOKIES === "true",
  serveStatic: process.env.NODE_ENV === "production",
});
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
    repo.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
