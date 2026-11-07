import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "./app";
import { configFromEnv } from "./bootstrap";
import { Repository } from "./database";

/**
 * Source of the Vercel Function. `npm run build:api` bundles it into
 * api/index.mjs, which is what Vercel runs (see scripts/api-bundle.ts for why).
 *
 * The company server as one Vercel Function. vercel.json sends every /api/*
 * request here and Express routes it exactly as it does locally, so API paths
 * and response shapes are unchanged. Static files come from the CDN.
 *
 * The app is built once per instance and reused. The database is the hosted
 * Postgres (KIT_DATABASE); an instance never holds data that another needs.
 */
let starting: Promise<ReturnType<typeof createApp>> | undefined;

async function start() {
  const url = process.env.KIT_DATABASE;
  if (!url || !/^postgres(ql)?:\/\//i.test(url))
    throw new NotConfigured(
      "KIT_DATABASE must be the Postgres connection string in this environment.",
    );
  const repo = await Repository.open(url);
  const app = createApp(repo, {
    ...configFromEnv(process.env, "http://127.0.0.1:5173"),
    // The CDN serves the built frontend; Express only answers /api.
    serveStatic: false,
    // One proxy hop (Vercel) sits in front, so req.ip is the real client for rate limits.
    trustProxy: 1,
    // A new instance says nothing about AI jobs running on other instances.
    resetBusyOnBoot: false,
  });
  await app.locals.ready;
  return app;
}

class NotConfigured extends Error {}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  try {
    starting ??= start();
    const app = await starting;
    app(req as any, res as any);
  } catch (error) {
    // A failed start is retried by the next request instead of being cached.
    starting = undefined;
    // Only the error name is logged: messages can carry connection details.
    console.error(
      JSON.stringify({
        level: "error",
        msg: "kit_start_failed",
        error: error instanceof Error ? error.name : "Unknown error",
      }),
    );
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(
      JSON.stringify({
        error:
          error instanceof NotConfigured
            ? "The company database is not configured for this deployment."
            : "The company server could not start. Try again in a moment.",
      }),
    );
  }
}
