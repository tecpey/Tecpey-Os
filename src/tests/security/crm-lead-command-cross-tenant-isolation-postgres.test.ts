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

      const committedA = await ingestAcademyLead(
        command({ tenantId: TENANT_A, idempotencyKey: sharedKey }),
      );
      assert.equal(committedA.status, "committed");

      // Tenant B reuses tenant A's idempotency key (with its own distinct
      // contact). The core negative assertion: B commits its own lead and is NOT
      // replayed tenant A's stored result nor rejected as a cross-tenant hash
      // conflict.
      const committedB = await ingestAcademyLead(
        command({ tenantId: TENANT_B, idempotencyKey: sharedKey }),
      );
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
      const inputA = command({ tenantId: TENANT_A, idempotencyKey: sharedKey });
      const inputB = command({ tenantId: TENANT_B, idempotencyKey: sharedKey });

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
});
