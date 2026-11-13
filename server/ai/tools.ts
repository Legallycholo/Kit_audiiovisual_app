import { z } from "zod";
import type {
  Role,
  WorkspaceChange,
  WorkspaceUser,
} from "../../src/shared/access";
import type { Workspace } from "../../src/shared/types";
import type { KitApproval, KitMode, KitToolEffect } from "../../src/shared/kit";
import type { ProposalGenerator } from "../proposal-ai";
import { portableSchema } from "../ai-provider";

/**
 * The application's tool registry for KIT. A tool is an explicit contract:
 * identifier, Spanish description for the model, zod input schema, allowed
 * roles, side-effect class and a handler. Handlers never persist anything:
 * reads return data, writes return record changes that the action engine
 * applies through the same `applyChanges` policy as the rest of the API.
 * The model's call is data; the server decides whether it runs.
 */
export type ToolEffect = KitToolEffect;

export interface ToolServices {
  proposal?: ProposalGenerator;
  now: () => string;
  /** Shared rate limiter for calls that cost money (AI generations). */
  limit?: (key: string, limit: number) => Promise<void>;
}
export interface ToolContext {
  user: WorkspaceUser;
  /** The workspace as this actor may see it (`scopeWorkspace`). */
  workspace: Workspace;
  revision: number;
  services: ToolServices;
  signal?: AbortSignal;
}
export interface ToolOutcome {
  /** Record changes for `applyChanges`; absent for reads. */
  changes?: WorkspaceChange[];
  /** Event the change belongs to, for the audit row. */
  eventId?: string;
  /** One sentence in Spanish describing what happened. */
  summary: string;
  /** Where the person can see the result. */
  route?: string;
  /** What the model receives. */
  output: unknown;
}
export interface ToolDefinition<S extends z.ZodType = z.ZodType> {
  id: string;
  description: string;
  input: S;
  roles: readonly Role[];
  effect: ToolEffect;
  /** Calls a provider while running (slow): a confirmation runs it as a job. */
  slow?: boolean;
  /** One sentence in Spanish for the approval card. */
  describe(input: z.infer<S>, ctx: ToolContext): string;
  run(input: z.infer<S>, ctx: ToolContext): Promise<ToolOutcome>;
}
export function defineTool<S extends z.ZodType>(
  tool: ToolDefinition<S>,
): ToolDefinition {
  return tool as unknown as ToolDefinition;
}

/** Reads never ask; drafts ask unless the person chose auto; money and external effects always ask. */
export function requiresConfirmation(
  effect: ToolEffect,
  approval: KitApproval,
): boolean {
  if (effect === "read") return false;
  if (effect === "draft") return approval === "ask";
  return true;
}

/** Provider-neutral tool description (JSON Schema input). */
export interface ToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}
/** Provider tool names allow only [A-Za-z0-9_-]; registry ids use dots. */
export const toolName = (id: string) => id.replace(/\./g, "__");
export const toolId = (name: string) => name.replace(/__/g, ".");

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  register(...tools: ToolDefinition[]) {
    for (const tool of tools) {
      if (this.tools.has(tool.id)) throw new Error(`Duplicate tool ${tool.id}`);
      this.tools.set(tool.id, tool);
    }
    return this;
  }
  get(id: string) {
    return this.tools.get(id) ?? this.tools.get(toolId(id));
  }
  /** Tools this actor may use, in a stable order; Ask mode offers reads only. */
  available(user: WorkspaceUser, mode: KitMode): ToolDefinition[] {
    return [...this.tools.values()]
      .filter(
        (t) =>
          t.roles.includes(user.role) &&
          (mode === "act" || t.effect === "read"),
      )
      .sort((a, b) => a.id.localeCompare(b.id));
  }
  specs(user: WorkspaceUser, mode: KitMode): ToolSpec[] {
    return this.available(user, mode).map((t) => ({
      name: toolName(t.id),
      description: t.description,
      input_schema: portableSchema(
        z.toJSONSchema(t.input, { target: "draft-7" }),
      ) as Record<string, unknown>,
    }));
  }
}
