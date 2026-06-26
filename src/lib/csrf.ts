import type { NextRequest } from "next/server";

/**
 * Verifies that a state-changing request originates from the same site.
 *
 * Browsers always include the Origin header on cross-origin requests (CORS)
 * and on same-origin POST requests. Checking it blocks CSRF attacks without
 * requiring a token round-trip.
 *
 * Returns true when the request is safe to process.
 */
export function verifyCsrfOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");

  // No Origin header — same-origin navigation or server-to-server call.
  if (!origin) return true;

  // Allow localhost origins in non-production environments.
  if (process.env.NODE_ENV !== "production") {
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return true;
    }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (!siteUrl) {
    // Fail-closed in production: a missing NEXT_PUBLIC_SITE_URL is a misconfiguration,
    // not a reason to allow all cross-origin requests.
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[csrf] NEXT_PUBLIC_SITE_URL is not set — blocking request as a safety measure. " +
          "Set this variable to the production URL (e.g. https://tecpey.ir).",
      );
      return false;
    }
    // In development with no site URL configured, allow to avoid blocking local dev.
    return true;
  }

  try {
    return origin === new URL(siteUrl).origin;
  } catch {
    return false;
  }
}
