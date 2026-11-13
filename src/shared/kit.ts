export type KitMode = "ask" | "act";
/**
 * How Act mode handles low-risk changes: ask before each one, or apply them
 * as KIT works. Financial and external changes always ask.
 */
export type KitApproval = "ask" | "auto";
/** Side-effect class of a tool; decides whether a confirmation is needed. */
export type KitToolEffect = "read" | "draft" | "financial" | "external";
export type KitReference = {
  kind: "event" | "proposal" | "client" | "file" | "attachment";
  id: string;
  title?: string;
  text?: string;
};
/** Where the person is working, so KIT attaches the matching records. */
export interface KitContext {
  route?: string;
  proposalId?: string;
  eventId?: string;
  clientId?: string;
}
export interface KitSource {
  key: string;
  ref: KitReference;
  label: string;
  route: string | null;
  revision: string;
  text: string;
  stale?: boolean;
  unavailable?: boolean;
}
/** A tool call the model asked for: validated and authorized by the server. */
export interface KitAction {
  tool: string;
  input: Record<string, unknown>;
}
export interface KitActionRecord extends KitAction {
  id: string;
  effect: KitToolEffect;
  /** One sentence in Spanish: what the change does. */
  summary: string;
  token: string;
  revision: number;
  status: "pending" | "running" | "completed" | "cancelled" | "failed";
  /** The change ran during the turn without a dialog (approval "auto"). */
  auto?: boolean;
  result?: string;
  route?: string;
  error?: string;
}
export interface KitMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: string;
  status:
    "completed" | "pending" | "failed" | "stopped" | "blocked" | "rate_limited";
  sources: KitSource[];
  citations: string[];
  model?: string;
  error?: string;
  /** Changes KIT made or proposed in this turn, in order. */
  actions?: KitActionRecord[];
  artifacts?: Array<{
    id: string;
    title: string;
    kind: "summary" | "proposal";
    text: string;
    route?: string;
  }>;
}
export interface KitThread {
  id: string;
  title: string;
  projectId: string | null;
  parentId?: string;
  createdAt: string;
  updatedAt: string;
  messages: KitMessage[];
  busy: boolean;
  /** Last approval setting used in this conversation. */
  approval?: KitApproval;
}
export interface KitStatus {
  configured: boolean;
  model: string | null;
  proposalConfigured: boolean;
  provider: string;
  maxSources: number;
  /** Tool ids the signed-in person may use through KIT. */
  tools?: string[];
}
