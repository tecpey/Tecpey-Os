import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Redis } from "ioredis";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";
import { DELETE as logout } from "../../app/api/academy-auth/route";
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

let redis: Redis | null = null;

function denyKey(jti: string): string {
  return `tecpey:revoked:jti:${jti}`;
}

function logoutRequest(accessToken: string, origin = "https://tecpey.ir"): NextRequest {
  return new NextRequest("https://tecpey.ir/api/academy-auth", {
    method: "DELETE",
    headers: {
      origin,
      cookie: `${UNIFIED_SESSION_COOKIE}=${accessToken}`,
      "user-agent": "tecpey-auth-route-test",
    },
  });
}

async function issueAccessSession(userId: string): Promise<{
  accessToken: string;
  jti: string;
}> {
  const accessToken = await signUnifiedSession({
    accountId: userId,
    studentId: null,
    email: `${userId}@tecpey.invalid`,
    displayName: "Authentication Test",
    username: `auth-${randomUUID()}`,
  });
  const jti = extractJtiFromToken(accessToken);
  const exp = extractExpFromToken(accessToken);
  assert.ok(jti);
  assert.ok(exp);
  assert.equal(
    await registerSession({
      jti,
      userId,
      deviceInfo: "tecpey-auth-route-test",
      ip: "127.0.0.1",
      expiresAt: new Date(exp * 1000),
    }),
    true,
  );
  return { accessToken, jti };
}

async function cleanup(userId: string, jti: string): Promise<void> {
  const deleted = await withDb(async (client) => {
    await client.query("DELETE FROM refresh_tokens WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM user_sessions WHERE id = $1", [jti]);
    return true;
  });
  assert.equal(deleted.enabled, true);
  if (redis) await redis.del(denyKey(jti));
}

before(async () => {
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
  if (!redis) return;
  if (globalThis.tecpeyRedisClient === redis) {
    globalThis.tecpeyRedisClient = undefined;
  }
  await redis.quit();
  redis = null;
});

describe("Academy logout route authority", () => {
  it(
    "rejects cross-origin logout without revoking the authenticated session",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const userId = `csrf-owner-${randomUUID()}`;
      const { accessToken, jti } = await issueAccessSession(userId);

      try {
        const response = await logout(
          logoutRequest(accessToken, "https://attacker.example"),
        );
        assert.equal(response.status, 403);
        assert.deepEqual(await response.json(), {
          ok: false,
          error: "forbidden",
        });

        const evidence = await withDb(async (client) => {
          const result = await client.query<{ is_revoked: boolean }>(
            "SELECT is_revoked FROM user_sessions WHERE id = $1",
            [jti],
          );
          return result.rows[0]?.is_revoked ?? null;
        });
        assert.equal(evidence.enabled, true);
        if (evidence.enabled) assert.equal(evidence.value, false);
      } finally {
        await cleanup(userId, jti);
      }
    },
  );

  it("rejects a forged unified session before reading its identity", async () => {
    const wrongSecret = new TextEncoder().encode(
      "wrong-session-secret-with-at-least-32-characters",
    );
    const forged = await new SignJWT({
      role: "unified",
      v: 1,
      accountId: "forged-account",
      studentId: null,
      email: "forged@tecpey.invalid",
      displayName: "Forged",
      username: "forged",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("forged-account")
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(wrongSecret);

    const response = await logout(logoutRequest(forged));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: "invalid_session",
    });
  });

  it(
    "revokes the exact access session and all durable refresh authority before success",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const userId = `logout-owner-${randomUUID()}`;
      const { accessToken, jti } = await issueAccessSession(userId);
      const refreshToken = await issueRefreshToken({
        userId,
        familyId: randomUUID(),
        deviceInfo: "tecpey-auth-route-test",
        ip: "127.0.0.1",
      });
      assert.ok(refreshToken);

      try {
        const request = logoutRequest(accessToken);
        const response = await logout(request);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
          ok: true,
          revoked: true,
        });
        const setCookie = response.headers.get("set-cookie") ?? "";
        assert.match(setCookie, new RegExp(`${UNIFIED_SESSION_COOKIE}=`));
        assert.match(setCookie, /tecpey_refresh=/);

        const evidence = await withDb(async (client) => {
          const access = await client.query<{ is_revoked: boolean }>(
            "SELECT is_revoked FROM user_sessions WHERE id = $1",
            [jti],
          );
          const refresh = await client.query<{ active: string }>(
            `SELECT COUNT(*)::text AS active
               FROM refresh_tokens
              WHERE user_id = $1
                AND is_revoked = FALSE`,
            [userId],
          );
          return {
            accessRevoked: access.rows[0]?.is_revoked ?? false,
            activeRefreshTokens: Number(refresh.rows[0]?.active ?? "0"),
          };
        });
        assert.equal(evidence.enabled, true);
        if (evidence.enabled) {
          assert.equal(evidence.value.accessRevoked, true);
          assert.equal(evidence.value.activeRefreshTokens, 0);
        }

        const oldAccess = await getCanonicalSession(request, {
          strictRevocation: true,
        });
        assert.equal(oldAccess.role, "guest");
        assert.equal(oldAccess.academyAccountId, null);

        const oldRefresh = await verifyRefreshToken(refreshToken);
        assert.equal(oldRefresh.ok, false);
      } finally {
        await cleanup(userId, jti);
      }
    },
  );

  it(
    "returns 503 during a Redis outage and a retry repairs deny evidence without false session_not_found",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const userId = `redis-outage-owner-${randomUUID()}`;
      const { accessToken, jti } = await issueAccessSession(userId);
      const previousRedis = globalThis.tecpeyRedisClient;

      try {
        globalThis.tecpeyRedisClient = undefined;
        const failed = await logout(logoutRequest(accessToken));
        assert.equal(failed.status, 503);
        const failedBody = await failed.json();
        assert.equal(failedBody.ok, false);
        assert.equal(failedBody.error, "logout_revocation_unavailable");
        assert.equal(
          failedBody.details?.accessReason,
          "revocation_store_unavailable",
        );

        const evidence = await withDb(async (client) => {
          const result = await client.query<{ is_revoked: boolean }>(
            "SELECT is_revoked FROM user_sessions WHERE id = $1",
            [jti],
          );
          return result.rows[0]?.is_revoked ?? false;
        });
        assert.equal(evidence.enabled, true);
        if (evidence.enabled) assert.equal(evidence.value, true);

        globalThis.tecpeyRedisClient = previousRedis;
        const repaired = await logout(logoutRequest(accessToken));
        assert.equal(repaired.status, 200);
        assert.deepEqual(await repaired.json(), {
          ok: true,
          revoked: true,
        });
        assert.equal(await redis!.get(denyKey(jti)), "1");
      } finally {
        globalThis.tecpeyRedisClient = previousRedis;
        await cleanup(userId, jti);
      }
    },
  );
});
