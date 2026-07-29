import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import {
  hashSensitiveAuditRequest,
  writeSensitiveMutationAuditTx,
  type SensitiveMutationAuditEvent,
} from "../../lib/security/sensitive-mutation-audit";

const databaseUrl = process.env.DATABASE_URL?.trim();
const databaseConfigured = Boolean(
  databaseUrl && !databaseUrl.includes("CHANGE_ME"),
);
let pool: Pool | null = null;

function event(
  overrides: Partial<SensitiveMutationAuditEvent> = {},
): SensitiveMutationAuditEvent {
  const suffix = randomUUID();
  return {
    tenantId: `audit-test-${suffix}`,
    actorType: "student",
    actorId: `student-${suffix}`,
    action: "device_token.register",
    resourceType: "device_token",
    resourceId: hashSensitiveAuditRequest(`resource-${suffix}`),
    outcome: "success",
    correlationId: `correlation-${suffix}`,
    requestHash: hashSensitiveAuditRequest({ suffix }),
    metadata: {
      platform: "ios",
      tokenHash: hashSensitiveAuditRequest(`token-${suffix}`),
    },
    ...overrides,
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

async function inTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const value = await callback(client);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function cleanup(): Promise<void> {
  if (!pool) return;
  await withClient(async (client) => {
    await client.query(
      "DELETE FROM sensitive_mutation_audit_test_effects WHERE tenant_id LIKE 'audit-test-%'",
    ).catch(() => undefined);
    await client.query(
      "DELETE FROM sensitive_mutation_audit_events WHERE tenant_id LIKE 'audit-test-%'",
    ).catch(() => undefined);
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
  await withClient(async (client) => {
    await applyDatabaseMigrationsWithLock(client);
    await client.query(`
      CREATE TABLE IF NOT EXISTS sensitive_mutation_audit_test_effects (
        tenant_id TEXT NOT NULL,
        effect_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (tenant_id, effect_id)
      )
    `);
  });
  await cleanup();
});

after(async () => {
  await cleanup();
  await pool?.end();
  pool = null;
});

describe("Sensitive mutation audit authority", () => {
  it(
    "reuses an exact correlation but rejects changed or cross-user evidence",
    { skip: !databaseConfigured, timeout: 20_000 },
    async () => {
      const original = event();
      const first = await inTransaction((client) =>
        writeSensitiveMutationAuditTx(client, original),
      );
      const replay = await inTransaction((client) =>
        writeSensitiveMutationAuditTx(client, original),
      );
      assert.equal(replay, first);

      await assert.rejects(
        inTransaction((client) =>
          writeSensitiveMutationAuditTx(client, {
            ...original,
            requestHash: hashSensitiveAuditRequest({ changed: true }),
          }),
        ),
        /sensitive_audit_correlation_conflict/,
      );
      await assert.rejects(
        inTransaction((client) =>
          writeSensitiveMutationAuditTx(client, {
            ...original,
            actorId: `other-${randomUUID()}`,
          }),
        ),
        /sensitive_audit_correlation_conflict/,
      );

      await withClient(async (client) => {
        const rows = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
             FROM sensitive_mutation_audit_events
            WHERE tenant_id = $1
              AND action = $2
              AND correlation_id = $3`,
          [original.tenantId, original.action, original.correlationId],
        );
        assert.equal(Number(rows.rows[0]?.count), 1);
      });
    },
  );

  it(
    "isolates the same correlation across tenants",
    { skip: !databaseConfigured, timeout: 20_000 },
    async () => {
      const correlationId = `shared-correlation-${randomUUID()}`;
      const first = event({ correlationId });
      const second = event({ correlationId });
      await inTransaction((client) => writeSensitiveMutationAuditTx(client, first));
      await inTransaction((client) => writeSensitiveMutationAuditTx(client, second));

      await withClient(async (client) => {
        const rows = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
             FROM sensitive_mutation_audit_events
            WHERE correlation_id = $1
              AND tenant_id = ANY($2::text[])`,
          [correlationId, [first.tenantId, second.tenantId]],
        );
        assert.equal(Number(rows.rows[0]?.count), 2);
      });
    },
  );

  it(
    "rejects raw sensitive metadata in both application and PostgreSQL",
    { skip: !databaseConfigured, timeout: 20_000 },
    async () => {
      const unsafe = event({ metadata: { token: "raw-device-token" } });
      await assert.rejects(
        inTransaction((client) => writeSensitiveMutationAuditTx(client, unsafe)),
        /forbidden_sensitive_audit_key:token/,
      );

      const direct = event();
      await assert.rejects(
        withClient((client) =>
          client.query(
            `INSERT INTO sensitive_mutation_audit_events
               (tenant_id, actor_type, actor_id, action, resource_type,
                resource_id, outcome, correlation_id, request_hash, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                     '{"conversation":"raw private transcript"}'::jsonb)`,
            [
              direct.tenantId,
              direct.actorType,
              direct.actorId,
              direct.action,
              direct.resourceType,
              direct.resourceId,
              direct.outcome,
              direct.correlationId,
              direct.requestHash,
            ],
          ),
        ),
        (error: unknown) =>
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          (error as { code?: string }).code === "22023",
      );
    },
  );

  it(
    "rolls back the mutation when the audit sink rejects evidence",
    { skip: !databaseConfigured, timeout: 20_000 },
    async () => {
      const unsafe = event({ metadata: { password: "never-store-this" } });
      const effectId = `effect-${randomUUID()}`;

      await assert.rejects(
        inTransaction(async (client) => {
          await client.query(
            `INSERT INTO sensitive_mutation_audit_test_effects
               (tenant_id, effect_id)
             VALUES ($1, $2)`,
            [unsafe.tenantId, effectId],
          );
          await writeSensitiveMutationAuditTx(client, unsafe);
        }),
        /forbidden_sensitive_audit_key:password/,
      );

      await withClient(async (client) => {
        const effect = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
             FROM sensitive_mutation_audit_test_effects
            WHERE tenant_id = $1 AND effect_id = $2`,
          [unsafe.tenantId, effectId],
        );
        assert.equal(Number(effect.rows[0]?.count), 0);
      });
    },
  );

  it(
    "keeps completed audit evidence append-only",
    { skip: !databaseConfigured, timeout: 20_000 },
    async () => {
      const immutable = event();
      const id = await inTransaction((client) =>
        writeSensitiveMutationAuditTx(client, immutable),
      );

      for (const sql of [
        "UPDATE sensitive_mutation_audit_events SET outcome = 'failed' WHERE id = $1::uuid",
        "DELETE FROM sensitive_mutation_audit_events WHERE id = $1::uuid",
      ]) {
        await assert.rejects(
          withClient((client) => client.query(sql, [id])),
          (error: unknown) =>
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            (error as { code?: string }).code === "55000",
        );
      }
    },
  );

  it(
    "stores hashes and safe metadata without raw token or conversation content",
    { skip: !databaseConfigured, timeout: 20_000 },
    async () => {
      const rawToken = `raw-token-${randomUUID()}`;
      const rawConversation = `private-conversation-${randomUUID()}`;
      const safe = event({
        action: "mentor_conversations.migrate",
        resourceType: "mentor_conversations",
        requestHash: hashSensitiveAuditRequest({
          tokenHash: hashSensitiveAuditRequest(rawToken),
          contentHash: hashSensitiveAuditRequest(rawConversation),
        }),
        metadata: {
          importedCount: 2,
          tokenHash: hashSensitiveAuditRequest(rawToken),
          contentHash: hashSensitiveAuditRequest(rawConversation),
        },
      });
      await inTransaction((client) => writeSensitiveMutationAuditTx(client, safe));

      await withClient(async (client) => {
        const stored = await client.query<{ document: string }>(
          `SELECT row_to_json(event)::text AS document
             FROM sensitive_mutation_audit_events event
            WHERE tenant_id = $1
              AND action = $2
              AND correlation_id = $3`,
          [safe.tenantId, safe.action, safe.correlationId],
        );
        const document = stored.rows[0]?.document ?? "";
        assert.equal(document.includes(rawToken), false);
        assert.equal(document.includes(rawConversation), false);
        assert.match(document, /tokenHash/);
        assert.match(document, /contentHash/);
      });
    },
  );
});
