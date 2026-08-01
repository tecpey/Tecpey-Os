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

// Cross-tenant adversarial proof for sensitive_mutation_audit_events (#109).
//
// This is the platform-wide immutable audit ledger for sensitive mutations. Its
// tenant boundary is the uniqueness UNIQUE (tenant_id, action, correlation_id):
// writeSensitiveMutationAuditTx inserts ON CONFLICT (tenant_id, action,
// correlation_id) DO NOTHING, and on conflict reads the existing row back
// (WHERE tenant_id = $1 AND action = $2 AND correlation_id = $3) and throws
// `sensitive_audit_correlation_conflict` unless the whole event matches.
//
// The threat proven closed: tenant B recording an audit event whose (action,
// correlation_id) collides with one tenant A already recorded — but with a
// different request — must record its own row, not be rejected as a conflict
// against tenant A's event. If the unique key or the conflict read dropped
// tenant_id, tenant B's write would collide with tenant A's row, the request
// hashes would differ, and B would throw a cross-tenant correlation conflict —
// letting tenant A deny tenant B the ability to audit simply by picking the
// correlation id first, and leaking that A holds that correlation. The proof
// asserts each tenant records its own audit row.

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

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

function event(overrides: Partial<SensitiveMutationAuditEvent> = {}): SensitiveMutationAuditEvent {
  const suffix = randomUUID();
  return {
    tenantId: `tenant-a-${suffix}`,
    actorType: "student",
    actorId: `actor-${suffix}`,
    action: "device_token.register",
    resourceType: "device_token",
    resourceId: `resource-${suffix}`,
    outcome: "success",
    correlationId: `correlation-${suffix}`,
    requestHash: hashSensitiveAuditRequest({ suffix }),
    metadata: {},
    ...overrides,
  };
}

async function tenantOfAudit(auditId: string): Promise<string | null> {
  return withClient(async (client) => {
    const rows = await client.query<{ tenant_id: string }>(
      "SELECT tenant_id FROM sensitive_mutation_audit_events WHERE id = $1::uuid",
      [auditId],
    );
    return rows.rows[0]?.tenant_id ?? null;
  });
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 8, allowExitOnIdle: true });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
});

after(async () => {
  await pool?.end();
  pool = null;
});

describe("Sensitive mutation audit cross-tenant isolation", () => {
  it(
    "keeps each tenant's audit correlation private: the same (action, correlation) under two tenants records two rows",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const suffix = randomUUID();
      const action = "device_token.register" as const;
      const correlationId = `correlation-${suffix}`;
      const shared = { action, correlationId, resourceType: "device_token" as const };

      const idA = await inTransaction((client) =>
        writeSensitiveMutationAuditTx(
          client,
          event({
            ...shared,
            tenantId: `tenant-a-${suffix}`,
            requestHash: hashSensitiveAuditRequest({ tenant: "a", suffix }),
          }),
        ),
      );

      // Tenant B: identical (action, correlation_id) but a different request.
      // The core negative assertion: B records its OWN row and is NOT rejected
      // as a cross-tenant correlation conflict against tenant A's event.
      const idB = await inTransaction((client) =>
        writeSensitiveMutationAuditTx(
          client,
          event({
            ...shared,
            tenantId: `tenant-b-${suffix}`,
            requestHash: hashSensitiveAuditRequest({ tenant: "b", suffix }),
          }),
        ),
      );

      assert.notEqual(idA, idB, "each tenant must record a distinct audit row");
      assert.equal(await tenantOfAudit(idA), `tenant-a-${suffix}`);
      assert.equal(await tenantOfAudit(idB), `tenant-b-${suffix}`);
    },
  );

  it(
    "enforces conflict within the owning tenant only, not across tenants",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const suffix = randomUUID();
      const action = "device_token.register" as const;
      const correlationId = `correlation-${suffix}`;
      const tenantA = `tenant-a-${suffix}`;
      const tenantB = `tenant-b-${suffix}`;

      const baseA = event({
        tenantId: tenantA,
        action,
        correlationId,
        resourceType: "device_token",
        requestHash: hashSensitiveAuditRequest({ tenant: "a", suffix }),
      });
      const baseB = {
        ...baseA,
        tenantId: tenantB,
        requestHash: hashSensitiveAuditRequest({ tenant: "b", suffix }),
      };

      // Insert BOTH tenants' rows for the same (action, correlation_id) FIRST,
      // so the conflict read-back path below runs while both identically-keyed
      // rows exist. This is what forces the WHERE tenant_id = $1 conflict read
      // to be exercised: if it dropped tenant_id, the LIMIT 1 lookup could
      // return the other tenant's row.
      const firstA = await inTransaction((client) => writeSensitiveMutationAuditTx(client, baseA));
      const firstB = await inTransaction((client) => writeSensitiveMutationAuditTx(client, baseB));
      assert.notEqual(firstA, firstB);

      // Replay EACH tenant with both rows present. The conflict read-back must
      // resolve to that tenant's own row — a tenant-blind read would hand one of
      // them the other tenant's row and either return the wrong id or throw a
      // spurious sensitive_audit_correlation_conflict (the request hashes differ).
      const replayA = await inTransaction((client) => writeSensitiveMutationAuditTx(client, baseA));
      const replayB = await inTransaction((client) => writeSensitiveMutationAuditTx(client, baseB));
      assert.equal(replayA, firstA, "tenant A's replay must resolve to tenant A's own row");
      assert.equal(replayB, firstB, "tenant B's replay must resolve to tenant B's own row");
      assert.equal(await tenantOfAudit(firstA), tenantA);
      assert.equal(await tenantOfAudit(firstB), tenantB);

      // A DIFFERENT request under the SAME tenant + correlation is a real
      // within-tenant conflict and must still be rejected — the guarantee is not
      // weakened by the isolation, and the read-back correctly finds A's row.
      await assert.rejects(
        inTransaction((client) =>
          writeSensitiveMutationAuditTx(client, {
            ...baseA,
            requestHash: hashSensitiveAuditRequest({ tenant: "a", changed: true, suffix }),
          }),
        ),
        /sensitive_audit_correlation_conflict/,
      );
    },
  );
});
