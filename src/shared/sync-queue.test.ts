import { beforeEach, describe, expect, it } from "vitest";
import { createSeed } from "./seed";
import {
  applyPendingSync,
  readPendingSync,
  writePendingSync,
  type PendingSync,
} from "./sync-queue";

const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) || null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key),
    },
  });
});

describe("encrypted company sync queue", () => {
  it("persists ciphertext tied to the current user and session", async () => {
    const pending: PendingSync = {
      id: "pending-1",
      userId: "user-1",
      baseRevision: 4,
      changes: [
        {
          collection: "settings",
          id: "company",
          value: {
            company: "Private Company Name",
            currency: "USD",
            timezone: "UTC",
            email: "",
            notifications: true,
          },
        },
      ],
      createdAt: new Date().toISOString(),
      attempts: 0,
    };
    await writePendingSync("user-1", "session-secret", pending);
    const stored = [...memory.values()][0];
    expect(stored).not.toContain("Private Company Name");
    expect(await readPendingSync("user-1", "session-secret")).toEqual(pending);
    expect(await readPendingSync("other-user", "session-secret")).toBeNull();
    expect(await readPendingSync("user-1", "wrong-session")).toBeNull();
  });

  it("reconstructs the local pending view without changing the server copy", () => {
    const workspace = createSeed();
    const client = { ...workspace.clients[0], name: "Queued client edit" };
    const pending: PendingSync = {
      id: "pending-2",
      userId: "user-1",
      baseRevision: 1,
      changes: [{ collection: "clients", id: client.id, value: client }],
      createdAt: new Date().toISOString(),
      attempts: 0,
    };
    const local = applyPendingSync(workspace, pending);
    expect(local.clients[0].name).toBe("Queued client edit");
    expect(workspace.clients[0].name).not.toBe("Queued client edit");
  });
});
