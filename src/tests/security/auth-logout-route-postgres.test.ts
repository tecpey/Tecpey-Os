import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Redis } from "ioredis";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";
import { DELETE as logout } from "../../app/api/academy-auth/route";
import { getCanonicalSession } from "../../lib/auth-session";
import { withDb } from "../../lib/db";
import { verifyRefreshToken } from "../../lib/security/refresh-tokens";
import { publishPendingSessionRevocations } from "../../lib/security/session-authority";
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
      const session = await issueBoundSession({
        userId,
        deviceInfo: "tecpey-auth-route-test",
        ip: "127.0.0.1",
      });

      try {
        const response = await logout(
          logoutRequest(session.accessToken, "https://attacker.example"),
        );
        assert.equal(response.status, 403);
        assert.deepEqual(await response.json(), {
          ok: false,
          error: "forbidden",
        });

        const evidence = await withDb(async (client) => {
          const result = await client.query<{ is_revoked: boolean }>(
            "SELECT is_revoked FROM user_sessions WHERE id = $1",
            [session.accessJti],
          );
          return result.rows[0]?.is_revoked ?? null;
        });
        assert.equal(evidence.enabled, true);
        if (evidence.enabled) assert.equal(evidence.value, false);
      } finally {
        await cleanupBoundSessions({
          userId,
          accessJtis: [session.accessJti],
          redis,
        });
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
    "revokes the exact access session and its bound refresh family before success",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const userId = `logout-owner-${randomUUID()}`;
      const session = await issueBoundSession({
        userId,
        deviceInfo: "tecpey-auth-route-test",
        ip: "127.0.0.1",
      });

      try {
        const request = logoutRequest(session.accessToken);
        const response = await logout(request);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
          ok: true,
          revoked: true,
          revokedCount: 1,
          revocationPending: false,
        });
        const setCookie = response.headers.get("set-cookie") ?? "";
        assert.match(setCookie, new RegExp(`${UNIFIED_SESSION_COOKIE}=`));
        assert.match(setCookie, /tecpey_refresh=/);

        const evidence = await withDb(async (client) => {
          const access = await client.query<{ is_revoked: boolean }>(
            "SELECT is_revoked FROM user_sessions WHERE id = $1",
            [session.accessJti],
          );
          const family = await client.query<{ status: string }>(
            "SELECT status FROM refresh_token_families WHERE id = $1",
            [session.familyId],
          );
          const refresh = await client.query<{ active: string }>(
            `SELECT COUNT(*)::text AS active
               FROM refresh_tokens
              WHERE family_id = $1
                AND is_revoked = FALSE`,
            [session.familyId],
          );
          return {
            accessRevoked: access.rows[0]?.is_revoked ?? false,
            familyStatus: family.rows[0]?.status,
            activeRefreshTokens: Number(refresh.rows[0]?.active ?? "0"),
          };
        });
        assert.equal(evidence.enabled, true);
        if (evidence.enabled) {
          assert.equal(evidence.value.accessRevoked, true);
          assert.equal(evidence.value.familyStatus, "revoked");
          assert.equal(evidence.value.activeRefreshTokens, 0);
        }

        const oldAccess = await getCanonicalSession(request, {
          strictRevocation: true,
        });
        assert.equal(oldAccess.role, "guest");
        assert.equal(oldAccess.academyAccountId, null);
        assert.equal((await verifyRefreshToken(session.refreshToken)).ok, false);
      } finally {
        await cleanupBoundSessions({
          userId,
          accessJtis: [session.accessJti],
          redis,
        });
      }
    },
  );

  it(
    "returns durable success when deny publication fails and repairs evidence through the outbox authority",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const userId = `redis-outage-owner-${randomUUID()}`;
      const session = await issueBoundSession({
        userId,
        deviceInfo: "tecpey-auth-route-test",
        ip: "127.0.0.1",
      });
      const previousRedis = globalThis.tecpeyRedisClient;
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
          failingPipelineRedis as unknown as typeof previousRedis;
        const committed = await logout(logoutRequest(session.accessToken));
        assert.equal(committed.status, 200);
        assert.deepEqual(await committed.json(), {
          ok: true,
          revoked: true,
          revokedCount: 1,
          revocationPending: true,
        });

        const evidence = await withDb(async (client) => {
          const access = await client.query<{ is_revoked: boolean }>(
            "SELECT is_revoked FROM user_sessions WHERE id = $1",
            [session.accessJti],
          );
          const outbox = await client.query<{ status: string }>(
            "SELECT status FROM session_revocation_outbox WHERE session_jti = $1",
            [session.accessJti],
          );
          return {
            accessRevoked: access.rows[0]?.is_revoked ?? false,
            outboxStatus: outbox.rows[0]?.status,
          };
        });
        assert.equal(evidence.enabled, true);
        if (evidence.enabled) {
          assert.equal(evidence.value.accessRevoked, true);
          assert.equal(evidence.value.outboxStatus, "pending");
        }

        globalThis.tecpeyRedisClient = previousRedis;
        assert.equal(await publishPendingSessionRevocations(), true);
        assert.equal(await redis!.get(denyKey(session.accessJti)), "1");

        const replay = await logout(logoutRequest(session.accessToken));
        assert.equal(replay.status, 401);
        assert.deepEqual(await replay.json(), {
          ok: false,
          error: "invalid_session",
        });
      } finally {
        globalThis.tecpeyRedisClient = previousRedis;
        await cleanupBoundSessions({
          userId,
          accessJtis: [session.accessJti],
          redis,
        });
      }
    },
  );
});
