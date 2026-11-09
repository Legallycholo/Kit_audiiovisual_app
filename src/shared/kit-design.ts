/**
 * KIT Design: shared records for the event visualization workspace.
 * Plan: docs/kit_design_AI.md. The browser and (from Phase 2) the server use
 * these same shapes.
 */

export type RoomImageMimeType = "image/png" | "image/jpeg" | "image/webp";

/** A photo or floor plan of the venue, as dropped by the user. */
export interface RoomImage {
  id: string;
  name: string;
  mimeType: RoomImageMimeType;
  /** Phase 1 keeps images in the browser; Phase 2 replaces this with a storage path. */
  dataUrl: string;
  width: number;
  height: number;
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
  views: { id: string; sourceImageId: string; prompt: string }[];
}

export interface DesignItem {
  /** Catalog item; absent for décor the catalog does not have. */
  equipmentId?: string;
  label: string;
  quantity: number;
  placement: string;
}

/** One realistic image of one view, belonging to a version. */
export interface DesignRender {
  viewId: string;
  sourceImageId: string;
  dataUrl: string;
  /** "fixture" until a live render provider is connected. */
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

/** Everything KIT Design keeps for one event. */
export interface DesignProject {
  eventId: string;
  images: RoomImage[];
  brief: string;
  versions: DesignVersion[];
  /** The version shown to the client. Pending versions are not in `versions` yet. */
  currentVersionId?: string;
  /** A refinement waiting for Aplicar / Descartar. */
  pendingVersion?: DesignVersion;
  messages: DesignChatMessage[];
}

/** Shortest event description KIT Design accepts. */
export const MIN_BRIEF_LENGTH = 10;

export function emptyDesignProject(eventId: string): DesignProject {
  return { eventId, images: [], brief: "", versions: [], messages: [] };
}
