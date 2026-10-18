import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createApp } from "./app";
import { Repository } from "./database";
import { jsonLogger, parseLogLevel, type LogLevel } from "./logger";

describe("JSON logger", () => {
  it("writes one JSON object per line at or above the minimum level", () => {
    const lines: [string, LogLevel][] = [];
    const logger = jsonLogger("warn", (line, level) =>
      lines.push([line, level]),
    );
    logger.log("info", "ignored");
    logger.log("error", "kept", { requestId: "r1" });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0][0])).toMatchObject({
      level: "error",
      event: "kept",
      requestId: "r1",
      time: expect.any(String),
    });
  });

  it("falls back to info for unknown levels and supports silent", () => {
    expect(parseLogLevel(undefined)).toBe("info");
    expect(parseLogLevel("verbose")).toBe("info");
    expect(parseLogLevel("toString")).toBe("info");
    expect(parseLogLevel("silent")).toBe("silent");
    const lines: string[] = [];
    jsonLogger("silent", (line) => lines.push(line)).log("error", "x");
    expect(lines).toEqual([]);
  });
});

describe("request logging and error responses", () => {
  let server: Server;
  let repo: Repository;
  const entries: Record<string, unknown>[] = [];
  afterEach(async () => {
    entries.length = 0;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const start = async () => {
    repo = new Repository(":memory:");
    server = createApp(repo, {
      origins: ["http://localhost:5173"],
      logger: jsonLogger("debug", (line) => entries.push(JSON.parse(line))),
    }).listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    return `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  };

  it("tags responses and log lines with the same request id", async () => {
    const url = await start();
    const response = await fetch(`${url}/health?token=secret`);
    const requestId = response.headers.get("x-request-id");
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(entries).toEqual([
      expect.objectContaining({
        event: "http_request",
        requestId,
        method: "GET",
        path: "/api/health",
        status: 200,
        durationMs: expect.any(Number),
      }),
    ]);
    // Query strings are never logged.
    expect(JSON.stringify(entries)).not.toContain("secret");
    repo.close();
  });

  it("returns 413 rather than a server error for oversized bodies", async () => {
    const url = await start();
    const response = await fetch(`${url}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
      },
      body: JSON.stringify({
        email: "a@example.test",
        password: "x".repeat(7_000_000),
      }),
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: "La solicitud supera el tamaño permitido.",
    });
    expect(entries.some((entry) => entry.event === "request_failed")).toBe(
      false,
    );
    repo.close();
  });

  it("logs unexpected failures by name only and keeps the generic error body", async () => {
    const url = await start();
    repo.close(); // Any database access now throws an unexpected error.
    const response = await fetch(`${url}/health`);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "The server could not complete this request.",
    });
    const failure = entries.find((entry) => entry.event === "request_failed");
    expect(failure).toMatchObject({
      level: "error",
      requestId: response.headers.get("x-request-id"),
      path: "/api/health",
      error: expect.any(String),
    });
    expect(Object.keys(failure!)).not.toContain("message");
  });
});

describe("secret redaction", () => {
  it("never prints keys, tokens or authorization headers", () => {
    const lines: string[] = [];
    const logger = jsonLogger("debug", (line) => lines.push(line));
    const keys = [
      "sk-ant-api03-abcdefghijklmnopqrstuvwxyz012345",
      "sk-proj-abcdefghijklmnopqrstuvwxyz",
      "AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz012345",
      "cal_live_0123456789abcdef",
      "serpapi-plain-secret-value",
    ];
    logger.log("info", "provider_call", {
      apiKey: keys[4],
      headers: {
        Authorization: `Bearer ${keys[1]}`,
        "x-api-key": keys[0],
        Cookie: "kit_session=abc",
      },
      url: `https://serpapi.com/account.json?api_key=${keys[4]}&q=mesa`,
      note: `fallback ${keys[2]} and ${keys[3]} and ${keys[0]}`,
      nested: [{ token: "t-123" }],
      status: 401,
    });
    const line = lines[0];
    for (const key of keys) expect(line).not.toContain(key);
    expect(line).not.toContain("kit_session=abc");
    expect(line).not.toContain("t-123");
    const entry = JSON.parse(line);
    expect(entry.status).toBe(401);
    expect(entry.url).toBe(
      "https://serpapi.com/account.json?api_key=[REDACTED]&q=mesa",
    );
    expect(entry.headers.Authorization).toBe("[REDACTED]");
  });
});
