import pg from "pg";
import type { Conn, QueryResult, SqlDriver } from "./driver";

// BIGINT columns (epoch milliseconds, identity counters, count(*)) are returned
// as JS numbers, exactly as SQLite returned them. Every value is far below 2^53.
pg.types.setTypeParser(20, (value) => Number(value));

/** One constant key: every transaction takes it first, so writers run one at a time (as SQLite's BEGIN IMMEDIATE did). */
const WRITER_LOCK = 7_243_001;

const result = (r: pg.QueryResult): QueryResult => ({
  rows: r.rows,
  rowCount: r.rowCount ?? 0,
});
const conn = (client: pg.Pool | pg.PoolClient): Conn => ({
  query: async (sql, params) =>
    result(await client.query(sql, params as any[])),
  exec: async (sql) => {
    await client.query(sql);
  },
});

export function pgDriver(connectionString: string): SqlDriver {
  const url = new URL(connectionString);
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
    url.hostname,
  );
  // The URL's sslmode would override the ssl option below, so it is removed.
  url.searchParams.delete("sslmode");
  const ca = process.env.KIT_DATABASE_CA;
  const pool = new pg.Pool({
    connectionString: url.toString(),
    // Serverless: a few connections per instance; Supabase's pooler multiplexes them.
    max: Number(process.env.KIT_DATABASE_POOL_MAX || 3),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    // Hosted databases always use TLS. Without KIT_DATABASE_CA the certificate
    // chain is not verified (Supabase's pooler uses its own CA); set it to verify.
    ssl: local ? undefined : ca ? { ca } : { rejectUnauthorized: false },
  });
  // An idle connection dropped by the pooler must not crash the process.
  pool.on("error", () => {});
  return {
    ...conn(pool),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock($1)", [WRITER_LOCK]);
        const value = await fn(conn(client));
        await client.query("COMMIT");
        return value;
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // The original error is the one that matters.
        }
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}
