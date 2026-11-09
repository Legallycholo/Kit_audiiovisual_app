import { useCallback, useSyncExternalStore } from "react";
import { id } from "../../shared/domain";
import {
  emptyDesignProject,
  type DesignChatMessage,
  type DesignProject,
  type DesignVersion,
  type RoomImage,
} from "../../shared/kit-design";
import { MAX_ROOM_IMAGES } from "./prepare-image";
import type { EngineResult } from "./engine";

/* Pure updates. Each returns a new project and never mutates its input. */

export function addImages(project: DesignProject, images: RoomImage[]) {
  const room = MAX_ROOM_IMAGES - project.images.length;
  return {
    project: {
      ...project,
      images: [...project.images, ...images.slice(0, Math.max(0, room))],
    },
    skipped: Math.max(0, images.length - Math.max(0, room)),
  };
}

/** Images can only be removed before the first design; versions depend on them. */
export function removeImage(
  project: DesignProject,
  imageId: string,
): DesignProject {
  if (project.versions.length) return project;
  return { ...project, images: project.images.filter((i) => i.id !== imageId) };
}

export function addMessage(
  project: DesignProject,
  role: DesignChatMessage["role"],
  text: string,
): DesignProject {
  return {
    ...project,
    messages: [
      ...project.messages,
      { id: id(), role, text, at: new Date().toISOString() },
    ],
  };
}

function toVersion(
  project: DesignProject,
  request: string,
  result: EngineResult,
): DesignVersion {
  return {
    id: id(),
    number: nextVersionNumber(project),
    request,
    spec: result.spec,
    renders: result.renders,
    createdAt: new Date().toISOString(),
  };
}

export const nextVersionNumber = (project: DesignProject) =>
  Math.max(
    0,
    ...project.versions.map((v) => v.number),
    project.pendingVersion?.number ?? 0,
  ) + 1;

/** The first design becomes the current version right away: there is nothing to compare it to. */
export function commitFirstVersion(
  project: DesignProject,
  brief: string,
  result: EngineResult,
): DesignProject {
  const version = toVersion(project, brief, result);
  return {
    ...project,
    brief,
    versions: [...project.versions, version],
    currentVersionId: version.id,
  };
}

/** A refinement waits for Aplicar / Descartar. */
export function proposeVersion(
  project: DesignProject,
  request: string,
  result: EngineResult,
): DesignProject {
  return { ...project, pendingVersion: toVersion(project, request, result) };
}

export function applyPending(project: DesignProject): DesignProject {
  const pending = project.pendingVersion;
  if (!pending) return project;
  return {
    ...project,
    versions: [...project.versions, pending],
    currentVersionId: pending.id,
    pendingVersion: undefined,
  };
}

export function discardPending(project: DesignProject): DesignProject {
  return { ...project, pendingVersion: undefined };
}

export function selectVersion(
  project: DesignProject,
  versionId: string,
): DesignProject {
  if (!project.versions.some((v) => v.id === versionId)) return project;
  return { ...project, currentVersionId: versionId };
}

export const currentVersion = (project: DesignProject) =>
  project.versions.find((v) => v.id === project.currentVersionId);

/*
 * Phase 1 store: one project per event, kept in memory for this browser tab.
 * Phase 2 replaces it with the server (Supabase Storage + kit tables).
 */
const projects = new Map<string, DesignProject>();
const listeners = new Set<() => void>();

export function readProject(eventId: string) {
  let project = projects.get(eventId);
  if (!project) {
    project = emptyDesignProject(eventId);
    projects.set(eventId, project);
  }
  return project;
}

export function writeProject(
  eventId: string,
  change: (p: DesignProject) => DesignProject,
) {
  projects.set(eventId, change(readProject(eventId)));
  listeners.forEach((listener) => listener());
}

/** Test helper: forget every project. */
export function resetProjects() {
  projects.clear();
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useDesignProject(eventId: string) {
  const project = useSyncExternalStore(subscribe, () => readProject(eventId));
  const change = useCallback(
    (update: (p: DesignProject) => DesignProject) =>
      writeProject(eventId, update),
    [eventId],
  );
  return [project, change] as const;
}
