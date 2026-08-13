import type { NextRequest } from "next/server";
import { logger } from "./logger";

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
    // Fail closed whatever the environment. The previous behaviour returned
    // true outside production so local development would not be blocked, but
    // the localhost allowance above already covers that case: any request that
    // reaches here carries a non-localhost Origin, and accepting an arbitrary
    // external Origin is never what a developer needs. A staging or preview
    // deployment running with NODE_ENV unset would otherwise have accepted
    // cross-origin state-changing requests from anywhere.
    logger.error(
      "[csrf] NEXT_PUBLIC_SITE_URL is not set — blocking cross-origin request as a safety measure. Set NEXT_PUBLIC_SITE_URL to the deployment URL.",
    );
    return false;
  }

  try {
    return origin === new URL(siteUrl).origin;
  } catch {
    return false;
  }
}
