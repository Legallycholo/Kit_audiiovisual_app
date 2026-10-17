import { describe, expect, it } from "vitest";
import { runPerformanceCheck, syntheticWorkspace } from "./workspace-perf";
import { validateWorkspace } from "../permissions";

describe("seeded performance check", () => {
  it("generates a workspace that passes server validation", () => {
    const workspace = syntheticWorkspace(0.05);
    expect(() => validateWorkspace(workspace, workspace)).not.toThrow();
    expect(workspace.events).toHaveLength(150);
  });

  it("times every measured operation at a small scale", () => {
    const report = runPerformanceCheck(0.02);
    expect(report.timings).toHaveLength(12);
    expect(report.timings.every((t) => Number.isFinite(t.medianMs))).toBe(true);
  });
});
