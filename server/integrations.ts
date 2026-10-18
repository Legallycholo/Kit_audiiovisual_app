import { HttpError, type Repository } from "./database";
import {
  aiKeyName,
  probeModel,
  providerLabel,
  resolveAIConfig,
  type AIConfig,
} from "./ai-provider";

/**
 * Third-party connections, read from the server environment only. Secrets
 * stay in this process: status responses carry at most a last-4 hint.
 */
export interface IntegrationsConfig {
  ai?: AIConfig | null;
  serpapi?: { key: string; monthlyCap: number } | null;
  whatsapp?: { token: string; phoneNumberId: string } | null;
  calcom?: { key?: string; webhookSecret?: string; bookingUrl?: string } | null;
  email?: { provider: string; key: string; from: string } | null;
  /** Injected in tests; production uses the global fetch. */
  transport?: typeof fetch;
}

export type IntegrationId =
  "ai" | "whatsapp" | "calcom" | "serpapi" | "search" | "email";

const clean = (value?: string) => value?.trim() || undefined;

/** Builds the integration settings from process.env-style variables. */
export function integrationsFromEnv(
  env: Record<string, string | undefined>,
): IntegrationsConfig {
  const cap = Number(env.KIT_SERPAPI_MONTHLY_CAP);
  const serpKey = clean(env.SERPAPI_API_KEY);
  const whatsappToken = clean(env.WHATSAPP_TOKEN);
  const phoneNumberId = clean(env.WHATSAPP_PHONE_NUMBER_ID);
  const calcom = {
    key: clean(env.CALCOM_API_KEY),
    webhookSecret: clean(env.CALCOM_WEBHOOK_SECRET),
    bookingUrl: clean(env.CALCOM_BOOKING_URL),
  };
  const emailKey = clean(env.KIT_EMAIL_API_KEY);
  return {
    ai: resolveAIConfig(env),
    serpapi: serpKey
      ? {
          key: serpKey,
          // Free plan size until the owner sets a cap (decision Q10).
          monthlyCap: Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : 250,
        }
      : null,
    whatsapp:
      whatsappToken && phoneNumberId
        ? { token: whatsappToken, phoneNumberId }
        : null,
    calcom:
      calcom.key || calcom.webhookSecret || calcom.bookingUrl ? calcom : null,
    email:
      emailKey && clean(env.KIT_EMAIL_PROVIDER) && clean(env.KIT_EMAIL_FROM)
        ? {
            provider: clean(env.KIT_EMAIL_PROVIDER)!,
            key: emailKey,
            from: clean(env.KIT_EMAIL_FROM)!,
          }
        : null,
  };
}

export const hint = (secret?: string) =>
  secret && secret.length >= 12 ? `…${secret.slice(-4)}` : secret ? "…" : null;

export function monthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Counts audit entries with one of the given actions in the current month. */
export function monthlyCount(
  repo: Repository,
  actions: string[],
  now = new Date(),
) {
  if (!actions.length) return 0;
  const row = repo.db
    .prepare(
      `SELECT COUNT(*) AS count FROM audit WHERE created_at >= ? AND action IN (${actions.map(() => "?").join(",")})`,
    )
    .get(monthStart(now).toISOString(), ...actions) as { count: number };
  return Number(row.count);
}

export const AUDIT = {
  test: "Integration connection tested",
  lookup: "External lookup performed",
  ai: [
    "AI proposal suggestion generated",
    "Floor-plan geometry extracted",
    "KIT generation completed",
  ],
  whatsapp: ["Outgoing message delivered to transport"],
};

function lastTest(repo: Repository, id: IntegrationId) {
  const row = repo.db
    .prepare(
      "SELECT detail, created_at FROM audit WHERE action=? AND detail LIKE ? ORDER BY rowid DESC LIMIT 1",
    )
    .get(AUDIT.test, `${id} · %`) as
    { detail: string; created_at: string } | undefined;
  const success = repo.db
    .prepare(
      "SELECT created_at FROM audit WHERE action=? AND detail LIKE ? ORDER BY rowid DESC LIMIT 1",
    )
    .get(AUDIT.test, `${id} · ok%`) as { created_at: string } | undefined;
  return {
    lastTestedAt: row?.created_at ?? null,
    lastTestOk: row ? row.detail.startsWith(`${id} · ok`) : null,
    lastSuccessAt: success?.created_at ?? null,
  };
}

export interface IntegrationStatus {
  id: IntegrationId;
  group: "ai" | "messaging" | "scheduling" | "search" | "email";
  configured: boolean;
  testable: boolean;
  env: string[];
  provider?: string;
  models?: { proposal?: string; chat?: string; plan?: string };
  account?: string | null;
  keyHint?: string | null;
  bookingUrl?: string | null;
  webhookSigned?: boolean;
  usage?: { label: string; value: number; cap?: number };
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastSuccessAt: string | null;
}

/** The status list for Settings › Integraciones. Contains no secrets. */
export function integrationStatus(
  repo: Repository,
  config: IntegrationsConfig,
  extra: { messagingLabel?: string | null; searchName?: string | null },
): IntegrationStatus[] {
  const { ai, serpapi, whatsapp, calcom, email } = config;
  return [
    {
      id: "ai",
      group: "ai",
      configured: Boolean(ai),
      testable: Boolean(ai),
      env: [
        "KIT_AI_PROVIDER",
        ai ? aiKeyName(ai.provider) : "ANTHROPIC_API_KEY",
        "KIT_AI_MODEL",
        "KIT_CHAT_MODEL",
        "KIT_PLAN_MODEL",
      ],
      provider: ai ? providerLabel[ai.provider] : undefined,
      models: ai
        ? { proposal: ai.proposalModel, chat: ai.chatModel, plan: ai.planModel }
        : undefined,
      keyHint: hint(ai?.key),
      usage: { label: "requests", value: monthlyCount(repo, AUDIT.ai) },
      ...lastTest(repo, "ai"),
    },
    {
      id: "whatsapp",
      group: "messaging",
      configured: Boolean(extra.messagingLabel),
      testable: Boolean(whatsapp),
      env: [
        "WHATSAPP_TOKEN",
        "WHATSAPP_PHONE_NUMBER_ID",
        "WHATSAPP_APP_SECRET",
        "WHATSAPP_VERIFY_TOKEN",
      ],
      account: extra.messagingLabel ?? null,
      keyHint: hint(whatsapp?.token),
      usage: { label: "sent", value: monthlyCount(repo, AUDIT.whatsapp) },
      ...lastTest(repo, "whatsapp"),
    },
    {
      id: "calcom",
      group: "scheduling",
      configured: Boolean(calcom?.key),
      testable: Boolean(calcom?.key),
      env: ["CALCOM_API_KEY", "CALCOM_WEBHOOK_SECRET", "CALCOM_BOOKING_URL"],
      bookingUrl: calcom?.key ? (calcom.bookingUrl ?? null) : null,
      webhookSigned: Boolean(calcom?.webhookSecret),
      keyHint: hint(calcom?.key),
      ...lastTest(repo, "calcom"),
    },
    {
      id: "serpapi",
      group: "search",
      configured: Boolean(serpapi),
      testable: Boolean(serpapi),
      env: ["SERPAPI_API_KEY", "KIT_SERPAPI_MONTHLY_CAP"],
      keyHint: hint(serpapi?.key),
      usage: {
        label: "searches",
        value: monthlyCount(repo, [AUDIT.lookup]),
        cap: serpapi?.monthlyCap,
      },
      ...lastTest(repo, "serpapi"),
    },
    {
      id: "search",
      group: "search",
      configured: Boolean(extra.searchName),
      testable: false,
      env: [
        "KIT_SEARCH_PROVIDER_URL",
        "KIT_SEARCH_PROVIDER_TOKEN",
        "KIT_SEARCH_PROVIDER_NAME",
        "KIT_SEARCH_ENCRYPTION_KEY",
      ],
      provider: extra.searchName ?? undefined,
      ...lastTest(repo, "search"),
    },
    {
      id: "email",
      group: "email",
      configured: Boolean(email),
      testable: false,
      env: ["KIT_EMAIL_PROVIDER", "KIT_EMAIL_API_KEY", "KIT_EMAIL_FROM"],
      provider: email?.provider,
      account: email?.from ?? null,
      keyHint: hint(email?.key),
      ...lastTest(repo, "email"),
    },
  ];
}

async function probe(
  url: string,
  headers: Record<string, string>,
  transport: typeof fetch,
) {
  let response: Response;
  try {
    response = await transport(url, {
      method: "GET",
      redirect: "error",
      headers,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new HttpError(502, "No se pudo contactar el servicio.");
  }
  await response.body?.cancel();
  if (response.status === 401 || response.status === 403)
    throw new HttpError(502, "El servicio rechazó la clave configurada.");
  if (!response.ok)
    throw new HttpError(502, "El servicio no respondió correctamente.");
}

/**
 * One minimal live request that proves the credentials work. It never
 * generates text, sends a message or creates a booking.
 */
export async function testIntegration(
  id: IntegrationId,
  config: IntegrationsConfig,
) {
  const transport = config.transport ?? fetch;
  if (id === "ai") {
    if (!config.ai)
      throw new HttpError(409, "Configura la clave de IA antes de probar.");
    const model =
      config.ai.proposalModel || config.ai.chatModel || config.ai.planModel;
    if (!model)
      throw new HttpError(409, "Configura KIT_AI_MODEL antes de probar.");
    await probeModel({
      provider: config.ai.provider,
      key: config.ai.key,
      model,
      transport,
    });
    return `${providerLabel[config.ai.provider]} reconoce el modelo ${model}.`;
  }
  if (id === "serpapi") {
    if (!config.serpapi)
      throw new HttpError(409, "Configura SERPAPI_API_KEY antes de probar.");
    // The account endpoint is free and does not use a search.
    await probe(
      `https://serpapi.com/account.json?api_key=${encodeURIComponent(config.serpapi.key)}`,
      {},
      transport,
    );
    return "SerpApi aceptó la clave. No se usó ninguna búsqueda.";
  }
  if (id === "whatsapp") {
    if (!config.whatsapp)
      throw new HttpError(
        409,
        "Configura WHATSAPP_TOKEN y WHATSAPP_PHONE_NUMBER_ID antes de probar.",
      );
    await probe(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(config.whatsapp.phoneNumberId)}?fields=display_phone_number`,
      { Authorization: `Bearer ${config.whatsapp.token}` },
      transport,
    );
    return "Meta aceptó el token y el número de WhatsApp. No se envió ningún mensaje.";
  }
  if (id === "calcom") {
    if (!config.calcom?.key)
      throw new HttpError(409, "Configura CALCOM_API_KEY antes de probar.");
    await probe(
      "https://api.cal.com/v2/me",
      { Authorization: `Bearer ${config.calcom.key}` },
      transport,
    );
    return "Cal.com aceptó la clave. No se creó ninguna reserva.";
  }
  throw new HttpError(422, "Este servicio no tiene una prueba en vivo.");
}
