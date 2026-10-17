import { invoke } from "@tauri-apps/api/core";
export const nativeFiles = () =>
  "__TAURI_INTERNALS__" in window && location.port !== "3001";
export interface FilePolicy {
  granted: boolean;
  paused: boolean;
  exclusions: string[];
  cloudConsent: boolean;
  ocr: boolean;
}
export interface FileStatus {
  home: string;
  policy: FilePolicy;
  running: boolean;
  scanned: number;
  indexed: number;
  skipped: number;
  failed: number;
  errors: string[];
  exclusions: string[];
  ocrAvailable: boolean;
  pendingDeletions: number;
  lastScan: number | null;
}
export interface IndexedFile {
  id: string;
  title: string;
  relativePath: string;
  mime: string;
  modified: number;
  bytes: number;
  hash: string;
  cloudHash?: string;
  text: string;
  excerpt: string;
  reason: string;
  score: number;
}
export function files<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!nativeFiles())
    return Promise.reject(
      new Error(
        "Disponible en la ventana local de KIT Desktop. El navegador no tiene acceso a tus carpetas.",
      ),
    );
  return invoke<T>(command, args);
}
