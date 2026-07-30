type LogLevel = "debug" | "info" | "warn" | "error";
export type LogContext = Record<string, unknown>;

const SERVICE = "tecpey-web";

// Structured logs are shipped to long-lived log stores. Any context field whose
// name suggests a secret, credential or session artifact is redacted at the
// sink so an accidental `logger.info("...", { token })` can never persist raw
// secrets. Keys remain visible so the log entry stays debuggable.
const SENSITIVE_KEY_PATTERN =
  /(secret|token|password|authorization|api[-_]?key|credential|cookie|session[-_]?id|jwt|private[-_]?key|refresh)/i;
const REDACTED = "[redacted]";

function redactContext(context?: LogContext): LogContext | undefined {
  if (!context) return context;
  const safe: LogContext = {};
  for (const [key, value] of Object.entries(context)) {
    safe[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : value;
  }
  return safe;
}

function emit(level: LogLevel, message: string, context?: LogContext) {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    service: SERVICE,
    environment: process.env.NODE_ENV ?? "unknown",
    msg: message,
    ...(redactContext(context) ?? {}),
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
