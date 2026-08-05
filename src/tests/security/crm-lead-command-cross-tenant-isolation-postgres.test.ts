import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { ingestAcademyLead, type AcademyLeadCommand } from "../../lib/crm/lead-authority";
import { PLATFORM } from "../../lib/platform-config";

// Cross-tenant adversarial proof for crm_lead_commands (#109).
//
// crm_lead_commands is the idempotency ledger for CRM lead ingestion. Its tenant
// boundary is UNIQUE (tenant_id, idempotency_key) and ingestAcademyLead's replay
// lookup `SELECT request_hash, result FROM crm_lead_commands WHERE tenant_id = $1
// AND idempotency_key = $2` — a completed receipt stores the lead result that is
// replayed to the caller.
//
// The threat proven closed: tenant B reusing an idempotency key that tenant A
// has already spent must ingest its own lead, not be replayed tenant A's stored
// result (which carries tenant A's lead id) or be rejected as a cross-tenant
// hash conflict. If the unique key or the replay lookup dropped tenant_id,
// tenant B's ingest would resolve to tenant A's command receipt. The proof
// asserts each tenant commits its own lead under a shared idempotency key.

const databaseUrl = process.env.DATABASE_URL?.trim();
const databaseConfigured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

const TENANT_A = PLATFORM.DEFAULT_TENANT_ID;
const TENANT_B = `tenant-b-${randomUUID()}`;

function uniquePhone(): string {
  const suffix = Math.floor(Math.random() * 900_000_000 + 100_000_000).toString();
  return `+989${suffix}`;
}

function command(overrides: Partial<AcademyLeadCommand> = {}): AcademyLeadCommand {
  return {
    tenantId: TENANT_A,
    idempotencyKey: `crm-cmd-xt-${randomUUID()}`,
    leadKind: "academy_specialized",
    source: "security-test",
    locale: "fa",
    pii: {
      name: "کاربر تست idempotency",
      phone: uniquePhone(),
      email: `lead-${randomUUID()}@example.test`,
      city: "Babol",
      note: "cross-tenant idempotency probe",
    },
    attributes: { mode: "online", track: "risk-first-trading" },
    consent: true,
    legalBasis: "consent",
    privacyNoticeVersion: "academy-leads-cmd-xt-v1",
    networkFingerprint: "a".repeat(64),
    ...overrides,
  };
}

async function withClient<T>(handler: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await handler(client);
  } finally {
    client.release();
  }
}

async function commandRow(
  tenantId: string,
  idempotencyKey: string,
): Promise<{ tenant_id: string; lead_id: string } | null> {
  return withClient(async (client) => {
    const rows = await client.query<{ tenant_id: string; lead_id: string }>(
      "SELECT tenant_id, lead_id::text FROM crm_lead_commands WHERE tenant_id = $1 AND idempotency_key = $2",
      [tenantId, idempotencyKey],
    );
    return rows.rows[0] ?? null;
  });
}

async function auditTenantsForLead(leadId: string): Promise<string[]> {
  return withClient(async (client) => {
    const rows = await client.query<{ tenant_id: string }>(
      "SELECT DISTINCT tenant_id FROM crm_lead_audit_events WHERE lead_id = $1::uuid ORDER BY tenant_id",
      [leadId],
    );
    return rows.rows.map((r) => r.tenant_id);
  });
}

async function deliveryOutboxTenantsForLead(leadId: string): Promise<string[]> {
  return withClient(async (client) => {
    const rows = await client.query<{ tenant_id: string }>(
      "SELECT DISTINCT tenant_id FROM crm_lead_delivery_outbox WHERE lead_id = $1::uuid ORDER BY tenant_id",
      [leadId],
    );
    return rows.rows.map((r) => r.tenant_id);
  });
}

before(async () => {
  if (!databaseConfigured || !databaseUrl) return;
  process.env.TECPEY_CRM_PII_KEY_B64 ||= Buffer.alloc(32, 11).toString("base64");
  process.env.TECPEY_CRM_CONTACT_HASH_SECRET ||= "crm-cmd-xt-postgres-test-contact-hash-secret-32";
  process.env.TECPEY_CRM_WEBHOOK_SECRET ||= "crm-cmd-xt-postgres-test-webhook-secret-32-minimum";
  pool = new Pool({ connectionString: databaseUrl, max: 8, allowExitOnIdle: true });
  await withClient(async (client) => {
    await applyDatabaseMigrationsWithLock(client);
    await client.query(
      `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
       VALUES ($1, $1, $1, 'enterprise', '{}'::text[])
       ON CONFLICT (id) DO NOTHING`,
      [TENANT_B],
    );
  });
});

after(async () => {
  // crm_lead_commands / crm_lead_audit_events are immutable/append-only and
  // crm_leads is ON DELETE RESTRICT, so tenant B's rows are intentionally left
  // in place — harmless in the ephemeral CI database (fresh random TENANT_B id).
  await pool?.end();
  pool = null;
});

describe("CRM lead command cross-tenant idempotency isolation", () => {
  it(
    "keeps each tenant's idempotency key private: the same key under two tenants commits two independent leads",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const sharedKey = `crm-shared-${randomUUID().replace(/-/g, "")}`;

      // Byte-identical payload for both tenants — only tenant_id differs. Because
      // hashAcademyLeadCommand omits tenant_id, inputA and inputB share the same
      // request_hash, so this covers the dangerous equal-hash case: a tenant-blind
      // replay would return tenant A's stored result (its lead id) to tenant B,
      // not merely a hash conflict.
      const base = command({ idempotencyKey: sharedKey });
      const inputA = base;
      const inputB: typeof base = { ...base, tenantId: TENANT_B };

      const committedA = await ingestAcademyLead(inputA);
      assert.equal(committedA.status, "committed");

      // The core negative assertion: B commits its OWN lead and is NOT replayed
      // tenant A's stored result under the shared key + identical request hash.
      const committedB = await ingestAcademyLead(inputB);
      assert.equal(
        committedB.status,
        "committed",
        "tenant B must commit its own lead under a shared idempotency key",
      );

      if (committedA.status !== "committed" || committedB.status !== "committed") {
        throw new Error("ingestion did not succeed for both tenants");
      }

      assert.equal(committedB.result.created, true, "tenant B must create its own lead");
      assert.notEqual(
        committedA.result.id,
        committedB.result.id,
        "the two tenants must own distinct leads for the same idempotency key",
      );

      const rowA = await commandRow(TENANT_A, sharedKey);
      const rowB = await commandRow(TENANT_B, sharedKey);
      assert.equal(rowA?.tenant_id, TENANT_A);
      assert.equal(rowB?.tenant_id, TENANT_B);
      assert.equal(rowA?.lead_id, committedA.result.id);
      assert.equal(rowB?.lead_id, committedB.result.id);
    },
  );

  it(
    "replays within the owning tenant only: re-sending tenant A's command returns tenant A's result",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const sharedKey = `crm-replay-${randomUUID().replace(/-/g, "")}`;
      // Identical payload → identical request_hash; only tenant_id differs, so a
      // tenant-blind replay would resolve one tenant to the other's receipt.
      const inputA = command({ idempotencyKey: sharedKey });
      const inputB: typeof inputA = { ...inputA, tenantId: TENANT_B };

      const firstA = await ingestAcademyLead(inputA);
      const firstB = await ingestAcademyLead(inputB);
      assert.equal(firstA.status, "committed");
      assert.equal(firstB.status, "committed");
      if (firstA.status !== "committed" || firstB.status !== "committed") {
        throw new Error("ingestion did not succeed for both tenants");
      }

      // Re-sending tenant A's identical command must replay tenant A's own
      // command receipt (same lead id) — proving the idempotency lookup is
      // scoped by tenant and does not reach tenant B's identically-keyed row.
      const replayA = await ingestAcademyLead(inputA);
      assert.equal(replayA.status, "committed");
      if (replayA.status !== "committed") throw new Error("expected tenant A replay");
      assert.equal(replayA.result.id, firstA.result.id);
      assert.notEqual(replayA.result.id, firstB.result.id);
    },
  );

  it(
    "attributes each lead's crm_lead_audit_events to that lead's own tenant, never the other's",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const sharedKey = `crm-audit-${randomUUID().replace(/-/g, "")}`;
      const base = command({ idempotencyKey: sharedKey });

      const committedA = await ingestAcademyLead(base);
      const committedB = await ingestAcademyLead({ ...base, tenantId: TENANT_B });
      assert.equal(committedA.status, "committed");
      assert.equal(committedB.status, "committed");
      if (committedA.status !== "committed" || committedB.status !== "committed") {
        throw new Error("ingestion did not succeed for both tenants");
      }

      // Ingesting each lead writes crm_lead_audit_events under the command's own
      // tenant (the 'created' action). Each lead's audit trail must be
      // single-tenant and attributed to its OWN tenant: if ingestAcademyLead
      // hardcoded or crossed the tenant on the audit write, tenant B's 'created'
      // event would land under tenant A — a cross-tenant leak in the durable
      // audit trail that outlives the lead. Driven entirely through the real
      // ingest path (no test-only tenant predicate decides the outcome).
      const auditA = await auditTenantsForLead(committedA.result.id);
      const auditB = await auditTenantsForLead(committedB.result.id);
      assert.deepEqual(
        auditA,
        [TENANT_A],
        "tenant A's lead audit trail must be attributed to tenant A only",
      );
      assert.deepEqual(
        auditB,
        [TENANT_B],
        "tenant B's lead audit trail must be attributed to tenant B only, not tenant A",
      );
    },
  );

  it(
    "attributes each lead's crm_lead_delivery_outbox to that lead's own tenant, never the other's",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const sharedKey = `crm-outbox-${randomUUID().replace(/-/g, "")}`;
      const base = command({ idempotencyKey: sharedKey });

      const committedA = await ingestAcademyLead(base);
      const committedB = await ingestAcademyLead({ ...base, tenantId: TENANT_B });
      assert.equal(committedA.status, "committed");
      assert.equal(committedB.status, "committed");
      if (committedA.status !== "committed" || committedB.status !== "committed") {
        throw new Error("ingestion did not succeed for both tenants");
      }

      // Ingesting each lead enqueues its academy_webhook delivery in
      // crm_lead_delivery_outbox under the command's own tenant. Each lead's
      // outbox must be single-tenant and attributed to its OWN tenant: a
      // hardcoded or crossed tenant on the outbox write would enqueue tenant B's
      // delivery under tenant A — a cross-tenant leak in the durable outbox that
      // a worker would later drain as tenant A's work. Driven entirely through
      // the real ingest path.
      const outboxA = await deliveryOutboxTenantsForLead(committedA.result.id);
      const outboxB = await deliveryOutboxTenantsForLead(committedB.result.id);
      assert.deepEqual(
        outboxA,
        [TENANT_A],
        "tenant A's lead delivery outbox must be attributed to tenant A only",
      );
      assert.deepEqual(
        outboxB,
        [TENANT_B],
        "tenant B's lead delivery outbox must be attributed to tenant B only, not tenant A",
      );
    },
  );
});
