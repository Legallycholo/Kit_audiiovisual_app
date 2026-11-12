import { describe, expect, it } from "vitest";
import { schemas } from "./schema";
import { createSeed } from "../src/shared/seed";

describe("proposal visuals", () => {
  const base = createSeed().proposals[1];
  const visual = {
    id: "v1",
    sourceType: "KIT Design" as const,
    sourceId: "render-1",
    sourceRevision: 2,
    title: "Salón principal",
    caption: "",
    altText: "Render del salón",
    mimeType: "image/png" as const,
    addedAt: "2026-11-11T10:00:00.000Z",
  };
  it("accepts a KIT Design render referenced by its server route", () => {
    const result = schemas.proposals.safeParse({
      ...base,
      visuals: [
        { ...visual, url: "/api/design/designs/d-1/renders/render-1/file" },
      ],
    });
    expect(result.success).toBe(true);
  });
  it("rejects a visual with neither data nor route, with both, or with a foreign route", () => {
    for (const bad of [
      visual,
      {
        ...visual,
        url: "/api/design/designs/d-1/renders/render-1/file",
        dataUrl: "data:image/png;base64,AA==",
      },
      { ...visual, url: "https://example.test/x.png" },
      {
        ...visual,
        sourceType: "Creative",
        url: "/api/design/designs/d-1/renders/render-1/file",
      },
    ])
      expect(
        schemas.proposals.safeParse({ ...base, visuals: [bad] }).success,
      ).toBe(false);
  });
});
