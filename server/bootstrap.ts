import { aiProposalGenerator } from "./proposal-ai";
import { supabaseVerifier } from "./supabase-auth";
import { integrationsFromEnv } from "./integrations";
import { httpSearchProvider } from "./search";
import { aiKitGenerator } from "./kit";
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
