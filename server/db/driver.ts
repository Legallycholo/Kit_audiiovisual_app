/** Result of one statement, shaped the same for every driver. */
export interface QueryResult {
  rows: any[];
  /** Rows changed by INSERT/UPDATE/DELETE (0 for SELECT). */
  rowCount: number;
}
export type Query = (sql: string, params: unknown[]) => Promise<QueryResult>;
/** One connection: single parameterised statements, or multi-statement scripts without parameters. */
export interface Conn {
  query: Query;
  exec(sql: string): Promise<void>;
}
export interface SqlDriver extends Conn {
  /** Runs fn on one connection inside BEGIN … COMMIT, rolling back if it throws. */
  transaction<T>(fn: (conn: Conn) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
