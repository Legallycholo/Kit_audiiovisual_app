import { test as base, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { Server } from "node:http";
import { createApp, type AppConfig } from "../../server/app";
import { Repository } from "../../server/database";
import { createSeed } from "../../src/shared/seed";
import { passwordHash } from "../../server/security";
import type { Workspace } from "../../src/shared/types";

export { expect };

/**
 * The browser journeys run against an isolated, in-process company server with
 * an in-memory database seeded from the sample workspace, proxied through
 * page.route so the Vite dev server only serves the frontend. Each test gets
 * its own server and database; nothing external is called.
 *
 * The seeded owner signs in through the real /api/login route; the cookie the
 * server sets is shared by the page because cookies ignore the port.
 */
export const OWNER = {
  id: "user-admin-seed",
  email: "owner@kit.local",
  name: "Honasis Dotel",
  password: "playwright-owner-password",
} as const;

export interface Company {
  repo: Repository;
  /** The isolated API server's origin, for direct requests in assertions. */
  root: string;
  /** Edits the stored workspace in place (next page load sees it). */
  update(fn: (workspace: Workspace) => Workspace | void): Promise<void>;
  /** Signs the seeded owner in again (for tests that sign out). */
  signIn(): Promise<void>;
}

type Options = {
  /** Adjusts the sample workspace before it is stored (an object, because Playwright treats function options as fixtures). */
  seed: { prepare?: (workspace: Workspace) => Workspace | void };
  /** Extra server configuration (generators, transports). */
  appConfig: Partial<AppConfig>;
  /** Turns the desktop tab bar on (development-only opt-in). */
  desktopTabs: boolean;
};

export const stubGenerators: Partial<AppConfig> = {
  proposalGenerator: {
    model: "test-model",
    generate: async () => ({
      title: "Conferencia con audio profesional",
      introduction: "Propuesta preliminar para el encuentro del cliente.",
      items: [{ equipmentId: "q1", quantity: 2, days: 1 }],
      assumptions: ["Un día de uso."],
      questions: ["Confirmar los horarios de montaje."],
    }),
  },
  kitGenerator: {
    model: "kit-test-model",
    generate: async (input) => ({
      text: "El proyecto tiene contexto verificado y tareas visibles.",
      citations: input.sources.map((source) => source.key),
      artifact: null,
      action: null,
    }),
  },
};

async function signIn(page: Page, root: string) {
  const response = await page.request.post(`${root}/api/login`, {
    data: { email: OWNER.email, password: OWNER.password },
  });
  if (!response.ok())
    throw new Error(
      `Sign-in failed: ${response.status()} ${await response.text()}`,
    );
}

export const test = base.extend<Options & { company: Company }>({
  seed: [{}, { option: true }],
  appConfig: [stubGenerators, { option: true }],
  desktopTabs: [false, { option: true }],
  company: [
    async ({ page, seed, appConfig, desktopTabs }, use) => {
      const repo = await Repository.open("memory://");
      const sample = createSeed();
      const workspace = seed.prepare?.(sample) || sample;
      await repo.transaction(async () => {
        await repo.db
          .prepare(
            "INSERT INTO users (id,email,name,role,owner,password_hash) VALUES (?,?,?,?,1,?)",
          )
          .run(
            OWNER.id,
            OWNER.email,
            OWNER.name,
            "Administrator",
            await passwordHash(OWNER.password),
          );
        await repo.db
          .prepare("INSERT INTO workspace VALUES (1,0,?)")
          .run(JSON.stringify(workspace));
      });
      const server: Server = createApp(repo, {
        origins: ["http://127.0.0.1:5173"],
        ...appConfig,
      }).listen(0, "127.0.0.1");
      await new Promise<void>((resolve) => server.once("listening", resolve));
      const root = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      await page.route("**/api/**", async (route) => {
        const url = new URL(route.request().url());
        const response = await route.fetch({
          url: root + url.pathname + url.search,
        });
        await route.fulfill({ response });
      });
      if (desktopTabs)
        await page.addInitScript(() =>
          localStorage.setItem("kit.desktop-tabs", "on"),
        );
      await signIn(page, root);
      const company: Company = {
        repo,
        root,
        update: async (fn) => {
          await repo.transaction(async () => {
            const current = await repo.read();
            const next = fn(current.workspace) || current.workspace;
            await repo.save(next, current.revision);
          });
        },
        signIn: () => signIn(page, root),
      };
      await use(company);
      await page.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await repo.close();
    },
    { auto: true },
  ],
});

/** Runs a page-header "⋯" menu action (PageHeader `menu` items). */
export async function headerMenuAction(page: Page, name: string) {
  await page.getByRole("button", { name: "Más acciones", exact: true }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}

/** Local-storage key the app uses for this signed-in owner. */
export const storageKey = (prefix: string) => `${prefix}:company:${OWNER.id}`;
