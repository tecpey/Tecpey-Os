import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { Redis } from "ioredis";
import { NextRequest } from "next/server";
import {
  DELETE as revokeAllSessions,
  GET as listSessions,
} from "../../app/api/auth/sessions/route";
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
  "sessions-route-test-refresh-secret-with-at-least-32-characters";

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

function request(accessToken: string, method: "GET" | "DELETE"): NextRequest {
  return new NextRequest("https://tecpey.ir/api/auth/sessions", {
    method,
    headers: {
      origin: "https://tecpey.ir",
      cookie: `${UNIFIED_SESSION_COOKIE}=${accessToken}`,
      "user-agent": "sessions-route-transactional-test",
      "x-forwarded-for": "127.0.0.1",
    },
  });
}

async function issueBoundSession(userId: string, label: string) {
  users.add(userId);
  const accessToken = await signUnifiedSession({
    accountId: userId,
    studentId: null,
    email: `${userId}@tecpey.invalid`,
    displayName: "Sessions Test",
    username: `sessions-${randomUUID()}`,
  });
  const accessJti = extractJtiFromToken(accessToken);
  const accessExp = extractExpFromToken(accessToken);
  assert.ok(accessJti);
  assert.ok(accessExp);
  const familyId = randomUUID();
  const preparedRefresh = await prepareRefreshToken({
    userId,
    familyId,
    deviceInfo: label,
    ip: "127.0.0.1",
  });
  assert.ok(preparedRefresh);
  await admitSession({
    userId,
    accessJti,
    accessExpiresAt: new Date(accessExp * 1000),
    preparedRefresh,
    deviceInfo: label,
    ip: "127.0.0.1",
    deviceFingerprint: `${label}-${randomUUID()}`,
    method: "password",
    audit: {
      tenantId: `sessions-test-${randomUUID()}`,
      actorType: "user",
      actorId: userId,
      correlationId: `sessions-issue-${randomUUID()}`,
      requestHash: hashSensitiveAuditRequest({ userId, label }),
    },
  });
  return {
    accessToken,
    accessJti,
    refreshId: preparedRefresh.jti,
    familyId,
  };
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

describe("Transactional session collection route", () => {
  it("lists active sessions through strict database authority", { skip: !configured }, async () => {
    const userId = `sessions-list-${randomUUID()}`;
    const current = await issueBoundSession(userId, "current-device");
    await issueBoundSession(userId, "other-device");
    const response = await listSessions(request(current.accessToken, "GET"));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.sessions.length, 2);
  });

  it("retains current access while revoking every other access session and all refresh authority", { skip: !configured }, async () => {
    const userId = `sessions-revoke-all-${randomUUID()}`;
    const current = await issueBoundSession(userId, "current-device");
    const other = await issueBoundSession(userId, "other-device");

    const response = await revokeAllSessions(request(current.accessToken, "DELETE"));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.revokedCount, 1);
    assert.equal(body.currentAccessRetained, true);
    assert.equal(body.refreshRevoked, true);
    assert.equal(body.denyCachePending, false);

    const durable = await withDb(async (client) => {
      const access = await client.query<{ id: string; is_revoked: boolean }>(
        "SELECT id, is_revoked FROM user_sessions WHERE id = ANY($1::text[])",
        [[current.accessJti, other.accessJti]],
      );
      const refresh = await client.query<{ is_revoked: boolean }>(
        "SELECT is_revoked FROM refresh_tokens WHERE user_id = $1",
        [userId],
      );
      return { access: access.rows, refresh: refresh.rows };
    });
    assert.equal(durable.enabled, true);
    if (durable.enabled) {
      assert.equal(
        durable.value.access.find((row) => row.id === current.accessJti)?.is_revoked,
        false,
      );
      assert.equal(
        durable.value.access.find((row) => row.id === other.accessJti)?.is_revoked,
        true,
      );
      assert.equal(durable.value.refresh.every((row) => row.is_revoked), true);
    }
  });

  it("returns committed revocation with pending cache repair when deny-cache publication fails", { skip: !configured }, async () => {
    const userId = `sessions-redis-outage-${randomUUID()}`;
    const current = await issueBoundSession(userId, "current-device");
    const other = await issueBoundSession(userId, "other-device");
    const original = globalThis.tecpeyRedisClient;
    globalThis.tecpeyRedisClient = {
      async get() {
        return null;
      },
      pipeline() {
        return {
          set() {
            return this;
          },
          async exec() {
            throw new Error("redis unavailable");
          },
        };
      },
    } as never;
    try {
      const response = await revokeAllSessions(request(current.accessToken, "DELETE"));
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.ok, true);
      assert.equal(body.revokedCount, 1);
      assert.equal(body.denyCachePending, true);

      const pending = await withDb(async (client) => {
        const result = await client.query<{ status: string }>(
          "SELECT status FROM session_revocation_outbox WHERE session_jti = $1",
          [other.accessJti],
        );
        return result.rows[0]?.status;
      });
      assert.equal(pending.enabled, true);
      if (pending.enabled) assert.equal(pending.value, "pending");
    } finally {
      globalThis.tecpeyRedisClient = original;
    }
  });

  it("database unavailability is represented as a 503 contract rather than an empty session list", async () => {
    const source = await readFile(
      "src/app/api/auth/sessions/route.ts",
      "utf8",
    );
    assert.match(source, /session_registry_unavailable/);
    assert.match(source, /apiError\("session_registry_unavailable", 503/);
  });
});
