import express from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { LayoutObject, LayoutProvenance } from "../src/shared/types";
import { canEditCollection } from "../src/shared/access";
import { HttpError, type Repository } from "./database";
import { ownsEvent } from "./permissions";
import { userOf } from "./security";

const imageData = z
  .string()
  .max(1_500_000)
  .regex(/^data:image\/(png|jpeg|webp);base64,/);

export const floorPlanRequestSchema = z
  .object({
    eventId: z.string().min(1).max(100),
    layoutId: z.string().min(1).max(100),
    name: z.string().trim().min(1).max(200),
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    dataUrl: imageData,
    intrinsicWidth: z.number().int().positive().max(50_000),
    intrinsicHeight: z.number().int().positive().max(50_000),
    roomWidth: z.number().finite().positive().max(10_000),
    roomDepth: z.number().finite().positive().max(10_000),
    knownMeasurement: z.number().finite().positive().max(10_000),
    ceilingHeight: z.number().finite().positive().max(100),
    units: z.literal("meters"),
    rightsConfirmed: z.literal(true),
  })
  .strict()
  .refine(
    (value) => value.dataUrl.startsWith(`data:${value.mimeType};base64,`),
    "Floor-plan MIME type does not match its data.",
  );

export type FloorPlanRequest = z.infer<typeof floorPlanRequestSchema>;

const extractedObjectSchema = z
  .object({
    kind: z.enum(["Wall", "Door", "Window"]),
    x: z.number().finite().min(0).max(10_000),
    y: z.number().finite().min(0).max(10_000),
    width: z.number().finite().positive().max(10_000),
    depth: z.number().finite().positive().max(10_000),
    height: z.number().finite().positive().max(100),
    rotation: z.number().finite().min(-360).max(360),
    label: z.string().trim().min(1).max(200),
    confidence: z.number().finite().min(0).max(1),
  })
  .strict();

export const floorPlanResultSchema = z
  .object({ objects: z.array(extractedObjectSchema).min(1).max(2_000) })
  .strict();

export interface FloorPlanExtractor {
  name: string;
  model: string;
  extract: (request: FloorPlanRequest) => Promise<unknown>;
}

export function materializeFloorPlan(
  raw: unknown,
  request: FloorPlanRequest,
  extractor: Pick<FloorPlanExtractor, "name" | "model">,
) {
  const parsed = floorPlanResultSchema.safeParse(raw);
  if (!parsed.success)
    throw new HttpError(
      502,
      "El extractor devolvió geometría inválida. El diseño no cambió.",
    );
  const outside = parsed.data.objects.find(
    (object) =>
      object.x + object.width > request.roomWidth + 0.001 ||
      object.y + object.depth > request.roomDepth + 0.001,
  );
  if (outside)
    throw new HttpError(
      502,
      `La geometría extraída para ${outside.label} cae fuera del espacio calibrado. El diseño no cambió.`,
    );
  const objects: LayoutObject[] = parsed.data.objects.map((object) => ({
    ...object,
    id: randomUUID(),
    layer: "Architecture",
    source: "Extracted",
    reviewStatus: "Suggested",
  }));
  const requestId = randomUUID();
  const provenance: LayoutProvenance = {
    method: "Structured extraction",
    provider: extractor.name,
    model: extractor.model,
    requestId,
    extractedAt: new Date().toISOString(),
    sourceName: request.name,
  };
  return { requestId, objects, provenance };
}

export class DesignService {
  constructor(
    private repo: Repository,
    private extractor?: FloorPlanExtractor,
  ) {}

  mount(app: express.Express) {
    app.get("/api/design/status", (_req, res) =>
      res.json({
        configured: Boolean(this.extractor),
        provider: this.extractor?.name,
        model: this.extractor?.model,
      }),
    );
    app.post("/api/design/extract", async (req, res) => {
      const user = userOf(res);
      if (!canEditCollection(user, "layouts"))
        throw new HttpError(403, "Your role cannot extract layout geometry.");
      const input = floorPlanRequestSchema.parse(req.body);
      if (!ownsEvent(user, input.eventId))
        throw new HttpError(403, "This event is outside your assigned scope.");
      const layout = this.repo
        .read()
        .workspace.layouts.find((item) => item.id === input.layoutId);
      if (!layout || layout.eventId !== input.eventId)
        throw new HttpError(404, "No se encontró el diseño solicitado.");
      if (!this.extractor)
        throw new HttpError(
          503,
          "La extracción automática todavía no tiene un proveedor configurado. Puedes seguir trazando el plano manualmente.",
        );
      const result = materializeFloorPlan(
        await this.extractor.extract(input),
        input,
        this.extractor,
      );
      this.repo.audit(
        user.id,
        "Floor-plan geometry extracted",
        `${input.name} · ${this.extractor.name} · review required`,
        input.eventId,
      );
      res.json(result);
    });
  }
}
