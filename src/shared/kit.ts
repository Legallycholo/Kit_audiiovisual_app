export type KitReference = {
  kind: "event" | "proposal" | "client" | "file" | "attachment";
  id: string;
  title?: string;
  text?: string;
};
/** A record or text the person attached to a message; the AI reads it as data. */
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
export interface KitMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: string;
  status:
    "completed" | "pending" | "failed" | "stopped" | "blocked" | "rate_limited";
  sources: KitSource[];
  model?: string;
  error?: string;
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
}
export interface KitStatus {
  configured: boolean;
  model: string | null;
  /** Models the person may switch between (empty when the provider has no choice). */
  models?: Array<{ id: string; label: string }>;
  proposalConfigured: boolean;
  provider: string;
  maxSources: number;
}
