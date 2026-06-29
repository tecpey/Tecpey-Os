type LogLevel = "debug" | "info" | "warn" | "error";
export type LogContext = Record<string, unknown>;

const SERVICE = "tecpey-web";

function emit(level: LogLevel, message: string, context?: LogContext) {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    service: SERVICE,
    environment: process.env.NODE_ENV ?? "unknown",
    msg: message,
    ...(context ?? {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

type Logger = {
  debug: (msg: string, ctx?: LogContext) => void;
  info: (msg: string, ctx?: LogContext) => void;
  warn: (msg: string, ctx?: LogContext) => void;
  error: (msg: string, ctx?: LogContext) => void;
  /** Returns a child logger with pre-bound context fields merged into every entry. */
  child: (ctx: LogContext) => Logger;
};

function createLogger(bound?: LogContext): Logger {
  return {
    debug: (msg, ctx) => emit("debug", msg, { ...bound, ...ctx }),
    info:  (msg, ctx) => emit("info",  msg, { ...bound, ...ctx }),
    warn:  (msg, ctx) => emit("warn",  msg, { ...bound, ...ctx }),
    error: (msg, ctx) => emit("error", msg, { ...bound, ...ctx }),
    child: (ctx: LogContext) => createLogger({ ...bound, ...ctx }),
  };
}

export const logger = createLogger();
