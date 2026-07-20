import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Redis } from "ioredis";
import { NextRequest } from "next/server";
import { DELETE as revokeOtherSessions } from "../../app/api/auth/sessions/route";
import { DELETE as revokeOneSession } from "../../app/api/auth/sessions/[id]/route";
import { withDb } from "../../lib/db";
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
let requestCounter = 80;

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function denyKey(jti: string): string {
  return `tecpey:revoked:jti:${jti}`;
}

function request(accessToken: string, requestId: string): NextRequest {
  requestCounter += 1;
  return new NextRequest("https://tecpey.ir/api/auth/sessions", {
    method: "DELETE",
    headers: {
      origin: "https://tecpey.ir",
      cookie: `${COOKIES.SESSION}=${accessToken}`,
      "user-agent": "tecpey-session-revocation-audit-test",
      "x-forwarded-for": `127.0.1.${requestCounter}`,
      "x-tecpey-request-id": requestId,
    },
  });
}

async function issueAccessSession(
  userId: string,
  label: string,
): Promise<{ token: string; jti: string }> {
  const token = await signUnifiedSession({
    accountId: userId,
    studentId: null,
    email: `${userId}@tecpey.invalid`,
    displayName: "Session Audit Test",
    username: `${label}-${randomUUID()}`,
  });
  const jti = extractJtiFromToken(token);
  const exp = extractExpFromToken(token);
  assert.ok(jti);
  assert.ok(exp);
  assert.equal(
    await registerSession({
      jti,
      userId,
      deviceInfo: label,
      ip: "127.0.0.1",
      expiresAt: new Date(exp * 1000),
    }),
    true,
  );
  return { token, jti };
}

async function issueRefresh(userId: string, label: string): Promise<string> {
  const token = await issueRefreshToken({
    userId,
    familyId: randomUUID(),
    deviceInfo: label,
    ip: "127.0.0.1",
  });
  assert.ok(token);
  return token;
}

async function sessionState(jti: string): Promise<boolean | null> {
  const result = await withDb(async (client) => {
    const row = await client.query<{ is_revoked: boolean }>(
      "SELECT is_revoked FROM user_sessions WHERE id = $1 LIMIT 1",
      [jti],
    );
    return row.rows[0]?.is_revoked ?? null;
  });
  assert.equal(result.enabled, true);
  return result.enabled ? result.value : null;
}

async function activeRefreshCount(userId: string): Promise<number> {
  const result = await withDb(async (client) => {
    const count = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM refresh_tokens
        WHERE user_id = $1
          AND is_revoked = FALSE`,
      [userId],
    );
    return Number(count.rows[0]?.count ?? "0");
  });
  assert.equal(result.enabled, true);
  return result.enabled ? result.value : -1;
}

async function auditDocument(
  action: "session.revoke_one" | "session.revoke_others",
  correlationId: string,
): Promise<string> {
  const result = await withDb(async (client) => {
    const audit = await client.query<{ document: string }>(
      `SELECT row_to_json(event)::text AS document
         FROM sensitive_mutation_audit_events event
        WHERE tenant_id = 'tecpey'
          AND action = $1
          AND correlation_id = $2
        LIMIT 1`,
      [action, correlationId],
    );
    return audit.rows[0]?.document ?? "";
  });
  assert.equal(result.enabled, true);
  return result.enabled ? result.value : "";
}

async function cleanup(userIds: string[], jtis: string[]): Promise<void> {
  const result = await withDb(async (client) => {
    await client.query("DELETE FROM refresh_tokens WHERE user_id = ANY($1::text[])", [userIds]);
    await client.query("DELETE FROM user_sessions WHERE user_id = ANY($1::text[])", [userIds]);
    return true;
  });
  assert.equal(result.enabled, true);
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

describe("Session revocation mandatory audit authority", { concurrency: 1 }, () => {
  it(
    "commits exact access and refresh revocation with one secret-free event",
    { skip: !integrationConfigured, timeout: 40_000 },
    async () => {
      const userId = `session-audit-one-${randomUUID()}`;
      const current = await issueAccessSession(userId, "current");
      const target = await issueAccessSession(userId, "target");
      const refresh = await issueRefresh(userId, "target-refresh");
      const requestId = `session-revoke-one-${randomUUID()}`;

      try {
        const response = await revokeOneSession(
          request(current.token, requestId),
          { params: Promise.resolve({ id: target.jti }) },
        );
        assert.equal(response.status, 200);
        assert.equal(await sessionState(current.jti), false);
        assert.equal(await sessionState(target.jti), true);
        assert.equal(await activeRefreshCount(userId), 0);

        const document = await auditDocument("session.revoke_one", requestId);
        assert.match(document, /session-revocation-v1/);
        assert.match(document, /targetSessionEvidenceHash/);
        assert.match(document, /currentSessionEvidenceHash/);
        assert.equal(document.includes(target.jti), false);
        assert.equal(document.includes(current.jti), false);
        assert.equal(document.includes(current.token), false);
        assert.equal(document.includes(refresh), false);

        const clearedRefresh = response.cookies.get("tecpey_refresh");
        assert.ok(clearedRefresh);
        assert.equal(clearedRefresh.value, "");
      } finally {
        await cleanup([userId], [current.jti, target.jti]);
      }
    },
  );

  it(
    "rolls back exact access and refresh revocation when audit admission fails",
    { skip: !integrationConfigured, timeout: 40_000 },
    async () => {
      const suffix = randomUUID().replace(/-/g, "");
      const userId = `session-audit-rollback-${suffix}`;
      const current = await issueAccessSession(userId, "current");
      const target = await issueAccessSession(userId, "target");
      await issueRefresh(userId, "refresh");
      const requestId = `session-audit-reject-${randomUUID()}`;
      const functionName = `reject_session_audit_${suffix}`;
      const triggerName = `reject_session_audit_trigger_${suffix}`;
      let triggerCreated = false;

      try {
        const created = await withDb(async (client) => {
          await client.query(
            `CREATE FUNCTION ${functionName}() RETURNS trigger
             LANGUAGE plpgsql AS $$
             BEGIN
               RAISE EXCEPTION 'forced session audit failure';
             END;
             $$`,
          );
          await client.query(
            `CREATE TRIGGER ${triggerName}
             BEFORE INSERT ON sensitive_mutation_audit_events
             FOR EACH ROW
             WHEN (
               NEW.actor_id = '${userId}'
               AND NEW.action = 'session.revoke_one'
             )
             EXECUTE FUNCTION ${functionName}()`,
          );
          return true;
        });
        assert.equal(created.enabled, true);
        triggerCreated = true;

        const response = await revokeOneSession(
          request(current.token, requestId),
          { params: Promise.resolve({ id: target.jti }) },
        );
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), {
          ok: false,
          error: "session_revocation_unavailable",
          details: { rolledBack: true },
        });
        assert.equal(await sessionState(target.jti), false);
        assert.equal(await activeRefreshCount(userId), 1);
        assert.equal(await auditDocument("session.revoke_one", requestId), "");
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
        await cleanup([userId], [current.jti, target.jti]);
      }
    },
  );

  it(
    "does not revoke or reveal another principal's session",
    { skip: !integrationConfigured, timeout: 40_000 },
    async () => {
      const actorId = `session-audit-actor-${randomUUID()}`;
      const ownerId = `session-audit-owner-${randomUUID()}`;
      const current = await issueAccessSession(actorId, "actor-current");
      const foreign = await issueAccessSession(ownerId, "foreign-target");
      const requestId = `session-cross-principal-${randomUUID()}`;

      try {
        const response = await revokeOneSession(
          request(current.token, requestId),
          { params: Promise.resolve({ id: foreign.jti }) },
        );
        assert.equal(response.status, 404);
        assert.equal(await sessionState(foreign.jti), false);
        assert.equal(await auditDocument("session.revoke_one", requestId), "");
      } finally {
        await cleanup([actorId, ownerId], [current.jti, foreign.jti]);
      }
    },
  );

  it(
    "rejects changed target replay and rolls back the second revocation",
    { skip: !integrationConfigured, timeout: 40_000 },
    async () => {
      const userId = `session-audit-replay-${randomUUID()}`;
      const current = await issueAccessSession(userId, "current");
      const firstTarget = await issueAccessSession(userId, "first-target");
      const secondTarget = await issueAccessSession(userId, "second-target");
      await issueRefresh(userId, "refresh");
      const requestId = `session-replay-${randomUUID()}`;

      try {
        const first = await revokeOneSession(
          request(current.token, requestId),
          { params: Promise.resolve({ id: firstTarget.jti }) },
        );
        assert.equal(first.status, 200);

        const replay = await revokeOneSession(
          request(current.token, requestId),
          { params: Promise.resolve({ id: secondTarget.jti }) },
        );
        assert.equal(replay.status, 503);
        assert.equal(await sessionState(firstTarget.jti), true);
        assert.equal(await sessionState(secondTarget.jti), false);
      } finally {
        await cleanup(
          [userId],
          [current.jti, firstTarget.jti, secondTarget.jti],
        );
      }
    },
  );

  it(
    "atomically revokes other access sessions and all refresh authority",
    { skip: !integrationConfigured, timeout: 40_000 },
    async () => {
      const userId = `session-audit-bulk-${randomUUID()}`;
      const current = await issueAccessSession(userId, "current");
      const firstOther = await issueAccessSession(userId, "other-one");
      const secondOther = await issueAccessSession(userId, "other-two");
      await issueRefresh(userId, "refresh-one");
      await issueRefresh(userId, "refresh-two");
      const requestId = `session-revoke-others-${randomUUID()}`;

      try {
        const response = await revokeOtherSessions(request(current.token, requestId));
        assert.equal(response.status, 200);
        assert.equal(await sessionState(current.jti), false);
        assert.equal(await sessionState(firstOther.jti), true);
        assert.equal(await sessionState(secondOther.jti), true);
        assert.equal(await activeRefreshCount(userId), 0);

        const document = await auditDocument("session.revoke_others", requestId);
        assert.match(document, /all_other_access_sessions/);
        assert.match(document, /currentAccessRetained/);
        assert.equal(document.includes(current.jti), false);
      } finally {
        await cleanup(
          [userId],
          [current.jti, firstOther.jti, secondOther.jti],
        );
      }
    },
  );

  it(
    "keeps committed session evidence truthful when Redis projection fails",
    { skip: !integrationConfigured, timeout: 40_000 },
    async () => {
      const userId = `session-audit-redis-${randomUUID()}`;
      const current = await issueAccessSession(userId, "current");
      const target = await issueAccessSession(userId, "target");
      await issueRefresh(userId, "refresh");
      const requestId = `session-redis-failure-${randomUUID()}`;
      const originalRedis = globalThis.tecpeyRedisClient;
      const failedRedis = {
        get: async () => null,
        set: async () => { throw new Error("forced Redis deny failure"); },
      };

      try {
        globalThis.tecpeyRedisClient = failedRedis as unknown as typeof globalThis.tecpeyRedisClient;
        const response = await revokeOneSession(
          request(current.token, requestId),
          { params: Promise.resolve({ id: target.jti }) },
        );
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), {
          ok: false,
          error: "session_revocation_cache_unavailable",
          details: {
            changed: true,
            targetAccessRevoked: true,
            currentAccessRevoked: false,
            refreshAuthorityRevoked: true,
            reauthenticationRequired: false,
          },
        });
        assert.equal(await sessionState(target.jti), true);
        assert.equal(await activeRefreshCount(userId), 0);
        assert.match(await auditDocument("session.revoke_one", requestId), /targetAccessRevoked/);
      } finally {
        globalThis.tecpeyRedisClient = originalRedis;
        await cleanup([userId], [current.jti, target.jti]);
      }
    },
  );
});
