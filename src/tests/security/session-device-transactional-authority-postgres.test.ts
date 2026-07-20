import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { prepareRefreshToken } from "../../lib/security/refresh-tokens";
import {
  admitSession,
  removeKnownDevice,
  repairPendingSessionRevocations,
  revokeExactSession,
  rotateSession,
  type SessionAuditContext,
} from "../../lib/security/session-authority";
import { hashSensitiveAuditRequest } from "../../lib/security/sensitive-mutation-audit";

process.env.TECPEY_REFRESH_SECRET ??=
  "session-authority-test-refresh-secret-with-32-characters";

const databaseUrl = process.env.DATABASE_URL?.trim();
const databaseConfigured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;
const userIds = new Set<string>();
const tenantIds = new Set<string>();
const previousRedis = globalThis.tecpeyRedisClient;

async function withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

function tenantId(): string {
  const value = `session-test-${randomUUID()}`;
  tenantIds.add(value);
  return value;
}

function audit(input: {
  tenant: string;
  userId: string;
  action: string;
  correlationId?: string;
  evidence?: Record<string, unknown>;
}): SessionAuditContext {
  return {
    tenantId: input.tenant,
    actorType: "user",
    actorId: input.userId,
    correlationId: input.correlationId ?? `session-audit-${randomUUID()}`,
    requestHash: hashSensitiveAuditRequest({
      tenantId: input.tenant,
      userId: input.userId,
      action: input.action,
      ...input.evidence,
    }),
  };
}

async function prepare(input: {
  userId: string;
  familyId: string;
  parentId?: string | null;
  deviceInfo?: string;
  ip?: string;
}) {
  const prepared = await prepareRefreshToken({
    userId: input.userId,
    familyId: input.familyId,
    parentId: input.parentId ?? null,
    deviceInfo: input.deviceInfo ?? "Session Authority Test Device",
    ip: input.ip ?? "203.0.113.10",
  });
  assert.ok(prepared);
  return prepared;
}

async function admit(input: {
  tenant: string;
  userId: string;
  familyId?: string;
  accessJti?: string;
  correlationId?: string;
  deviceInfo?: string;
  ip?: string;
  deviceFingerprint?: string;
}) {
  userIds.add(input.userId);
  const familyId = input.familyId ?? randomUUID();
  const accessJti = input.accessJti ?? randomUUID();
  const deviceInfo = input.deviceInfo ?? "Session Authority Test Device";
  const ip = input.ip ?? "203.0.113.10";
  const prepared = await prepare({
    userId: input.userId,
    familyId,
    deviceInfo,
    ip,
  });
  const result = await admitSession({
    userId: input.userId,
    accessJti,
    accessExpiresAt: new Date(Date.now() + 15 * 60_000),
    preparedRefresh: prepared,
    deviceInfo,
    ip,
    deviceFingerprint:
      input.deviceFingerprint ?? `device-evidence-${randomUUID()}`,
    method: "password",
    audit: audit({
      tenant: input.tenant,
      userId: input.userId,
      action: "session.issue",
      correlationId: input.correlationId,
      evidence: { familyId, accessJti },
    }),
  });
  return { ...result, accessJti, familyId, prepared };
}

async function cleanup(): Promise<void> {
  if (!pool) return;
  await withClient(async (client) => {
    if (userIds.size > 0) {
      const users = [...userIds];
      await client.query(
        "DELETE FROM session_revocation_outbox WHERE user_id = ANY($1::text[])",
        [users],
      );
      await client.query(
        "DELETE FROM user_sessions WHERE user_id = ANY($1::text[])",
        [users],
      );
      await client.query(
        "DELETE FROM refresh_tokens WHERE user_id = ANY($1::text[])",
        [users],
      );
      await client.query(
        "DELETE FROM known_devices WHERE user_id = ANY($1::text[])",
        [users],
      );
    }
    if (tenantIds.size > 0) {
      await client.query(
        "DELETE FROM sensitive_mutation_audit_events WHERE tenant_id = ANY($1::text[])",
        [[...tenantIds]],
      );
    }
  });
}

before(async () => {
  if (!databaseConfigured || !databaseUrl) return;
  pool = new Pool({
    connectionString: databaseUrl,
    max: 12,
    idleTimeoutMillis: 1_000,
    allowExitOnIdle: true,
  });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
});

after(async () => {
  globalThis.tecpeyRedisClient = previousRedis;
  await cleanup();
  await pool?.end();
  pool = null;
});

describe("Transactional session and device authority", { concurrency: 1 }, () => {
  it(
    "commits refresh, access session, known device and secret-free evidence atomically",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const tenant = tenantId();
      const userId = `session-user-${randomUUID()}`;
      const deviceInfo = "Highly Sensitive Browser User Agent";
      const ip = "203.0.113.77";
      const admitted = await admit({ tenant, userId, deviceInfo, ip });

      await withClient(async (client) => {
        const tuple = await client.query<{
          refresh_family_id: string;
          refresh_token_id: string;
          known_device_id: string;
        }>(
          `SELECT refresh_family_id, refresh_token_id, known_device_id
             FROM user_sessions
            WHERE id = $1`,
          [admitted.accessJti],
        );
        assert.equal(tuple.rowCount, 1);
        assert.equal(tuple.rows[0]!.refresh_family_id, admitted.familyId);
        assert.equal(tuple.rows[0]!.refresh_token_id, admitted.prepared.jti);
        assert.equal(tuple.rows[0]!.known_device_id, admitted.knownDeviceId);

        const evidence = await client.query<{ document: string }>(
          `SELECT row_to_json(event)::text AS document
             FROM sensitive_mutation_audit_events event
            WHERE tenant_id = $1
              AND actor_id = $2
              AND action = 'session.issue'
              AND outcome = 'success'
            LIMIT 1`,
          [tenant, userId],
        );
        assert.equal(evidence.rowCount, 1);
        const document = evidence.rows[0]!.document;
        assert.equal(document.includes(admitted.prepared.token), false);
        assert.equal(document.includes(admitted.accessJti), false);
        assert.equal(document.includes(ip), false);
        assert.equal(document.includes(deviceInfo), false);
        assert.match(document, /refreshFamilyFingerprint/);
        assert.match(document, /deviceEvidenceFingerprint/);
      });
    },
  );

  it(
    "rolls back the complete admission tuple when mandatory evidence is rejected",
    { skip: !databaseConfigured, timeout: 20_000 },
    async () => {
      const userId = `session-user-${randomUUID()}`;
      userIds.add(userId);
      const familyId = randomUUID();
      const accessJti = randomUUID();
      const prepared = await prepare({ userId, familyId });

      await assert.rejects(
        admitSession({
          userId,
          accessJti,
          accessExpiresAt: new Date(Date.now() + 60_000),
          preparedRefresh: prepared,
          deviceInfo: "rollback-device",
          ip: "203.0.113.20",
          deviceFingerprint: `rollback-${randomUUID()}`,
          method: "password",
          audit: audit({
            tenant: "INVALID TENANT",
            userId,
            action: "session.issue",
          }),
        }),
        /invalid_sensitive_audit_tenant/,
      );

      await withClient(async (client) => {
        const sessions = await client.query(
          "SELECT 1 FROM user_sessions WHERE id = $1",
          [accessJti],
        );
        const refresh = await client.query(
          "SELECT 1 FROM refresh_tokens WHERE id = $1",
          [prepared.jti],
        );
        const devices = await client.query(
          "SELECT 1 FROM known_devices WHERE user_id = $1",
          [userId],
        );
        assert.equal(sessions.rowCount, 0);
        assert.equal(refresh.rowCount, 0);
        assert.equal(devices.rowCount, 0);
      });
    },
  );

  it(
    "rolls back a replacement refresh row when the access JTI conflicts",
    { skip: !databaseConfigured, timeout: 20_000 },
    async () => {
      const tenant = tenantId();
      const userId = `session-user-${randomUUID()}`;
      const accessJti = randomUUID();
      await admit({ tenant, userId, accessJti });

      const secondFamily = randomUUID();
      const replacement = await prepare({ userId, familyId: secondFamily });
      await assert.rejects(
        admitSession({
          userId,
          accessJti,
          accessExpiresAt: new Date(Date.now() + 60_000),
          preparedRefresh: replacement,
          deviceInfo: "second-device",
          ip: "203.0.113.21",
          deviceFingerprint: `second-${randomUUID()}`,
          method: "password",
          audit: audit({
            tenant,
            userId,
            action: "session.issue",
          }),
        }),
        /access_jti_conflict/,
      );

      await withClient(async (client) => {
        const refresh = await client.query(
          "SELECT 1 FROM refresh_tokens WHERE id = $1",
          [replacement.jti],
        );
        assert.equal(refresh.rowCount, 0);
      });
    },
  );

  it(
    "allows at most one concurrent rotation and revokes the family on reuse",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const tenant = tenantId();
      const userId = `session-user-${randomUUID()}`;
      const admitted = await admit({ tenant, userId });
      const firstReplacement = await prepare({
        userId,
        familyId: admitted.familyId,
        parentId: admitted.prepared.jti,
      });
      const secondReplacement = await prepare({
        userId,
        familyId: admitted.familyId,
        parentId: admitted.prepared.jti,
      });
      globalThis.tecpeyRedisClient = undefined;

      const [first, second] = await Promise.all([
        rotateSession({
          rawRefreshToken: admitted.prepared.token,
          accessJti: randomUUID(),
          accessExpiresAt: new Date(Date.now() + 60_000),
          preparedRefresh: firstReplacement,
          deviceInfo: "rotation-device",
          ip: "203.0.113.30",
          deviceFingerprint: `rotation-${randomUUID()}`,
          tenantId: tenant,
          correlationId: `rotation-${randomUUID()}`,
          requestHash: hashSensitiveAuditRequest({ attempt: 1 }),
        }),
        rotateSession({
          rawRefreshToken: admitted.prepared.token,
          accessJti: randomUUID(),
          accessExpiresAt: new Date(Date.now() + 60_000),
          preparedRefresh: secondReplacement,
          deviceInfo: "rotation-device",
          ip: "203.0.113.30",
          deviceFingerprint: `rotation-${randomUUID()}`,
          tenantId: tenant,
          correlationId: `rotation-${randomUUID()}`,
          requestHash: hashSensitiveAuditRequest({ attempt: 2 }),
        }),
      ]);

      const results = [first, second];
      assert.equal(results.filter((result) => result.ok).length, 1);
      assert.equal(
        results.filter(
          (result) => !result.ok && result.reason === "token_reused",
        ).length,
        1,
      );

      await withClient(async (client) => {
        const rows = await client.query<{ is_revoked: boolean }>(
          `SELECT is_revoked
             FROM refresh_tokens
            WHERE user_id = $1
              AND family_id = $2`,
          [userId, admitted.familyId],
        );
        assert.equal(rows.rowCount, 2);
        assert.equal(rows.rows.every((row) => row.is_revoked), true);

        const sessions = await client.query<{ is_revoked: boolean }>(
          `SELECT is_revoked
             FROM user_sessions
            WHERE user_id = $1
              AND refresh_family_id = $2`,
          [userId, admitted.familyId],
        );
        assert.equal(sessions.rows.every((row) => row.is_revoked), true);
      });
    },
  );

  it(
    "rejects changed correlation replay and rolls back the second admission",
    { skip: !databaseConfigured, timeout: 20_000 },
    async () => {
      const tenant = tenantId();
      const userId = `session-user-${randomUUID()}`;
      const correlationId = `session-replay-${randomUUID()}`;
      await admit({ tenant, userId, correlationId });

      const familyId = randomUUID();
      const accessJti = randomUUID();
      const prepared = await prepare({ userId, familyId });
      await assert.rejects(
        admitSession({
          userId,
          accessJti,
          accessExpiresAt: new Date(Date.now() + 60_000),
          preparedRefresh: prepared,
          deviceInfo: "replay-device",
          ip: "203.0.113.40",
          deviceFingerprint: `replay-${randomUUID()}`,
          method: "password",
          audit: audit({
            tenant,
            userId,
            action: "session.issue",
            correlationId,
            evidence: { changed: true },
          }),
        }),
        /sensitive_audit_correlation_conflict/,
      );

      await withClient(async (client) => {
        assert.equal(
          (await client.query("SELECT 1 FROM user_sessions WHERE id = $1", [accessJti]))
            .rowCount,
          0,
        );
        assert.equal(
          (await client.query("SELECT 1 FROM refresh_tokens WHERE id = $1", [prepared.jti]))
            .rowCount,
          0,
        );
      });
    },
  );

  it(
    "binds exact-session revocation to the owner and its refresh family",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const tenant = tenantId();
      const ownerId = `session-user-${randomUUID()}`;
      const attackerId = `session-user-${randomUUID()}`;
      userIds.add(attackerId);
      const first = await admit({ tenant, userId: ownerId });
      const second = await admit({ tenant, userId: ownerId });

      const denied = await revokeExactSession({
        sessionId: first.accessJti,
        userId: attackerId,
        audit: audit({
          tenant,
          userId: attackerId,
          action: "session.revoke",
        }),
      });
      assert.deepEqual(denied, { ok: false, reason: "session_not_found" });

      globalThis.tecpeyRedisClient = undefined;
      const revoked = await revokeExactSession({
        sessionId: first.accessJti,
        userId: ownerId,
        audit: audit({ tenant, userId: ownerId, action: "session.revoke" }),
      });
      assert.equal(revoked.ok, true);
      if (revoked.ok) assert.equal(revoked.denyCachePending, true);

      await withClient(async (client) => {
        const rows = await client.query<{
          id: string;
          refresh_family_id: string;
          is_revoked: boolean;
        }>(
          `SELECT id, refresh_family_id, is_revoked
             FROM user_sessions
            WHERE id = ANY($1::text[])`,
          [[first.accessJti, second.accessJti]],
        );
        const firstRow = rows.rows.find((row) => row.id === first.accessJti)!;
        const secondRow = rows.rows.find((row) => row.id === second.accessJti)!;
        assert.equal(firstRow.refresh_family_id, first.familyId);
        assert.equal(firstRow.is_revoked, true);
        assert.equal(secondRow.refresh_family_id, second.familyId);
        assert.equal(secondRow.is_revoked, false);
      });
    },
  );

  it(
    "device removal revokes only device-bound refresh and access authority",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const tenant = tenantId();
      const userId = `session-user-${randomUUID()}`;
      const first = await admit({
        tenant,
        userId,
        deviceFingerprint: `device-one-${randomUUID()}`,
      });
      const second = await admit({
        tenant,
        userId,
        deviceFingerprint: `device-two-${randomUUID()}`,
      });
      globalThis.tecpeyRedisClient = undefined;

      const removed = await removeKnownDevice({
        id: first.knownDeviceId,
        userId,
        audit: audit({ tenant, userId, action: "device.remove" }),
      });
      assert.equal(removed.ok, true);

      await withClient(async (client) => {
        const sessions = await client.query<{ id: string; is_revoked: boolean }>(
          "SELECT id, is_revoked FROM user_sessions WHERE id = ANY($1::text[])",
          [[first.accessJti, second.accessJti]],
        );
        assert.equal(
          sessions.rows.find((row) => row.id === first.accessJti)!.is_revoked,
          true,
        );
        assert.equal(
          sessions.rows.find((row) => row.id === second.accessJti)!.is_revoked,
          false,
        );

        const refresh = await client.query<{ id: string; is_revoked: boolean }>(
          "SELECT id, is_revoked FROM refresh_tokens WHERE id = ANY($1::text[])",
          [[first.prepared.jti, second.prepared.jti]],
        );
        assert.equal(
          refresh.rows.find((row) => row.id === first.prepared.jti)!.is_revoked,
          true,
        );
        assert.equal(
          refresh.rows.find((row) => row.id === second.prepared.jti)!.is_revoked,
          false,
        );
      });
    },
  );

  it(
    "retains durable pending revocation evidence and repairs it after Redis returns",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const tenant = tenantId();
      const userId = `session-user-${randomUUID()}`;
      const admitted = await admit({ tenant, userId });
      globalThis.tecpeyRedisClient = undefined;

      const revoked = await revokeExactSession({
        sessionId: admitted.accessJti,
        userId,
        audit: audit({ tenant, userId, action: "session.revoke" }),
      });
      assert.equal(revoked.ok, true);
      if (revoked.ok) assert.equal(revoked.denyCachePending, true);

      await withClient(async (client) => {
        const pending = await client.query<{ status: string }>(
          "SELECT status FROM session_revocation_outbox WHERE session_jti = $1",
          [admitted.accessJti],
        );
        assert.equal(pending.rows[0]?.status, "pending");
      });

      const writes: string[] = [];
      const fakeRedis = {
        pipeline() {
          const operations: string[] = [];
          return {
            set(key: string) {
              operations.push(key);
              return this;
            },
            async exec() {
              writes.push(...operations);
              return operations.map(() => [null, "OK"]);
            },
          };
        },
      };
      globalThis.tecpeyRedisClient = fakeRedis as never;

      const repaired = await repairPendingSessionRevocations(50);
      assert.ok(repaired.selected >= 1);
      assert.ok(repaired.published >= 1);
      assert.ok(writes.some((key) => key.endsWith(admitted.accessJti)));

      await withClient(async (client) => {
        const published = await client.query<{ status: string }>(
          "SELECT status FROM session_revocation_outbox WHERE session_jti = $1",
          [admitted.accessJti],
        );
        assert.equal(published.rows[0]?.status, "published");
      });
    },
  );
});
