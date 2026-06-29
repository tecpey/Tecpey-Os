/**
 * Session refresh foundation — Phase 27.
 *
 * Current behavior (Phase 23+): TecPey issues a single 30-day JWT
 * (tecpey_session cookie). There is no refresh token — the session is valid
 * until it expires, at which point the user must re-authenticate.
 *
 * This module provides the plumbing for future short-lived + refresh-token
 * auth without breaking the existing cookie contract.
 *
 * Refresh strategy (deferred):
 *  - Short-lived access token: 15 min
 *  - Refresh token: 30 days, HttpOnly, Secure, SameSite=Strict
 *  - Rotation: each use of a refresh token issues a new one (single-use)
 *  - Revocation: refresh tokens stored in DB, deletable on logout/compromise
 *
 * Current limitation: only `shouldRefreshSession` is wired. The actual token
 * swap is deferred until a refresh-token DB table is added in a future phase.
 */

import type { NextResponse } from "next/server";
import { sessionMaxAgeSeconds } from "./platform-config";
import { setUnifiedSessionCookieAsync } from "./unified-session";
import type { CanonicalSession } from "./auth-session";

/** Fraction of total session lifetime remaining that triggers a proactive refresh. */
const REFRESH_THRESHOLD = 0.25; // refresh when less than 25% of lifetime remains

/**
 * Returns true if the session should be proactively refreshed.
 * Uses the session's issued-at time (iat) if available.
 * Falls back to false if the session has no iat (legacy cookies).
 */
export function shouldRefreshSession(session: CanonicalSession & { iat?: number; exp?: number }): boolean {
  if (!session.exp || !session.iat) return false;
  const totalLifetime = session.exp - session.iat;
  const remaining = session.exp - Math.floor(Date.now() / 1000);
  if (remaining <= 0) return false; // already expired
  return remaining / totalLifetime < REFRESH_THRESHOLD;
}

/**
 * Renew the unified session cookie on the given response.
 * Preserves all session claims; issues a fresh JWT with a new iat/exp.
 *
 * Call this after authentication (GET /api/academy/auth/me) to slide the
 * session window forward for active users.
 *
 * Note: this does NOT implement refresh token rotation yet. A future phase
 * will add DB-backed refresh tokens and single-use rotation.
 */
export async function refreshSessionCookie(
  response: NextResponse,
  session: CanonicalSession,
): Promise<void> {
  if (!session.academyAccountId && !session.studentId && !session.userId) return;
  await setUnifiedSessionCookieAsync(response, {
    accountId: session.academyAccountId ?? null,
    studentId: session.studentId ?? null,
    email: session.email ?? null,
    displayName: session.displayName ?? null,
    username: session.username ?? null,
  });
}

/** Maximum number of seconds a refreshed session can be valid for. */
export function maxRefreshableSessionAge(): number {
  return sessionMaxAgeSeconds();
}
