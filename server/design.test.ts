import { describe, expect, it } from "vitest";
import { floorPlanRequestSchema, materializeFloorPlan } from "./design";

const request = floorPlanRequestSchema.parse({
  eventId: "e1",
  layoutId: "layout-1",
  name: "salon.png",
  mimeType: "image/png",
  dataUrl: "data:image/png;base64,YQ==",
  intrinsicWidth: 1200,
  intrinsicHeight: 800,
  roomWidth: 12,
  roomDepth: 8,
  knownMeasurement: 12,
  ceilingHeight: 3.5,
  units: "meters",
  rightsConfirmed: true,
});

describe("provider-neutral floor-plan extraction", () => {
  it("materializes suggestions with confidence, review state and provenance", () => {
    const result = materializeFloorPlan(
      {
        objects: [
          {
            kind: "Wall",
            x: 0,
            y: 0,
            width: 12,
            depth: 0.15,
            height: 3.5,
            rotation: 0,
            label: "North wall",
            confidence: 0.94,
          },
        ],
      },
      request,
      { name: "Fixture extractor", model: "fixture-v1" },
    );
    expect(result.objects[0]).toMatchObject({
      source: "Extracted",
      reviewStatus: "Suggested",
      layer: "Architecture",
      confidence: 0.94,
    });
    expect(result.provenance).toMatchObject({
      method: "Structured extraction",
      provider: "Fixture extractor",
      model: "fixture-v1",
      sourceName: "salon.png",
    });
  });

  it("rejects malformed or out-of-bounds geometry before it reaches a layout", () => {
    expect(() =>
      materializeFloorPlan(
        {
          objects: [
            {
              kind: "Wall",
              x: 11,
              y: 0,
              width: 2,
              depth: 0.15,
              height: 3,
              rotation: 0,
              label: "Outside wall",
              confidence: 0.8,
            },
          ],
        },
        request,
        { name: "Fixture", model: "fixture-v1" },
      ),
    ).toThrow("fuera del espacio calibrado");
    expect(() =>
      materializeFloorPlan({ objects: [{ kind: "Wall" }] }, request, {
        name: "Fixture",
        model: "fixture-v1",
      }),
    ).toThrow("geometría inválida");
  });
});
