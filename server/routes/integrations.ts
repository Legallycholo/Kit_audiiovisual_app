import type express from "express";
import { z } from "zod";
import { HttpError } from "../database";
import { rateLimit, requireAdmin, userOf } from "../security";
import {
  AUDIT,
  integrationStatus,
  testIntegration,
  type IntegrationId,
} from "../integrations";
import type { RouteContext } from "./context";

const ids = ["ai", "whatsapp", "calcom", "serpapi", "search", "email"] as const;

/**
 * Settings › Integraciones. Administrators read status; only the owner runs
 * live connection tests. Responses never include keys.
 */
export function mountIntegrationRoutes(
  app: express.Express,
  { repo, config }: RouteContext,
) {
  const settings = () => config.integrations ?? {};
  app.get("/api/integrations", (_req, res) => {
    const user = requireAdmin(res);
    res.json({
      canTest: user.isOwner,
      month: new Date().toISOString().slice(0, 7),
      integrations: integrationStatus(repo, settings(), {
        messagingLabel: config.messageTransport?.label ?? null,
        searchName: config.search?.provider ? config.search.name : null,
      }),
    });
  });
  app.post("/api/integrations/:id/test", async (req, res) => {
    const user = userOf(res);
    if (!user.isOwner)
      throw new HttpError(
        403,
        "Solo el propietario puede probar las conexiones.",
      );
    const id = z.enum(ids).parse(req.params.id) as IntegrationId;
    rateLimit(repo, `integration-test:${user.id}`, 10);
    let ok = true;
    let message: string;
    try {
      message = await testIntegration(id, settings());
    } catch (error) {
      if (error instanceof HttpError && [409, 422].includes(error.status))
        throw error;
      ok = false;
      message =
        error instanceof HttpError
          ? error.message
          : "La prueba de conexión falló.";
    }
    repo.audit(user.id, AUDIT.test, `${id} · ${ok ? "ok" : "error"}`);
    res.json({ id, ok, message, testedAt: new Date().toISOString() });
  });
}
