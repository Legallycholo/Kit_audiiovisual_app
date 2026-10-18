import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  portableSchema,
  probeModel,
  resolveAIConfig,
  structuredResponse,
} from "./ai-provider";
import { HttpError } from "./database";

const schema = z
  .object({
    title: z.string().min(1).max(20),
    count: z.number().int().min(1).max(5),
  })
  .strict();
const image = { mimeType: "image/png" as const, data: "YQ==" };
const base = {
  key: "sk-test-secret-0001",
  model: "test-model",
  name: "fixture",
  schema,
  instructions: "Devuelve JSON.",
  input: { brief: "Escenario" },
};

describe("anthropic adapter", () => {
  it("sends the schema, images and fallback, and parses the text block", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        stop_reason: "end_turn",
        content: [
          { type: "thinking", thinking: "" },
          { type: "text", text: '{"title":"Gala","count":2}' },
        ],
      }),
    );
    const result = await structuredResponse({
      ...base,
      provider: "anthropic",
      model: "claude-opus-5-5",
      images: [image],
      effort: "high",
      transport,
    });
    expect(result).toEqual({ title: "Gala", count: 2 });
    const [url, init] = transport.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = init?.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe(base.key);
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["anthropic-beta"]).toBe("server-side-fallback-2026-07-01");
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("claude-opus-5-5");
    expect(body.fallbacks).toBe("default");
    expect(body.output_config.effort).toBe("high");
    expect(body.output_config.format.type).toBe("json_schema");
    // Constraints the API rejects are removed; zod still enforces them.
    expect(JSON.stringify(body.output_config.format.schema)).not.toMatch(
      /minimum|maxLength/,
    );
    expect(body.output_config.format.schema.additionalProperties).toBe(false);
    expect(body.messages[0].content[0]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "YQ==" },
    });
    expect(body).not.toHaveProperty("thinking");
  });

  it("omits the fallback for models without server-side fallback", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        stop_reason: "end_turn",
        content: [{ type: "text", text: '{"title":"A","count":1}' }],
      }),
    );
    await structuredResponse({
      ...base,
      provider: "anthropic",
      model: "claude-haiku-5-5",
      transport,
    });
    const init = transport.mock.calls[0][1];
    expect(init?.headers).not.toHaveProperty("anthropic-beta");
    expect(JSON.parse(String(init?.body))).not.toHaveProperty("fallbacks");
  });

  it.each([
    [{ stop_reason: "refusal", content: [] }, 422],
    [
      { stop_reason: "max_tokens", content: [{ type: "text", text: "{" }] },
      502,
    ],
    [{ stop_reason: "end_turn", content: [{ type: "text", text: "no" }] }, 502],
  ])("maps unusable responses to a safe error", async (payload, status) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(payload));
    await expect(
      structuredResponse({ ...base, provider: "anthropic", transport }),
    ).rejects.toMatchObject({ status });
  });

  it("reports rate limits and never echoes the key", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("{}", { status: 429 }));
    const error = (await structuredResponse({
      ...base,
      provider: "anthropic",
      transport,
    }).catch((e: unknown) => e)) as HttpError;
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(429);
    expect(String(error.message)).not.toContain(base.key);
  });
});

describe("gemini adapter", () => {
  it("sends inline image data and a JSON response schema", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: '{"title":"Gala","count":3}' }] },
          },
        ],
      }),
    );
    const result = await structuredResponse({
      ...base,
      provider: "gemini",
      model: "gemini-test",
      images: [image],
      transport,
    });
    expect(result).toEqual({ title: "Gala", count: 3 });
    const [url, init] = transport.mock.calls[0];
    expect(url).toContain("/models/gemini-test:generateContent");
    expect((init?.headers as Record<string, string>)["x-goog-api-key"]).toBe(
      base.key,
    );
    const body = JSON.parse(String(init?.body));
    expect(body.contents[0].parts[0]).toEqual({
      inline_data: { mime_type: "image/png", data: "YQ==" },
    });
    expect(body.generationConfig.responseMimeType).toBe("application/json");
  });

  it("treats safety blocks as a refusal", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ promptFeedback: { blockReason: "SAFETY" } }),
      );
    await expect(
      structuredResponse({ ...base, provider: "gemini", transport }),
    ).rejects.toMatchObject({ status: 422 });
  });
});

describe("openai adapter", () => {
  it("adds images as input parts only when provided", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: '{"title":"A","count":1}' }],
          },
        ],
      }),
    );
    await structuredResponse({ ...base, images: [image], transport });
    const body = JSON.parse(String(transport.mock.calls[0][1]?.body));
    expect(body.input[0].content[1]).toEqual({
      type: "input_image",
      image_url: "data:image/png;base64,YQ==",
    });
  });
});

describe("configuration", () => {
  it("keeps an existing OpenAI setup working without KIT_AI_PROVIDER", () => {
    expect(
      resolveAIConfig({
        OPENAI_API_KEY: "sk-openai",
        KIT_AI_MODEL: "gpt-test",
        KIT_CHAT_MODEL: "gpt-chat",
      }),
    ).toEqual({
      provider: "openai",
      key: "sk-openai",
      proposalModel: "gpt-test",
      chatModel: "gpt-chat",
      planModel: "gpt-test",
    });
  });

  it("defaults Claude to Claude Opus 5.5 and honors KIT_PLAN_MODEL", () => {
    expect(
      resolveAIConfig({
        KIT_AI_PROVIDER: "anthropic",
        ANTHROPIC_API_KEY: "sk-ant",
        KIT_PLAN_MODEL: "claude-haiku-5-5",
      }),
    ).toMatchObject({
      provider: "anthropic",
      proposalModel: "claude-opus-5-5",
      chatModel: "claude-opus-5-5",
      planModel: "claude-haiku-5-5",
    });
  });

  it("is off without a key or with an unknown provider", () => {
    expect(resolveAIConfig({})).toBeNull();
    expect(resolveAIConfig({ KIT_AI_PROVIDER: "anthropic" })).toBeNull();
    expect(
      resolveAIConfig({ KIT_AI_PROVIDER: "other", OPENAI_API_KEY: "k" }),
    ).toBeNull();
  });

  it("strips unsupported keywords recursively", () => {
    expect(
      portableSchema({
        type: "object",
        properties: { a: { type: "string", maxLength: 3, minLength: 1 } },
        $schema: "x",
      }),
    ).toEqual({ type: "object", properties: { a: { type: "string" } } });
  });
});

describe("connection probe", () => {
  it("looks up the model without generating text", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ id: "claude-opus-5-5" }));
    await probeModel({
      provider: "anthropic",
      key: "sk-ant",
      model: "claude-opus-5-5",
      transport,
    });
    expect(transport.mock.calls[0][0]).toBe(
      "https://api.anthropic.com/v1/models/claude-opus-5-5",
    );
    expect(transport.mock.calls[0][1]?.method).toBe("GET");
  });

  it.each([
    [401, "rechazó la clave"],
    [404, "no reconoce el modelo"],
  ])("explains a %i in Spanish", async (status, text) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("{}", { status }));
    await expect(
      probeModel({ provider: "openai", key: "k", model: "m", transport }),
    ).rejects.toThrow(text);
  });
});
