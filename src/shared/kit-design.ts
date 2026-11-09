/**
 * KIT Design: shared records for the event visualization workspace.
 * Plan: docs/kit_design_AI.md. The browser and the server use these shapes;
 * the server (server/design-ai/) is the source of truth.
 */
import type {
  Equipment,
  ProductionEvent,
  Proposal,
  QuoteLine,
  Reservation,
} from "./types";
import { availableStock } from "./domain";

export type RoomImageMimeType = "image/png" | "image/jpeg" | "image/webp";

/** A room photo or floor plan as the browser sends it (already resized). */
export interface RoomImageUpload {
  name: string;
  mimeType: RoomImageMimeType;
  dataUrl: string;
  width: number;
  height: number;
}

/** A stored room image. `url` serves the bytes to signed-in users who can see the event. */
export interface RoomImage {
  id: string;
  name: string;
  mimeType: RoomImageMimeType;
  width: number;
  height: number;
  url: string;
}

/** The source of truth for what the design contains. Renders only visualize it. */
export interface DesignSpec {
  room: {
    widthM?: number;
    depthM?: number;
    heightM?: number;
    measured: "estimated" | "confirmed";
    notes: string;
  };
  style: { mood: string; palette: string[]; lighting: string };
  items: DesignItem[];
  views: DesignView[];
}

export interface DesignItem {
  /** Catalog item; absent for décor the catalog does not have. */
  equipmentId?: string;
  label: string;
  quantity: number;
  placement: string;
}

export interface DesignView {
  id: string;
  sourceImageId: string;
  /** Instruction sent to the render provider for this view. */
  prompt: string;
}

/** One image of one view, belonging to a version. */
export interface DesignRender {
  id: string;
  viewId: string;
  sourceImageId: string;
  url: string;
  /** "fixture" renders are samples (the original photo); anything else is a real render. */
  provider: string;
}

export interface DesignVersion {
  id: string;
  number: number;
  /** What the person asked for that produced this version. */
  request: string;
  spec: DesignSpec;
  renders: DesignRender[];
  createdAt: string;
}

export interface DesignChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: string;
}

/** A short mp4 of a camera move over one render, so the 2D plan reads as a 3D space. */
export interface DesignVideo {
  id: string;
  renderId: string;
  versionId: string;
  url: string;
  /** "fixture" videos are samples; anything else is a real generated video. */
  provider: string;
}

/** Work KIT Design is doing in the background for one design. */
export interface DesignJob {
  id: string;
  kind: "create" | "refine" | "video";
  request: string;
  /** Render being turned into a video (kind "video"). */
  renderId?: string;
  startedAt: string;
}

/** One entry in an event's design history. */
export interface DesignSummary {
  id: string;
  title: string;
  updatedAt: string;
  working: boolean;
}

/** Everything KIT Design keeps for one design (one "chat"). An event can have many. */
export interface DesignProject {
  id: string;
  eventId: string;
  title: string;
  brief: string;
  images: RoomImage[];
  /** Applied versions, oldest first. */
  versions: DesignVersion[];
  /** The version shown to the client. */
  currentVersionId?: string;
  /** A refinement waiting for Aplicar / Descartar. */
  pendingVersion?: DesignVersion;
  messages: DesignChatMessage[];
  /** Videos of renders, for any version. */
  videos: DesignVideo[];
  job?: DesignJob;
}

/** What the server can do, and how much of the monthly render allowance is used. */
export interface DesignStatus {
  /** Who writes the spec: a model label, or null for the built-in sample designer. */
  designer: string | null;
  /** "fixture" until a live render provider is configured. */
  renderer: string;
  usage: { month: string; renders: number; cap: number };
  /** "fixture" until a live video provider is configured. */
  videoRenderer: string;
  videoUsage: { month: string; videos: number; cap: number };
  canEdit: boolean;
}

/** Shortest event description KIT Design accepts. */
export const MIN_BRIEF_LENGTH = 10;
/** Most images one design can start from. */
export const MAX_ROOM_IMAGES = 6;

export const isFixtureRender = (
  render: Pick<DesignRender | DesignVideo, "provider">,
) => render.provider === "fixture";

/** Title shown for a design before its first message. */
export const NEW_DESIGN_TITLE = "Nuevo diseño";

/** The history title for a design: the start of its first request. */
export function designTitle(brief: string) {
  const text = brief.replace(/\s+/g, " ").trim();
  return text.length > 60 ? `${text.slice(0, 59)}…` : text || NEW_DESIGN_TITLE;
}

/* ------------------------------------------------------------------------ */
/* Sample designer: used when no AI is configured, and by every test.        */
/* ------------------------------------------------------------------------ */

/** Catalog categories a typical event setup draws from, in display order. */
const SETUP: { match: RegExp; placement: string }[] = [
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
export function sampleSpec(
  brief: string,
  images: { id: string }[],
  equipment: Equipment[],
  newId: () => string,
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
      id: newId(),
      sourceImageId: image.id,
      prompt: `The same room as the photo, set up for this event: ${brief.trim()}`,
    })),
  };
}

/** Applies a chat request to a spec in the simplest honest way: it is recorded on every view. */
export function sampleRefineSpec(
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
      prompt: `${view.prompt}. Change: ${text}`,
    })),
  };
}

/* ------------------------------------------------------------------------ */
/* Business links (Phase 4)                                                  */
/* ------------------------------------------------------------------------ */

/** Days an event spans, counting both ends; at least one. */
export function eventDays(start: string, end: string) {
  const days =
    Math.round(
      (Date.parse(end.slice(0, 10)) - Date.parse(start.slice(0, 10))) /
        86_400_000,
    ) + 1;
  return Number.isFinite(days) && days > 0 ? days : 1;
}

export interface InventoryCheck {
  equipmentId: string;
  label: string;
  needed: number;
  /** Units free on the event dates, not counting this event's own reservations. */
  available: number;
  short: number;
}

/** check_inventory: compares the design's catalog items with stock on the event dates. Read-only. */
export function checkDesignInventory(
  spec: DesignSpec,
  event: Pick<ProductionEvent, "id" | "date" | "endDate">,
  equipment: Equipment[],
  reservations: Reservation[],
): InventoryCheck[] {
  const others = reservations.filter((r) => r.eventId !== event.id);
  const needed = new Map<string, number>();
  for (const item of spec.items)
    if (item.equipmentId)
      needed.set(
        item.equipmentId,
        (needed.get(item.equipmentId) ?? 0) + item.quantity,
      );
  return [...needed].flatMap(([equipmentId, quantity]) => {
    const item = equipment.find((e) => e.id === equipmentId);
    if (!item) return [];
    const available = availableStock(item, others, event.date, event.endDate);
    return [
      {
        equipmentId,
        label: item.name,
        needed: quantity,
        available,
        short: Math.max(0, quantity - available),
      },
    ];
  });
}

export interface ProposalChange {
  label: string;
  before: number;
  after: number;
}

/**
 * add_to_proposal: the event's newest Draft proposal with the design's catalog
 * items added (or a new draft when there is none). Existing lines only grow,
 * never shrink. Décor outside the catalog is listed in `skipped`, not priced.
 * The caller shows `changes` and only saves after the person confirms.
 */
export function designToProposal(input: {
  spec: DesignSpec;
  event: ProductionEvent;
  proposals: Proposal[];
  equipment: Equipment[];
  newId: () => string;
  versionNumber: number;
}): {
  proposal: Proposal;
  created: boolean;
  changes: ProposalChange[];
  skipped: string[];
} {
  const { spec, event, proposals, equipment, newId } = input;
  const draft = proposals
    .filter((p) => p.eventId === event.id && p.status === "Draft")
    .sort((a, b) => b.version - a.version)[0];
  const days = eventDays(event.date, event.endDate);
  const base: Proposal = draft
    ? structuredClone(draft)
    : {
        id: newId(),
        number: `KIT-${new Date().getFullYear()}-${String(proposals.length + 1).padStart(3, "0")}`,
        eventId: event.id,
        version: 1,
        title: event.name,
        introduction: event.notes,
        terms:
          "La disponibilidad, las condiciones de pago y el alcance final están sujetos a revisión.",
        lines: [],
        discount: 0,
        tax: 0,
        status: "Draft",
        validUntil: event.date,
      };
  const changes: ProposalChange[] = [];
  const skipped: string[] = [];
  const wanted = new Map<string, number>();
  for (const item of spec.items) {
    if (
      !item.equipmentId ||
      !equipment.some((e) => e.id === item.equipmentId)
    ) {
      skipped.push(item.label);
      continue;
    }
    wanted.set(
      item.equipmentId,
      (wanted.get(item.equipmentId) ?? 0) + item.quantity,
    );
  }
  for (const [equipmentId, quantity] of wanted) {
    const item = equipment.find((e) => e.id === equipmentId)!;
    const line = base.lines.find((l) => l.equipmentId === equipmentId);
    if (line) {
      if (line.quantity >= quantity) continue;
      changes.push({
        label: item.name,
        before: line.quantity,
        after: quantity,
      });
      line.quantity = quantity;
      continue;
    }
    const next: QuoteLine = {
      id: newId(),
      equipmentId,
      description: item.name,
      quantity,
      rate: item.rate,
      days,
    };
    base.lines.push(next);
    changes.push({ label: item.name, before: 0, after: quantity });
  }
  return { proposal: base, created: !draft, changes, skipped };
}
