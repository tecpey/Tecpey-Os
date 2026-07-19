import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Redis } from "ioredis";
import { NextRequest } from "next/server";
import { DELETE as revokeDeviceSession } from "../../app/api/auth/sessions/[id]/route";
import { getCanonicalSession } from "../../lib/auth-session";
import { withDb } from "../../lib/db";
import {
  issueRefreshToken,
  verifyRefreshToken,
} from "../../lib/security/refresh-tokens";
import { registerSession } from "../../lib/security/session-store";
import {
  extractExpFromToken,
  extractJtiFromToken,
  signUnifiedSession,
  UNIFIED_SESSION_COOKIE,
} from "../../lib/unified-session";

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

async function issueAccessSession(userId: string, deviceInfo: string): Promise<{
  accessToken: string;
  jti: string;
}> {
  const accessToken = await signUnifiedSession({
    accountId: userId,
    studentId: null,
    email: `${userId}@tecpey.invalid`,
    displayName: "Device Revoke Test",
    username: `device-${randomUUID()}`,
  });
  const jti = extractJtiFromToken(accessToken);
  const exp = extractExpFromToken(accessToken);
  assert.ok(jti);
  assert.ok(exp);
  assert.equal(
    await registerSession({
      jti,
      userId,
      deviceInfo,
      ip: "127.0.0.1",
      expiresAt: new Date(exp * 1000),
    }),
    true,
  );
  return { accessToken, jti };
}

async function cleanup(userId: string, jtis: string[]): Promise<void> {
  const deleted = await withDb(async (client) => {
    await client.query("DELETE FROM refresh_tokens WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM user_sessions WHERE user_id = $1", [userId]);
    return true;
  });
  assert.equal(deleted.enabled, true);
  if (redis && jtis.length > 0) await redis.del(...jtis.map(denyKey));
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
    "revokes the selected access session and all refresh authority so the device cannot mint a replacement",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const userId = `device-revoke-owner-${randomUUID()}`;
      const current = await issueAccessSession(userId, "current-device");
      const target = await issueAccessSession(userId, "target-device");
      const currentRefresh = await issueRefreshToken({
        userId,
        familyId: randomUUID(),
        deviceInfo: "current-device",
        ip: "127.0.0.1",
      });
      const targetRefresh = await issueRefreshToken({
        userId,
        familyId: randomUUID(),
        deviceInfo: "target-device",
        ip: "127.0.0.2",
      });
      assert.ok(currentRefresh);
      assert.ok(targetRefresh);

      try {
        const response = await revokeDeviceSession(request(current.accessToken), {
          params: Promise.resolve({ id: target.jti }),
        });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
          ok: true,
          revoked: true,
          refreshRevoked: true,
          refreshScope: "all_user_tokens",
        });

        const evidence = await withDb(async (client) => {
          const access = await client.query<{
            id: string;
            is_revoked: boolean;
          }>(
            "SELECT id, is_revoked FROM user_sessions WHERE user_id = $1",
            [userId],
          );
          const refresh = await client.query<{ active: string }>(
            `SELECT COUNT(*)::text AS active
               FROM refresh_tokens
              WHERE user_id = $1
                AND is_revoked = FALSE`,
            [userId],
          );
          return {
            access: new Map<string, boolean>(
              access.rows.map((row) => [row.id, row.is_revoked] as const),
            ),
            activeRefreshTokens: Number(refresh.rows[0]?.active ?? "0"),
          };
        });
        assert.equal(evidence.enabled, true);
        if (evidence.enabled) {
          assert.equal(evidence.value.access.get(current.jti), false);
          assert.equal(evidence.value.access.get(target.jti), true);
          assert.equal(evidence.value.activeRefreshTokens, 0);
        }

        assert.equal(await redis!.get(denyKey(target.jti)), "1");
        const currentSession = await getCanonicalSession(request(current.accessToken), {
          strictRevocation: true,
        });
        assert.equal(currentSession.academyAccountId, userId);
        const targetSession = await getCanonicalSession(request(target.accessToken), {
          strictRevocation: true,
        });
        assert.equal(targetSession.role, "guest");
        assert.equal((await verifyRefreshToken(currentRefresh)).ok, false);
        assert.equal((await verifyRefreshToken(targetRefresh)).ok, false);
      } finally {
        await cleanup(userId, [current.jti, target.jti]);
      }
    },
  );

  it(
    "does not revoke refresh authority when the requested session does not belong to the principal",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const userId = `device-not-found-${randomUUID()}`;
      const current = await issueAccessSession(userId, "current-device");
      const refreshToken = await issueRefreshToken({
        userId,
        familyId: randomUUID(),
        deviceInfo: "current-device",
        ip: "127.0.0.1",
      });
      assert.ok(refreshToken);

      try {
        const response = await revokeDeviceSession(request(current.accessToken), {
          params: Promise.resolve({ id: randomUUID() }),
        });
        assert.equal(response.status, 404);
        assert.deepEqual(await response.json(), {
          ok: false,
          error: "not_found",
        });
        assert.equal((await verifyRefreshToken(refreshToken)).ok, true);
      } finally {
        await cleanup(userId, [current.jti]);
      }
    },
  );
});
