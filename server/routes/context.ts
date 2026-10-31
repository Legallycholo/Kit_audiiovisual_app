import type express from "express";
import type { Repository } from "../database";
import type { SearchConfig } from "../search";
import type { KitGenerator } from "../kit";
import type { ProposalGenerator } from "../proposal-ai";
import type { MessageTransport } from "../messaging";
import type { FloorPlanExtractor } from "../design";
import type { FirebaseVerifier } from "../firebase-auth";
import type {
  SupabaseAccountReader,
  SupabaseDirectory,
  SupabaseVerifier,
} from "../supabase-auth";
import type { RecaptchaVerifier } from "../recaptcha";
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
  /** Enables sign-in with Firebase Authentication when set. */
  firebaseVerifier?: FirebaseVerifier;
  /**
   * Enables sign-in with Supabase Auth when both are set. The verifier proves
   * who signed in; the reader supplies the role and approval status from
   * `public.profiles`, so neither comes from the client.
   */
  supabaseVerifier?: SupabaseVerifier;
  supabaseAccount?: SupabaseAccountReader;
  /** Administrator review of Supabase registrations. */
  supabaseDirectory?: SupabaseDirectory;
  /** The Supabase project URL, allowed in the page's connect-src. */
  supabaseOrigin?: string;
  /** Requires a valid reCAPTCHA Enterprise token on sign-in when set. */
  recaptchaVerifier?: RecaptchaVerifier;
  /** Connection settings shown in Settings › Integraciones. */
  integrations?: IntegrationsConfig;
};

export type RouteContext = {
  repo: Repository;
  config: AppConfig;
  response: (res: express.Response) => WorkspaceResponse;
};
