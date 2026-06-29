import { logger } from "./logger";

export type ErrorTrackingContext = {
  requestId?: string;
  userId?: string;
  tenantId?: string;
  route?: string;
  method?: string;
  extra?: Record<string, unknown>;
};

type Provider = "sentry" | "betterstack" | "none";

function getProvider(): Provider {
  const val = (process.env.ERROR_TRACKING_PROVIDER ?? "").toLowerCase();
  if (val === "sentry" || val === "betterstack") return val as Provider;
  return "none";
}

function logFallback(error: Error, context?: ErrorTrackingContext) {
  logger.error("[error-tracking] captured error", {
    errorName: error.name,
    errorMessage: error.message,
    stack: error.stack?.slice(0, 500),
    ...(context?.extra ?? {}),
    requestId: context?.requestId,
    userId: context?.userId,
    tenantId: context?.tenantId,
    route: context?.route,
    method: context?.method,
  });
}

// Sentry SDK is not imported here to avoid adding a dependency.
// To activate: set ERROR_TRACKING_PROVIDER=sentry, run `npm install @sentry/nextjs`,
// initialize in next.config.ts, and replace the stub below.
async function sentryCapture(error: Error, context?: ErrorTrackingContext): Promise<void> {
  // TODO(error-tracking): Sentry.captureException(error, { extra: context })
  logFallback(error, context);
}

// BetterStack/Logtail structured log push via fetch — no extra package required.
// Requires BETTERSTACK_SOURCE_TOKEN env var.
async function betterStackCapture(error: Error, context?: ErrorTrackingContext): Promise<void> {
  const token = process.env.BETTERSTACK_SOURCE_TOKEN;
  if (!token) {
    logFallback(error, context);
    return;
  }
  try {
    await fetch("https://in.logs.betterstack.com", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        level: "error",
        message: error.message,
        errorName: error.name,
        stack: error.stack?.slice(0, 500),
        dt: new Date().toISOString(),
        ...context,
      }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    logFallback(error, context);
  }
}

/**
 * Capture and forward an error to the configured tracking provider.
 * Never throws — safe to call anywhere without try/catch.
 */
export function captureError(error: Error, context?: ErrorTrackingContext): void {
  try {
    const provider = getProvider();
    if (provider === "sentry") {
      sentryCapture(error, context).catch(() => logFallback(error, context));
      return;
    }
    if (provider === "betterstack") {
      betterStackCapture(error, context).catch(() => logFallback(error, context));
      return;
    }
    // In production with no provider, still log at error level.
    if (process.env.NODE_ENV === "production") logFallback(error, context);
  } catch {
    // Never let error tracking break the caller.
  }
}

export function isErrorTrackingConfigured(): boolean {
  return getProvider() !== "none";
}
