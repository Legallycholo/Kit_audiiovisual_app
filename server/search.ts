import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { Repository, HttpError, publicUser } from "./database";
import { scopeWorkspace } from "./permissions";
import { searchWorkspace } from "../src/shared/search";
import { requireAdmin, userOf, rateLimit } from "./security";

export interface SearchProvider {
  embed(text: string[]): Promise<number[][]>;
  replace(
    namespace: string,
    source: string,
    chunks: { id: string; text: string; vector: number[] }[],
  ): Promise<void>;
  query(
    namespace: string,
    vector: number[],
    limit: number,
  ): Promise<{ source: string; score: number }[]>;
  delete(namespace: string, source: string): Promise<boolean>;
}
export interface SearchConfig {
  provider?: SearchProvider;
  providerIdentity?: string;
  name: string;
  region: string;
  retention: string;
  monthlyBudgetCents: number;
  embeddingCentsPerThousandCharacters: number;
  encryptionKey?: Buffer;
}
const disabled: SearchConfig = {
  name: "No configurado",
  region: "",
  retention: "",
  monthlyBudgetCents: 0,
  embeddingCentsPerThousandCharacters: 0,
};
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export function redactSecrets(text: string) {
  let count = 0;
  const patterns = [
    /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,
    /\b(?:sk-[A-Za-z0-9_-]{16,}|AKIA[A-Z0-9]{16})\b/g,
    /\b(?:password|passwd|api[_-]?key|access[_-]?token|secret)\s*[:=]\s*["']?[^\s"',;]+/gi,
    /\bBearer\s+[A-Za-z0-9._~-]+/g,
  ];
  let value = text;
  for (const pattern of patterns)
    value = value.replace(pattern, () => {
      count++;
      return "[REDACTED]";
    });
  return { text: value, count };
}
export function chunks(text: string) {
  const result: string[] = [];
  for (let i = 0; i < text.length; i += 1800) {
    result.push(text.slice(i, i + 2000));
    if (i + 2000 >= text.length) break;
  }
  return result;
}
const upload = z
  .object({
    id: z.string().regex(/^[a-f0-9]{64}$/),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    title: z.string().min(1).max(300),
    mime: z.string().max(120),
    text: z.string().max(1_000_000),
    policy: z.string().length(64),
  })
  .strict();

export class SearchGateway {
  private queue: Promise<unknown> = Promise.resolve();
  readonly tenant: string;
  readonly fingerprint: string;
  constructor(
    readonly repo: Repository,
    readonly config: SearchConfig = disabled,
  ) {
    repo.db.exec(`CREATE TABLE IF NOT EXISTS search_tenant(id TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS search_devices(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,name TEXT NOT NULL,expires INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS search_sources(user_id TEXT NOT NULL,id TEXT NOT NULL,hash TEXT NOT NULL,payload TEXT NOT NULL,state TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,error TEXT NOT NULL DEFAULT '',updated TEXT NOT NULL, PRIMARY KEY(user_id,id));
      CREATE TABLE IF NOT EXISTS search_usage(month TEXT NOT NULL,user_id TEXT NOT NULL,cents INTEGER NOT NULL, PRIMARY KEY(month,user_id));`);
    const row = repo.db
      .prepare("SELECT id FROM search_tenant LIMIT 1")
      .get() as { id: string } | undefined;
    this.tenant = row?.id || randomUUID();
    if (!row)
      repo.db.prepare("INSERT INTO search_tenant VALUES(?)").run(this.tenant);
    this.fingerprint = sha(
      JSON.stringify([
        config.name,
        config.region,
        config.retention,
        config.providerIdentity || "",
      ]),
    );
    const columns = repo.db
      .prepare("PRAGMA table_info(search_sources)")
      .all() as { name: string }[];
    if (!columns.some((c) => c.name === "policy"))
      repo.db.exec(
        "ALTER TABLE search_sources ADD COLUMN policy TEXT NOT NULL DEFAULT ''",
      );
    const incompatible = repo.db
      .prepare("SELECT count(*) count FROM search_sources WHERE policy<>?")
      .get(this.fingerprint) as { count: number };
    if (incompatible.count)
      throw new Error(
        "Drain and confirm deletion with the previous search provider policy before changing provider, region or retention.",
      );
  }
  enabled() {
    return Boolean(
      this.config.provider &&
      this.config.encryptionKey?.length === 32 &&
      this.config.region &&
      this.config.retention &&
      Number.isFinite(this.config.monthlyBudgetCents) &&
      Number.isFinite(this.config.embeddingCentsPerThousandCharacters) &&
      this.config.monthlyBudgetCents > 0 &&
      this.config.embeddingCentsPerThousandCharacters > 0,
    );
  }
  policy() {
    return {
      configured: this.enabled(),
      name: this.config.name,
      region: this.config.region,
      retention: this.config.retention,
      fingerprint: this.fingerprint,
      monthlyBudgetCents: this.config.monthlyBudgetCents,
      costPerThousandCharacters:
        this.config.embeddingCentsPerThousandCharacters,
    };
  }
  private encrypt(value: unknown) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv(
      "aes-256-gcm",
      this.config.encryptionKey!,
      nonce,
    );
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(value)),
      cipher.final(),
    ]);
    return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString(
      "base64",
    );
  }
  private decrypt(payload: string) {
    const b = Buffer.from(payload, "base64");
    const d = createDecipheriv(
      "aes-256-gcm",
      this.config.encryptionKey!,
      b.subarray(0, 12),
    );
    d.setAuthTag(b.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([d.update(b.subarray(28)), d.final()]).toString(),
    );
  }
  private namespace(user: string) {
    return `${this.tenant}:${user}`;
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const task = this.queue.then(fn, fn);
    this.queue = task.catch(() => {});
    return task;
  }
  private checkUser(user: string) {
    const row = this.repo.user(user);
    if (!row?.active || row.role === "Client / Guest")
      throw new HttpError(
        403,
        "Cloud file search is unavailable for this account.",
      );
  }
  private reserve(user: string, characters: number) {
    this.checkUser(user);
    const month = new Date().toISOString().slice(0, 7);
    const cents = Math.max(
      1,
      Math.ceil(
        (characters / 1000) * this.config.embeddingCentsPerThousandCharacters,
      ),
    );
    this.repo.transaction(() => {
      const spent = this.repo.db
        .prepare(
          "SELECT COALESCE(SUM(cents),0) total FROM search_usage WHERE month=?",
        )
        .get(month) as { total: number };
      if (spent.total + cents > this.config.monthlyBudgetCents)
        throw new HttpError(
          429,
          "Monthly search budget exhausted. Deletions remain available.",
        );
      this.repo.db
        .prepare(
          "INSERT INTO search_usage VALUES(?,?,?) ON CONFLICT(month,user_id) DO UPDATE SET cents=cents+excluded.cents",
        )
        .run(month, user, cents);
    });
  }
  private audit(user: string, action: string, detail: string) {
    this.repo.db
      .prepare(
        "INSERT INTO audit(id,actor_id,action,detail,created_at) VALUES(?,?,?,?,?)",
      )
      .run(randomUUID(), user, action, detail, new Date().toISOString());
  }
  device(req: Request): string {
    const token = req.get("authorization")?.replace(/^Bearer /, "") || "";
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new HttpError(401, "Device authorization required.");
    const row = this.repo.db
      .prepare(
        "SELECT * FROM search_devices WHERE token_hash=? AND revoked=0 AND expires>?",
      )
      .get(sha(token), Date.now()) as { user_id: string } | undefined;
    if (!row)
      throw new HttpError(401, "Device authorization expired or revoked.");
    this.checkUser(row.user_id);
    rateLimit(this.repo, `search-device:${row.user_id}`, 120);
    return row.user_id;
  }
  issue(user: string, name: string) {
    this.checkUser(user);
    const token = randomBytes(32).toString("hex");
    this.repo.db
      .prepare("INSERT INTO search_devices VALUES(?,?,?,?,0)")
      .run(sha(token), user, name, Date.now() + 30 * 86400_000);
    this.audit(user, "search-device-created", name);
    return token;
  }
  async put(user: string, input: unknown) {
    this.checkUser(user);
    if (!this.enabled())
      throw new HttpError(
        503,
        "Cloud search provider, privacy policy, encryption key and budget must be configured first.",
      );
    const item = upload.parse(input);
    if (item.policy !== this.fingerprint)
      throw new HttpError(
        409,
        "Provider policy changed. Review and consent again.",
      );
    const clean = redactSecrets(item.text);
    const title = redactSecrets(item.title).text;
    return this.serial(async () => {
      this.checkUser(user);
      const old = this.repo.db
        .prepare(
          "SELECT state,hash FROM search_sources WHERE user_id=? AND id=?",
        )
        .get(user, item.id) as { state: string; hash: string } | undefined;
      if (old?.hash === item.hash && old.state === "ready")
        return { state: "ready" };
      const payload = this.encrypt({
        title,
        mime: item.mime,
        chunks: chunks(`${title}\n${clean.text}`),
      });
      this.repo.db
        .prepare(
          "INSERT INTO search_sources(user_id,id,hash,payload,state,attempts,error,updated,policy) VALUES(?,?,?,?, 'pending',0,'',?,?) ON CONFLICT(user_id,id) DO UPDATE SET hash=excluded.hash,payload=excluded.payload,state='pending',attempts=0,error='',updated=excluded.updated,policy=excluded.policy",
        )
        .run(
          user,
          item.id,
          item.hash,
          payload,
          new Date().toISOString(),
          this.fingerprint,
        );
      this.audit(
        user,
        "search-source-queued",
        JSON.stringify({ source: item.id, redactions: clean.count }),
      );
      await this.process(user, item.id);
      return this.sourceState(user, item.id);
    });
  }
  private sourceState(user: string, id: string) {
    return this.repo.db
      .prepare(
        "SELECT id,state,error,updated FROM search_sources WHERE user_id=? AND id=?",
      )
      .get(user, id);
  }
  private async process(user: string, id: string) {
    const row = this.repo.db
      .prepare("SELECT * FROM search_sources WHERE user_id=? AND id=?")
      .get(user, id) as
      { state: string; payload: string; attempts: number } | undefined;
    if (!row) return;
    try {
      if (row.state === "deletion_pending") {
        if (!this.config.provider)
          throw new Error("Provider unavailable for deletion");
        const confirmed = await this.config.provider.delete(
          this.namespace(user),
          id,
        );
        if (!confirmed) throw new Error("Provider deletion not confirmed");
        this.repo.db
          .prepare("DELETE FROM search_sources WHERE user_id=? AND id=?")
          .run(user, id);
        this.audit(user, "search-source-deleted", id);
        return;
      }
      if (!this.enabled()) throw new Error("Provider unavailable");
      this.checkUser(user);
      const data = this.decrypt(row.payload) as {
        title: string;
        mime: string;
        chunks: string[];
      };
      this.reserve(user, data.chunks.join("").length);
      const vectors = await this.config.provider!.embed(data.chunks);
      if (
        vectors.length !== data.chunks.length ||
        vectors.some(
          (v) =>
            !v.length || v.length > 4096 || v.some((n) => !Number.isFinite(n)),
        )
      )
        throw new Error("Invalid embeddings response");
      await this.config.provider!.replace(
        this.namespace(user),
        id,
        data.chunks.map((text, i) => ({
          id: `${id}:${i}`,
          text,
          vector: vectors[i],
        })),
      );
      this.checkUser(user);
      this.repo.db
        .prepare(
          "UPDATE search_sources SET state='ready',error='',updated=? WHERE user_id=? AND id=?",
        )
        .run(new Date().toISOString(), user, id);
      this.audit(user, "search-source-indexed", id);
    } catch (error) {
      // Never persist provider response bodies: they can contain document content.
      this.repo.db
        .prepare(
          "UPDATE search_sources SET state=CASE WHEN state='deletion_pending' THEN state ELSE 'failed' END,attempts=attempts+1,error=?,updated=? WHERE user_id=? AND id=?",
        )
        .run(
          error instanceof HttpError
            ? error.message
            : "Provider operation failed; retry pending.",
          new Date().toISOString(),
          user,
          id,
        );
    }
  }
  async remove(user: string, id?: string) {
    return this.serial(async () => {
      if (id)
        this.repo.db
          .prepare(
            "UPDATE search_sources SET state='deletion_pending',payload='' WHERE user_id=? AND id=?",
          )
          .run(user, id);
      else
        this.repo.db
          .prepare(
            "UPDATE search_sources SET state='deletion_pending',payload='' WHERE user_id=?",
          )
          .run(user);
      const rows = this.repo.db
        .prepare(
          "SELECT id FROM search_sources WHERE user_id=? AND state='deletion_pending'",
        )
        .all(user) as { id: string }[];
      for (const r of rows) await this.process(user, r.id);
      const pending = this.repo.db
        .prepare(
          "SELECT count(*) count FROM search_sources WHERE user_id=? AND state='deletion_pending'",
        )
        .get(user) as { count: number };
      this.audit(
        user,
        "search-access-revoked",
        JSON.stringify({ pending: pending.count }),
      );
      return { confirmed: pending.count === 0, pending: pending.count };
    });
  }
  async retry() {
    return this.serial(async () => {
      this.repo.db.exec(
        "UPDATE search_sources SET state='deletion_pending',payload='' WHERE user_id NOT IN (SELECT id FROM users WHERE active=1 AND role<>'Client / Guest')",
      );
      const rows = this.repo.db
        .prepare(
          "SELECT user_id,id FROM search_sources WHERE state='deletion_pending' OR (state IN ('pending','failed') AND attempts<3) ORDER BY updated LIMIT 20",
        )
        .all() as { user_id: string; id: string }[];
      for (const row of rows) await this.process(row.user_id, row.id);
    });
  }
  async drain() {
    await this.queue;
  }
  async search(user: string, query: string) {
    this.checkUser(user);
    if (!this.enabled()) return { configured: false, results: [] };
    return this.serial(async () => {
      this.reserve(user, query.length);
      const vectors = await this.config.provider!.embed([
        redactSecrets(query).text,
      ]);
      if (!vectors[0]?.length || vectors[0].some((n) => !Number.isFinite(n)))
        throw new HttpError(502, "Invalid embedding response");
      const matches = await this.config.provider!.query(
        this.namespace(user),
        vectors[0],
        50,
      );
      this.checkUser(user);
      const unique = new Map<string, unknown>();
      for (const match of matches.slice(0, 100)) {
        if (!Number.isFinite(match.score)) continue;
        const row = this.repo.db
          .prepare(
            "SELECT payload,updated FROM search_sources WHERE user_id=? AND id=? AND state='ready'",
          )
          .get(user, match.source) as
          { payload: string; updated: string } | undefined;
        if (!row) continue;
        const data = this.decrypt(row.payload);
        unique.set(match.source, {
          id: match.source,
          title: data.title,
          mime: data.mime,
          excerpt: data.chunks.join(" ").slice(0, 350),
          score: match.score,
          modified: row.updated,
          source: "cloud",
          reason: "Coincidencia semántica",
        });
      }
      this.audit(
        user,
        "search-query",
        JSON.stringify({ resultCount: unique.size }),
      );
      return { configured: true, results: [...unique.values()] };
    });
  }
  status(user: string) {
    this.checkUser(user);
    const account = this.repo.user(user)!;
    return {
      account: {
        id: account.id,
        name: account.name,
        email: account.email,
        tenant: this.tenant,
      },
      policy: this.policy(),
      sources: this.repo.db
        .prepare(
          "SELECT id,state,error,updated FROM search_sources WHERE user_id=? ORDER BY updated DESC LIMIT 100",
        )
        .all(user),
      usage: this.repo.db
        .prepare(
          "SELECT month,cents FROM search_usage WHERE user_id=? ORDER BY month DESC LIMIT 12",
        )
        .all(user),
    };
  }
  mountDevice(app: Express) {
    app.post("/api/search/device/records", (req, res) => {
      const id = this.device(req);
      const user = publicUser(this.repo.user(id)!);
      const query = z.string().trim().min(1).max(300).parse(req.body.query);
      const data = scopeWorkspace(this.repo.read().workspace, user);
      res.json({
        connected: true,
        results: searchWorkspace(data, user, query)
          .slice(0, 100)
          .map((r) => ({ ...r, source: "company" })),
      });
    });
    app.get("/api/search/device/status", (req, res) =>
      res.json(this.status(this.device(req))),
    );
    app.post("/api/search/device/sources", async (req, res) =>
      res.json(await this.put(this.device(req), req.body)),
    );
    app.post("/api/search/device/query", async (req, res) =>
      res.json(
        await this.search(
          this.device(req),
          z.string().trim().min(1).max(300).parse(req.body.query),
        ),
      ),
    );
    app.delete("/api/search/device/sources/:id", async (req, res) =>
      res.json(
        await this.remove(
          this.device(req),
          z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .parse(req.params.id),
        ),
      ),
    );
    app.delete("/api/search/device/sources", async (req, res) =>
      res.json(await this.remove(this.device(req))),
    );
  }
  mountSession(app: Express) {
    app.get("/api/search/status", (_req, res) =>
      res.json(this.status(userOf(res).id)),
    );
    app.post("/api/search/devices", (req, res) =>
      res.json({
        token: this.issue(
          userOf(res).id,
          z.string().trim().min(1).max(80).parse(req.body.name),
        ),
      }),
    );
    app.delete("/api/search/devices", async (_req, res) => {
      const user = userOf(res);
      this.repo.db
        .prepare("UPDATE search_devices SET revoked=1 WHERE user_id=?")
        .run(user.id);
      res.json(await this.remove(user.id));
    });
    app.post("/api/search/query", async (req, res) =>
      res.json(
        await this.search(
          userOf(res).id,
          z.string().trim().min(1).max(300).parse(req.body.query),
        ),
      ),
    );
    app.delete("/api/search/sources", async (_req, res) =>
      res.json(await this.remove(userOf(res).id)),
    );
    app.get("/api/search/admin", (_req, res) => {
      requireAdmin(res);
      res.json({
        policy: this.policy(),
        sources: this.repo.db
          .prepare(
            "SELECT user_id,state,count(*) count FROM search_sources GROUP BY user_id,state",
          )
          .all(),
        usage: this.repo.db
          .prepare("SELECT * FROM search_usage ORDER BY month DESC LIMIT 100")
          .all(),
        audit: this.repo.db
          .prepare(
            "SELECT * FROM audit WHERE action LIKE 'search-%' ORDER BY created_at DESC LIMIT 100",
          )
          .all(),
      });
    });
  }
}

/** Gateway contract: embeddings + atomic per-source vector replacement; no vendor keys in UI. */
export function httpSearchProvider(
  base: string,
  token: string,
): SearchProvider {
  const url = new URL(base);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error(
      "Search provider requires an HTTPS URL without embedded credentials",
    );
  async function call(path: string, body: unknown) {
    const response = await fetch(
      new URL(path, url.href.endsWith("/") ? url : new URL(url.href + "/")),
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok || !response.body)
      throw new Error("Search provider failed");
    const reader = response.body.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 8_000_000)
          throw new Error("Search provider response too large");
        parts.push(value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  }
  return {
    embed: async (text) => {
      const value = await call("embeddings", { input: text });
      return z
        .array(z.array(z.number().finite()).min(1).max(4096))
        .parse(value.vectors);
    },
    replace: async (namespace, source, chunks) => {
      await call("vectors/replace", { namespace, source, chunks });
    },
    query: async (namespace, vector, limit) =>
      z
        .array(z.object({ source: z.string(), score: z.number().finite() }))
        .parse(
          (await call("vectors/query", { namespace, vector, limit })).matches,
        ),
    delete: async (namespace, source) =>
      (await call("vectors/delete", { namespace, source })).confirmed === true,
  };
}
