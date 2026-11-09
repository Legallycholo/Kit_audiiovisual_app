import { PGlite } from "@electric-sql/pglite";
import { mkdirSync, readFileSync } from "node:fs";
import type { Conn, SqlDriver } from "./driver";

// The company schema, in order. The hosted database applies the same files.
const migrations = [
  "20261107000012_kit_company_schema.sql",
  "20261109000013_kit_design.sql",
].map((file) => new URL(`../../supabase/migrations/${file}`, import.meta.url));
const schema = () =>
  migrations.map((file) => readFileSync(file, "utf8")).join("\n");

const conn = (db: Pick<PGlite, "query" | "exec">): Conn => ({
  query: async (sql, params) => {
    const r = await db.query(sql, params as any[]);
    return { rows: r.rows as any[], rowCount: r.affectedRows ?? 0 };
  },
  exec: async (sql) => {
    await db.exec(sql);
  },
});

// Creating a Postgres cluster takes ~0.6 s; loading a copy of one takes ~0.12 s.
// In-memory databases (tests) start from a migrated template built once per process.
let template: Promise<File | Blob> | undefined;
function migratedTemplate() {
  template ??= (async () => {
    const seed = new PGlite();
    await seed.waitReady;
    await seed.exec(schema());
    const dump = await seed.dumpDataDir("none");
    await seed.close();
    return dump;
  })();
  return template;
}

/**
 * In-process Postgres for local development and tests: no network, no account.
 * `dir` undefined means in memory. The same SQL file the hosted database uses
 * creates the schema, so local and production cannot drift.
 */
export async function pgliteDriver(dir?: string): Promise<SqlDriver> {
  let db: PGlite;
  if (dir) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    db = new PGlite(dir);
    await db.waitReady;
    // Idempotent: creates the schema on first run, does nothing afterwards.
    await db.exec(schema());
  } else {
    db = new PGlite({ loadDataDir: await migratedTemplate() });
    await db.waitReady;
  }
  await db.exec("SET search_path = kit");
  return {
    ...conn(db),
    // PGlite runs one statement at a time on one connection, which already
    // serializes writers; no advisory lock is needed.
    transaction: (fn) => db.transaction((tx) => fn(conn(tx))),
    close: () => db.close(),
  };
}
