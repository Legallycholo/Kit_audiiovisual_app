/**
 * Turns SQLite-style `?` placeholders into Postgres `$1, $2, …`.
 * Question marks inside single-quoted strings or double-quoted identifiers
 * are left alone. Statements in this codebase never use Postgres' own `?`
 * operators, so a bare `?` is always a placeholder.
 */
export function toPositional(sql: string): string {
  let out = "";
  let n = 0;
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) {
      out += ch;
      if (ch === quote) {
        // A doubled quote is an escaped quote, not the end of the literal.
        if (sql[i + 1] === quote) out += sql[++i];
        else quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      out += ch;
    } else if (ch === "?") {
      n += 1;
      out += "$" + n;
    } else out += ch;
  }
  return out;
}
