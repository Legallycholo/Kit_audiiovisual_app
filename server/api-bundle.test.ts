import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { bundleApi, apiBundlePath } from "../scripts/api-bundle";

const root = fileURLToPath(new URL("../", import.meta.url));

// Loads the committed bundle in plain Node (no TypeScript, no Vite), the way
// Vercel runs it, and calls the handler through a real HTTP server.
const script = `
  import http from "node:http";
  const { default: handler } = await import(${JSON.stringify(apiBundlePath)});
  const server = http.createServer(handler).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const res = await fetch("http://127.0.0.1:" + server.address().port + "/api/health");
  console.log(JSON.stringify({ status: res.status, body: await res.json() }));
  server.close();
  process.exit(0);
`;
const run = (env: Record<string, string>) =>
  JSON.parse(
    execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: root,
      env: { PATH: process.env.PATH ?? "", ...env },
      encoding: "utf8",
      timeout: 30_000,
    })
      .trim()
      .split("\n")
      .at(-1)!,
  );

describe("Vercel function bundle (api/index.mjs)", () => {
  it("is up to date with its source (run `npm run build:api` after changing server code)", async () => {
    const fresh = await bundleApi({ write: false });
    expect(readFileSync(apiBundlePath, "utf8")).toBe(fresh);
  });

  it("loads in plain Node and reports a missing database clearly instead of crashing", () => {
    const result = run({});
    expect(result.status).toBe(503);
    expect(result.body.error).toContain("not configured");
  });

  it("reports an unreachable database as a retryable start failure and never leaks the connection string", () => {
    const result = run({
      KIT_DATABASE: "postgres://kit_server:secret-password@127.0.0.1:1/postgres",
    });
    expect(result.status).toBe(503);
    expect(result.body.error).toContain("could not start");
    expect(JSON.stringify(result.body)).not.toContain("secret-password");
  });

  it("does not bundle the local PGlite database", () => {
    expect(readFileSync(apiBundlePath, "utf8")).not.toContain("dumpDataDir");
  });
});
