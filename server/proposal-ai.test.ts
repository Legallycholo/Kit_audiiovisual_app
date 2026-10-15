import { expect, it, vi } from "vitest";
import {
  materializeSuggestion,
  openAIProposalGenerator,
  proposalContext,
} from "./proposal-ai";
import { createSeed } from "../src/shared/seed";
const context = proposalContext(
  createSeed(),
  "e1",
  "Preparar audio para una conferencia.",
);
const payload = {
  title: "Conferencia",
  introduction: "Alcance preliminar",
  items: [],
  assumptions: [],
  questions: [],
};
it("calls Responses with strict structured output and no tools or stored response", async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({
        status: "completed",
        output: [
          { type: "reasoning" },
          {
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify(payload) }],
          },
        ],
      }),
    );
  const generator = openAIProposalGenerator(
    "test-secret",
    "configured-model",
    transport,
  );
  expect(await generator.generate(context)).toEqual(payload);
  const [url, options] = transport.mock.calls[0];
  expect(url).toBe("https://api.openai.com/v1/responses");
  const body = JSON.parse(String(options?.body));
  expect(body).toMatchObject({
    model: "configured-model",
    store: false,
    max_output_tokens: 6000,
    text: { format: { type: "json_schema", strict: true } },
  });
  expect(body).not.toHaveProperty("tools");
  expect(body.instructions).toContain("español");
  expect(body.text.format.schema.additionalProperties).toBe(false);
});
it.each([
  [{ status: "incomplete", output: [] }, 502],
  [
    {
      status: "completed",
      output: [{ type: "message", content: [{ type: "refusal" }] }],
    },
    422,
  ],
  [
    {
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: "not-json" }],
        },
      ],
    },
    502,
  ],
  [{ output: [] }, 502],
])(
  "rejects incomplete, refused and malformed provider output %#",
  async (body, status) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(body));
    await expect(
      openAIProposalGenerator("test-secret", "model", transport).generate(
        context,
      ),
    ).rejects.toMatchObject({ status });
  },
);
it("does not expose provider error bodies or credentials", async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json(
        { error: "private provider diagnostic test-secret" },
        { status: 401 },
      ),
    );
  await expect(
    openAIProposalGenerator("test-secret", "model", transport).generate(
      context,
    ),
  ).rejects.toThrow("La IA no pudo generar");
});
it("reports provider transport failure without dropping the manual drafting path", async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockRejectedValue(new Error("test-secret transport error"));
  await expect(
    openAIProposalGenerator("test-secret", "model", transport).generate(
      context,
    ),
  ).rejects.toMatchObject({ status: 503 });
});

it("flags missing requirements and catalog rates in the review notes", () => {
  const incomplete = structuredClone(context);
  incomplete.event.type = "";
  incomplete.event.notes = "";
  incomplete.event.attendees = 0;
  incomplete.equipment[0].rate = 0;
  const result = materializeSuggestion(
    {
      ...payload,
      items: [{ equipmentId: incomplete.equipment[0].id, quantity: 1, days: 1 }],
    },
    incomplete,
    "test-model",
  );
  expect(result.aiReview.questions).toEqual(
    expect.arrayContaining([
      "Confirmar el tipo de evento.",
      "Confirmar los requisitos y notas operativas del evento.",
      "Confirmar la cantidad estimada de asistentes.",
      expect.stringContaining("el catálogo indica cero"),
    ]),
  );
});
