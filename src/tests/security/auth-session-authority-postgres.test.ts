import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Redis } from "ioredis";
import { NextRequest } from "next/server";
import { getCanonicalSession } from "../../lib/auth-session";
import { withDb } from "../../lib/db";
import { isJtiRevoked, isJtiRevokedStrict } from "../../lib/security/jti-store";
import {
  registerSession,
  revokeSessionStrict,
} from "../../lib/security/session-store";
import {
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

async function deleteSessionEvidence(jti: string): Promise<void> {
  const deleted = await withDb(async (client) => {
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

describe("Authentication session PostgreSQL and Redis authority", () => {
  it(
    "rejects duplicate JTI registration instead of treating a conflict as durable success",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const jti = randomUUID();
      const firstUserId = `session-owner-${randomUUID()}`;
      const secondUserId = `session-attacker-${randomUUID()}`;

      try {
        assert.equal(
          await registerSession({
            jti,
            userId: firstUserId,
            deviceInfo: "first-device",
            ip: "127.0.0.1",
            expiresAt: new Date(Date.now() + 60_000),
          }),
          true,
        );
        assert.equal(
          await registerSession({
            jti,
            userId: secondUserId,
            deviceInfo: "second-device",
            ip: "127.0.0.2",
            expiresAt: new Date(Date.now() + 120_000),
          }),
          false,
        );

        const evidence = await withDb(async (client) => {
          const result = await client.query<{ user_id: string }>(
            "SELECT user_id FROM user_sessions WHERE id = $1",
            [jti],
          );
          return result.rows[0] ?? null;
        });
        assert.equal(evidence.enabled, true);
        if (evidence.enabled) assert.equal(evidence.value?.user_id, firstUserId);
      } finally {
        await deleteSessionEvidence(jti);
      }
    },
  );

  it(
    "binds revocation to the exact owner and writes Redis deny evidence",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const jti = randomUUID();
      const userId = `session-owner-${randomUUID()}`;
      const wrongUserId = `wrong-owner-${randomUUID()}`;

      try {
        await redis!.del(denyKey(jti));
        assert.equal(
          await registerSession({
            jti,
            userId,
            deviceInfo: "owner-device",
            ip: "127.0.0.1",
            expiresAt: new Date(Date.now() + 60_000),
          }),
          true,
        );

        assert.deepEqual(await revokeSessionStrict(jti, wrongUserId), {
          ok: false,
          reason: "session_not_found",
        });
        assert.equal(await isJtiRevokedStrict(jti), false);

        assert.deepEqual(await revokeSessionStrict(jti, userId), { ok: true });
        assert.equal(await redis!.get(denyKey(jti)), "1");
        assert.equal(await isJtiRevokedStrict(jti), true);
      } finally {
        await deleteSessionEvidence(jti);
      }
    },
  );

  it(
    "returns an explicit failure when Redis deny persistence is unavailable while preserving durable revocation",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const jti = randomUUID();
      const userId = `session-owner-${randomUUID()}`;
      const previousRedis = globalThis.tecpeyRedisClient;

      try {
        assert.equal(
          await registerSession({
            jti,
            userId,
            deviceInfo: "offline-redis-device",
            ip: "127.0.0.1",
            expiresAt: new Date(Date.now() + 60_000),
          }),
          true,
        );

        globalThis.tecpeyRedisClient = undefined;
        assert.deepEqual(await revokeSessionStrict(jti, userId), {
          ok: false,
          reason: "revocation_store_unavailable",
        });
        assert.equal(await isJtiRevoked(jti), true);

        const evidence = await withDb(async (client) => {
          const result = await client.query<{ is_revoked: boolean }>(
            "SELECT is_revoked FROM user_sessions WHERE id = $1",
            [jti],
          );
          return result.rows[0]?.is_revoked ?? false;
        });
        assert.equal(evidence.enabled, true);
        if (evidence.enabled) assert.equal(evidence.value, true);
      } finally {
        globalThis.tecpeyRedisClient = previousRedis;
        await deleteSessionEvidence(jti);
      }
    },
  );

  it(
    "does not let a prior non-strict allow bypass a later strict revocation check",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const accountId = `academy-account-${randomUUID()}`;
      const accessToken = await signUnifiedSession({
        accountId,
        studentId: null,
        email: "security-test@tecpey.invalid",
        displayName: "Security Test",
        username: `security-${randomUUID()}`,
      });
      const jti = extractJtiFromToken(accessToken);
      assert.ok(jti);

      try {
        await redis!.del(denyKey(jti));
        assert.equal(
          await registerSession({
            jti,
            userId: accountId,
            deviceInfo: "cache-test-device",
            ip: "127.0.0.1",
            expiresAt: new Date(Date.now() + 60_000),
          }),
          true,
        );

        const request = new NextRequest("https://tecpey.ir/api/security-test", {
          headers: {
            cookie: `${UNIFIED_SESSION_COOKIE}=${accessToken}`,
          },
        });
        const ordinary = await getCanonicalSession(request);
        assert.equal(ordinary.academyAccountId, accountId);

        const revoked = await withDb(async (client) => {
          await client.query(
            `UPDATE user_sessions
                SET is_revoked = TRUE,
                    revoked_at = NOW()
              WHERE id = $1`,
            [jti],
          );
          return true;
        });
        assert.equal(revoked.enabled, true);
        await redis!.del(denyKey(jti));

        const strict = await getCanonicalSession(request, {
          strictRevocation: true,
        });
        assert.equal(strict.role, "guest");
        assert.equal(strict.academyAccountId, null);
      } finally {
        await deleteSessionEvidence(jti);
      }
    },
  );

  it("refuses access-session and refresh-token issuance without PostgreSQL authority", () => {
    const script = `
      const { registerSession } = await import("./src/lib/security/session-store.ts");
      const { issueRefreshToken } = await import("./src/lib/security/refresh-tokens.ts");
      const session = await registerSession({
        jti: "00000000-0000-4000-8000-000000000001",
        userId: "db-unavailable-user",
        deviceInfo: "test",
        ip: "127.0.0.1",
        expiresAt: new Date(Date.now() + 60000),
      });
      const refresh = await issueRefreshToken({
        userId: "db-unavailable-user",
        familyId: "00000000-0000-4000-8000-000000000002",
        deviceInfo: "test",
        ip: "127.0.0.1",
      });
      console.log("AUTH_RESULT=" + JSON.stringify({ session, refresh }));
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
          TECPEY_REFRESH_SECRET: "test-refresh-secret-with-at-least-32-characters",
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
      session: false,
      refresh: null,
    });
  });

  it("rejects production environments that reuse one secret across token classes", () => {
    const sharedSecret = "shared-auth-secret-with-at-least-32-characters";
    const child = spawnSync(process.execPath, ["scripts/validate-env.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "production",
        NEXT_PUBLIC_SITE_URL: "https://tecpey.ir",
        NEXT_PUBLIC_API_URL: "https://my.tecpey.ir",
        NEXT_PUBLIC_API_BACKEND_URL: "https://api.tecpey.ir",
        NEXT_PUBLIC_API_SOCKET_URL: "wss://api.tecpey.ir/spot",
        TECPEY_SESSION_SECRET: sharedSecret,
        TECPEY_REFRESH_SECRET: sharedSecret,
        TECPEY_ACADEMY_AUTH_SECRET:
          "academy-auth-secret-with-at-least-32-characters",
        CERTIFICATE_SIGNING_SECRET:
          "certificate-secret-with-at-least-32-characters",
        DATABASE_URL: "postgresql://test:test@localhost:5432/test",
        UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "test-upstash-token",
      },
      encoding: "utf8",
      timeout: 10_000,
    });

    assert.notEqual(child.status, 0);
    assert.match(
      child.stderr,
      /TECPEY_SESSION_SECRET and TECPEY_REFRESH_SECRET must be distinct/,
    );
  });
});
