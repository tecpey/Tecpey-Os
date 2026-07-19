import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Redis } from "ioredis";
import { NextRequest } from "next/server";
import { POST as changePassword } from "../../app/api/auth/password/change/route";
import { getCanonicalSession } from "../../lib/auth-session";
import { withDb } from "../../lib/db";
import {
  hashPassword,
  verifyPassword,
} from "../../lib/security/passwords";
import {
  issueRefreshToken,
  REFRESH_COOKIE,
  verifyRefreshToken,
} from "../../lib/security/refresh-tokens";
import { registerSession } from "../../lib/security/session-store";
import {
  extractExpFromToken,
  extractJtiFromToken,
  signUnifiedSession,
} from "../../lib/unified-session";
import { COOKIES } from "../../lib/platform-config";

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

function request(
  accessToken: string,
  currentPassword: string,
  newPassword: string,
): NextRequest {
  return new NextRequest("https://tecpey.ir/api/auth/password/change", {
    method: "POST",
    headers: {
      origin: "https://tecpey.ir",
      cookie: `${COOKIES.SESSION}=${accessToken}`,
      "content-type": "application/json",
      "user-agent": "tecpey-password-change-test",
      "x-forwarded-for": "127.0.0.1",
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

function sessionRequest(accessToken: string): NextRequest {
  return new NextRequest("https://tecpey.ir/api/security-test", {
    headers: {
      cookie: `${COOKIES.SESSION}=${accessToken}`,
    },
  });
}

async function seedAccount(
  userId: string,
  email: string,
  username: string,
  password: string,
): Promise<void> {
  const seeded = await withDb(async (client) => {
    await client.query(
      `INSERT INTO academy_auth_accounts
         (id, email, username, display_name, password_hash)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        userId,
        email,
        username,
        "Password Rotation Test",
        hashPassword(password),
      ],
    );
    return true;
  });
  assert.equal(seeded.enabled, true);
}

async function issueAccessSession(
  userId: string,
  email: string,
  username: string,
  deviceInfo: string,
): Promise<{ accessToken: string; jti: string }> {
  const accessToken = await signUnifiedSession({
    accountId: userId,
    studentId: null,
    email,
    displayName: "Password Rotation Test",
    username,
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
    await client.query("DELETE FROM password_history WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM academy_auth_accounts WHERE id = $1", [userId]);
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

describe("Atomic password credential rotation", { concurrency: 1 }, () => {
  it(
    "commits the password, all revocations and exactly one fresh credential pair together",
    { skip: !integrationConfigured, timeout: 45_000 },
    async () => {
      const userId = `password-owner-${randomUUID()}`;
      const email = `${userId}@tecpey.invalid`;
      const username = `password-${randomUUID()}`;
      const currentPassword = "TecPey-Old-Password-2026!";
      const newPassword = "TecPey-New-Password-2026!";
      await seedAccount(userId, email, username, currentPassword);

      const current = await issueAccessSession(
        userId,
        email,
        username,
        "current-device",
      );
      const other = await issueAccessSession(
        userId,
        email,
        username,
        "other-device",
      );
      const currentRefresh = await issueRefreshToken({
        userId,
        familyId: randomUUID(),
        deviceInfo: "current-device",
        ip: "127.0.0.1",
      });
      const otherRefresh = await issueRefreshToken({
        userId,
        familyId: randomUUID(),
        deviceInfo: "other-device",
        ip: "127.0.0.2",
      });
      assert.ok(currentRefresh);
      assert.ok(otherRefresh);

      const cleanupJtis = [current.jti, other.jti];
      try {
        const response = await changePassword(
          request(current.accessToken, currentPassword, newPassword),
        );
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
          ok: true,
          changed: true,
          sessionsRotated: true,
          revokedAccessSessions: 2,
          revokedRefreshTokens: 2,
          atomic: true,
        });

        const newAccessToken = response.cookies.get(COOKIES.SESSION)?.value;
        const newRefreshToken = response.cookies.get(REFRESH_COOKIE)?.value;
        assert.ok(newAccessToken);
        assert.ok(newRefreshToken);
        const newJti = extractJtiFromToken(newAccessToken);
        assert.ok(newJti);
        cleanupJtis.push(newJti);

        const evidence = await withDb(async (client) => {
          const account = await client.query<{ password_hash: string }>(
            "SELECT password_hash FROM academy_auth_accounts WHERE id = $1",
            [userId],
          );
          const sessions = await client.query<{
            id: string;
            is_revoked: boolean;
          }>(
            "SELECT id, is_revoked FROM user_sessions WHERE user_id = $1",
            [userId],
          );
          const refresh = await client.query<{
            id: string;
            is_revoked: boolean;
          }>(
            "SELECT id, is_revoked FROM refresh_tokens WHERE user_id = $1",
            [userId],
          );
          return {
            passwordHash: account.rows[0]?.password_hash ?? "",
            sessions: new Map<string, boolean>(
              sessions.rows.map((row) => [row.id, row.is_revoked] as const),
            ),
            refreshRows: refresh.rows,
          };
        });
        assert.equal(evidence.enabled, true);
        if (evidence.enabled) {
          assert.equal(verifyPassword(newPassword, evidence.value.passwordHash), true);
          assert.equal(verifyPassword(currentPassword, evidence.value.passwordHash), false);
          assert.equal(evidence.value.sessions.get(current.jti), true);
          assert.equal(evidence.value.sessions.get(other.jti), true);
          assert.equal(evidence.value.sessions.get(newJti), false);
          assert.equal(
            evidence.value.refreshRows.filter((row) => !row.is_revoked).length,
            1,
          );
        }

        assert.equal(await redis!.get(denyKey(current.jti)), "1");
        assert.equal(await redis!.get(denyKey(other.jti)), "1");
        assert.equal(await redis!.get(denyKey(newJti)), null);

        assert.equal(
          (await getCanonicalSession(sessionRequest(current.accessToken), {
            strictRevocation: true,
          })).role,
          "guest",
        );
        assert.equal(
          (await getCanonicalSession(sessionRequest(other.accessToken), {
            strictRevocation: true,
          })).role,
          "guest",
        );
        assert.equal(
          (await getCanonicalSession(sessionRequest(newAccessToken), {
            strictRevocation: true,
          })).academyAccountId,
          userId,
        );

        assert.equal((await verifyRefreshToken(currentRefresh)).ok, false);
        assert.equal((await verifyRefreshToken(otherRefresh)).ok, false);
        assert.equal((await verifyRefreshToken(newRefreshToken)).ok, true);
      } finally {
        await cleanup(userId, cleanupJtis);
      }
    },
  );

  it(
    "rejects a reused historical password without mutating the password or credentials",
    { skip: !integrationConfigured, timeout: 45_000 },
    async () => {
      const userId = `password-reuse-${randomUUID()}`;
      const email = `${userId}@tecpey.invalid`;
      const username = `password-${randomUUID()}`;
      const currentPassword = "TecPey-Current-Password-2026!";
      const historicalPassword = "TecPey-Historical-Password-2026!";
      await seedAccount(userId, email, username, currentPassword);
      const current = await issueAccessSession(
        userId,
        email,
        username,
        "current-device",
      );
      const refreshToken = await issueRefreshToken({
        userId,
        familyId: randomUUID(),
        deviceInfo: "current-device",
        ip: "127.0.0.1",
      });
      assert.ok(refreshToken);
      const historySeeded = await withDb(async (client) => {
        await client.query(
          `INSERT INTO password_history (id, user_id, password_hash)
           VALUES ($1, $2, $3)`,
          [randomUUID(), userId, hashPassword(historicalPassword)],
        );
        return true;
      });
      assert.equal(historySeeded.enabled, true);

      try {
        const response = await changePassword(
          request(current.accessToken, currentPassword, historicalPassword),
        );
        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), {
          ok: false,
          error: "password_previously_used",
        });

        const evidence = await withDb(async (client) => {
          const account = await client.query<{ password_hash: string }>(
            "SELECT password_hash FROM academy_auth_accounts WHERE id = $1",
            [userId],
          );
          const session = await client.query<{ is_revoked: boolean }>(
            "SELECT is_revoked FROM user_sessions WHERE id = $1",
            [current.jti],
          );
          const refresh = await client.query<{ is_revoked: boolean }>(
            "SELECT is_revoked FROM refresh_tokens WHERE user_id = $1 LIMIT 1",
            [userId],
          );
          return {
            passwordHash: account.rows[0]?.password_hash ?? "",
            accessRevoked: session.rows[0]?.is_revoked ?? true,
            refreshRevoked: refresh.rows[0]?.is_revoked ?? true,
          };
        });
        assert.equal(evidence.enabled, true);
        if (evidence.enabled) {
          assert.equal(verifyPassword(currentPassword, evidence.value.passwordHash), true);
          assert.equal(verifyPassword(historicalPassword, evidence.value.passwordHash), false);
          assert.equal(evidence.value.accessRevoked, false);
          assert.equal(evidence.value.refreshRevoked, false);
        }
        assert.equal((await verifyRefreshToken(refreshToken)).ok, true);
      } finally {
        await cleanup(userId, [current.jti]);
      }
    },
  );

  it(
    "rolls back the password and every revocation when replacement credential persistence fails",
    { skip: !integrationConfigured, timeout: 45_000 },
    async () => {
      const suffix = randomUUID().replace(/-/g, "");
      const functionName = `reject_refresh_${suffix}`;
      const triggerName = `reject_refresh_trigger_${suffix}`;
      const userId = `atomic-failure-${suffix}`;
      const email = `${userId}@tecpey.invalid`;
      const username = `password-${suffix}`;
      const currentPassword = "TecPey-Rollback-Old-2026!";
      const newPassword = "TecPey-Rollback-New-2026!";
      await seedAccount(userId, email, username, currentPassword);
      const current = await issueAccessSession(
        userId,
        email,
        username,
        "rollback-device",
      );
      const refreshToken = await issueRefreshToken({
        userId,
        familyId: randomUUID(),
        deviceInfo: "rollback-device",
        ip: "127.0.0.1",
      });
      assert.ok(refreshToken);

      let triggerCreated = false;
      try {
        const triggerResult = await withDb(async (client) => {
          await client.query(
            `CREATE FUNCTION ${functionName}() RETURNS trigger
             LANGUAGE plpgsql AS $$
             BEGIN
               RAISE EXCEPTION 'forced replacement refresh failure';
             END;
             $$`,
          );
          await client.query(
            `CREATE TRIGGER ${triggerName}
             BEFORE INSERT ON refresh_tokens
             FOR EACH ROW
             WHEN (NEW.user_id = '${userId}')
             EXECUTE FUNCTION ${functionName}()`,
          );
          return true;
        });
        assert.equal(triggerResult.enabled, true);
        triggerCreated = true;

        const response = await changePassword(
          request(current.accessToken, currentPassword, newPassword),
        );
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), {
          ok: false,
          error: "credential_rotation_unavailable",
          details: { rolledBack: true },
        });

        const evidence = await withDb(async (client) => {
          const account = await client.query<{ password_hash: string }>(
            "SELECT password_hash FROM academy_auth_accounts WHERE id = $1",
            [userId],
          );
          const session = await client.query<{ is_revoked: boolean }>(
            "SELECT is_revoked FROM user_sessions WHERE id = $1",
            [current.jti],
          );
          const refresh = await client.query<{ is_revoked: boolean }>(
            "SELECT is_revoked FROM refresh_tokens WHERE user_id = $1 LIMIT 1",
            [userId],
          );
          const history = await client.query<{ count: string }>(
            "SELECT COUNT(*)::text AS count FROM password_history WHERE user_id = $1",
            [userId],
          );
          return {
            passwordHash: account.rows[0]?.password_hash ?? "",
            accessRevoked: session.rows[0]?.is_revoked ?? true,
            refreshRevoked: refresh.rows[0]?.is_revoked ?? true,
            historyCount: Number(history.rows[0]?.count ?? "0"),
          };
        });
        assert.equal(evidence.enabled, true);
        if (evidence.enabled) {
          assert.equal(verifyPassword(currentPassword, evidence.value.passwordHash), true);
          assert.equal(verifyPassword(newPassword, evidence.value.passwordHash), false);
          assert.equal(evidence.value.accessRevoked, false);
          assert.equal(evidence.value.refreshRevoked, false);
          assert.equal(evidence.value.historyCount, 0);
        }
        assert.equal(
          (await getCanonicalSession(sessionRequest(current.accessToken), {
            strictRevocation: true,
          })).academyAccountId,
          userId,
        );
        assert.equal((await verifyRefreshToken(refreshToken)).ok, true);
      } finally {
        if (triggerCreated) {
          await withDb(async (client) => {
            await client.query(
              `DROP TRIGGER IF EXISTS ${triggerName} ON refresh_tokens`,
            );
            await client.query(`DROP FUNCTION IF EXISTS ${functionName}()`);
            return true;
          });
        }
        await cleanup(userId, [current.jti]);
      }
    },
  );

  it("fails closed when password-history authority is unavailable", () => {
    const script = `
      const module = await import("./src/lib/security/passwords.ts");
      const api = module.default ?? module;
      const isPasswordReused = module.isPasswordReused ?? api.isPasswordReused;
      try {
        await isPasswordReused("db-unavailable-user", "Any-New-Password-2026!", 5);
        console.log("HISTORY_RESULT=allowed");
      } catch (error) {
        console.log("HISTORY_RESULT=" + (error instanceof Error ? error.message : "failed"));
      }
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
    assert.match(child.stdout, /HISTORY_RESULT=password_history_unavailable/);
  });
});
