import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import {
  createApiKey,
  deleteApiKey,
  rotateApiKey,
  setApiKeyActive,
  type ApiKeyMutationAuditContext,
} from "../../lib/security/api-keys";
import { hashSensitiveAuditRequest } from "../../lib/security/sensitive-mutation-audit";

const databaseUrl = process.env.DATABASE_URL?.trim();
const databaseConfigured = Boolean(
  databaseUrl && !databaseUrl.includes("CHANGE_ME"),
);
let pool: Pool | null = null;
const testUsers = new Set<string>();

async function withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

function auditContext(
  userId: string,
  action: string,
  correlationId = `api-key-audit-${randomUUID()}`,
  tenantId = `api-key-test-${randomUUID()}`,
): ApiKeyMutationAuditContext {
  return {
    tenantId,
    actorType: "user",
    actorId: userId,
    correlationId,
    requestHash: hashSensitiveAuditRequest({ userId, action }),
  };
}

async function keyRow(keyId: string): Promise<{
  key_hash: string;
  key_prefix: string;
  is_active: boolean;
} | null> {
  return withClient(async (client) => {
    const result = await client.query<{
      key_hash: string;
      key_prefix: string;
      is_active: boolean;
    }>(
      `SELECT key_hash, key_prefix, is_active
         FROM api_keys
        WHERE id = $1
        LIMIT 1`,
      [keyId],
    );
    return result.rows[0] ?? null;
  });
}

async function cleanup(): Promise<void> {
  if (!pool || testUsers.size === 0) return;
  await withClient(async (client) => {
    await client.query(
      `DELETE FROM api_keys
        WHERE user_id = ANY($1::text[])`,
      [[...testUsers]],
    );
  });
}

before(async () => {
  if (!databaseConfigured || !databaseUrl) return;
  pool = new Pool({
    connectionString: databaseUrl,
    max: 6,
    idleTimeoutMillis: 1_000,
    allowExitOnIdle: true,
  });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
});

after(async () => {
  await cleanup();
  await pool?.end();
  pool = null;
});

describe("API key transactional audit authority", () => {
  it(
    "commits credential creation and mandatory evidence atomically without plaintext leakage",
    { skip: !databaseConfigured, timeout: 20_000 },
    async () => {
      const userId = `api-key-user-${randomUUID()}`;
      testUsers.add(userId);
      const audit = auditContext(userId, "create");
      const created = await createApiKey({
        userId,
        name: "CI key",
        permissions: ["read", "trade"],
        ipWhitelist: ["127.0.0.1"],
        audit,
      });

      assert.match(created.plaintext, /^tecpey_[A-Za-z0-9_-]{8}_[A-Za-z0-9_-]{48}$/);
      const stored = await keyRow(created.apiKey.id);
      assert.ok(stored);
      assert.notEqual(stored.key_hash, created.plaintext);

      await withClient(async (client) => {
        const result = await client.query<{ document: string }>(
          `SELECT row_to_json(event)::text AS document
             FROM sensitive_mutation_audit_events event
            WHERE tenant_id = $1
              AND action = 'api_key.create'
              AND correlation_id = $2
            LIMIT 1`,
          [audit.tenantId, audit.correlationId],
        );
        const document = result.rows[0]?.document ?? "";
        assert.match(document, new RegExp(created.apiKey.id));
        assert.match(document, /credentialFingerprint/);
        assert.equal(document.includes(created.plaintext), false);
        assert.equal(document.includes(stored.key_hash), false);
      });
    },
  );

  it(
    "rolls back API key creation when mandatory audit admission is invalid",
    { skip: !databaseConfigured, timeout: 20_000 },
    async () => {
      const userId = `api-key-user-${randomUUID()}`;
      testUsers.add(userId);
      const invalidAudit = auditContext(userId, "create", undefined, "INVALID TENANT");

      await assert.rejects(
        createApiKey({
          userId,
          name: "must rollback",
          permissions: ["read"],
          audit: invalidAudit,
        }),
        /invalid_sensitive_audit_tenant/,
      );

      await withClient(async (client) => {
        const result = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
             FROM api_keys
            WHERE user_id = $1`,
          [userId],
        );
        assert.equal(Number(result.rows[0]?.count), 0);
      });
    },
  );

  it(
    "prevents replayed rotation from committing a second credential version",
    { skip: !databaseConfigured, timeout: 20_000 },
    async () => {
      const userId = `api-key-user-${randomUUID()}`;
      testUsers.add(userId);
      const created = await createApiKey({
        userId,
        name: "rotation key",
        permissions: ["read"],
        audit: auditContext(userId, "create"),
      });

      const correlationId = `api-key-rotate-${randomUUID()}`;
      const audit = auditContext(userId, "rotate", correlationId);
      const first = await rotateApiKey(created.apiKey.id, userId, audit);
      assert.ok(first);
      const firstStored = await keyRow(created.apiKey.id);
      assert.ok(firstStored);

      await assert.rejects(
        rotateApiKey(created.apiKey.id, userId, audit),
        /sensitive_audit_correlation_conflict/,
      );
      const afterReplay = await keyRow(created.apiKey.id);
      assert.deepEqual(afterReplay, firstStored);
    },
  );

  it(
    "transactionally records disable, enable and delete lifecycle evidence",
    { skip: !databaseConfigured, timeout: 20_000 },
    async () => {
      const userId = `api-key-user-${randomUUID()}`;
      testUsers.add(userId);
      const created = await createApiKey({
        userId,
        name: "lifecycle key",
        permissions: ["read"],
        audit: auditContext(userId, "create"),
      });

      const disabled = await setApiKeyActive(
        created.apiKey.id,
        userId,
        false,
        auditContext(userId, "disable"),
      );
      assert.equal(disabled, true);
      assert.equal((await keyRow(created.apiKey.id))?.is_active, false);

      const enabled = await setApiKeyActive(
        created.apiKey.id,
        userId,
        true,
        auditContext(userId, "enable"),
      );
      assert.equal(enabled, true);
      assert.equal((await keyRow(created.apiKey.id))?.is_active, true);

      const deleteAudit = auditContext(userId, "delete");
      const deleted = await deleteApiKey(created.apiKey.id, userId, deleteAudit);
      assert.equal(deleted, true);
      assert.equal(await keyRow(created.apiKey.id), null);

      await withClient(async (client) => {
        const result = await client.query<{ action: string }>(
          `SELECT action
             FROM sensitive_mutation_audit_events
            WHERE actor_id = $1
              AND resource_id = $2
              AND action = ANY($3::text[])
            ORDER BY action`,
          [
            userId,
            created.apiKey.id,
            ["api_key.create", "api_key.disable", "api_key.enable", "api_key.delete"],
          ],
        );
        assert.deepEqual(
          result.rows.map((row) => row.action),
          ["api_key.create", "api_key.delete", "api_key.disable", "api_key.enable"],
        );
      });
    },
  );

  it(
    "does not mutate or emit success evidence for another principal's key",
    { skip: !databaseConfigured, timeout: 20_000 },
    async () => {
      const ownerId = `api-key-user-${randomUUID()}`;
      const attackerId = `api-key-user-${randomUUID()}`;
      testUsers.add(ownerId);
      testUsers.add(attackerId);
      const created = await createApiKey({
        userId: ownerId,
        name: "owned key",
        permissions: ["read"],
        audit: auditContext(ownerId, "create"),
      });
      const attackerAudit = auditContext(attackerId, "disable");

      const updated = await setApiKeyActive(
        created.apiKey.id,
        attackerId,
        false,
        attackerAudit,
      );
      assert.equal(updated, false);
      assert.equal((await keyRow(created.apiKey.id))?.is_active, true);

      await withClient(async (client) => {
        const result = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
             FROM sensitive_mutation_audit_events
            WHERE tenant_id = $1
              AND actor_id = $2
              AND correlation_id = $3`,
          [attackerAudit.tenantId, attackerId, attackerAudit.correlationId],
        );
        assert.equal(Number(result.rows[0]?.count), 0);
      });
    },
  );
});
