export type KitMode = "ask" | "act";
export type KitReference = { kind:"event"|"proposal"|"attachment"; id:string; title?:string; text?:string };
export interface KitSource { key:string; ref:KitReference; label:string; route:string|null; revision:string; text:string; stale?:boolean; unavailable?:boolean }
export interface KitAction { kind:"create_task"|"proposal_draft"; eventId:string; title:string; brief:string }
export interface KitMessage {
  id:string; role:"user"|"assistant"; text:string; at:string;
  status:"completed"|"pending"|"failed"|"stopped"|"blocked"|"rate_limited";
  sources:KitSource[]; citations:string[]; model?:string; error?:string;
  action?:{input:KitAction; token:string; revision:number; status:"pending"|"running"|"completed"|"cancelled"; result?:string};
  artifacts?:Array<{id:string;title:string;kind:"summary"|"proposal";text:string;route?:string}>;
}
export interface KitThread { id:string; title:string; projectId:string|null; parentId?:string; createdAt:string; updatedAt:string; messages:KitMessage[]; busy:boolean }
export interface KitStatus { configured:boolean; model:string|null; proposalConfigured:boolean; provider:string; maxSources:number }
