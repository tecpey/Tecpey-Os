import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Redis } from "ioredis";
import { NextRequest } from "next/server";
import { DELETE as logoutAll } from "../../app/api/auth/sessions/route";
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
  return new NextRequest("https://tecpey.ir/api/auth/sessions", {
    method: "DELETE",
    headers: {
      origin: "https://tecpey.ir",
      cookie: `${UNIFIED_SESSION_COOKIE}=${accessToken}`,
      "user-agent": "tecpey-auth-sessions-route-test",
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
    displayName: "Sessions Test",
    username: `sessions-${randomUUID()}`,
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
  if (redis && jtis.length > 0) {
    await redis.del(...jtis.map(denyKey));
  }
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

describe("Logout-all session authority", () => {
  it(
    "revokes every other access session and all refresh tokens while retaining the current short-lived access token",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const userId = `logout-all-owner-${randomUUID()}`;
      const current = await issueAccessSession(userId, "current-device");
      const other = await issueAccessSession(userId, "other-device");
      const firstRefresh = await issueRefreshToken({
        userId,
        familyId: randomUUID(),
        deviceInfo: "current-device",
        ip: "127.0.0.1",
      });
      const secondRefresh = await issueRefreshToken({
        userId,
        familyId: randomUUID(),
        deviceInfo: "other-device",
        ip: "127.0.0.2",
      });
      assert.ok(firstRefresh);
      assert.ok(secondRefresh);

      try {
        const currentRequest = request(current.accessToken);
        const response = await logoutAll(currentRequest);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
          ok: true,
          revokedCount: 1,
          currentAccessRetained: true,
          refreshRevoked: true,
        });

        const evidence = await withDb(async (client) => {
          const access = await client.query<{
            id: string;
            is_revoked: boolean;
          }>(
            `SELECT id, is_revoked
               FROM user_sessions
              WHERE user_id = $1`,
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
            access: new Map(access.rows.map((row) => [row.id, row.is_revoked])),
            activeRefreshTokens: Number(refresh.rows[0]?.active ?? "0"),
          };
        });
        assert.equal(evidence.enabled, true);
        if (evidence.enabled) {
          assert.equal(evidence.value.access.get(current.jti), false);
          assert.equal(evidence.value.access.get(other.jti), true);
          assert.equal(evidence.value.activeRefreshTokens, 0);
        }

        assert.equal(await redis!.get(denyKey(current.jti)), null);
        assert.equal(await redis!.get(denyKey(other.jti)), "1");

        const currentSession = await getCanonicalSession(currentRequest, {
          strictRevocation: true,
        });
        assert.equal(currentSession.academyAccountId, userId);

        const otherSession = await getCanonicalSession(request(other.accessToken), {
          strictRevocation: true,
        });
        assert.equal(otherSession.role, "guest");

        assert.equal((await verifyRefreshToken(firstRefresh)).ok, false);
        assert.equal((await verifyRefreshToken(secondRefresh)).ok, false);
      } finally {
        await cleanup(userId, [current.jti, other.jti]);
      }
    },
  );

  it(
    "returns 503 on Redis pipeline failure and repairs deny evidence on retry",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const userId = `logout-all-retry-${randomUUID()}`;
      const current = await issueAccessSession(userId, "current-device");
      const other = await issueAccessSession(userId, "other-device");
      const refreshToken = await issueRefreshToken({
        userId,
        familyId: randomUUID(),
        deviceInfo: "other-device",
        ip: "127.0.0.2",
      });
      assert.ok(refreshToken);
      const originalRedis = globalThis.tecpeyRedisClient;

      const failingPipelineRedis = {
        get: (key: string) => redis!.get(key),
        pipeline: () => ({
          set: () => undefined,
          exec: async () => {
            throw new Error("redis_pipeline_unavailable");
          },
        }),
      };

      try {
        globalThis.tecpeyRedisClient =
          failingPipelineRedis as unknown as typeof originalRedis;
        const failed = await logoutAll(request(current.accessToken));
        assert.equal(failed.status, 503);
        const failedBody = await failed.json();
        assert.equal(failedBody.ok, false);
        assert.equal(failedBody.error, "session_revocation_unavailable");
        assert.equal(
          failedBody.details?.accessReason,
          "revocation_store_unavailable",
        );
        assert.equal(failedBody.details?.revokedCount, 1);
        assert.equal(failedBody.details?.refreshRevoked, true);

        const durable = await withDb(async (client) => {
          const access = await client.query<{ is_revoked: boolean }>(
            "SELECT is_revoked FROM user_sessions WHERE id = $1",
            [other.jti],
          );
          const refresh = await client.query<{ is_revoked: boolean }>(
            "SELECT is_revoked FROM refresh_tokens WHERE user_id = $1 LIMIT 1",
            [userId],
          );
          return {
            accessRevoked: access.rows[0]?.is_revoked ?? false,
            refreshRevoked: refresh.rows[0]?.is_revoked ?? false,
          };
        });
        assert.equal(durable.enabled, true);
        if (durable.enabled) {
          assert.equal(durable.value.accessRevoked, true);
          assert.equal(durable.value.refreshRevoked, true);
        }
        assert.equal(await redis!.get(denyKey(other.jti)), null);

        globalThis.tecpeyRedisClient = originalRedis;
        const repaired = await logoutAll(request(current.accessToken));
        assert.equal(repaired.status, 200);
        assert.deepEqual(await repaired.json(), {
          ok: true,
          revokedCount: 0,
          currentAccessRetained: true,
          refreshRevoked: true,
        });
        assert.equal(await redis!.get(denyKey(other.jti)), "1");
        assert.equal((await verifyRefreshToken(refreshToken)).ok, false);
      } finally {
        globalThis.tecpeyRedisClient = originalRedis;
        await cleanup(userId, [current.jti, other.jti]);
      }
    },
  );

  it("reports database unavailability instead of false empty or zero-success results", () => {
    const script = `
      const module = await import("./src/lib/security/session-store.ts");
      const api = module.default ?? module;
      const listActiveSessionsStrict = module.listActiveSessionsStrict ?? api.listActiveSessionsStrict;
      const revokeAllSessionsStrict = module.revokeAllSessionsStrict ?? api.revokeAllSessionsStrict;
      if (typeof listActiveSessionsStrict !== "function" || typeof revokeAllSessionsStrict !== "function") {
        throw new TypeError("session authority exports unavailable");
      }
      const listed = await listActiveSessionsStrict("db-unavailable-user");
      const revoked = await revokeAllSessionsStrict("db-unavailable-user");
      console.log("AUTH_RESULT=" + JSON.stringify({ listed, revoked }));
    `;
    const child = spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", script],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: "test",
          DATABASE_URL: "",
        },
        encoding: "utf8",
        timeout: 30_000,
      },
    );

    assert.equal(child.status, 0, child.stderr);
    const resultLine = child.stdout
      .split(/\r?\n/)
      .find((line) => line.startsWith("AUTH_RESULT="));
    assert.ok(resultLine, child.stdout);
    assert.deepEqual(JSON.parse(resultLine.slice("AUTH_RESULT=".length)), {
      listed: { ok: false, reason: "database_unavailable" },
      revoked: {
        ok: false,
        reason: "database_unavailable",
        revokedCount: 0,
      },
    });
  });
});
