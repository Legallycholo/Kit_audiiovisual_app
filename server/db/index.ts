import { AsyncLocalStorage } from "node:async_hooks";
import { statSync } from "node:fs";
import { resolve, sep } from "node:path";
import type { Conn, SqlDriver } from "./driver";
import { toPositional } from "./translate";

export type { SqlDriver, Conn, QueryResult } from "./driver";
export { toPositional } from "./translate";

export interface Statement {
  get(...params: unknown[]): Promise<any | undefined>;
  all(...params: unknown[]): Promise<any[]>;
  run(...params: unknown[]): Promise<{ changes: number }>;
}

/**
 * The async replacement for node:sqlite's DatabaseSync: the same
 * `prepare(sql).get/all/run` and `exec` shape, so SQL text stays as it was and
 * call sites only gain `await`. Inside `transaction()` every call (however
 * deep) runs on that transaction's connection.
 */
export class Db {
  private current = new AsyncLocalStorage<Conn>();
  constructor(readonly driver: SqlDriver) {}
  private conn(): Conn {
    return this.current.getStore() ?? this.driver;
  }
  prepare(sql: string): Statement {
    const text = toPositional(sql);
    return {
      get: async (...params) => (await this.conn().query(text, params)).rows[0],
      all: async (...params) => (await this.conn().query(text, params)).rows,
      run: async (...params) => ({
        changes: (await this.conn().query(text, params)).rowCount,
      }),
    };
  }
  exec(sql: string) {
    return this.conn().exec(sql);
  }
  async transaction<T>(fn: () => Promise<T> | T): Promise<T> {
    // A nested call joins the outer transaction.
    if (this.current.getStore()) return fn();
    return this.driver.transaction((conn) =>
      this.current.run(conn, async () => fn()),
    );
  }
  close() {
    return this.driver.close();
  }
}

/**
 * Picks the database from KIT_DATABASE:
 *   postgres:// or postgresql://  → hosted Postgres (Supabase pooler)
 *   memory://                     → in-memory PGlite (tests)
 *   anything else                 → a PGlite directory (local development)
 * Unset means `.kit-local/pglite` under the working directory. data/ is never used.
 */
export const DEFAULT_LOCAL_DB = ".kit-local/pglite";

/**
 * Decides which local database a KIT_DATABASE value means. The old SQLite
 * setup used `KIT_DATABASE=data/kit.sqlite`; that value is still in some .env
 * files. PGlite needs a directory, and `data/` holds the original company file,
 * which must never be written. So a value that is an existing file, or points
 * inside `data/`, falls back to the default local database with a warning
 * instead of crashing or touching it.
 */
export function resolveDbTarget(
  url: string | undefined,
  cwd = process.cwd(),
): { target: string; warning?: string } {
  const target = url?.trim() || DEFAULT_LOCAL_DB;
  if (/^postgres(ql)?:\/\//i.test(target) || target === "memory://")
    return { target };
  const path = resolve(cwd, target.replace(/^pglite:\/\//, ""));
  const data = resolve(cwd, "data");
  const insideData = path === data || path.startsWith(`${data}${sep}`);
  let isFile = false;
  try {
    isFile = statSync(path).isFile();
  } catch {
    /* Missing: PGlite creates the directory. */
  }
  if (!insideData && !isFile) return { target };
  return {
    target: DEFAULT_LOCAL_DB,
    warning:
      `KIT_DATABASE=${target} is the old SQLite file, not a database KIT can open. ` +
      `Using the local database in ${DEFAULT_LOCAL_DB} instead; the file was not touched. ` +
      "Remove KIT_DATABASE from .env for local development (or set it to the Supabase postgres:// string on the server). " +
      "To bring the old data across, run npm run migrate:sqlite.",
  };
}

export async function openDb(url?: string): Promise<Db> {
  const resolved = resolveDbTarget(url);
  if (resolved.warning) console.warn(`\n⚠️  ${resolved.warning}\n`);
  const target = resolved.target;
  if (/^postgres(ql)?:\/\//i.test(target)) {
    const { pgDriver } = await import("./pg");
    return new Db(pgDriver(target));
  }
  const { pgliteDriver } = await import("./pglite");
  if (target === "memory://") return new Db(await pgliteDriver());
  return new Db(
    await pgliteDriver(resolve(target.replace(/^pglite:\/\//, ""))),
  );
}
