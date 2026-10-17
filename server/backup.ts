import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Workspace } from "../src/shared/types";
import { HttpError } from "./database";
import { schemas } from "./schema";

const backupWorkspaceSchema = z
  .object({
    schema: z.literal(1),
    clients: z.array(schemas.clients),
    venues: z.array(schemas.venues),
    events: z.array(schemas.events),
    equipment: z.array(schemas.equipment),
    proposals: z.array(schemas.proposals),
    conversations: z.array(schemas.conversations),
    tasks: z.array(schemas.tasks),
    reservations: z.array(schemas.reservations),
    packages: z.array(schemas.packages),
    maintenanceRecords: z.array(schemas.maintenanceRecords),
    operations: z.array(schemas.operations),
    automations: z.array(schemas.automations),
    layouts: z.array(schemas.layouts),
    brandAssets: z.array(schemas.brandAssets),
    creativeAssets: z.array(schemas.creativeAssets),
    settings: schemas.settings,
  })
  .strict();

const backupPayloadSchema = z
  .object({
    format: z.literal("kit-workspace-backup"),
    version: z.literal(1),
    exportedAt: z.string().datetime(),
    sourceRevision: z.number().int().nonnegative(),
    workspace: backupWorkspaceSchema,
  })
  .strict();

const backupSchema = backupPayloadSchema
  .extend({ checksum: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();

export type WorkspaceBackup = z.infer<typeof backupSchema>;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right),
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined)
    throw new HttpError(422, "The backup contains an unsupported value.");
  return encoded;
}

function checksum(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function backupWorkspace(workspace: Workspace) {
  const { activity: _activity, ...records } = workspace;
  return backupWorkspaceSchema.parse(records);
}

export function createWorkspaceBackup(
  workspace: Workspace,
  sourceRevision: number,
  exportedAt = new Date().toISOString(),
): WorkspaceBackup {
  const payload = backupPayloadSchema.parse({
    format: "kit-workspace-backup",
    version: 1,
    exportedAt,
    sourceRevision,
    workspace: backupWorkspace(workspace),
  });
  return { ...payload, checksum: checksum(payload) };
}

export function readWorkspaceBackup(value: unknown): WorkspaceBackup {
  const parsed = backupSchema.parse(value);
  const { checksum: supplied, ...payload } = parsed;
  const calculated = checksum(payload);
  const suppliedBytes = Buffer.from(supplied, "hex");
  const calculatedBytes = Buffer.from(calculated, "hex");
  if (
    suppliedBytes.length !== calculatedBytes.length ||
    !timingSafeEqual(suppliedBytes, calculatedBytes)
  )
    throw new HttpError(
      422,
      "The backup checksum does not match. The file may be incomplete or modified.",
    );
  return parsed;
}

export function backupSummary(backup: WorkspaceBackup) {
  const { workspace } = backup;
  return {
    format: backup.format,
    version: backup.version,
    exportedAt: backup.exportedAt,
    sourceRevision: backup.sourceRevision,
    checksum: backup.checksum,
    company: workspace.settings.company,
    counts: {
      clients: workspace.clients.length,
      projects: workspace.events.length,
      proposals: workspace.proposals.length,
      equipment: workspace.equipment.length,
      layouts: workspace.layouts.length,
      conversations: workspace.conversations.length,
    },
  };
}
