import type { Server } from "node:http";
import { createApp, type AppConfig } from "../app";
import { Repository } from "../database";
import { createSeed } from "../../src/shared/seed";

/** An isolated company server on a random port with an in-memory database. */
export async function startCompany(config: Partial<AppConfig> = {}) {
  const origin = "http://localhost:5173";
  const password = "only-for-automated-tests-123";
  const repo = new Repository(":memory:");
  const server: Server = createApp(repo, {
    origins: [origin],
    ...config,
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  type Session = { cookie: string; csrf: string };
  async function call(
    path: string,
    method = "GET",
    body?: unknown,
    session?: Session,
  ) {
    const response = await fetch(`${url}/api${path}`, {
      method,
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...(session
          ? { Cookie: session.cookie, "x-csrf-token": session.csrf }
          : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    return {
      status: response.status,
      text,
      json: text ? JSON.parse(text) : null,
      cookie: response.headers.getSetCookie().at(-1)?.split(";")[0] || "",
    };
  }
  const setup = await call("/setup", "POST", {
    name: "Owner",
    company: "Test AV",
    email: "owner@example.test",
    password,
  });
  if (setup.status !== 201) throw new Error(`setup failed: ${setup.text}`);
  const owner: Session = { cookie: setup.cookie, csrf: setup.json.csrf };
  const seed = createSeed();
  seed.conversations.forEach((c) =>
    c.messages.forEach((m) => {
      m.at = new Date(m.at).toISOString();
    }),
  );
  repo.save(seed, 0);
  /** Creates another account with the given role and signs it in. */
  async function account(role: string): Promise<Session> {
    const email = `${role.replaceAll(/[^a-z]/gi, "").toLowerCase()}@example.test`;
    const created = await call(
      "/users",
      "POST",
      { name: "Test Person", email, password, role },
      owner,
    );
    if (created.status !== 201) throw new Error(created.text);
    const login = await call("/login", "POST", { email, password });
    return { cookie: login.cookie, csrf: login.json.csrf };
  }
  async function close() {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    repo.close();
  }
  return { repo, call, owner, account, close };
}
