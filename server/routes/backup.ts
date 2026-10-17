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
  const validateRecovery = (workspace: Workspace) => {
    validateWorkspace(workspace, workspace);
    for (const task of workspace.tasks) {
      if (!task.assigneeId) continue;
      const assignee = repo.user(task.assigneeId);
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
        const member = repo.user(shift.memberId);
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
  app.get("/api/backup", (_req, res) => {
    const user = requireAdmin(res);
    const current = repo.read();
    const backup = createWorkspaceBackup(current.workspace, current.revision);
    repo.audit(
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
  app.post("/api/backup/preview", (req, res) => {
    requireAdmin(res);
    const input = z.object({ backup: z.unknown() }).strict().parse(req.body);
    const backup = readWorkspaceBackup(input.backup);
    const workspace = restorableWorkspace(backup);
    validateRecovery(workspace);
    const current = repo.read();
    res.json({
      backup: backupSummary(backup),
      current: {
        company: current.workspace.settings.company,
        revision: current.revision,
      },
      confirmation: `RESTORE ${backup.workspace.settings.company}`,
    });
  });
  app.post("/api/backup/restore", (req, res) => {
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
    validateRecovery(workspace);
    let recoveryPoint!: ReturnType<Repository["replaceWorkspace"]>;
    repo.transaction(() => {
      recoveryPoint = repo.replaceWorkspace(
        workspace,
        input.expectedRevision,
        user.id,
        backup.checksum,
      );
      repo.audit(
        user.id,
        "Workspace backup restored",
        `${backup.workspace.settings.company} · source revision ${backup.sourceRevision} · safety point ${recoveryPoint.id}`,
      );
    });
    res.json({ ...response(res), recoveryPoint });
  });
  app.get("/api/backup/recovery-points", (_req, res) => {
    requireAdmin(res);
    res.json({
      recoveryPoints: repo.recoveryPoints(),
      currentRevision: repo.read().revision,
    });
  });
  app.post("/api/backup/recovery-points/:id/restore", (req, res) => {
    const user = requireAdmin(res);
    const recoveryId = identifier.parse(req.params.id);
    const input = z
      .object({
        expectedRevision: z.number().int().nonnegative(),
        confirmation: z.literal("ROLL BACK"),
      })
      .strict()
      .parse(req.body);
    const workspace = repo.recoveryWorkspace(recoveryId);
    validateRecovery(workspace);
    let recoveryPoint!: ReturnType<Repository["replaceWorkspace"]>;
    repo.transaction(() => {
      recoveryPoint = repo.replaceWorkspace(
        workspace,
        input.expectedRevision,
        user.id,
        `recovery:${recoveryId}`,
      );
      repo.audit(
        user.id,
        "Workspace recovery point restored",
        `${recoveryId} · safety point ${recoveryPoint.id}`,
      );
    });
    res.json({ ...response(res), recoveryPoint });
  });
  app.get("/api/export", (_req, res) => {
    const user = requireAdmin(res);
    const current = repo.read();
    repo.audit(user.id, "Workspace exported", "Legacy workspace JSON export");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="kit-workspace-export.json"',
    );
    res.json({ ...current, exportedAt: new Date().toISOString() });
  });
}
