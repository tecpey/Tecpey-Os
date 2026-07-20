import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Redis } from "ioredis";
import { NextRequest } from "next/server";
import { DELETE as revokeDeviceSession } from "../../app/api/auth/sessions/[id]/route";
import { getCanonicalSession } from "../../lib/auth-session";
import { withDb } from "../../lib/db";
import { verifyRefreshToken } from "../../lib/security/refresh-tokens";
import { UNIFIED_SESSION_COOKIE } from "../../lib/unified-session";
import {
  cleanupBoundSessions,
  issueBoundSession,
} from "./session-authority-test-fixtures";

const databaseUrl = process.env.DATABASE_URL?.trim();
const redisUrl = process.env.REDIS_URL?.trim();
const databaseConfigured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
const redisConfigured = Boolean(redisUrl && !redisUrl.includes("CHANGE_ME"));
const integrationConfigured = databaseConfigured && redisConfigured;

const originalRateLimitEnv = {
  upstashUrl: process.env.UPSTASH_REDIS_REST_URL,
  upstashToken: process.env.UPSTASH_REDIS_REST_TOKEN,
  redisRestUrl: process.env.REDIS_REST_URL,
  redisRestToken: process.env.REDIS_REST_TOKEN,
};

let redis: Redis | null = null;

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function denyKey(jti: string): string {
  return `tecpey:revoked:jti:${jti}`;
}

function request(accessToken: string): NextRequest {
  return new NextRequest("https://tecpey.ir/api/auth/sessions/device", {
    method: "DELETE",
    headers: {
      origin: "https://tecpey.ir",
      cookie: `${UNIFIED_SESSION_COOKIE}=${accessToken}`,
      "user-agent": "tecpey-device-revoke-test",
      "x-forwarded-for": "127.0.0.1",
    },
  });
}

before(async () => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.REDIS_REST_URL;
  delete process.env.REDIS_REST_TOKEN;

  if (!integrationConfigured || !redisUrl) return;
  redis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
  });
  await redis.connect();
  await redis.ping();
  globalThis.tecpeyRedisClient = redis;
});

after(async () => {
  if (redis) {
    if (globalThis.tecpeyRedisClient === redis) {
      globalThis.tecpeyRedisClient = undefined;
    }
    await redis.quit();
    redis = null;
  }
  restoreEnv("UPSTASH_REDIS_REST_URL", originalRateLimitEnv.upstashUrl);
  restoreEnv("UPSTASH_REDIS_REST_TOKEN", originalRateLimitEnv.upstashToken);
  restoreEnv("REDIS_REST_URL", originalRateLimitEnv.redisRestUrl);
  restoreEnv("REDIS_REST_TOKEN", originalRateLimitEnv.redisRestToken);
});

describe("Specific device session revocation", () => {
  it(
    "revokes only the selected access session and its bound refresh family",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const userId = `device-revoke-owner-${randomUUID()}`;
      const current = await issueBoundSession({
        userId,
        deviceInfo: "current-device",
        ip: "127.0.0.1",
      });
      const target = await issueBoundSession({
        userId,
        deviceInfo: "target-device",
        ip: "127.0.0.2",
      });

      try {
        const response = await revokeDeviceSession(request(current.accessToken), {
          params: Promise.resolve({ id: target.accessJti }),
        });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
          ok: true,
          revoked: true,
          revokedCount: 1,
          refreshFamilyRevoked: true,
          revocationPending: false,
        });

        const evidence = await withDb(async (client) => {
          const access = await client.query<{
            id: string;
            is_revoked: boolean;
          }>(
            "SELECT id, is_revoked FROM user_sessions WHERE user_id = $1",
            [userId],
          );
          const families = await client.query<{ id: string; status: string }>(
            "SELECT id, status FROM refresh_token_families WHERE user_id = $1",
            [userId],
          );
          const refresh = await client.query<{
            family_id: string;
            active: string;
          }>(
            `SELECT family_id, COUNT(*) FILTER (WHERE is_revoked = FALSE)::text AS active
               FROM refresh_tokens
              WHERE user_id = $1
              GROUP BY family_id`,
            [userId],
          );
          return {
            access: new Map<string, boolean>(
              access.rows.map((row) => [row.id, row.is_revoked] as const),
            ),
            families: new Map(
              families.rows.map((row) => [row.id, row.status] as const),
            ),
            refresh: new Map(
              refresh.rows.map((row) => [row.family_id, Number(row.active)] as const),
            ),
          };
        });
        assert.equal(evidence.enabled, true);
        if (evidence.enabled) {
          assert.equal(evidence.value.access.get(current.accessJti), false);
          assert.equal(evidence.value.access.get(target.accessJti), true);
          assert.equal(evidence.value.families.get(current.familyId), "active");
          assert.equal(evidence.value.families.get(target.familyId), "revoked");
          assert.equal(evidence.value.refresh.get(current.familyId), 1);
          assert.equal(evidence.value.refresh.get(target.familyId), 0);
        }

        assert.equal(await redis!.get(denyKey(target.accessJti)), "1");
        assert.equal(await redis!.get(denyKey(current.accessJti)), null);
        const currentSession = await getCanonicalSession(request(current.accessToken), {
          strictRevocation: true,
        });
        assert.equal(currentSession.academyAccountId, userId);
        const targetSession = await getCanonicalSession(request(target.accessToken), {
          strictRevocation: true,
        });
        assert.equal(targetSession.role, "guest");
        assert.equal((await verifyRefreshToken(current.refreshToken)).ok, true);
        assert.equal((await verifyRefreshToken(target.refreshToken)).ok, false);
      } finally {
        await cleanupBoundSessions({
          userId,
          accessJtis: [current.accessJti, target.accessJti],
          redis,
        });
      }
    },
  );

  it(
    "does not revoke refresh authority when the requested session does not belong to the principal",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const userId = `device-not-found-${randomUUID()}`;
      const current = await issueBoundSession({
        userId,
        deviceInfo: "current-device",
        ip: "127.0.0.1",
      });

      try {
        const response = await revokeDeviceSession(request(current.accessToken), {
          params: Promise.resolve({ id: randomUUID() }),
        });
        assert.equal(response.status, 404);
        assert.deepEqual(await response.json(), {
          ok: false,
          error: "not_found",
        });
        assert.equal((await verifyRefreshToken(current.refreshToken)).ok, true);
      } finally {
        await cleanupBoundSessions({
          userId,
          accessJtis: [current.accessJti],
          redis,
        });
      }
    },
  );
});
