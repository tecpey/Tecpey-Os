import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Redis } from "ioredis";
import { NextRequest } from "next/server";
import { DELETE as logout } from "../../app/api/academy-auth/route";
import { withDb } from "../../lib/db";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { prepareRefreshToken } from "../../lib/security/refresh-tokens";
import { admitSession } from "../../lib/security/session-authority";
import { hashSensitiveAuditRequest } from "../../lib/security/sensitive-mutation-audit";
import {
  extractExpFromToken,
  extractJtiFromToken,
  signUnifiedSession,
  UNIFIED_SESSION_COOKIE,
} from "../../lib/unified-session";

process.env.TECPEY_REFRESH_SECRET ??=
  "logout-route-test-refresh-secret-with-at-least-32-characters";

const databaseUrl = process.env.DATABASE_URL?.trim();
const redisUrl = process.env.REDIS_URL?.trim();
const configured = Boolean(
  databaseUrl &&
    !databaseUrl.includes("CHANGE_ME") &&
    redisUrl &&
    !redisUrl.includes("CHANGE_ME"),
);
let redis: Redis | null = null;
const users = new Set<string>();

function denyKey(jti: string): string {
  return `tecpey:revoked:jti:${jti}`;
}

function request(accessToken: string, origin = "https://tecpey.ir"): NextRequest {
  return new NextRequest("https://tecpey.ir/api/academy-auth", {
    method: "DELETE",
    headers: {
      origin,
      cookie: `${UNIFIED_SESSION_COOKIE}=${accessToken}`,
      "user-agent": "logout-route-transactional-test",
      "x-forwarded-for": "127.0.0.1",
    },
  });
}

async function issueBoundSession(userId: string) {
  users.add(userId);
  const accessToken = await signUnifiedSession({
    accountId: userId,
    studentId: null,
    email: `${userId}@tecpey.invalid`,
    displayName: "Logout Test",
    username: `logout-${randomUUID()}`,
  });
  const accessJti = extractJtiFromToken(accessToken);
  const accessExp = extractExpFromToken(accessToken);
  assert.ok(accessJti);
  assert.ok(accessExp);
  const familyId = randomUUID();
  const preparedRefresh = await prepareRefreshToken({
    userId,
    familyId,
    deviceInfo: "logout-route-device",
    ip: "127.0.0.1",
  });
  assert.ok(preparedRefresh);
  await admitSession({
    userId,
    accessJti,
    accessExpiresAt: new Date(accessExp * 1000),
    preparedRefresh,
    deviceInfo: "logout-route-device",
    ip: "127.0.0.1",
    deviceFingerprint: `logout-device-${randomUUID()}`,
    method: "password",
    audit: {
      tenantId: `logout-test-${randomUUID()}`,
      actorType: "user",
      actorId: userId,
      correlationId: `logout-issue-${randomUUID()}`,
      requestHash: hashSensitiveAuditRequest({ userId, action: "session.issue" }),
    },
  });
  return { accessToken, accessJti, refreshId: preparedRefresh.jti };
}

async function cleanup(): Promise<void> {
  if (users.size === 0) return;
  const ids = [...users];
  const result = await withDb(async (client) => {
    await client.query("DELETE FROM session_revocation_outbox WHERE user_id = ANY($1::text[])", [ids]);
    await client.query("DELETE FROM user_sessions WHERE user_id = ANY($1::text[])", [ids]);
    await client.query("DELETE FROM refresh_tokens WHERE user_id = ANY($1::text[])", [ids]);
    await client.query("DELETE FROM known_devices WHERE user_id = ANY($1::text[])", [ids]);
    return true;
  });
  assert.equal(result.enabled, true);
}

before(async () => {
  if (!configured || !redisUrl) return;
  await withDb((client) => applyDatabaseMigrationsWithLock(client));
  redis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
  });
  await redis.connect();
  globalThis.tecpeyRedisClient = redis;
});

after(async () => {
  await cleanup();
  if (redis) {
    if (globalThis.tecpeyRedisClient === redis) globalThis.tecpeyRedisClient = undefined;
    await redis.quit();
  }
});

describe("Transactional logout route", () => {
  it("rejects cross-origin logout before durable mutation", { skip: !configured }, async () => {
    const userId = `logout-cross-origin-${randomUUID()}`;
    const session = await issueBoundSession(userId);
    const response = await logout(request(session.accessToken, "https://attacker.invalid"));
    assert.equal(response.status, 403);
  });

  it("revokes the current bound family and clears cookies", { skip: !configured }, async () => {
    const userId = `logout-owner-${randomUUID()}`;
    const session = await issueBoundSession(userId);
    const response = await logout(request(session.accessToken));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.revoked, true);
    assert.equal(body.denyCachePending, false);
    assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/i);

    const durable = await withDb(async (client) => {
      const access = await client.query<{ is_revoked: boolean }>(
        "SELECT is_revoked FROM user_sessions WHERE id = $1",
        [session.accessJti],
      );
      const refresh = await client.query<{ is_revoked: boolean }>(
        "SELECT is_revoked FROM refresh_tokens WHERE id = $1",
        [session.refreshId],
      );
      return {
        access: access.rows[0]?.is_revoked,
        refresh: refresh.rows[0]?.is_revoked,
      };
    });
    assert.equal(durable.enabled, true);
    if (durable.enabled) {
      assert.equal(durable.value.access, true);
      assert.equal(durable.value.refresh, true);
    }
    assert.equal(await redis!.get(denyKey(session.accessJti)), "1");
  });

  it("returns committed revocation with pending cache repair when Redis is unavailable", { skip: !configured }, async () => {
    const userId = `logout-redis-outage-${randomUUID()}`;
    const session = await issueBoundSession(userId);
    const original = globalThis.tecpeyRedisClient;
    globalThis.tecpeyRedisClient = undefined;
    try {
      const response = await logout(request(session.accessToken));
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.ok, true);
      assert.equal(body.revoked, true);
      assert.equal(body.denyCachePending, true);

      const pending = await withDb(async (client) => {
        const result = await client.query<{ status: string }>(
          "SELECT status FROM session_revocation_outbox WHERE session_jti = $1",
          [session.accessJti],
        );
        return result.rows[0]?.status;
      });
      assert.equal(pending.enabled, true);
      if (pending.enabled) assert.equal(pending.value, "pending");
    } finally {
      globalThis.tecpeyRedisClient = original;
    }
  });
});
