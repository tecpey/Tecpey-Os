// JWT ID revocation store — Redis-backed, TTL-aligned with token lifetime.
//
// When a session is revoked (logout, logout-all, admin kick), the jti is written
// to Redis with TTL = remaining token lifetime. Every sensitive request checks
// this store after signature verification.
//
// Failure mode: if Redis is unavailable, isRevoked() returns false (allow).
// This is a deliberate trade-off: availability over perfect revocation.
// The PostgreSQL session table provides a durable audit trail and can be
// replayed into Redis on recovery.

import { logger } from "@/lib/logger";

const PREFIX = "tecpey:revoked:jti:";

function getRedis() {
  return globalThis.tecpeyRedisClient ?? null;
}

/** Mark a jti as revoked. TTL = seconds until token naturally expires. */
export async function revokeJti(jti: string, expiresAt: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return; // graceful degradation
  const ttl = Math.max(1, expiresAt - Math.floor(Date.now() / 1000));
  try {
    await redis.set(`${PREFIX}${jti}`, "1", "EX", ttl);
  } catch (err) {
    logger.warn("[jti-store] failed to write revocation", { jti, err: String(err) });
  }
}

/** Returns true if the jti is in the revocation list. */
export async function isJtiRevoked(jti: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    const val = await redis.get(`${PREFIX}${jti}`);
    return val !== null;
  } catch (err) {
    logger.warn("[jti-store] revocation check failed — allowing", { jti, err: String(err) });
    return false;
  }
}

/**
 * Strict variant — fails closed for security-sensitive operations.
 * Returns true (revoked) when Redis is unavailable so a revoked session
 * is never accepted during an outage.
 */
export async function isJtiRevokedStrict(jti: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true;
  try {
    const val = await redis.get(`${PREFIX}${jti}`);
    return val !== null;
  } catch (err) {
    logger.warn("[jti-store] strict revocation check failed — blocking", { jti, err: String(err) });
    return true;
  }
}

/** Revoke all jtis for a user by scanning the session table + revoking each.
 *  Called by logout-all. Accepts array of { jti, expiresAt } tuples. */
export async function revokeMultiple(sessions: Array<{ jti: string; expiresAt: number }>): Promise<void> {
  const redis = getRedis();
  if (!redis || sessions.length === 0) return;
  try {
    const pipe = redis.pipeline();
    for (const { jti, expiresAt } of sessions) {
      const ttl = Math.max(1, expiresAt - Math.floor(Date.now() / 1000));
      pipe.set(`${PREFIX}${jti}`, "1", "EX", ttl);
    }
    await pipe.exec();
  } catch (err) {
    logger.warn("[jti-store] batch revoke failed", { count: sessions.length, err: String(err) });
  }
}
