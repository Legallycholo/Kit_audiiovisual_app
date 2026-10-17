import { describe, expect, it } from "vitest";
import { createSeed } from "../../src/shared/seed";
import { proposalEvalCases } from "./cases";
import { runProposalEval, scriptedGenerator } from "./harness";

describe("AI proposal evaluation harness (offline)", () => {
  it("covers at least ten Spanish briefs including adversarial responses", () => {
    expect(proposalEvalCases.length).toBeGreaterThanOrEqual(10);
    expect(new Set(proposalEvalCases.map((c) => c.id)).size).toBe(
      proposalEvalCases.length,
    );
    expect(proposalEvalCases.some((c) => c.expect === "rejected")).toBe(true);
  });

  it("every case meets its expected outcome under server-side validation", async () => {
    const results = await runProposalEval(
      createSeed(),
      "e1",
      scriptedGenerator(proposalEvalCases),
      proposalEvalCases,
    );
    const failures = results.filter((result) => !result.passed);
    expect(failures).toEqual([]);
  });

  it("reports a problem when a generator's case expectation is wrong", async () => {
    const [valid] = proposalEvalCases;
    const results = await runProposalEval(
      createSeed(),
      "e1",
      scriptedGenerator([valid]),
      [{ ...valid, expect: "rejected" }],
    );
    expect(results[0]).toMatchObject({
      outcome: "accepted",
      passed: false,
      problems: ["expected rejected, got accepted"],
    });
  });
});
