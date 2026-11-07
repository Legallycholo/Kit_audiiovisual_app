import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BODY_LIMIT, contentSecurityPolicy } from "./app";

const root = new URL("../", import.meta.url);
const config = JSON.parse(readFileSync(new URL("vercel.json", root), "utf8")) as {
  buildCommand: string;
  outputDirectory: string;
  crons: { path: string; schedule: string }[];
  rewrites: { source: string; destination: string }[];
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const header = (source: string, key: string) =>
  config.headers
    .find((h) => h.source === source)
    ?.headers.find((h) => h.key === key)?.value;

describe("vercel.json", () => {
  it("builds the Vite frontend as static output", () => {
    expect(config.buildCommand).toBe("npm run build:api && npm run build");
    expect(config.outputDirectory).toBe("dist");
  });

  it("sends /api to the one function, then falls back to the SPA", () => {
    expect(existsSync(new URL("api/index.mjs", root))).toBe(true);
    expect(config.rewrites[0]).toEqual({ source: "/api/(.*)", destination: "/api" });
    expect(config.rewrites.at(-1)).toEqual({ source: "/(.*)", destination: "/index.html" });
  });

  it("schedules the search retry at the real cron route", () => {
    expect(config.crons).toEqual([
      { path: "/api/cron/search-retry", schedule: "0 5 * * *" },
    ]);
  });

  it("gives static pages the same security policy Express gives API responses", () => {
    expect(header("/((?!api/|assets/).*)", "Content-Security-Policy")).toBe(
      contentSecurityPolicy(false, "https://hgugkgbpsrbqusazmthb.supabase.co"),
    );
  });

  it("keeps the API body limit under Vercel's 4.5 MB request cap", () => {
    expect(BODY_LIMIT).toBe("4mb");
  });
});
