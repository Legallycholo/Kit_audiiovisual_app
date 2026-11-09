import { id } from "../../shared/domain";
import type { Equipment } from "../../shared/types";
import type {
  DesignItem,
  DesignRender,
  DesignSpec,
  RoomImage,
} from "../../shared/kit-design";

/**
 * What KIT Design needs from its AI. Phase 1 uses `fixtureEngine` (no network,
 * clearly marked sample images). Phase 2 replaces it with a server-backed
 * engine (Claude writes the spec, Higgsfield renders) behind this same shape.
 */
export interface DesignEngine {
  create(input: {
    brief: string;
    images: RoomImage[];
    equipment: Equipment[];
    versionNumber: number;
  }): Promise<EngineResult>;
  refine(input: {
    request: string;
    spec: DesignSpec;
    images: RoomImage[];
    equipment: Equipment[];
    versionNumber: number;
  }): Promise<EngineResult>;
}

export interface EngineResult {
  spec: DesignSpec;
  renders: DesignRender[];
  reply: string;
}

/** Paints one sample render. Injected so tests run without a canvas. */
export type FixturePainter = (
  image: RoomImage,
  caption: string,
  versionNumber: number,
) => Promise<string>;

/** Catalog categories a typical event setup draws from, in display order. */
const SETUP: { match: RegExp; placement: string; perGuests?: number }[] = [
  { match: /staging|tarima|escenario/i, placement: "Al fondo del salón" },
  { match: /led|screen|pantalla/i, placement: "Detrás del escenario" },
  {
    match: /lighting|luces|iluminaci/i,
    placement: "En truss sobre el escenario y perímetro",
  },
  { match: /audio|sonido/i, placement: "A ambos lados del escenario" },
  { match: /truss|rigging/i, placement: "Sobre el escenario" },
  {
    match: /projector|proyector/i,
    placement: "Al centro, frente a la pantalla",
  },
];

/** First number in the brief, read as the guest count. */
export function guestsFrom(brief: string) {
  const match = brief.match(/\d{2,5}/);
  return match ? Number(match[0]) : undefined;
}

/** Builds a plausible spec from the brief and the catalog. No AI involved. */
export function fixtureSpec(
  brief: string,
  images: RoomImage[],
  equipment: Equipment[],
): DesignSpec {
  const guests = guestsFrom(brief);
  const items: DesignItem[] = [];
  for (const step of SETUP) {
    const item = equipment.find(
      (e) =>
        step.match.test(e.category) &&
        !items.some((i) => i.equipmentId === e.id),
    );
    if (!item) continue;
    items.push({
      equipmentId: item.id,
      label: item.name,
      quantity: Math.max(
        1,
        Math.min(item.quantity, /audio/i.test(item.category) ? 2 : 1),
      ),
      placement: step.placement,
    });
  }
  if (guests)
    items.push({
      label: "Mesas redondas para 10",
      quantity: Math.ceil(guests / 10),
      placement: "Distribuidas frente al escenario",
    });
  return {
    room: {
      measured: "estimated",
      notes:
        "Medidas estimadas a partir de las imágenes. Confírmalas antes de producción.",
    },
    style: { mood: brief.trim(), palette: [], lighting: "Cálida" },
    items,
    views: images.map((image) => ({
      id: id(),
      sourceImageId: image.id,
      prompt: `El mismo salón de la imagen, montado para: ${brief.trim()}`,
    })),
  };
}

/** Applies a chat request to a spec in the simplest honest way: it is recorded on every view. */
export function fixtureRefineSpec(
  spec: DesignSpec,
  request: string,
): DesignSpec {
  const text = request.trim();
  return {
    ...structuredClone(spec),
    style: {
      ...spec.style,
      lighting: /luz|iluminaci/i.test(text) ? text : spec.style.lighting,
    },
    views: spec.views.map((view) => ({
      ...view,
      prompt: `${view.prompt}. Cambio: ${text}`,
    })),
  };
}

export const FIXTURE_NOTICE =
  "Vista de muestra: todavía no hay un motor de imágenes conectado.";

export function fixtureEngine(paint: FixturePainter): DesignEngine {
  const renders = (
    spec: DesignSpec,
    images: RoomImage[],
    caption: string,
    versionNumber: number,
  ) =>
    Promise.all(
      spec.views.map(async (view) => {
        const image = images.find((i) => i.id === view.sourceImageId);
        if (!image) throw new Error("Falta la imagen de una vista.");
        return {
          viewId: view.id,
          sourceImageId: image.id,
          dataUrl: await paint(image, caption, versionNumber),
          provider: "fixture",
        };
      }),
    );
  return {
    async create({ brief, images, equipment, versionNumber }) {
      const spec = fixtureSpec(brief, images, equipment);
      return {
        spec,
        renders: await renders(spec, images, brief, versionNumber),
        reply: `Listo. Preparé ${spec.views.length === 1 ? "una vista" : `${spec.views.length} vistas`} y ${spec.items.length} artículos de equipo. ${FIXTURE_NOTICE}`,
      };
    },
    async refine({ request, spec, images, versionNumber }) {
      const next = fixtureRefineSpec(spec, request);
      return {
        spec: next,
        renders: await renders(next, images, request, versionNumber),
        reply: `Preparé la versión ${versionNumber} con: «${request.trim()}». Revísala y pulsa Aplicar o Descartar. ${FIXTURE_NOTICE}`,
      };
    },
  };
}

/** Browser painter: the original image with a warm wash and a "MUESTRA" band, so it can never pass for a real render. */
export const canvasPainter: FixturePainter = async (
  image,
  caption,
  versionNumber,
) => {
  const source = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("La imagen no es válida."));
    element.src = image.dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No se pudo procesar la imagen.");
  context.drawImage(source, 0, 0, image.width, image.height);
  const hue = (30 + versionNumber * 47) % 360;
  const wash = context.createLinearGradient(0, 0, image.width, image.height);
  wash.addColorStop(0, `hsla(${hue}, 85%, 55%, 0.28)`);
  wash.addColorStop(1, `hsla(${(hue + 60) % 360}, 80%, 35%, 0.38)`);
  context.fillStyle = wash;
  context.fillRect(0, 0, image.width, image.height);
  const band = Math.max(40, Math.round(image.height * 0.12));
  context.fillStyle = "rgba(0, 0, 0, 0.62)";
  context.fillRect(0, image.height - band, image.width, band);
  context.fillStyle = "#fff";
  context.font = `600 ${Math.round(band * 0.32)}px system-ui, sans-serif`;
  context.textBaseline = "middle";
  // Right-aligned and sized to the right half, so "MUESTRA" stays visible in
  // the "Después" side of the before/after slider at its default position.
  context.textAlign = "right";
  const label = `${caption} · MUESTRA v${versionNumber}`;
  const maxChars = Math.max(12, Math.floor(image.width / 2 / (band * 0.19)));
  context.fillText(
    label.length > maxChars ? `…${label.slice(-(maxChars - 1))}` : label,
    image.width - band * 0.4,
    image.height - band / 2,
  );
  return canvas.toDataURL("image/jpeg", 0.85);
};
