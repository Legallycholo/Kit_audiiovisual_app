import type { WorkspaceChange } from "./access";
import type { Workspace } from "./types";

const STORAGE_KEY = "kit.company-sync.v1";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface PendingSync {
  id: string;
  userId: string;
  baseRevision: number;
  changes: WorkspaceChange[];
  createdAt: string;
  attempts: number;
  lastError?: string;
}

interface EncryptedQueue {
  version: 1;
  userId: string;
  iv: string;
  ciphertext: string;
}

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
};

const base64ToBytes = (value: string) => {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

async function queueKey(csrf: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`kit-company-sync:${csrf}`),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function writePendingSync(
  userId: string,
  csrf: string,
  pending: PendingSync | null,
) {
  if (!pending) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await queueKey(csrf),
    encoder.encode(JSON.stringify(pending)),
  );
  const stored: EncryptedQueue = {
    version: 1,
    userId,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

export async function readPendingSync(userId: string, csrf: string) {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  let stored: EncryptedQueue;
  try {
    stored = JSON.parse(raw) as EncryptedQueue;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
  if (stored.version !== 1 || stored.userId !== userId) return null;
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(stored.iv) },
      await queueKey(csrf),
      base64ToBytes(stored.ciphertext),
    );
    const pending = JSON.parse(decoder.decode(plaintext)) as PendingSync;
    if (
      pending.userId !== userId ||
      !Array.isArray(pending.changes) ||
      !Number.isInteger(pending.baseRevision)
    )
      throw new Error("Invalid pending sync payload.");
    return pending;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function clearPendingSync() {
  localStorage.removeItem(STORAGE_KEY);
}

export function applyPendingSync(
  workspace: Workspace,
  pending: PendingSync,
): Workspace {
  const next = structuredClone(workspace) as Workspace &
    Record<string, unknown>;
  for (const change of pending.changes) {
    if (change.collection === "settings") {
      next.settings = structuredClone(change.value) as Workspace["settings"];
      continue;
    }
    const records = next[change.collection] as { id: string }[];
    const index = records.findIndex((record) => record.id === change.id);
    if (index < 0)
      records.push(structuredClone(change.value) as { id: string });
    else records[index] = structuredClone(change.value) as { id: string };
  }
  return next;
}

export function pendingTargets(pending: PendingSync) {
  return pending.changes.map((change) => ({
    collection: change.collection,
    id: change.id,
  }));
}
