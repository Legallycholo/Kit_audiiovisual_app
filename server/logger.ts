export type LogLevel = "debug" | "info" | "warn" | "error";
const order: Record<LogLevel | "silent", number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

export interface Logger {
  log: (
    level: LogLevel,
    event: string,
    fields?: Record<string, unknown>,
  ) => void;
}

export function parseLogLevel(value: string | undefined): LogLevel | "silent" {
  return value && Object.hasOwn(order, value)
    ? (value as LogLevel | "silent")
    : "info";
}

/** Field names whose values are always replaced, at any depth. */
const sensitiveKey =
  /(authorization|cookie|password|passwd|secret|token|api[_-]?key|x-api-key|x-goog-api-key|csrf|credential)/i;
/** Values that look like credentials, even under an innocent field name. */
const sensitiveValue = [
  /\b(?:sk-(?:ant-)?[A-Za-z0-9_-]{12,}|AKIA[A-Z0-9]{16}|AIza[0-9A-Za-z_-]{20,}|cal_(?:live|test)_[A-Za-z0-9_]{8,}|EAA[A-Za-z0-9]{20,})\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /([?&](?:api_key|key|token|access_token)=)[^&\s"]+/gi,
];
const REDACTED = "[REDACTED]";

/** Removes credentials from a log field before it is written. */
export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === "string")
    return sensitiveValue.reduce(
      (text, pattern) =>
        text.replace(pattern, (_match, prefix?: string) =>
          (typeof prefix === "string" && prefix.startsWith("?")) ||
          (typeof prefix === "string" && prefix.startsWith("&"))
            ? `${prefix}${REDACTED}`
            : REDACTED,
        ),
      value,
    );
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      sensitiveKey.test(key) ? REDACTED : redact(item, depth + 1),
    ]),
  );
}

// One JSON object per line. Callers must not pass request bodies; credentials
// are redacted defensively by field name and by value shape.
export function jsonLogger(
  minimum: LogLevel | "silent" = "info",
  write: (line: string, level: LogLevel) => void = (line, level) =>
    (level === "warn" || level === "error"
      ? process.stderr
      : process.stdout
    ).write(`${line}\n`),
): Logger {
  return {
    log(level, event, fields = {}) {
      if (order[level] < order[minimum]) return;
      write(
        JSON.stringify({
          time: new Date().toISOString(),
          level,
          event,
          ...(redact(fields) as Record<string, unknown>),
        }),
        level,
      );
    },
  };
}
