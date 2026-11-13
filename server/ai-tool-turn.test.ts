import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { anthropicToolTurn } from "./ai-provider";

/** The Claude tool loop over an injected transport: no network, no key in errors. */
const schema = z
  .object({ text: z.string(), citations: z.array(z.string()) })
  .strict();
const tools = [
  {
    name: "proposal__get",
    description: "Lee",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "proposal__update_section",
    description: "Edita",
    input_schema: { type: "object", properties: {} },
  },
];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("anthropicToolTurn", () => {
  it("runs tool calls, returns their results in one message and ends with the structured answer", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          stop_reason: "tool_use",
          content: [
            { type: "text", text: "Voy a leer la propuesta." },
            {
              type: "tool_use",
              id: "t1",
              name: "proposal__get",
              input: { proposalId: "p2" },
            },
            {
              type: "tool_use",
              id: "t2",
              name: "proposal__update_section",
              input: { proposalId: "p2" },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        json({
          stop_reason: "end_turn",
          content: [{ type: "text", text: '{"text":"Listo","citations":[]}' }],
        }),
      );
    const run = vi.fn(async (name: string) =>
      name === "proposal__get"
        ? { content: { title: "Northstar" } }
        : { content: { error: "Rol" }, isError: true },
    );
    const result = await anthropicToolTurn({
      key: "sk-ant-secret",
      model: "claude-opus-5-5",
      instructions: "Eres KIT.",
      input: { question: "Hola" },
      schema,
      tools,
      run,
      transport,
    });
    expect(result).toEqual({ text: "Listo", citations: [] });
    expect(run).toHaveBeenCalledTimes(2);
    const first = JSON.parse(String(transport.mock.calls[0][1]!.body));
    expect(first.system[0]).toMatchObject({
      type: "text",
      text: "Eres KIT.",
      cache_control: { type: "ephemeral" },
    });
    expect(first.tools.at(-1).cache_control).toEqual({ type: "ephemeral" });
    expect(first.tools[0].cache_control).toBeUndefined();
    expect(first.tool_choice).toEqual({ type: "auto" });
    expect(first.output_config.format.type).toBe("json_schema");
    expect(first.fallbacks).toBe("default");
    expect(first).not.toHaveProperty("thinking");
    const second = JSON.parse(String(transport.mock.calls[1][1]!.body));
    expect(second.messages).toHaveLength(3);
    expect(second.messages[1].role).toBe("assistant");
    expect(second.messages[2].content).toEqual([
      {
        type: "tool_result",
        tool_use_id: "t1",
        content: JSON.stringify({ title: "Northstar" }),
      },
      {
        type: "tool_result",
        tool_use_id: "t2",
        content: JSON.stringify({ error: "Rol" }),
        is_error: true,
      },
    ]);
    const headers = (transport.mock.calls[0][1]!.headers ?? {}) as Record<
      string,
      string
    >;
    expect(headers["x-api-key"]).toBe("sk-ant-secret");
    expect(first).not.toContain("sk-ant-secret");
  });
  it("forbids tools on the last allowed step and reports a thrown tool as an error result", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          stop_reason: "tool_use",
          content: [
            { type: "tool_use", id: "t1", name: "proposal__get", input: {} },
          ],
        }),
      )
      .mockResolvedValueOnce(
        json({
          stop_reason: "end_turn",
          content: [{ type: "text", text: '{"text":"Fin","citations":[]}' }],
        }),
      );
    const result = await anthropicToolTurn({
      key: "k",
      model: "claude-opus-5-5",
      instructions: "x",
      input: {},
      schema,
      tools,
      run: async () => {
        throw new Error("boom with k");
      },
      maxTurns: 2,
      transport,
    });
    expect(result).toEqual({ text: "Fin", citations: [] });
    const second = JSON.parse(String(transport.mock.calls[1][1]!.body));
    expect(second.tool_choice).toEqual({ type: "none" });
    expect(second.messages[2].content[0]).toMatchObject({
      is_error: true,
      content: JSON.stringify({ error: "La herramienta falló." }),
    });
  });
  it("maps provider failures to Spanish errors without the provider body", async () => {
    await expect(
      anthropicToolTurn({
        key: "k",
        model: "claude-opus-5-5",
        instructions: "x",
        input: {},
        schema,
        tools,
        run: async () => ({ content: null }),
        transport: vi
          .fn<typeof fetch>()
          .mockRejectedValue(new Error("ECONNRESET k")),
      }),
    ).rejects.toMatchObject({
      status: 503,
      message: expect.not.stringContaining("ECONNRESET"),
    });
    await expect(
      anthropicToolTurn({
        key: "k",
        model: "claude-opus-5-5",
        instructions: "x",
        input: {},
        schema,
        tools,
        run: async () => ({ content: null }),
        transport: vi
          .fn<typeof fetch>()
          .mockResolvedValue(json({ stop_reason: "refusal", content: [] })),
      }),
    ).rejects.toMatchObject({ status: 422 });
  });
});
