/**
 * Access-session refresh policy.
 *
 * Access JWTs are short-lived and refresh tokens are single-use PostgreSQL
 * authority. This helper may not mint a replacement cookie on its own because
 * doing so would bypass refresh-token rotation and family revocation.
 */

import { sessionMaxAgeSeconds } from "./platform-config";
import type { CanonicalSession } from "./auth-session";

const REFRESH_THRESHOLD = 0.25;

export function shouldRefreshSession(
  session: CanonicalSession & { iat?: number; exp?: number },
): boolean {
  if (!session.exp || !session.iat) return false;
  const totalLifetime = session.exp - session.iat;
  const remaining = session.exp - Math.floor(Date.now() / 1000);
  if (remaining <= 0 || totalLifetime <= 0) return false;
  return remaining / totalLifetime < REFRESH_THRESHOLD;
}

/**
 * @deprecated Access renewal must use POST /api/auth/refresh so the old refresh
 * token is revoked, the replacement token is persisted, and the new access JTI
 * is registered before any cookie is written.
 */
export async function refreshSessionCookie(): Promise<never> {
  throw new Error("refresh_token_rotation_required");
}

export function maxRefreshableSessionAge(): number {
  return sessionMaxAgeSeconds();
}
