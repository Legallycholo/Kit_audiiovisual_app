import { describe, expect, it } from "vitest";
import { describeChanges, type DraftSuggestion } from "./ProposalAssistant";
import { createSeed } from "../../shared/seed";

const review = {
  brief: "b",
  assumptions: [],
  questions: [],
  generatedAt: "2026-11-11T00:00:00.000Z",
  model: "test",
};

describe("suggestion change review", () => {
  const draft = createSeed().proposals.find((p) => p.id === "p2")!;
  it("lists text, line and discount changes and flags the financial ones", () => {
    const suggestion: DraftSuggestion = {
      title: draft.title,
      introduction: "Nueva introducción",
      lines: [
        { ...draft.lines[0], quantity: draft.lines[0].quantity + 1 },
        {
          id: "x",
          description: "Técnico de montaje",
          quantity: 2,
          days: 1,
          rate: 0,
        },
      ],
      discount: 10,
      aiReview: review,
    };
    const changes = describeChanges(draft, suggestion);
    expect(changes.map((c) => `${c.symbol} ${c.label}`)).toEqual([
      "~ Actualizar introducción",
      `~ ${draft.lines[0].description}: ${draft.lines[0].quantity} × ${draft.lines[0].days} días → ${draft.lines[0].quantity + 1} × ${draft.lines[0].days} días`,
      "+ Añadir 2 × Técnico de montaje",
      ...draft.lines
        .slice(1)
        .map(
          (line) =>
            `− Quitar ${line.quantity} × ${line.description}${line.days > 1 ? ` · ${line.days} días` : ""}`,
        ),
      `~ Cambiar descuento de ${draft.discount}% → 10%`,
    ]);
    expect(changes.some((c) => c.kind !== "text")).toBe(true);
  });
  it("reports no changes when the suggestion matches the document", () => {
    const suggestion: DraftSuggestion = {
      title: draft.title,
      introduction: draft.introduction,
      lines: draft.lines,
      aiReview: review,
    };
    expect(describeChanges(draft, suggestion)).toEqual([]);
  });
});
