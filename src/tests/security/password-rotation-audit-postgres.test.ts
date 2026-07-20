import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Redis } from "ioredis";
import { NextRequest } from "next/server";
import { POST as changePassword } from "../../app/api/auth/password/change/route";
import { withDb } from "../../lib/db";
import { hashPassword, verifyPassword } from "../../lib/security/passwords";
import { issueRefreshToken } from "../../lib/security/refresh-tokens";
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
let requestCounter = 10;

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
  requestId: string,
): NextRequest {
  requestCounter += 1;
  return new NextRequest("https://tecpey.ir/api/auth/password/change", {
    method: "POST",
    headers: {
      origin: "https://tecpey.ir",
      cookie: `${COOKIES.SESSION}=${accessToken}`,
      "content-type": "application/json",
      "user-agent": "tecpey-password-audit-test",
      "x-forwarded-for": `127.0.0.${requestCounter}`,
      "x-tecpey-request-id": requestId,
    },
    body: JSON.stringify({ currentPassword, newPassword }),
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
      [userId, email, username, "Password Audit Test", hashPassword(password)],
    );
    return true;
  });
  assert.equal(seeded.enabled, true);
}

async function issueAccessSession(
  userId: string,
  email: string,
  username: string,
): Promise<{ accessToken: string; jti: string }> {
  const accessToken = await signUnifiedSession({
    accountId: userId,
    studentId: null,
    email,
    displayName: "Password Audit Test",
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
      deviceInfo: "password-audit-device",
      ip: "127.0.0.1",
      expiresAt: new Date(exp * 1000),
    }),
    true,
  );
  return { accessToken, jti };
}

async function seedCredentials(
  prefix: string,
  password: string,
): Promise<{
  userId: string;
  email: string;
  username: string;
  accessToken: string;
  jti: string;
  refreshToken: string;
}> {
  const suffix = randomUUID();
  const userId = `${prefix}-${suffix}`;
  const email = `${userId}@tecpey.invalid`;
  const username = `pwd-${randomUUID()}`;
  await seedAccount(userId, email, username, password);
  const access = await issueAccessSession(userId, email, username);
  const refreshToken = await issueRefreshToken({
    userId,
    familyId: randomUUID(),
    deviceInfo: "password-audit-device",
    ip: "127.0.0.1",
  });
  assert.ok(refreshToken);
  return { userId, email, username, accessToken: access.accessToken, jti: access.jti, refreshToken };
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
    if (globalThis.tecpeyRedisClient === redis) globalThis.tecpeyRedisClient = undefined;
    await redis.quit();
    redis = null;
  }
  restoreEnv("UPSTASH_REDIS_REST_URL", originalRateLimitEnv.upstashUrl);
  restoreEnv("UPSTASH_REDIS_REST_TOKEN", originalRateLimitEnv.upstashToken);
  restoreEnv("REDIS_REST_URL", originalRateLimitEnv.redisRestUrl);
  restoreEnv("REDIS_REST_TOKEN", originalRateLimitEnv.redisRestToken);
});

describe("Password rotation mandatory audit evidence", { concurrency: 1 }, () => {
  it(
    "commits password rotation and one secret-free audit event atomically",
    { skip: !integrationConfigured, timeout: 45_000 },
    async () => {
      const currentPassword = "TecPey-Audit-Current-2026!";
      const newPassword = "TecPey-Audit-Replacement-2026!";
      const credentials = await seedCredentials("password-audit-success", currentPassword);
      const requestId = `password-change-${randomUUID()}`;
      const cleanupJtis = [credentials.jti];

      try {
        const response = await changePassword(
          request(credentials.accessToken, currentPassword, newPassword, requestId),
        );
        assert.equal(response.status, 200);
        const replacementToken = response.cookies.get(COOKIES.SESSION)?.value;
        assert.ok(replacementToken);
        const replacementJti = extractJtiFromToken(replacementToken);
        assert.ok(replacementJti);
        cleanupJtis.push(replacementJti);

        const evidence = await withDb(async (client) => {
          const account = await client.query<{ password_hash: string }>(
            "SELECT password_hash FROM academy_auth_accounts WHERE id = $1",
            [credentials.userId],
          );
          const audit = await client.query<{ document: string }>(
            `SELECT row_to_json(event)::text AS document
               FROM sensitive_mutation_audit_events event
              WHERE tenant_id = 'tecpey'
                AND action = 'credential.password.change'
                AND correlation_id = $1
              LIMIT 1`,
            [requestId],
          );
          return {
            passwordHash: account.rows[0]?.password_hash ?? "",
            auditDocument: audit.rows[0]?.document ?? "",
          };
        });
        assert.equal(evidence.enabled, true);
        if (evidence.enabled) {
          assert.equal(verifyPassword(newPassword, evidence.value.passwordHash), true);
          assert.match(evidence.value.auditDocument, /credentialVersionFingerprint/);
          assert.match(evidence.value.auditDocument, /currentSessionEvidenceHash/);
          assert.match(evidence.value.auditDocument, /password-rotation-v1/);
          assert.equal(evidence.value.auditDocument.includes(currentPassword), false);
          assert.equal(evidence.value.auditDocument.includes(newPassword), false);
          assert.equal(evidence.value.auditDocument.includes(evidence.value.passwordHash), false);
          assert.equal(evidence.value.auditDocument.includes(credentials.accessToken), false);
          assert.equal(evidence.value.auditDocument.includes(credentials.refreshToken), false);
        }
      } finally {
        await cleanup(credentials.userId, cleanupJtis);
      }
    },
  );

  it(
    "rolls back password, history and session rotation when audit admission fails",
    { skip: !integrationConfigured, timeout: 45_000 },
    async () => {
      const suffix = randomUUID().replace(/-/g, "");
      const functionName = `reject_password_audit_${suffix}`;
      const triggerName = `reject_password_audit_trigger_${suffix}`;
      const currentPassword = "TecPey-Audit-Rollback-Old-2026!";
      const newPassword = "TecPey-Audit-Rollback-New-2026!";
      const credentials = await seedCredentials(`password-audit-rollback-${suffix}`, currentPassword);
      const requestId = `password-audit-reject-${randomUUID()}`;
      let triggerCreated = false;

      try {
        const triggerResult = await withDb(async (client) => {
          await client.query(
            `CREATE FUNCTION ${functionName}() RETURNS trigger
             LANGUAGE plpgsql AS $$
             BEGIN
               RAISE EXCEPTION 'forced password audit admission failure';
             END;
             $$`,
          );
          await client.query(
            `CREATE TRIGGER ${triggerName}
             BEFORE INSERT ON sensitive_mutation_audit_events
             FOR EACH ROW
             WHEN (
               NEW.actor_id = '${credentials.userId}'
               AND NEW.action = 'credential.password.change'
             )
             EXECUTE FUNCTION ${functionName}()`,
          );
          return true;
        });
        assert.equal(triggerResult.enabled, true);
        triggerCreated = true;

        const response = await changePassword(
          request(credentials.accessToken, currentPassword, newPassword, requestId),
        );
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), {
          ok: false,
          error: "credential_rotation_unavailable",
          details: { rolledBack: true },
        });

        const state = await withDb(async (client) => {
          const account = await client.query<{ password_hash: string }>(
            "SELECT password_hash FROM academy_auth_accounts WHERE id = $1",
            [credentials.userId],
          );
          const session = await client.query<{ is_revoked: boolean }>(
            "SELECT is_revoked FROM user_sessions WHERE id = $1",
            [credentials.jti],
          );
          const history = await client.query<{ count: string }>(
            "SELECT COUNT(*)::text AS count FROM password_history WHERE user_id = $1",
            [credentials.userId],
          );
          const audit = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM sensitive_mutation_audit_events
              WHERE correlation_id = $1`,
            [requestId],
          );
          return {
            passwordHash: account.rows[0]?.password_hash ?? "",
            sessionRevoked: session.rows[0]?.is_revoked ?? true,
            historyCount: Number(history.rows[0]?.count ?? "0"),
            auditCount: Number(audit.rows[0]?.count ?? "0"),
          };
        });
        assert.equal(state.enabled, true);
        if (state.enabled) {
          assert.equal(verifyPassword(currentPassword, state.value.passwordHash), true);
          assert.equal(verifyPassword(newPassword, state.value.passwordHash), false);
          assert.equal(state.value.sessionRevoked, false);
          assert.equal(state.value.historyCount, 0);
          assert.equal(state.value.auditCount, 0);
        }
      } finally {
        if (triggerCreated) {
          await withDb(async (client) => {
            await client.query(
              `DROP TRIGGER IF EXISTS ${triggerName} ON sensitive_mutation_audit_events`,
            );
            await client.query(`DROP FUNCTION IF EXISTS ${functionName}()`);
            return true;
          });
        }
        await cleanup(credentials.userId, [credentials.jti]);
      }
    },
  );

  it(
    "rejects changed replay evidence and rolls back the second credential generation",
    { skip: !integrationConfigured, timeout: 45_000 },
    async () => {
      const originalPassword = "TecPey-Replay-Original-2026!";
      const firstPassword = "TecPey-Replay-First-2026!";
      const secondPassword = "TecPey-Replay-Second-2026!";
      const credentials = await seedCredentials("password-audit-replay", originalPassword);
      const requestId = `password-replay-${randomUUID()}`;
      const cleanupJtis = [credentials.jti];

      try {
        const first = await changePassword(
          request(credentials.accessToken, originalPassword, firstPassword, requestId),
        );
        assert.equal(first.status, 200);
        const firstAccessToken = first.cookies.get(COOKIES.SESSION)?.value;
        assert.ok(firstAccessToken);
        const firstJti = extractJtiFromToken(firstAccessToken);
        assert.ok(firstJti);
        cleanupJtis.push(firstJti);

        const replay = await changePassword(
          request(firstAccessToken, firstPassword, secondPassword, requestId),
        );
        assert.equal(replay.status, 503);
        assert.deepEqual(await replay.json(), {
          ok: false,
          error: "credential_rotation_unavailable",
          details: { rolledBack: true },
        });

        const state = await withDb(async (client) => {
          const account = await client.query<{ password_hash: string }>(
            "SELECT password_hash FROM academy_auth_accounts WHERE id = $1",
            [credentials.userId],
          );
          const activeSession = await client.query<{ is_revoked: boolean }>(
            "SELECT is_revoked FROM user_sessions WHERE id = $1",
            [firstJti],
          );
          const audit = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM sensitive_mutation_audit_events
              WHERE tenant_id = 'tecpey'
                AND action = 'credential.password.change'
                AND correlation_id = $1`,
            [requestId],
          );
          return {
            passwordHash: account.rows[0]?.password_hash ?? "",
            firstSessionRevoked: activeSession.rows[0]?.is_revoked ?? true,
            auditCount: Number(audit.rows[0]?.count ?? "0"),
          };
        });
        assert.equal(state.enabled, true);
        if (state.enabled) {
          assert.equal(verifyPassword(firstPassword, state.value.passwordHash), true);
          assert.equal(verifyPassword(secondPassword, state.value.passwordHash), false);
          assert.equal(state.value.firstSessionRevoked, false);
          assert.equal(state.value.auditCount, 1);
        }
      } finally {
        await cleanup(credentials.userId, cleanupJtis);
      }
    },
  );

  it(
    "keeps committed password evidence truthful when Redis deny synchronization fails",
    { skip: !integrationConfigured, timeout: 45_000 },
    async () => {
      const currentPassword = "TecPey-Redis-Failure-Old-2026!";
      const newPassword = "TecPey-Redis-Failure-New-2026!";
      const credentials = await seedCredentials("password-audit-redis", currentPassword);
      const requestId = `password-redis-failure-${randomUUID()}`;
      const originalRedis = globalThis.tecpeyRedisClient;

      const failedRedis = {
        get: async () => null,
        pipeline: () => {
          const pipeline = {
            set: () => pipeline,
            exec: async () => [[new Error("forced redis projection failure"), null]],
          };
          return pipeline;
        },
      };

      try {
        globalThis.tecpeyRedisClient = failedRedis as unknown as typeof globalThis.tecpeyRedisClient;
        const response = await changePassword(
          request(credentials.accessToken, currentPassword, newPassword, requestId),
        );
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), {
          ok: false,
          error: "credential_rotation_cache_unavailable",
          details: {
            changed: true,
            credentialsRevoked: true,
            reauthenticationRequired: true,
          },
        });
        const clearedSessionCookie = response.cookies.get(COOKIES.SESSION);
        assert.ok(clearedSessionCookie);
        assert.equal(clearedSessionCookie.value, "");
        assert.equal(new Date(clearedSessionCookie.expires ?? 0).getTime(), 0);

        const state = await withDb(async (client) => {
          const account = await client.query<{ password_hash: string }>(
            "SELECT password_hash FROM academy_auth_accounts WHERE id = $1",
            [credentials.userId],
          );
          const oldSession = await client.query<{ is_revoked: boolean }>(
            "SELECT is_revoked FROM user_sessions WHERE id = $1",
            [credentials.jti],
          );
          const audit = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM sensitive_mutation_audit_events
              WHERE tenant_id = 'tecpey'
                AND action = 'credential.password.change'
                AND correlation_id = $1`,
            [requestId],
          );
          return {
            passwordHash: account.rows[0]?.password_hash ?? "",
            oldSessionRevoked: oldSession.rows[0]?.is_revoked ?? false,
            auditCount: Number(audit.rows[0]?.count ?? "0"),
          };
        });
        assert.equal(state.enabled, true);
        if (state.enabled) {
          assert.equal(verifyPassword(newPassword, state.value.passwordHash), true);
          assert.equal(state.value.oldSessionRevoked, true);
          assert.equal(state.value.auditCount, 1);
        }
      } finally {
        globalThis.tecpeyRedisClient = originalRedis;
        await cleanup(credentials.userId, [credentials.jti]);
      }
    },
  );
});
