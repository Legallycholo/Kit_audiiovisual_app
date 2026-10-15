import { openAIProposalGenerator } from "./proposal-ai";
import { resolve } from "node:path";
import { Repository } from "./database";
import { createApp } from "./app";

const port = Number(process.env.PORT || 3001);
const origins = (
  process.env.KIT_ORIGINS ||
  "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:3001"
).split(",");
const repo = new Repository(
  resolve(process.env.KIT_DATABASE || "data/kit.sqlite"),
);
const app = createApp(repo, {
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
function shutdown() {
  server.close(() => {
    repo.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
