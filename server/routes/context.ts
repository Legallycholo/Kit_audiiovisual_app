import type express from "express";
import type { Repository } from "../database";
import type { SearchConfig } from "../search";
import type { KitGenerator } from "../kit";
import type { ProposalGenerator } from "../proposal-ai";
import type { MessageTransport } from "../messaging";
import type { FloorPlanExtractor } from "../design";
import type { Logger } from "../logger";
import type { WorkspaceResponse } from "../../src/shared/access";

export type AppConfig = {
  origins: string[];
  secureCookies?: boolean;
  serveStatic?: boolean;
  proposalGenerator?: ProposalGenerator;
  messageTransport?: MessageTransport;
  search?: SearchConfig;
  kitGenerator?: KitGenerator;
  floorPlanExtractor?: FloorPlanExtractor;
  logger?: Logger;
};

export type RouteContext = {
  repo: Repository;
  config: AppConfig;
  response: (res: express.Response) => WorkspaceResponse;
};
