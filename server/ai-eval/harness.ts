// Offline evaluation harness for AI proposal drafting.
// Runs briefs through the real context builder and server-side validation with any
// ProposalGenerator. Tests use a scripted generator; a live generator must only be
// plugged in after the provider and data policy are approved.
import type { ProductionEvent, Workspace } from "../../src/shared/types";
import { HttpError } from "../database";
import {
  materializeSuggestion,
  proposalContext,
  type ProposalGenerator,
} from "../proposal-ai";

export type EvalWarning = "price-in-narrative" | "no-line-items";

export interface EvalCase {
  id: string;
  brief: string;
  /** Overrides applied to the target event before building the context. */
  event?: Partial<ProductionEvent>;
  /** What a scripted generator returns for this brief. */
  response: unknown;
  expect: "accepted" | "rejected";
  /** Substrings that must appear among the review questions. */
  questions?: string[];
  warnings?: EvalWarning[];
}

export interface EvalResult {
  id: string;
  outcome: "accepted" | "rejected";
  warnings: EvalWarning[];
  problems: string[];
  passed: boolean;
}

const moneyInText =
  /(\$\s?\d)|(\b\d[\d.,]*\s?(USD|dólares|dolares)\b)|(\bUSD\s?\d)/i;

export function scriptedGenerator(cases: EvalCase[]): ProposalGenerator {
  return {
    model: "scripted-eval",
    generate: async (context) => {
      const match = cases.find((item) => item.brief === context.brief);
      if (!match) throw new Error("No scripted response for this brief.");
      return structuredClone(match.response);
    },
  };
}

export async function runProposalEval(
  workspace: Workspace,
  eventId: string,
  generator: ProposalGenerator,
  cases: EvalCase[],
): Promise<EvalResult[]> {
  const results: EvalResult[] = [];
  for (const item of cases) {
    const scoped = structuredClone(workspace);
    scoped.events = scoped.events.map((event) =>
      event.id === eventId ? { ...event, ...item.event } : event,
    );
    const context = proposalContext(scoped, eventId, item.brief);
    const problems: string[] = [];
    const warnings: EvalWarning[] = [];

    // The provider must only receive the documented minimal context.
    const client = scoped.clients.find(
      (c) => c.id === scoped.events.find((e) => e.id === eventId)?.clientId,
    )!;
    const sent = JSON.stringify(context);
    for (const secret of [client.email, client.phone, client.notes])
      if (secret.trim() && sent.includes(secret))
        problems.push("context leaks client contact details or notes");

    let outcome: EvalResult["outcome"] = "accepted";
    try {
      const raw = await generator.generate(context);
      const draft = materializeSuggestion(raw, context, generator.model);
      const catalog = new Map(context.equipment.map((q) => [q.id, q]));
      const ids = new Set<string>();
      for (const line of draft.lines) {
        const equipment = catalog.get(line.equipmentId || "");
        if (!equipment) problems.push(`unknown equipment ${line.equipmentId}`);
        else {
          if (line.rate !== equipment.rate)
            problems.push(`rate for ${equipment.id} differs from catalog`);
          if (line.description !== equipment.name)
            problems.push(
              `description for ${equipment.id} differs from catalog`,
            );
        }
        if (ids.has(line.equipmentId || ""))
          problems.push(`duplicate equipment ${line.equipmentId}`);
        ids.add(line.equipmentId || "");
      }
      if (draft.aiReview.brief !== item.brief)
        problems.push("review notes do not preserve the brief");
      if (moneyInText.test(`${draft.title}\n${draft.introduction}`))
        warnings.push("price-in-narrative");
      if (!draft.lines.length) warnings.push("no-line-items");
      for (const expected of item.questions || [])
        if (!draft.aiReview.questions.some((q) => q.includes(expected)))
          problems.push(`missing review question: ${expected}`);
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 502) throw error;
      outcome = "rejected";
    }

    if (outcome !== item.expect)
      problems.push(`expected ${item.expect}, got ${outcome}`);
    const expectedWarnings = [...(item.warnings || [])].sort();
    if (
      JSON.stringify([...warnings].sort()) !== JSON.stringify(expectedWarnings)
    )
      problems.push(
        `warnings ${JSON.stringify(warnings)} != expected ${JSON.stringify(expectedWarnings)}`,
      );
    results.push({
      id: item.id,
      outcome,
      warnings,
      problems,
      passed: problems.length === 0,
    });
  }
  return results;
}
