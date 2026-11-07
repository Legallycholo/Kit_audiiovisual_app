import type express from "express";
import { z } from "zod";
import { HttpError } from "../database";
import { rateLimit, userOf } from "../security";
import { AUDIT, monthlyCount } from "../integrations";
import { serpLookup } from "../lookup";
import type { RouteContext } from "./context";

/**
 * Web lookup for the new equipment, venue and event forms. Owner only, with
 * a monthly cap enforced here. Results are suggestions the person picks from.
 */
export function mountLookupRoutes(
  app: express.Express,
  { repo, config }: RouteContext,
) {
  const owner = (res: express.Response) => {
    const user = userOf(res);
    if (!user.isOwner)
      throw new HttpError(403, "Solo el propietario usa la búsqueda externa.");
    return user;
  };
  const usage = async () => {
    const serpapi = config.integrations?.serpapi;
    return {
      configured: Boolean(serpapi),
      used: await monthlyCount(repo, [AUDIT.lookup]),
      cap: serpapi?.monthlyCap ?? 0,
    };
  };
  app.get("/api/lookup/status", async (_req, res) => {
    owner(res);
    res.json(await usage());
  });
  app.post("/api/lookup", async (req, res) => {
    const user = owner(res);
    const input = z
      .object({
        kind: z.enum(["equipment", "venue", "event"]),
        query: z.string().trim().min(2).max(200),
      })
      .strict()
      .parse(req.body);
    const serpapi = config.integrations?.serpapi;
    if (!serpapi) throw new HttpError(503, "Búsqueda externa no conectada.");
    if ((await usage()).used >= serpapi.monthlyCap)
      throw new HttpError(429, "Límite mensual alcanzado.");
    await rateLimit(repo, `lookup:${user.id}`, 30);
    const results = await serpLookup(
      input.kind,
      input.query,
      serpapi.key,
      config.integrations?.transport,
    );
    // The query itself is not stored; only that a search was spent.
    await repo.audit(user.id, AUDIT.lookup, `${input.kind} · ${results.length}`);
    res.json({ kind: input.kind, results, ...(await usage()) });
  });
}
