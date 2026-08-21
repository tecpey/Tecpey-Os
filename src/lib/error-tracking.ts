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

// A provider name the configuration accepts is not the same as a provider that
// can actually deliver. `sentry` is declared but its capture function is a stub:
// selecting it forwards nothing. Keeping the two ideas apart is the whole point
// of this module's honesty — see assertErrorTrackingProviderOperational below.
const UNIMPLEMENTED_PROVIDERS: readonly Provider[] = ["sentry"];

function getProvider(): Provider {
  const val = (process.env.ERROR_TRACKING_PROVIDER ?? "").toLowerCase();
  if (val === "sentry" || val === "betterstack") return val as Provider;
  return "none";
}

function isOperational(provider: Provider): boolean {
  return provider !== "none" && !UNIMPLEMENTED_PROVIDERS.includes(provider);
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
// To activate: run `npm install @sentry/nextjs`, initialize in next.config.ts,
// replace the body below with Sentry.captureException, and remove "sentry" from
// UNIMPLEMENTED_PROVIDERS so the configuration stops rejecting it.
async function sentryCapture(error: Error, context?: ErrorTrackingContext): Promise<void> {
  // Deliberately distinct from logFallback. Falling back silently is what made
  // this dangerous: an operator setting ERROR_TRACKING_PROVIDER=sentry got local
  // logs and believed errors were reaching Sentry. The misconfiguration has to be
  // visible in the same line that shows the error was not forwarded.
  logger.error("[error-tracking] provider selected but not implemented", {
    provider: "sentry",
    forwarded: false,
    remedy: "install and initialise the Sentry SDK, or set ERROR_TRACKING_PROVIDER=betterstack",
  });
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

/**
 * Whether errors are actually forwarded off this process.
 *
 * A selected-but-unimplemented provider is deliberately NOT configured. /api/health
 * reports this field, and the deployment contract routes traffic on that response,
 * so answering true for an inert provider would let the health signal authorise
 * traffic while vouching for observability the platform does not have.
 */
export function isErrorTrackingConfigured(): boolean {
  return isOperational(getProvider());
}

export type ErrorTrackingStatus = "configured" | "unconfigured" | "misconfigured";

/**
 * Distinguishes "no provider chosen" from "provider chosen but inert". Collapsing
 * them hides the case that actually needs an operator: someone believes tracking
 * is on.
 */
export function errorTrackingStatus(): ErrorTrackingStatus {
  const provider = getProvider();
  if (provider === "none") return "unconfigured";
  return isOperational(provider) ? "configured" : "misconfigured";
}

/**
 * Fail loud on a provider that cannot deliver.
 *
 * This is separate from captureError on purpose: captureError must never throw,
 * because it runs on error paths where throwing would replace the original
 * failure. A misconfiguration is not an error-path problem — it is a boot-time
 * one, and surfacing it there is the difference between finding out at deploy and
 * finding out during an incident.
 */
export function assertErrorTrackingProviderOperational(): void {
  const provider = getProvider();
  if (provider === "none" || isOperational(provider)) return;
  throw new Error(
    `error_tracking_provider_not_implemented:${provider}`,
  );
}
