import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Redis } from "ioredis";
import { NextRequest } from "next/server";
import { DELETE as logoutAll } from "../../app/api/auth/sessions/route";
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
    "revokes every other session family while retaining the current access and refresh family",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const userId = `logout-all-owner-${randomUUID()}`;
      const current = await issueBoundSession({
        userId,
        deviceInfo: "current-device",
        ip: "127.0.0.1",
      });
      const other = await issueBoundSession({
        userId,
        deviceInfo: "other-device",
        ip: "127.0.0.2",
      });

      try {
        const currentRequest = request(current.accessToken);
        const response = await logoutAll(currentRequest);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
          ok: true,
          revokedCount: 1,
          currentAccessRetained: true,
          currentRefreshFamilyRetained: true,
          revocationPending: false,
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
            access: new Map(access.rows.map((row) => [row.id, row.is_revoked])),
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
          assert.equal(evidence.value.access.get(other.accessJti), true);
          assert.equal(evidence.value.families.get(current.familyId), "active");
          assert.equal(evidence.value.families.get(other.familyId), "revoked");
          assert.equal(evidence.value.refresh.get(current.familyId), 1);
          assert.equal(evidence.value.refresh.get(other.familyId), 0);
        }

        assert.equal(await redis!.get(denyKey(current.accessJti)), null);
        assert.equal(await redis!.get(denyKey(other.accessJti)), "1");

        const currentSession = await getCanonicalSession(currentRequest, {
          strictRevocation: true,
        });
        assert.equal(currentSession.academyAccountId, userId);

        const otherSession = await getCanonicalSession(request(other.accessToken), {
          strictRevocation: true,
        });
        assert.equal(otherSession.role, "guest");

        assert.equal((await verifyRefreshToken(current.refreshToken)).ok, true);
        assert.equal((await verifyRefreshToken(other.refreshToken)).ok, false);
      } finally {
        await cleanupBoundSessions({
          userId,
          accessJtis: [current.accessJti, other.accessJti],
          redis,
        });
      }
    },
  );

  it(
    "returns durable success on Redis pipeline failure and repairs deny evidence on retry",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const userId = `logout-all-retry-${randomUUID()}`;
      const current = await issueBoundSession({
        userId,
        deviceInfo: "current-device",
        ip: "127.0.0.1",
      });
      const other = await issueBoundSession({
        userId,
        deviceInfo: "other-device",
        ip: "127.0.0.2",
      });
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
        const committed = await logoutAll(request(current.accessToken));
        assert.equal(committed.status, 200);
        assert.deepEqual(await committed.json(), {
          ok: true,
          revokedCount: 1,
          currentAccessRetained: true,
          currentRefreshFamilyRetained: true,
          revocationPending: true,
        });

        const durable = await withDb(async (client) => {
          const access = await client.query<{ is_revoked: boolean }>(
            "SELECT is_revoked FROM user_sessions WHERE id = $1",
            [other.accessJti],
          );
          const currentFamily = await client.query<{ status: string }>(
            "SELECT status FROM refresh_token_families WHERE id = $1",
            [current.familyId],
          );
          const otherFamily = await client.query<{ status: string }>(
            "SELECT status FROM refresh_token_families WHERE id = $1",
            [other.familyId],
          );
          const outbox = await client.query<{ status: string }>(
            "SELECT status FROM session_revocation_outbox WHERE session_jti = $1",
            [other.accessJti],
          );
          return {
            accessRevoked: access.rows[0]?.is_revoked ?? false,
            currentFamilyStatus: currentFamily.rows[0]?.status,
            otherFamilyStatus: otherFamily.rows[0]?.status,
            outboxStatus: outbox.rows[0]?.status,
          };
        });
        assert.equal(durable.enabled, true);
        if (durable.enabled) {
          assert.equal(durable.value.accessRevoked, true);
          assert.equal(durable.value.currentFamilyStatus, "active");
          assert.equal(durable.value.otherFamilyStatus, "revoked");
          assert.equal(
            ["pending", "published"].includes(durable.value.outboxStatus ?? ""),
            true,
          );
          const denyValue = await redis!.get(denyKey(other.accessJti));
          if (durable.value.outboxStatus === "pending") {
            assert.equal(denyValue, null);
          } else {
            assert.equal(durable.value.outboxStatus, "published");
            assert.equal(denyValue, "1");
          }
        }

        globalThis.tecpeyRedisClient = originalRedis;
        const repaired = await logoutAll(request(current.accessToken));
        assert.equal(repaired.status, 200);
        assert.deepEqual(await repaired.json(), {
          ok: true,
          revokedCount: 0,
          currentAccessRetained: true,
          currentRefreshFamilyRetained: true,
          revocationPending: false,
        });
        assert.equal(await redis!.get(denyKey(other.accessJti)), "1");
        assert.equal((await verifyRefreshToken(current.refreshToken)).ok, true);
        assert.equal((await verifyRefreshToken(other.refreshToken)).ok, false);
      } finally {
        globalThis.tecpeyRedisClient = originalRedis;
        await cleanupBoundSessions({
          userId,
          accessJtis: [current.accessJti, other.accessJti],
          redis,
        });
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
