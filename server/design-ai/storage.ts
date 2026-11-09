import type { Repository } from "../database";

/**
 * Where KIT Design keeps image bytes (room photos and renders). Paths are
 * opaque keys chosen by the server, e.g. `<eventId>/images/<id>.jpg`.
 */
export interface DesignStorage {
  readonly name: "database" | "supabase";
  put(path: string, bytes: Buffer, mimeType: string): Promise<void>;
  get(path: string): Promise<{ bytes: Buffer; mimeType: string }>;
  /**
   * A short-lived direct link to the file, for large files (videos) that would
   * exceed Vercel's 4.5 MB response limit if streamed through a function.
   * Absent when the bytes can only be served by the server itself.
   */
  signedUrl?(path: string, seconds: number): Promise<string>;
  remove(paths: string[]): Promise<void>;
}

/** Bytes in kit.design_files. Used locally, in tests, and when no bucket is configured. */
export function databaseStorage(repo: Repository): DesignStorage {
  return {
    name: "database",
    async put(path, bytes, mimeType) {
      await repo.db
        .prepare(
          "INSERT INTO design_files (path,mime_type,data) VALUES (?,?,?) ON CONFLICT(path) DO UPDATE SET mime_type=excluded.mime_type, data=excluded.data",
        )
        .run(path, mimeType, bytes);
    },
    async get(path) {
      const row = (await repo.db
        .prepare("SELECT mime_type,data FROM design_files WHERE path=?")
        .get(path)) as { mime_type: string; data: Uint8Array } | undefined;
      if (!row) throw new Error("design file missing");
      return { bytes: Buffer.from(row.data), mimeType: row.mime_type };
    },
    async remove(paths) {
      for (const path of paths)
        await repo.db
          .prepare("DELETE FROM design_files WHERE path=?")
          .run(path);
    },
  };
}

/**
 * The private `kit-design` bucket in the company's Supabase project, reached
 * with the server-only secret key (supabase/migrations/20261109000013_kit_design.sql
 * creates the bucket). The key never leaves the server.
 */
export function supabaseStorage(
  url: string,
  secretKey: string,
  bucket = "kit-design",
  transport: typeof fetch = fetch,
): DesignStorage {
  const base = `${url.replace(/\/+$/, "")}/storage/v1/object`;
  const headers = { apikey: secretKey, Authorization: `Bearer ${secretKey}` };
  const object = (path: string) =>
    `${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const fail = (action: string, status: number) =>
    new Error(`supabase storage ${action} failed (${status})`);
  return {
    name: "supabase",
    async put(path, bytes, mimeType) {
      const response = await transport(`${base}/${object(path)}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": mimeType, "x-upsert": "true" },
        body: new Uint8Array(bytes),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw fail("upload", response.status);
    },
    async get(path) {
      const response = await transport(
        `${base}/authenticated/${object(path)}`,
        {
          headers,
          signal: AbortSignal.timeout(30_000),
        },
      );
      if (!response.ok) throw fail("download", response.status);
      return {
        bytes: Buffer.from(await response.arrayBuffer()),
        mimeType:
          response.headers.get("content-type")?.split(";")[0] ||
          "application/octet-stream",
      };
    },
    async signedUrl(path, seconds) {
      const response = await transport(`${base}/sign/${object(path)}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: seconds }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw fail("sign", response.status);
      const { signedURL } = (await response.json()) as { signedURL?: string };
      if (!signedURL) throw fail("sign", 502);
      const root = url.replace(/\/+$/, "");
      return signedURL.startsWith("/storage/v1")
        ? `${root}${signedURL}`
        : `${root}/storage/v1${signedURL}`;
    },
    async remove(paths) {
      if (!paths.length) return;
      const response = await transport(
        `${base}/${encodeURIComponent(bucket)}`,
        {
          method: "DELETE",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ prefixes: paths }),
          signal: AbortSignal.timeout(30_000),
        },
      );
      if (!response.ok) throw fail("delete", response.status);
    },
  };
}
