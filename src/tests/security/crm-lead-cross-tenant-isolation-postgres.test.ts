import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { ingestAcademyLead, type AcademyLeadCommand } from "../../lib/crm/lead-authority";
import { PLATFORM } from "../../lib/platform-config";

// Cross-tenant adversarial proof for crm_leads (#109).
//
// crm_leads holds lead PII (hashed contact) and its tenant boundary is the
// active-contact uniqueness: UNIQUE INDEX crm_leads (tenant_id, lead_kind,
// contact_hash) WHERE status = 'active', and ingestAcademyLead's dedup lookup
// filters WHERE tenant_id = $1 AND lead_kind = $2 AND contact_hash = $3. The
// contact hash itself is global — HMAC(secret, phone), with no tenant in it —
// so two tenants that receive the same phone number produce the *same*
// contact_hash. Tenant scoping therefore lives entirely in tenant_id.
//
// The threat proven closed: tenant B submitting a contact that tenant A already
// holds must get its own new lead, never be deduplicated into (or collide with)
// tenant A's lead. If the unique index or the dedup WHERE dropped tenant_id,
// tenant B's ingest would either merge into tenant A's lead (leaking that A
// holds that contact, and reusing A's lead id) or raise a cross-tenant unique
// violation. The proof asserts B creates a distinct lead of its own.

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
    idempotencyKey: `crm-xt-${randomUUID()}`,
    leadKind: "academy_specialized",
    source: "security-test",
    locale: "fa",
    pii: {
      name: "کاربر تست ایزوله‌سازی",
      phone: uniquePhone(),
      email: `lead-${randomUUID()}@example.test`,
      city: "Babol",
      note: "cross-tenant isolation probe",
    },
    attributes: { mode: "online", track: "risk-first-trading" },
    consent: true,
    legalBasis: "consent",
    privacyNoticeVersion: "academy-leads-xt-v1",
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

async function tenantOfLead(leadId: string): Promise<string | null> {
  return withClient(async (client) => {
    const rows = await client.query<{ tenant_id: string }>(
      "SELECT tenant_id FROM crm_leads WHERE id = $1::uuid",
      [leadId],
    );
    return rows.rows[0]?.tenant_id ?? null;
  });
}

before(async () => {
  if (!databaseConfigured || !databaseUrl) return;
  process.env.TECPEY_CRM_PII_KEY_B64 ||= Buffer.alloc(32, 11).toString("base64");
  process.env.TECPEY_CRM_CONTACT_HASH_SECRET ||= "crm-xt-postgres-test-contact-hash-secret-32-min";
  process.env.TECPEY_CRM_WEBHOOK_SECRET ||= "crm-xt-postgres-test-webhook-secret-32-minimum";
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
  // crm_lead_audit_events is append-only (immutable audit) and crm_leads is
  // ON DELETE RESTRICT, so the tenant-B fixtures cannot be torn down and are
  // intentionally left in place — harmless in the ephemeral CI database, and
  // each run uses a fresh random TENANT_B id.
  await pool?.end();
  pool = null;
});

describe("CRM lead cross-tenant isolation", () => {
  it(
    "keeps contacts private per tenant: the same phone under two tenants creates two distinct leads",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const phone = uniquePhone();
      const email = `shared-${randomUUID()}@example.test`;

      const admittedA = await ingestAcademyLead(
        command({ tenantId: TENANT_A, pii: { ...command().pii, phone, email } }),
      );
      assert.equal(admittedA.status, "committed");

      // Tenant B, byte-identical contact (same phone → same global contact_hash),
      // distinct idempotency key. This is the shape that would deduplicate across
      // tenants if tenant_id were not part of the active-contact uniqueness.
      const admittedB = await ingestAcademyLead(
        command({ tenantId: TENANT_B, pii: { ...command().pii, phone, email } }),
      );
      assert.equal(admittedB.status, "committed");

      if (admittedA.status !== "committed" || admittedB.status !== "committed") {
        throw new Error("ingestion did not succeed for both tenants");
      }

      // Core negative assertions: tenant B created its OWN lead (not deduped into
      // A's) and the two lead ids are distinct.
      assert.equal(
        admittedB.result.created,
        true,
        "tenant B must create its own lead, not be deduplicated into tenant A's",
      );
      assert.notEqual(
        admittedA.result.id,
        admittedB.result.id,
        "the two tenants must own distinct lead rows for the same contact",
      );
      assert.equal(await tenantOfLead(admittedA.result.id), TENANT_A);
      assert.equal(await tenantOfLead(admittedB.result.id), TENANT_B);
    },
  );

  it(
    "deduplicates within the owning tenant only: re-sending tenant A's contact returns tenant A's lead",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const phone = uniquePhone();
      const email = `dedup-${randomUUID()}@example.test`;

      const firstA = await ingestAcademyLead(
        command({ tenantId: TENANT_A, pii: { ...command().pii, phone, email } }),
      );
      const firstB = await ingestAcademyLead(
        command({ tenantId: TENANT_B, pii: { ...command().pii, phone, email } }),
      );
      assert.equal(firstA.status, "committed");
      assert.equal(firstB.status, "committed");
      if (firstA.status !== "committed" || firstB.status !== "committed") {
        throw new Error("ingestion did not succeed for both tenants");
      }

      // A second, differently-keyed submission of the same contact under tenant A
      // must deduplicate to tenant A's existing lead (created=false, same id) —
      // and must never resolve to tenant B's identically-hashed lead.
      const dedupA = await ingestAcademyLead(
        command({ tenantId: TENANT_A, pii: { ...command().pii, phone, email } }),
      );
      assert.equal(dedupA.status, "committed");
      if (dedupA.status !== "committed") throw new Error("expected tenant A dedup");
      assert.equal(dedupA.result.created, false, "tenant A's second contact must deduplicate");
      assert.equal(dedupA.result.id, firstA.result.id);
      assert.notEqual(dedupA.result.id, firstB.result.id);
      assert.equal(await tenantOfLead(dedupA.result.id), TENANT_A);
    },
  );
});
