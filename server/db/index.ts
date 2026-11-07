import { AsyncLocalStorage } from "node:async_hooks";
import { resolve } from "node:path";
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
      get: async (...params) =>
        (await this.conn().query(text, params)).rows[0],
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
export async function openDb(url?: string): Promise<Db> {
  const target = url?.trim() || ".kit-local/pglite";
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
