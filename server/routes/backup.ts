import type express from "express";
import { z } from "zod";
import { HttpError, type Repository } from "../database";
import { requireAdmin } from "../security";
import { identifier } from "../schema";
import { validateWorkspace } from "../permissions";
import type { Workspace } from "../../src/shared/types";
import {
  backupSummary,
  createWorkspaceBackup,
  readWorkspaceBackup,
  type WorkspaceBackup,
} from "../backup";
import type { RouteContext } from "./context";

export function mountBackupRoutes(
  app: express.Express,
  { repo, response }: RouteContext,
) {
  const restorableWorkspace = (backup: WorkspaceBackup): Workspace => ({
    ...structuredClone(backup.workspace),
    activity: [],
  });
  const validateRecovery = async (workspace: Workspace) => {
    validateWorkspace(workspace, workspace);
    for (const task of workspace.tasks) {
      if (!task.assigneeId) continue;
      const assignee = await repo.user(task.assigneeId);
      if (
        !assignee?.active ||
        assignee.role === "Client / Guest" ||
        (assignee.role !== "Administrator" &&
          !JSON.parse(assignee.event_ids).includes(task.eventId)) ||
        assignee.name !== task.assignee
      )
        throw new HttpError(
          422,
          `Task ${task.id} references an unavailable or unauthorized team account.`,
        );
    }
    for (const operation of workspace.operations) {
      for (const shift of operation.crewShifts) {
        if (!shift.memberId) continue;
        const member = await repo.user(shift.memberId);
        if (
          !member?.active ||
          member.role === "Client / Guest" ||
          (member.role !== "Administrator" &&
            !JSON.parse(member.event_ids).includes(operation.eventId)) ||
          member.name !== shift.person
        )
          throw new HttpError(
            422,
            `Crew shift ${shift.id} references an unavailable or unauthorized team account.`,
          );
      }
    }
  };
  app.get("/api/backup", async (_req, res) => {
    const user = requireAdmin(res);
    const current = await repo.read();
    const backup = createWorkspaceBackup(current.workspace, current.revision);
    await repo.audit(
      user.id,
      "Workspace backup exported",
      `Revision ${current.revision} · ${backup.checksum.slice(0, 12)}`,
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="kit-workspace-backup.json"',
    );
    res.json(backup);
  });
  app.post("/api/backup/preview", async (req, res) => {
    requireAdmin(res);
    const input = z.object({ backup: z.unknown() }).strict().parse(req.body);
    const backup = readWorkspaceBackup(input.backup);
    const workspace = restorableWorkspace(backup);
    await validateRecovery(workspace);
    const current = await repo.read();
    res.json({
      backup: backupSummary(backup),
      current: {
        company: current.workspace.settings.company,
        revision: current.revision,
      },
      confirmation: `RESTORE ${backup.workspace.settings.company}`,
    });
  });
  app.post("/api/backup/restore", async (req, res) => {
    const user = requireAdmin(res);
    const input = z
      .object({
        backup: z.unknown(),
        expectedRevision: z.number().int().nonnegative(),
        confirmation: z.string().max(220),
      })
      .strict()
      .parse(req.body);
    const backup = readWorkspaceBackup(input.backup);
    if (input.confirmation !== `RESTORE ${backup.workspace.settings.company}`)
      throw new HttpError(422, "The restore confirmation does not match.");
    const workspace = restorableWorkspace(backup);
    await validateRecovery(workspace);
    let recoveryPoint!: Awaited<ReturnType<Repository["replaceWorkspace"]>>;
    await repo.transaction(async () => {
      recoveryPoint = await repo.replaceWorkspace(
        workspace,
        input.expectedRevision,
        user.id,
        backup.checksum,
      );
      await repo.audit(
        user.id,
        "Workspace backup restored",
        `${backup.workspace.settings.company} · source revision ${backup.sourceRevision} · safety point ${recoveryPoint.id}`,
      );
    });
    res.json({ ...(await response(res)), recoveryPoint });
  });
  app.get("/api/backup/recovery-points", async (_req, res) => {
    requireAdmin(res);
    res.json({
      recoveryPoints: await repo.recoveryPoints(),
      currentRevision: (await repo.read()).revision,
    });
  });
  app.post("/api/backup/recovery-points/:id/restore", async (req, res) => {
    const user = requireAdmin(res);
    const recoveryId = identifier.parse(req.params.id);
    const input = z
      .object({
        expectedRevision: z.number().int().nonnegative(),
        confirmation: z.literal("ROLL BACK"),
      })
      .strict()
      .parse(req.body);
    const workspace = await repo.recoveryWorkspace(recoveryId);
    await validateRecovery(workspace);
    let recoveryPoint!: Awaited<ReturnType<Repository["replaceWorkspace"]>>;
    await repo.transaction(async () => {
      recoveryPoint = await repo.replaceWorkspace(
        workspace,
        input.expectedRevision,
        user.id,
        `recovery:${recoveryId}`,
      );
      await repo.audit(
        user.id,
        "Workspace recovery point restored",
        `${recoveryId} · safety point ${recoveryPoint.id}`,
      );
    });
    res.json({ ...(await response(res)), recoveryPoint });
  });
  app.get("/api/export", async (_req, res) => {
    const user = requireAdmin(res);
    const current = await repo.read();
    await repo.audit(
      user.id,
      "Workspace exported",
      "Legacy workspace JSON export",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="kit-workspace-export.json"',
    );
    res.json({ ...current, exportedAt: new Date().toISOString() });
  });
}
