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

describe("vision extractor on the provider adapter", () => {
  it("turns a fixture plan image into suggestions that need review", async () => {
    const { aiFloorPlanExtractor } = await import("./design");
    const { startCompany } = await import("./testing/harness");
    const { vi } = await import("vitest");
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        stop_reason: "end_turn",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              objects: [
                {
                  kind: "Wall",
                  x: 0,
                  y: 0,
                  width: 10,
                  depth: 0.2,
                  height: 3,
                  rotation: 0,
                  label: "Pared norte",
                  confidence: 0.9,
                },
                {
                  kind: "Door",
                  x: 4,
                  y: 0,
                  width: 1.2,
                  depth: 0.2,
                  height: 2.1,
                  rotation: 0,
                  label: "Entrada principal",
                  confidence: 0.6,
                },
              ],
            }),
          },
        ],
      }),
    );
    const company = await startCompany({
      floorPlanExtractor: aiFloorPlanExtractor(
        "anthropic",
        "sk-ant-test",
        "claude-opus-5-5",
        transport,
      ),
    });
    try {
      const status = await company.call(
        "/design/status",
        "GET",
        undefined,
        company.owner,
      );
      expect(status.json).toEqual({
        configured: true,
        provider: "Claude (Anthropic)",
        model: "claude-opus-5-5",
      });
      const before = await company.call(
        "/workspace",
        "GET",
        undefined,
        company.owner,
      );
      const layout = before.json.workspace.layouts[0];
      const result = await company.call(
        "/design/extract",
        "POST",
        {
          eventId: layout.eventId,
          layoutId: layout.id,
          name: "salon.png",
          mimeType: "image/png",
          dataUrl: "data:image/png;base64,iVBORw0KGgo=",
          intrinsicWidth: 1000,
          intrinsicHeight: 800,
          roomWidth: layout.width,
          roomDepth: layout.depth,
          knownMeasurement: layout.width,
          ceilingHeight: 3,
          units: "meters",
          rightsConfirmed: true,
        },
        company.owner,
      );
      expect(result.status).toBe(200);
      expect(result.json.objects).toHaveLength(2);
      for (const object of result.json.objects)
        expect(object).toMatchObject({
          source: "Extracted",
          reviewStatus: "Suggested",
          layer: "Architecture",
        });
      expect(result.json.provenance).toMatchObject({
        provider: "Claude (Anthropic)",
        model: "claude-opus-5-5",
      });
      // The image travels as base64 without the data-URL prefix.
      const body = JSON.parse(String(transport.mock.calls[0][1]?.body));
      expect(body.messages[0].content[0].source.data).toBe("iVBORw0KGgo=");
      expect(JSON.parse(body.messages[0].content[1].text)).toMatchObject({
        roomWidth: layout.width,
        imageWidthPixels: 1000,
      });
      expect(result.text).not.toContain("sk-ant-test");
      // Suggestions are not applied until a person saves them.
      const after = await company.call(
        "/workspace",
        "GET",
        undefined,
        company.owner,
      );
      expect(after.json.workspace.layouts[0]).toEqual(layout);
    } finally {
      await company.close();
    }
  });
});
