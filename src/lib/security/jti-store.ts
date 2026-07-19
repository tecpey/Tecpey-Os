// JWT ID revocation store — Redis deny cache plus PostgreSQL durable authority.

import { withDb } from "@/lib/db";
import { logger } from "@/lib/logger";

const PREFIX = "tecpey:revoked:jti:";

type DurableSessionState = "active" | "revoked" | "missing" | "unavailable";

function getRedis() {
  return globalThis.tecpeyRedisClient ?? null;
}

async function durableSessionState(jti: string): Promise<DurableSessionState> {
  try {
    const result = await withDb(async (db) => {
      const rows = await db.query<{
        is_revoked: boolean;
        expires_at: Date;
      }>(
        `SELECT is_revoked, expires_at
           FROM user_sessions
          WHERE id = $1
          LIMIT 1`,
        [jti],
      );
      const session = rows.rows[0];
      if (!session) return "missing" as const;
      if (session.is_revoked || session.expires_at.getTime() <= Date.now()) {
        return "revoked" as const;
      }
      return "active" as const;
    });
    return result.enabled ? result.value : "unavailable";
  } catch (err) {
    logger.warn("[jti-store] durable session check failed", {
      jti,
      err: String(err),
    });
    return "unavailable";
  }
}

/** Mark a JTI revoked in Redis. False means the fast deny store is unavailable. */
export async function revokeJti(jti: string, expiresAt: number): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  const ttl = Math.max(1, expiresAt - Math.floor(Date.now() / 1000));
  try {
    await redis.set(`${PREFIX}${jti}`, "1", "EX", ttl);
    return true;
  } catch (err) {
    logger.warn("[jti-store] failed to write revocation", {
      jti,
      err: String(err),
    });
    return false;
  }
}

/**
 * Ordinary authenticated reads still require durable active-session evidence.
 * Redis can immediately deny, but a Redis miss is not proof of validity.
 */
export async function isJtiRevoked(jti: string): Promise<boolean> {
  const redis = getRedis();
  if (redis) {
    try {
      const value = await redis.get(`${PREFIX}${jti}`);
      if (value !== null) return true;
    } catch (err) {
      logger.warn("[jti-store] Redis check failed; consulting durable session", {
        jti,
        err: String(err),
      });
    }
  }

  const durable = await durableSessionState(jti);
  if (durable === "active") return false;
  if (durable === "revoked" || durable === "missing") return true;

  logger.warn("[jti-store] durable revocation authority unavailable — blocking", {
    jti,
  });
  return true;
}

/**
 * Security-sensitive check. PostgreSQL must confirm a registered active session
 * and Redis must be reachable with no deny record.
 */
export async function isJtiRevokedStrict(jti: string): Promise<boolean> {
  const durable = await durableSessionState(jti);
  if (durable !== "active") {
    if (durable === "unavailable") {
      logger.warn("[jti-store] strict durable check unavailable — blocking", {
        jti,
      });
    }
    return true;
  }

  const redis = getRedis();
  if (!redis) return true;
  try {
    return (await redis.get(`${PREFIX}${jti}`)) !== null;
  } catch (err) {
    logger.warn("[jti-store] strict Redis check failed — blocking", {
      jti,
      err: String(err),
    });
    return true;
  }
}

/** Revoke several JTIs. False unless every Redis write succeeds. */
export async function revokeMultiple(
  sessions: Array<{ jti: string; expiresAt: number }>,
): Promise<boolean> {
  if (sessions.length === 0) return true;
  const redis = getRedis();
  if (!redis) return false;
  try {
    const pipe = redis.pipeline();
    for (const { jti, expiresAt } of sessions) {
      const ttl = Math.max(1, expiresAt - Math.floor(Date.now() / 1000));
      pipe.set(`${PREFIX}${jti}`, "1", "EX", ttl);
    }
    const results = await pipe.exec();
    return Array.isArray(results) && results.every((entry) => !entry?.[0]);
  } catch (err) {
    logger.warn("[jti-store] batch revoke failed", {
      count: sessions.length,
      err: String(err),
    });
    return false;
  }
}
