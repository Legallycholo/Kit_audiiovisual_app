import type express from "express";
import type { Repository } from "../database";
import type { SearchConfig } from "../search";
import type { KitGenerator } from "../kit";
import type { ProposalGenerator } from "../proposal-ai";
import type { MessageTransport } from "../messaging";
import type { FloorPlanExtractor } from "../design";
import type { RecaptchaVerifier } from "../recaptcha";
import type { SupabaseVerifier } from "../supabase-auth";
import type { Logger } from "../logger";
import type { IntegrationsConfig } from "../integrations";
import type { WorkspaceResponse } from "../../src/shared/access";

export type AppConfig = {
  origins: string[];
  secureCookies?: boolean;
  serveStatic?: boolean;
  viteMiddleware?: express.RequestHandler;
  proposalGenerator?: ProposalGenerator;
  messageTransport?: MessageTransport;
  search?: SearchConfig;
  kitGenerator?: KitGenerator;
  floorPlanExtractor?: FloorPlanExtractor;
  logger?: Logger;
  /** Requires a valid reCAPTCHA Enterprise token on sign-in when set. */
  recaptchaVerifier?: RecaptchaVerifier;
  /** Lets a verified portal (Supabase) administrator enter the workspace without a second login. */
  supabaseVerifier?: SupabaseVerifier;
  /** Connection settings shown in Settings › Integraciones. */
  integrations?: IntegrationsConfig;
};

export type RouteContext = {
  repo: Repository;
  config: AppConfig;
  response: (res: express.Response) => WorkspaceResponse;
};
