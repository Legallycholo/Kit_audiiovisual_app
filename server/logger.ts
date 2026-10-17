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

// One JSON object per line. Callers must not pass secrets or request bodies.
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
          ...fields,
        }),
        level,
      );
    },
  };
}
