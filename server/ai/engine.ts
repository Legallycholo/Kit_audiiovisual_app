import type { WorkspaceUser } from "../../src/shared/access";
import type { Workspace } from "../../src/shared/types";
import type { KitAction } from "../../src/shared/kit";
import { HttpError, type Repository } from "../database";
import { applyChanges, scopeWorkspace } from "../permissions";
import { assertCrewMembers, assertTaskAssignees } from "../policy/assignees";
import type {
  ToolContext,
  ToolDefinition,
  ToolEffect,
  ToolRegistry,
  ToolServices,
} from "./tools";

/**
 * Runs KIT's tools on behalf of a signed-in person. The model only names a
 * tool and its input; this engine validates the input, checks the role, runs
 * the handler on the actor's scoped view of the records and applies any
 * resulting changes through `applyChanges` inside one transaction, guarded by
 * the workspace revision the change was prepared against. Every write leaves
 * an audit row. Future specialized agents go through this same path.
 */
export interface Prepared {
  tool: ToolDefinition;
  input: unknown;
  effect: ToolEffect;
  summary: string;
  ctx: ToolContext;
}
export interface ExecuteOptions {
  origin: { thread: string; message: string; action: string };
  approval: "auto" | "confirmed";
  /** Revision the change was prepared against; a different one means stale records. */
  expectedRevision: number;
  signal?: AbortSignal;
}
export interface ExecuteResult {
  summary: string;
  route?: string;
  output: unknown;
  revision: number;
  changed: boolean;
}
export const STALE_MESSAGE =
  "Los datos cambiaron desde que KIT preparó este cambio. Revisa el registro y vuelve a pedirlo.";

export class ActionEngine {
  constructor(
    private readonly repo: Repository,
    readonly registry: ToolRegistry,
    private readonly services: ToolServices,
  ) {}
  private async scope(user: WorkspaceUser) {
    const { workspace, revision } = await this.repo.read();
    return { workspace: scopeWorkspace(workspace, user), revision };
  }
  /** Validates the call and the actor's right to make it; nothing runs yet. */
  async prepare(
    user: WorkspaceUser,
    call: KitAction,
    view?: { workspace: Workspace; revision: number },
    signal?: AbortSignal,
  ): Promise<Prepared> {
    const tool = this.registry.get(call.tool);
    if (!tool)
      throw new HttpError(422, `KIT no tiene la herramienta «${call.tool}».`);
    if (!tool.roles.includes(user.role))
      throw new HttpError(403, "Tu rol no puede usar esta herramienta.");
    const parsed = tool.input.safeParse(call.input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new HttpError(
        422,
        `Datos inválidos para ${tool.id}: ${issue.path.join(".") || "entrada"} ${issue.message}`,
      );
    }
    const scoped = view ?? (await this.scope(user));
    const ctx: ToolContext = {
      user,
      workspace: scoped.workspace,
      revision: scoped.revision,
      services: this.services,
      signal,
    };
    return {
      tool,
      input: parsed.data,
      effect: tool.effect,
      summary: tool.describe(parsed.data, ctx),
      ctx,
    };
  }
  /** Runs a read tool against the actor's scoped records. */
  async read(
    user: WorkspaceUser,
    call: KitAction,
    view?: { workspace: Workspace; revision: number },
    signal?: AbortSignal,
  ) {
    const p = await this.prepare(user, call, view, signal);
    if (p.effect !== "read")
      throw new HttpError(422, `${p.tool.id} no es una consulta.`);
    return p.tool.run(p.input, p.ctx);
  }
  /**
   * Runs a write tool: the handler computes the change on the latest records,
   * then one transaction re-checks the revision, applies the change with the
   * shared policy and audits it. A stale revision changes nothing.
   */
  async execute(
    user: WorkspaceUser,
    call: KitAction,
    options: ExecuteOptions,
  ): Promise<ExecuteResult> {
    const p = await this.prepare(user, call, undefined, options.signal);
    if (p.effect === "read") {
      const out = await p.tool.run(p.input, p.ctx);
      return { ...out, revision: p.ctx.revision, changed: false };
    }
    if (p.ctx.revision !== options.expectedRevision)
      throw new HttpError(409, STALE_MESSAGE);
    const outcome = await p.tool.run(p.input, p.ctx);
    if (options.signal?.aborted)
      throw new HttpError(409, "La acción se detuvo antes de guardarse.");
    let revision = p.ctx.revision;
    let changed = false;
    if (outcome.changes?.length) {
      await this.repo.transaction(async () => {
        const current = await this.repo.read();
        if (current.revision !== options.expectedRevision)
          throw new HttpError(409, STALE_MESSAGE);
        const next = applyChanges(current.workspace, outcome.changes!, user);
        await assertTaskAssignees(this.repo, next, outcome.changes!);
        await assertCrewMembers(this.repo, next, outcome.changes!);
        await this.repo.save(next, current.revision);
        revision = current.revision + 1;
        changed = true;
        await this.repo.audit(
          user.id,
          "KIT action executed",
          JSON.stringify({
            ...options.origin,
            tool: p.tool.id,
            effect: p.effect,
            approval: options.approval,
            summary: outcome.summary,
            input: JSON.stringify(p.input).slice(0, 2000),
          }),
          outcome.eventId,
        );
      });
    }
    return {
      summary: outcome.summary,
      route: outcome.route,
      output: outcome.output,
      revision,
      changed,
    };
  }
}
