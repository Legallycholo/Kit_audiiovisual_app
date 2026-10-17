import { describe, expect, it } from "vitest";
import { createSeed } from "../src/shared/seed";
import {
  backupSummary,
  createWorkspaceBackup,
  readWorkspaceBackup,
} from "./backup";

describe("workspace backups", () => {
  const workspace = () => {
    const value = createSeed();
    value.conversations.forEach((conversation) =>
      conversation.messages.forEach((message) => {
        message.at = new Date(message.at).toISOString();
      }),
    );
    return value;
  };
  it("creates a versioned manifest without audit records", () => {
    const value = workspace();
    value.activity = [
      {
        id: "private-audit",
        title: "Immutable audit entry",
        detail: "Server-owned evidence",
        at: new Date().toISOString(),
      },
    ];
    const backup = createWorkspaceBackup(value, 12, "2026-10-17T12:00:00.000Z");

    expect(backup).not.toHaveProperty("workspace.activity");
    expect(readWorkspaceBackup(structuredClone(backup))).toEqual(backup);
    expect(backupSummary(backup)).toMatchObject({
      version: 1,
      sourceRevision: 12,
      company: value.settings.company,
      counts: { clients: value.clients.length },
    });
  });

  it("rejects modified content even when it still matches the schema", () => {
    const backup = createWorkspaceBackup(workspace(), 3);
    const changed = structuredClone(backup);
    changed.workspace.settings.company = "Modified after export";

    expect(() => readWorkspaceBackup(changed)).toThrow(/checksum/i);
  });
});
