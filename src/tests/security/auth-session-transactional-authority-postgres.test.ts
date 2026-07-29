import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Redis } from "ioredis";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { PLATFORM } from "../../lib/platform-config";
import { prepareRefreshToken } from "../../lib/security/refresh-tokens";
import {
  admitSessionAuthority,
  publishPendingSessionRevocations,
  removeKnownDeviceAuthority,
  revokeSessionAuthority,
  rotateSessionAuthority,
  type PreparedAccessSession,
  type SessionAuditContext,
  type SessionSystemAuditContext,
} from "../../lib/security/session-authority";
import { hashSensitiveAuditRequest } from "../../lib/security/sensitive-mutation-audit";

const databaseUrl = process.env.DATABASE_URL?.trim();
const redisUrl = process.env.REDIS_URL?.trim();
const databaseConfigured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
const redisConfigured = Boolean(redisUrl && !redisUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;
let redis: Redis | null = null;

function access(userId: string): PreparedAccessSession {
  return {
    jti: randomUUID(),
    userId,
    expiresAt: new Date(Date.now() + 15 * 60_000),
  };
}

function userAudit(
  userId: string,
  action: string,
  correlationId = `session-test-${randomUUID()}`,
): SessionAuditContext {
  return {
    tenantId: PLATFORM.DEFAULT_TENANT_ID,
    actorType: "user",
    actorId: userId,
    correlationId,
    requestHash: hashSensitiveAuditRequest({ action, userId, correlationId }),
  };
}

function systemAudit(
  action: string,
  correlationId = `session-test-${randomUUID()}`,
): SessionSystemAuditContext {
  return {
    tenantId: PLATFORM.DEFAULT_TENANT_ID,
    correlationId,
    requestHash: hashSensitiveAuditRequest({ action, correlationId }),
  };
}

async function withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

async function cleanupUser(userId: string): Promise<void> {
  if (!pool) return;
  await withClient(async (client) => {
    const sessions = await client.query<{ id: string }>(
      "SELECT id FROM user_sessions WHERE user_id = $1",
      [userId],
    );
    const ids = sessions.rows.map((row) => row.id);
    if (ids.length > 0) {
      await client.query(
        "DELETE FROM session_revocation_outbox WHERE session_jti = ANY($1::text[])",
        [ids],
      );
      if (redis) {
        await redis.del(...ids.map((id) => `tecpey:revoked:jti:${id}`));
      }
    }
    await client.query("DELETE FROM user_sessions WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM refresh_tokens WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM refresh_token_families WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM known_devices WHERE user_id = $1", [userId]);
  });
}

before(async () => {
  if (!databaseConfigured || !databaseUrl) return;
  pool = new Pool({
    connectionString: databaseUrl,
    max: 8,
    idleTimeoutMillis: 1_000,
    allowExitOnIdle: true,
  });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));

  if (redisConfigured && redisUrl) {
    redis = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
    });
    await redis.connect();
    await redis.ping();
    globalThis.tecpeyRedisClient = redis;
  }
});

after(async () => {
  if (globalThis.tecpeyRedisClient === redis) {
    globalThis.tecpeyRedisClient = undefined;
  }
  await redis?.quit();
  redis = null;
  await pool?.end();
  pool = null;
});

describe("Transactional session authority", () => {
  it(
    "commits refresh family, refresh token, access session, device and secret-free evidence atomically",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const userId = `session-admit-${randomUUID()}`;
      const familyId = randomUUID();
      const preparedAccess = access(userId);
      const deviceInfo = "TecPey Security Test Browser/1.0";
      const ip = "127.0.0.10";
      const preparedRefresh = await prepareRefreshToken({
        userId,
        familyId,
        deviceInfo,
        ip,
      });
      assert.ok(preparedRefresh);
      const audit = userAudit(userId, "session.issue");

      try {
        const admitted = await admitSessionAuthority({
          userId,
          access: preparedAccess,
          refresh: preparedRefresh,
          deviceInfo,
          ip,
          method: "password",
          audit,
        });
        assert.equal(admitted.refreshToken, preparedRefresh.token);
        assert.equal(typeof admitted.knownDeviceId, "string");

        const evidence = await withClient(async (client) => {
          const family = await client.query<{
            user_id: string;
            known_device_id: string;
            status: string;
          }>(
            "SELECT user_id, known_device_id, status FROM refresh_token_families WHERE id = $1",
            [familyId],
          );
          const refresh = await client.query<{
            known_device_id: string;
            is_revoked: boolean;
          }>(
            "SELECT known_device_id, is_revoked FROM refresh_tokens WHERE id = $1",
            [preparedRefresh.jti],
          );
          const session = await client.query<{
            refresh_family_id: string;
            known_device_id: string;
            is_revoked: boolean;
          }>(
            "SELECT refresh_family_id, known_device_id, is_revoked FROM user_sessions WHERE id = $1",
            [preparedAccess.jti],
          );
          const auditRow = await client.query<{ document: string }>(
            `SELECT row_to_json(event)::text AS document
               FROM sensitive_mutation_audit_events event
              WHERE tenant_id = $1
                AND action = 'session.issue'
                AND correlation_id = $2`,
            [audit.tenantId, audit.correlationId],
          );
          return {
            family: family.rows[0],
            refresh: refresh.rows[0],
            session: session.rows[0],
            document: auditRow.rows[0]?.document ?? "",
          };
        });

        assert.equal(evidence.family.user_id, userId);
        assert.equal(evidence.family.status, "active");
        assert.equal(evidence.refresh.is_revoked, false);
        assert.equal(evidence.session.refresh_family_id, familyId);
        assert.equal(evidence.session.is_revoked, false);
        assert.equal(evidence.family.known_device_id, admitted.knownDeviceId);
        assert.equal(evidence.refresh.known_device_id, admitted.knownDeviceId);
        assert.equal(evidence.session.known_device_id, admitted.knownDeviceId);
        for (const raw of [
          preparedRefresh.token,
          preparedRefresh.jti,
          familyId,
          preparedAccess.jti,
          deviceInfo,
          ip,
        ]) {
          assert.equal(evidence.document.includes(raw), false);
        }
      } finally {
        await cleanupUser(userId);
      }
    },
  );

  it(
    "rolls back the entire admission tuple when mandatory evidence conflicts",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const userId = `session-rollback-${randomUUID()}`;
      const familyId = randomUUID();
      const preparedAccess = access(userId);
      const preparedRefresh = await prepareRefreshToken({
        userId,
        familyId,
        deviceInfo: "rollback-device",
        ip: "127.0.0.11",
      });
      assert.ok(preparedRefresh);
      const correlationId = `session-conflict-${randomUUID()}`;
      const audit = userAudit(userId, "session.issue", correlationId);

      await withClient(async (client) => {
        await client.query(
          `INSERT INTO sensitive_mutation_audit_events
             (tenant_id, actor_type, actor_id, action, resource_type, resource_id,
              outcome, correlation_id, request_hash, metadata)
           VALUES ($1, 'user', $2, 'session.issue', 'auth_session', $3,
                   'success', $4, $5, '{"policyVersion":"conflict-fixture"}'::jsonb)`,
          [
            audit.tenantId,
            userId,
            hashSensitiveAuditRequest(`fixture-${randomUUID()}`),
            correlationId,
            hashSensitiveAuditRequest({ different: true }),
          ],
        );
      });

      try {
        await assert.rejects(
          admitSessionAuthority({
            userId,
            access: preparedAccess,
            refresh: preparedRefresh,
            deviceInfo: "rollback-device",
            ip: "127.0.0.11",
            method: "password",
            audit,
          }),
          /sensitive_audit_correlation_conflict/,
        );

        const counts = await withClient(async (client) => {
          const result = await client.query<{
            families: string;
            refresh: string;
            sessions: string;
            devices: string;
          }>(
            `SELECT
               (SELECT COUNT(*)::text FROM refresh_token_families WHERE user_id = $1) AS families,
               (SELECT COUNT(*)::text FROM refresh_tokens WHERE user_id = $1) AS refresh,
               (SELECT COUNT(*)::text FROM user_sessions WHERE user_id = $1) AS sessions,
               (SELECT COUNT(*)::text FROM known_devices WHERE user_id = $1) AS devices`,
            [userId],
          );
          return result.rows[0];
        });
        assert.deepEqual(counts, {
          families: "0",
          refresh: "0",
          sessions: "0",
          devices: "0",
        });
      } finally {
        await cleanupUser(userId);
      }
    },
  );

  it(
    "allows at most one concurrent rotation and turns the loser into durable reuse handling",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const userId = `session-rotation-${randomUUID()}`;
      const familyId = randomUUID();
      const initialAccess = access(userId);
      const initialRefresh = await prepareRefreshToken({
        userId,
        familyId,
        deviceInfo: "rotation-device",
        ip: "127.0.0.12",
      });
      assert.ok(initialRefresh);

      try {
        await admitSessionAuthority({
          userId,
          access: initialAccess,
          refresh: initialRefresh,
          deviceInfo: "rotation-device",
          ip: "127.0.0.12",
          method: "password",
          audit: userAudit(userId, "session.issue"),
        });

        const replacements = await Promise.all([0, 1].map(async () => ({
          access: access(userId),
          refresh: await prepareRefreshToken({
            userId,
            familyId,
            parentId: initialRefresh.jti,
            deviceInfo: "rotation-device",
            ip: "127.0.0.12",
          }),
          audit: systemAudit("session.refresh.rotate"),
        })));
        assert.ok(replacements[0].refresh);
        assert.ok(replacements[1].refresh);

        const outcomes = await Promise.all(
          replacements.map((replacement) =>
            rotateSessionAuthority({
              rawRefreshToken: initialRefresh.token,
              access: replacement.access,
              replacement: replacement.refresh!,
              deviceInfo: "rotation-device",
              ip: "127.0.0.12",
              audit: replacement.audit,
            }),
          ),
        );
        assert.equal(outcomes.filter((outcome) => outcome.ok).length <= 1, true);
        assert.equal(
          outcomes.some((outcome) => !outcome.ok && outcome.reason === "token_reused"),
          true,
        );

        const state = await withClient(async (client) => {
          const family = await client.query<{ status: string }>(
            "SELECT status FROM refresh_token_families WHERE id = $1",
            [familyId],
          );
          const active = await client.query<{ count: string }>(
            "SELECT COUNT(*)::text AS count FROM refresh_tokens WHERE family_id = $1 AND is_revoked = FALSE",
            [familyId],
          );
          const incidents = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM sensitive_mutation_audit_events
              WHERE action = 'session.refresh.reuse_detected'
                AND actor_id = $1`,
            [userId],
          );
          return {
            familyStatus: family.rows[0]?.status,
            activeRefresh: Number(active.rows[0]?.count ?? "0"),
            incidents: Number(incidents.rows[0]?.count ?? "0"),
          };
        });
        assert.equal(state.familyStatus, "revoked");
        assert.equal(state.activeRefresh, 0);
        assert.equal(state.incidents >= 1, true);
      } finally {
        await cleanupUser(userId);
      }
    },
  );

  it(
    "keeps durable revocation and a repairable outbox when Redis is unavailable",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const userId = `session-outbox-${randomUUID()}`;
      const familyId = randomUUID();
      const preparedAccess = access(userId);
      const preparedRefresh = await prepareRefreshToken({
        userId,
        familyId,
        deviceInfo: "outbox-device",
        ip: "127.0.0.13",
      });
      assert.ok(preparedRefresh);
      const previousRedis = globalThis.tecpeyRedisClient;

      try {
        await admitSessionAuthority({
          userId,
          access: preparedAccess,
          refresh: preparedRefresh,
          deviceInfo: "outbox-device",
          ip: "127.0.0.13",
          method: "password",
          audit: userAudit(userId, "session.issue"),
        });

        globalThis.tecpeyRedisClient = undefined;
        const revoked = await revokeSessionAuthority({
          userId,
          sessionJti: preparedAccess.jti,
          audit: userAudit(userId, "session.revoke"),
        });
        assert.equal(revoked.ok, true);
        if (revoked.ok) assert.equal(revoked.revocationPending, true);

        const durable = await withClient(async (client) => {
          const session = await client.query<{ is_revoked: boolean }>(
            "SELECT is_revoked FROM user_sessions WHERE id = $1",
            [preparedAccess.jti],
          );
          const outbox = await client.query<{ status: string }>(
            "SELECT status FROM session_revocation_outbox WHERE session_jti = $1",
            [preparedAccess.jti],
          );
          return {
            revoked: session.rows[0]?.is_revoked,
            outboxStatus: outbox.rows[0]?.status,
          };
        });
        assert.equal(durable.revoked, true);
        assert.equal(durable.outboxStatus, "pending");

        if (redis) {
          globalThis.tecpeyRedisClient = redis;
          assert.equal(await publishPendingSessionRevocations(), true);
          assert.equal(
            await redis.get(`tecpey:revoked:jti:${preparedAccess.jti}`),
            "1",
          );
        }
      } finally {
        globalThis.tecpeyRedisClient = previousRedis;
        await cleanupUser(userId);
      }
    },
  );

  it(
    "prevents cross-principal revocation and removes a device with its bound family",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const ownerId = `session-owner-${randomUUID()}`;
      const attackerId = `session-attacker-${randomUUID()}`;
      const familyId = randomUUID();
      const preparedAccess = access(ownerId);
      const preparedRefresh = await prepareRefreshToken({
        userId: ownerId,
        familyId,
        deviceInfo: "owner-device",
        ip: "127.0.0.14",
      });
      assert.ok(preparedRefresh);

      try {
        const admitted = await admitSessionAuthority({
          userId: ownerId,
          access: preparedAccess,
          refresh: preparedRefresh,
          deviceInfo: "owner-device",
          ip: "127.0.0.14",
          method: "password",
          audit: userAudit(ownerId, "session.issue"),
        });

        const foreign = await revokeSessionAuthority({
          userId: attackerId,
          sessionJti: preparedAccess.jti,
          audit: userAudit(attackerId, "session.revoke"),
        });
        assert.deepEqual(foreign, { ok: false, reason: "session_not_found" });

        const removedByAttacker = await removeKnownDeviceAuthority({
          userId: attackerId,
          deviceId: admitted.knownDeviceId,
          audit: userAudit(attackerId, "device.remove"),
        });
        assert.deepEqual(removedByAttacker, {
          ok: false,
          reason: "device_not_found",
        });

        const active = await withClient(async (client) => {
          const result = await client.query<{ is_revoked: boolean }>(
            "SELECT is_revoked FROM user_sessions WHERE id = $1",
            [preparedAccess.jti],
          );
          return result.rows[0]?.is_revoked;
        });
        assert.equal(active, false);

        const removed = await removeKnownDeviceAuthority({
          userId: ownerId,
          deviceId: admitted.knownDeviceId,
          audit: userAudit(ownerId, "device.remove"),
        });
        assert.equal(removed.ok, true);
        if (removed.ok) assert.equal(removed.revokedCount >= 1, true);

        const state = await withClient(async (client) => {
          const session = await client.query<{ is_revoked: boolean }>(
            "SELECT is_revoked FROM user_sessions WHERE id = $1",
            [preparedAccess.jti],
          );
          const family = await client.query<{ status: string }>(
            "SELECT status FROM refresh_token_families WHERE id = $1",
            [familyId],
          );
          const device = await client.query<{ is_active: boolean }>(
            "SELECT is_active FROM known_devices WHERE id = $1",
            [admitted.knownDeviceId],
          );
          return {
            sessionRevoked: session.rows[0]?.is_revoked,
            familyStatus: family.rows[0]?.status,
            deviceActive: device.rows[0]?.is_active,
          };
        });
        assert.equal(state.sessionRevoked, true);
        assert.equal(state.familyStatus, "revoked");
        assert.equal(state.deviceActive, false);
      } finally {
        await cleanupUser(ownerId);
        await cleanupUser(attackerId);
      }
    },
  );
});
