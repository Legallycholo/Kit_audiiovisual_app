import { aiProposalGenerator } from "./proposal-ai";
import { supabaseVerifier } from "./supabase-auth";
import { integrationsFromEnv } from "./integrations";
import { httpSearchProvider } from "./search";
import { aiKitGenerator } from "./kit";
import { aiDesigner } from "./design-ai/designer";
import { higgsfieldRenderProvider } from "./design-ai/render-provider";
import { supabaseStorage } from "./design-ai/storage";
import { recaptchaVerifier } from "./recaptcha";
import { jsonLogger, parseLogLevel } from "./logger";
import type { AppConfig } from "./routes/context";

/**
 * The company-server configuration read from environment variables. One place
 * for every host: the local servers (server.ts, server/index.ts) and the
 * Vercel function (api/index.ts). Hosting-specific options (static files, the
 * Vite middleware, trust proxy) are added by the caller.
 */
export function configFromEnv(
  env: NodeJS.ProcessEnv,
  defaultOrigins: string,
): AppConfig {
  // One AI provider for drafting, KIT chat and plan reading (Settings › Integraciones).
  const integrations = integrationsFromEnv(env);
  const ai = integrations.ai;
  return {
    logger: jsonLogger(parseLogLevel(env.KIT_LOG_LEVEL)),
    integrations,
    supabaseVerifier:
      env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY
        ? supabaseVerifier(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY)
        : undefined,
    recaptchaVerifier:
      env.RECAPTCHA_PROJECT_ID &&
      env.RECAPTCHA_API_KEY &&
      env.RECAPTCHA_SITE_KEY
        ? recaptchaVerifier(
            env.RECAPTCHA_PROJECT_ID,
            env.RECAPTCHA_API_KEY,
            env.RECAPTCHA_SITE_KEY,
          )
        : undefined,
    design: designFromEnv(env, ai),
    kitGenerator: ai?.chatModel
      ? aiKitGenerator(ai.provider, ai.key, ai.chatModel)
      : undefined,
    search: {
      name: env.KIT_SEARCH_PROVIDER_NAME || "No configurado",
      providerIdentity: env.KIT_SEARCH_PROVIDER_URL || "",
      region: env.KIT_SEARCH_REGION || "",
      retention: env.KIT_SEARCH_RETENTION || "",
      monthlyBudgetCents: Number(env.KIT_SEARCH_MONTHLY_BUDGET_CENTS || 0),
      embeddingCentsPerThousandCharacters: Number(
        env.KIT_SEARCH_CENTS_PER_1000_CHARS || 0,
      ),
      encryptionKey: env.KIT_SEARCH_ENCRYPTION_KEY
        ? Buffer.from(env.KIT_SEARCH_ENCRYPTION_KEY, "hex")
        : undefined,
      provider:
        env.KIT_SEARCH_PROVIDER_URL && env.KIT_SEARCH_PROVIDER_TOKEN
          ? httpSearchProvider(
              env.KIT_SEARCH_PROVIDER_URL,
              env.KIT_SEARCH_PROVIDER_TOKEN,
            )
          : undefined,
    },
    proposalGenerator: ai?.proposalModel
      ? aiProposalGenerator(ai.provider, ai.key, ai.proposalModel)
      : undefined,
    origins: (env.KIT_ORIGINS || defaultOrigins).split(","),
    secureCookies: env.KIT_SECURE_COOKIES === "true",
    cronSecret: env.CRON_SECRET || undefined,
  };
}

/**
 * KIT Design (docs/kit_design_AI.md). Each part falls back to its offline
 * fixture when its keys are missing, so local runs without keys still work:
 * - spec: the configured AI provider with KIT_PLAN_MODEL (default: the proposal model);
 * - renders: Higgsfield when HIGGSFIELD_API_KEY ("KEY_ID:KEY_SECRET") or
 *   HIGGSFIELD_KEY_ID + HIGGSFIELD_KEY_SECRET is set (model: KIT_DESIGN_RENDER_MODEL);
 * - images: the private Supabase bucket when SUPABASE_URL + SUPABASE_SECRET_KEY are set,
 *   otherwise the database;
 * - KIT_DESIGN_MONTHLY_RENDER_CAP live renders per month (default 100).
 */
export function designFromEnv(
  env: NodeJS.ProcessEnv,
  ai: ReturnType<typeof integrationsFromEnv>["ai"],
) {
  const higgsfieldKey =
    env.HIGGSFIELD_API_KEY?.trim() ||
    (env.HIGGSFIELD_KEY_ID && env.HIGGSFIELD_KEY_SECRET
      ? `${env.HIGGSFIELD_KEY_ID.trim()}:${env.HIGGSFIELD_KEY_SECRET.trim()}`
      : "");
  const cap = Number(env.KIT_DESIGN_MONTHLY_RENDER_CAP || 100);
  return {
    designer: ai?.planModel
      ? aiDesigner(ai.provider, ai.key, ai.planModel)
      : undefined,
    renderer: higgsfieldKey
      ? higgsfieldRenderProvider({
          key: higgsfieldKey,
          ...(env.KIT_DESIGN_RENDER_MODEL?.trim()
            ? { model: env.KIT_DESIGN_RENDER_MODEL.trim() }
            : {}),
        })
      : undefined,
    storage:
      env.SUPABASE_URL && env.SUPABASE_SECRET_KEY
        ? supabaseStorage(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY)
        : undefined,
    monthlyRenderCap: Number.isFinite(cap) && cap >= 0 ? cap : 100,
  };
}
