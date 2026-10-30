import { z } from "zod";
import { HttpError } from "./database";
import { GoogleGenAI } from "@google/genai";

/**
 * Provider-neutral structured output. Every provider gets the same inputs and
 * returns parsed JSON that callers validate again with zod. Model output is
 * data, never executable authority. Keys are passed in and never logged.
 */
export type AIProvider = "openai" | "anthropic" | "gemini";
export const aiProviders: AIProvider[] = ["anthropic", "openai", "gemini"];

export interface AIImage {
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  /** Base64 data without the data-URL prefix. */
  data: string;
}

export interface StructuredOptions {
  provider?: AIProvider;
  key: string;
  model: string;
  name: string;
  schema: z.ZodType;
  instructions: string;
  input: unknown;
  images?: AIImage[];
  effort?: "low" | "medium" | "high";
  maxOutputTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  transport?: typeof fetch;
}

const unreachable = () =>
  new HttpError(
    503,
    "No se pudo contactar la IA. Puedes reintentar; no se aplicó ninguna acción.",
  );

function signalFor(options: StructuredOptions) {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 60_000);
  return options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
}

async function readJson(response: Response): Promise<any> {
  if (!response.ok)
    throw new HttpError(
      response.status === 429 ? 429 : 502,
      response.status === 429
        ? "La IA alcanzó su límite de uso. Intenta más tarde."
        : "La IA no pudo generar la respuesta. Revisa la conexión del servidor.",
    );
  if (!response.body) throw new HttpError(502, "Respuesta de IA vacía.");
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2_000_000)
        throw new HttpError(502, "Respuesta de IA demasiado grande.");
      parts.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString());
  } catch {
    throw new HttpError(502, "Respuesta de IA inválida.");
  }
}

function parseOutput(text: string) {
  try {
    const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    return JSON.parse(cleaned);
  } catch {
    throw new HttpError(502, "La IA no devolvió una respuesta válida.");
  }
}

/**
 * Removes JSON Schema keywords that some providers reject. The same zod
 * schema still validates every bound after the response arrives.
 */
export function portableSchema(
  schema: unknown,
  drop: string[] = [
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "multipleOf",
    "minLength",
    "maxLength",
    "pattern",
    "minItems",
    "maxItems",
    "$schema",
  ],
): unknown {
  if (Array.isArray(schema))
    return schema.map((item) => portableSchema(item, drop));
  if (!schema || typeof schema !== "object") return schema;
  return Object.fromEntries(
    Object.entries(schema as Record<string, unknown>)
      .filter(([key]) => !drop.includes(key))
      .map(([key, value]) => [key, portableSchema(value, drop)]),
  );
}

async function openAI(options: StructuredOptions) {
  const input = options.images?.length
    ? [
        {
          role: "user",
          content: [
            { type: "input_text", text: JSON.stringify(options.input) },
            ...options.images.map((image) => ({
              type: "input_image",
              image_url: `data:${image.mimeType};base64,${image.data}`,
            })),
          ],
        },
      ]
    : JSON.stringify(options.input);
  let response: Response;
  try {
    response = await (options.transport || fetch)(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        redirect: "error",
        headers: {
          Authorization: `Bearer ${options.key}`,
          "Content-Type": "application/json",
        },
        signal: signalFor(options),
        body: JSON.stringify({
          model: options.model,
          store: false,
          max_output_tokens: options.maxOutputTokens ?? 6000,
          instructions: options.instructions,
          input,
          text: {
            format: {
              type: "json_schema",
              name: options.name,
              strict: true,
              schema: z.toJSONSchema(options.schema, { target: "draft-7" }),
            },
          },
        }),
      },
    );
  } catch {
    throw unreachable();
  }
  const value = await readJson(response);
  if (value.status !== "completed" || !Array.isArray(value.output))
    throw new HttpError(502, "La respuesta de IA quedó incompleta.");
  const content = value.output
    .filter((i: any) => i.type === "message")
    .flatMap((i: any) => (Array.isArray(i.content) ? i.content : []));
  if (content.some((i: any) => i.type === "refusal"))
    throw new HttpError(422, "La IA no pudo responder a esta solicitud.");
  return parseOutput(
    content
      .filter((i: any) => i.type === "output_text")
      .map((i: any) => i.text || "")
      .join(""),
  );
}

/** Models that accept the server-side refusal fallback ("default" routing). */
const anthropicFallbackModel = /^claude-(opus-5|fable-5|sonnet-5-5)/;

async function anthropic(options: StructuredOptions) {
  const fallback = anthropicFallbackModel.test(options.model);
  let response: Response;
  try {
    response = await (options.transport || fetch)(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        redirect: "error",
        headers: {
          "x-api-key": options.key,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
          ...(fallback
            ? { "anthropic-beta": "server-side-fallback-2026-07-01" }
            : {}),
        },
        signal: signalFor(options),
        body: JSON.stringify({
          model: options.model,
          max_tokens: options.maxOutputTokens ?? 16000,
          system: options.instructions,
          messages: [
            {
              role: "user",
              content: [
                ...(options.images ?? []).map((image) => ({
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: image.mimeType,
                    data: image.data,
                  },
                })),
                { type: "text", text: JSON.stringify(options.input) },
              ],
            },
          ],
          output_config: {
            effort: options.effort ?? "medium",
            format: {
              type: "json_schema",
              schema: portableSchema(
                z.toJSONSchema(options.schema, { target: "draft-7" }),
              ),
            },
          },
          ...(fallback ? { fallbacks: "default" } : {}),
        }),
      },
    );
  } catch {
    throw unreachable();
  }
  if (response.status === 529)
    throw new HttpError(503, "La IA está saturada. Intenta en unos minutos.");
  const value = await readJson(response);
  if (value.stop_reason === "refusal")
    throw new HttpError(422, "La IA no pudo responder a esta solicitud.");
  if (value.stop_reason === "max_tokens" || !Array.isArray(value.content))
    throw new HttpError(502, "La respuesta de IA quedó incompleta.");
  return parseOutput(
    value.content
      .filter((block: any) => block.type === "text")
      .map((block: any) => block.text || "")
      .join(""),
  );
}

async function gemini(options: StructuredOptions) {
  try {
    const ai = new GoogleGenAI({
      apiKey: options.key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const promptText =
      typeof options.input === "string"
        ? options.input
        : JSON.stringify(options.input);

    const parts: any[] = [
      ...(options.images ?? []).map((image) => ({
        inlineData: { mimeType: image.mimeType, data: image.data },
      })),
      { text: promptText },
    ];

    const modelName = options.model || DEFAULT_GEMINI_MODEL;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: { parts },
      config: {
        systemInstruction: options.instructions,
        responseMimeType: "application/json",
      },
    });

    const text = response.text;
    if (!text) throw new HttpError(502, "La IA no devolvió contenido.");
    return parseOutput(text);
  } catch (error: any) {
    if (error instanceof HttpError) throw error;
    if (error?.status === 429) {
      throw new HttpError(429, "La IA alcanzó su límite de uso. Intenta más tarde.");
    }
    if (error?.status === 403 || error?.status === 400) {
      throw new HttpError(403, "La clave o permisos de Gemini no son válidos.");
    }
    throw unreachable();
  }
}

/** Shared stateless transport for every provider. */
export async function structuredResponse(
  options: StructuredOptions,
): Promise<unknown> {
  const provider = options.provider ?? "gemini";
  if (provider === "anthropic") return anthropic(options);
  if (provider === "gemini") return gemini(options);
  return openAI(options);
}

/**
 * Minimal live check used by Settings › Integraciones. It looks up the
 * configured model, which proves the key and model without generating text.
 */
export async function probeModel(options: {
  provider: AIProvider;
  key: string;
  model: string;
  transport?: typeof fetch;
}): Promise<void> {
  if (options.provider === "gemini") {
    try {
      const ai = new GoogleGenAI({
        apiKey: options.key,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
      await ai.models.generateContent({
        model: options.model || DEFAULT_GEMINI_MODEL,
        contents: "hola",
      });
      return;
    } catch {
      throw new HttpError(502, "El proveedor no reconoció la clave o modelo de Gemini.");
    }
  }
  const request: { url: string; headers: Record<string, string> } =
    options.provider === "anthropic"
      ? {
          url: `https://api.anthropic.com/v1/models/${encodeURIComponent(options.model)}`,
          headers: {
            "x-api-key": options.key,
            "anthropic-version": "2023-06-01",
          },
        }
      : {
          url: `https://api.openai.com/v1/models/${encodeURIComponent(options.model)}`,
          headers: { Authorization: `Bearer ${options.key}` },
        };
  let response: Response;
  try {
    response = await (options.transport || fetch)(request.url, {
      method: "GET",
      redirect: "error",
      headers: request.headers,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw unreachable();
  }
  await response.body?.cancel();
  if (response.status === 401 || response.status === 403)
    throw new HttpError(502, "El proveedor rechazó la clave configurada.");
  if (response.status === 404)
    throw new HttpError(502, "El proveedor no reconoce el modelo configurado.");
  if (!response.ok)
    throw new HttpError(502, "El proveedor no respondió correctamente.");
}

export interface AIConfig {
  provider: AIProvider;
  key: string;
  proposalModel?: string;
  chatModel?: string;
  planModel?: string;
}

/** Recommended default when Gemini is selected */
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
/** Recommended default when Claude is selected (decision Q4). */
export const DEFAULT_CLAUDE_MODEL = "claude-opus-5-5";

const keyNames: Record<AIProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
};
export const aiKeyName = (provider: AIProvider) => keyNames[provider];

/**
 * Reads the AI provider from the server environment. Prioritizes Gemini when GEMINI_API_KEY is available.
 */
export function resolveAIConfig(
  env: Record<string, string | undefined>,
): AIConfig | null {
  const geminiKey = env.GEMINI_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim();
  const requested = env.KIT_AI_PROVIDER?.trim().toLowerCase();
  const provider: AIProvider | undefined =
    requested && (aiProviders as string[]).includes(requested)
      ? (requested as AIProvider)
      : geminiKey
        ? "gemini"
        : env.OPENAI_API_KEY
          ? "openai"
          : env.ANTHROPIC_API_KEY
            ? "anthropic"
            : undefined;
  if (!provider) return null;
  const key = provider === "gemini" ? (geminiKey || "") : (env[keyNames[provider]]?.trim() || "");
  if (!key) return null;
  const fallback =
    provider === "gemini"
      ? DEFAULT_GEMINI_MODEL
      : provider === "anthropic"
        ? DEFAULT_CLAUDE_MODEL
        : undefined;
  const proposalModel = env.KIT_AI_MODEL?.trim() || fallback || DEFAULT_GEMINI_MODEL;
  return {
    provider,
    key,
    proposalModel,
    chatModel: env.KIT_CHAT_MODEL?.trim() || fallback || DEFAULT_GEMINI_MODEL,
    planModel: env.KIT_PLAN_MODEL?.trim() || proposalModel,
  };
}

export const providerLabel: Record<AIProvider, string> = {
  anthropic: "Claude (Anthropic)",
  openai: "OpenAI",
  gemini: "Gemini (Google)",
};
