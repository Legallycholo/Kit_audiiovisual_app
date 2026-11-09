import type express from "express";
import type { Repository } from "../database";
import type { SearchConfig } from "../search";
import type { KitGenerator } from "../kit";
import type { ProposalGenerator } from "../proposal-ai";
import type { MessageTransport } from "../messaging";
import type { RecaptchaVerifier } from "../recaptcha";
import type { DesignConfig } from "../design-ai/service";
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
  /** KIT Design (Diseño): spec writer, render provider, image storage, monthly render cap. */
  design?: DesignConfig;
  logger?: Logger;
  /** Requires a valid reCAPTCHA Enterprise token on sign-in when set. */
  recaptchaVerifier?: RecaptchaVerifier;
  /** Lets a verified portal (Supabase) administrator enter the workspace without a second login. */
  supabaseVerifier?: SupabaseVerifier;
  /** Connection settings shown in Settings › Integraciones. */
  integrations?: IntegrationsConfig;
  /** Express "trust proxy" setting. Needed behind Vercel so req.ip is the real client (login rate limits). */
  trustProxy?: boolean | number;
  /** Interrupt AI jobs left running by a previous process at startup. Off on serverless (see KitService). */
  resetBusyOnBoot?: boolean;
  /** Bearer secret for the cron route (Vercel sends CRON_SECRET). Without it the route answers 503. */
  cronSecret?: string;
};

export type RouteContext = {
  repo: Repository;
  config: AppConfig;
  response: (res: express.Response) => Promise<WorkspaceResponse>;
};
