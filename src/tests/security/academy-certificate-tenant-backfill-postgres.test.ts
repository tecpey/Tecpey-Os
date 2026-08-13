import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { ACADEMY_CERTIFICATE_TENANT_SQL } from "../../lib/db-migrate-academy-certificate-tenant";
import { PLATFORM } from "../../lib/platform-config";

// Migration 0070 gives academy_certificates a tenant boundary. The columns it
// adds are the ownership record for rows that already exist, so how those rows
// are attributed is itself a correctness question: certificate issuance started
// working with migration 0067, and a non-default tenant could have issued
// between that and 0070. Defaulting every legacy row to the default tenant would
// have handed those certificates to the wrong tenant — the issuing tenant would
// stop finding its own and mint a duplicate, and a default-tenant request for
// the same student and term could be served the misattributed row.
//
// So ownership is derived from the evidence that gated issuance in the first
// place: the passed academy_term_progress row in the issuing tenant. This suite
// runs the migration's real SQL against real legacy-shaped data.
//
// Each case rebuilds the pre-0070 shape inside a transaction it rolls back, so
// the database is left exactly as found.

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

const TENANT_DEFAULT = PLATFORM.DEFAULT_TENANT_ID;
const WORKSPACE_DEFAULT = PLATFORM.DEFAULT_WORKSPACE_ID;

async function withRollback<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    await client.query("BEGIN");
    return await fn(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

/** Returns academy_certificates to the shape it had before migration 0070. */
async function revertToPreMigrationShape(client: PoolClient): Promise<void> {
  await client.query("DROP INDEX IF EXISTS academy_certificates_tenant_active_term_idx");
  await client.query("DROP INDEX IF EXISTS academy_certificates_tenant_student_idx");
  await client.query(
    "ALTER TABLE academy_certificates DROP CONSTRAINT IF EXISTS academy_certificates_tenant_workspace_fk",
  );
  await client.query(
    "ALTER TABLE academy_certificates DROP CONSTRAINT IF EXISTS academy_certificates_tenant_fk",
  );
  await client.query("ALTER TABLE academy_certificates DROP COLUMN IF EXISTS tenant_id");
  await client.query("ALTER TABLE academy_certificates DROP COLUMN IF EXISTS workspace_id");
  await client.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS academy_certificates_active_term_idx
       ON academy_certificates (student_id, term_number) WHERE status = 'verified'`,
  );
}

async function seedTenant(
  client: PoolClient,
  tenantId: string,
  workspaceId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
       VALUES ($1, $1, $1, 'enterprise', '{}'::text[]) ON CONFLICT (id) DO NOTHING`,
    [tenantId],
  );
  await client.query(
    `INSERT INTO platform_workspaces (id, tenant_id, slug, display_name, products, settings)
       VALUES ($1, $2, $1, $1, '{}'::text[], '{}'::jsonb) ON CONFLICT (id) DO NOTHING`,
    [workspaceId, tenantId],
  );
}

async function seedStudent(client: PoolClient): Promise<string> {
  const studentId = randomUUID();
  await client.query(
    `INSERT INTO academy_students (id, locale, display_name)
       VALUES ($1::uuid, 'fa', 'Certificate Backfill Probe')`,
    [studentId],
  );
  return studentId;
}

async function seedPassedTerm(
  client: PoolClient,
  tenantId: string,
  workspaceId: string,
  studentId: string,
  termNumber: number,
  locale = "fa",
): Promise<void> {
  await client.query(
    `INSERT INTO platform_principal_bindings
       (tenant_id, workspace_id, principal_type, principal_id, status, source)
     VALUES ($1, $2, 'student', $3, 'active', 'certificate-backfill-test')
     ON CONFLICT (tenant_id, workspace_id, principal_type, principal_id) DO NOTHING`,
    [tenantId, workspaceId, studentId],
  );
  await client.query(
    `INSERT INTO academy_term_progress
       (tenant_id, workspace_id, student_id, term_number, locale, score, percent, status, passed_at)
     VALUES ($1, $2, $3::uuid, $4, $5, 100, 100, 'passed', NOW())`,
    [tenantId, workspaceId, studentId, termNumber, locale],
  );
}

/** Inserts a certificate in the pre-0070 shape: no tenant columns at all. */
async function seedLegacyCertificate(
  client: PoolClient,
  studentId: string,
  termNumber: number,
): Promise<string> {
  const id = `TP-CERT-TEST-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
  await client.query(
    `INSERT INTO academy_certificates
       (id, student_id, term_number, student_name, course_title, score, level_title,
        verification_hash, public_student_id, status)
     VALUES ($1, $2::uuid, $3, 'Probe', 'Probe Course', 100, 'Verified', 'hash', 'TP-STD-PROBE', 'verified')`,
    [id, studentId, termNumber],
  );
  return id;
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 2, allowExitOnIdle: true });
  await withRollback(async (client) => {
    await client.query("COMMIT");
    await applyDatabaseMigrationsWithLock(client);
    await client.query("BEGIN");
  });
});

after(async () => {
  if (!pool) return;
  await pool.end();
  pool = null;
});

describe("academy_certificates tenant backfill (migration 0070)", () => {
  it(
    "attributes a legacy certificate to the tenant whose passed term gated it",
    { skip: !configured, timeout: 45_000 },
    async () => {
      await withRollback(async (client) => {
        const tenantB = `tenant-b-${randomUUID()}`;
        const workspaceB = `ws-b-${randomUUID()}`;
        await seedTenant(client, tenantB, workspaceB);
        await revertToPreMigrationShape(client);

        const studentId = await seedStudent(client);
        await seedPassedTerm(client, tenantB, workspaceB, studentId, 3);
        const certificateId = await seedLegacyCertificate(client, studentId, 3);

        await client.query(ACADEMY_CERTIFICATE_TENANT_SQL);

        const row = await client.query<{ tenant_id: string; workspace_id: string }>(
          "SELECT tenant_id, workspace_id FROM academy_certificates WHERE id = $1",
          [certificateId],
        );
        assert.equal(
          row.rows[0]?.tenant_id,
          tenantB,
          "the certificate must follow the tenant that recorded the passing term, not the default",
        );
        assert.equal(row.rows[0]?.workspace_id, workspaceB);
      });
    },
  );

  it(
    "places a certificate with no passed progress in the default tenant",
    { skip: !configured, timeout: 45_000 },
    async () => {
      await withRollback(async (client) => {
        await revertToPreMigrationShape(client);
        const studentId = await seedStudent(client);
        // No academy_term_progress at all: no tenant could have issued this
        // through the gate, so it predates the gate.
        const certificateId = await seedLegacyCertificate(client, studentId, 4);

        await client.query(ACADEMY_CERTIFICATE_TENANT_SQL);

        const row = await client.query<{ tenant_id: string; workspace_id: string }>(
          "SELECT tenant_id, workspace_id FROM academy_certificates WHERE id = $1",
          [certificateId],
        );
        assert.equal(row.rows[0]?.tenant_id, TENANT_DEFAULT);
        assert.equal(row.rows[0]?.workspace_id, WORKSPACE_DEFAULT);
      });
    },
  );

  it(
    "refuses to guess when two tenants both recorded the passing term",
    { skip: !configured, timeout: 45_000 },
    async () => {
      await withRollback(async (client) => {
        const tenantB = `tenant-b-${randomUUID()}`;
        const workspaceB = `ws-b-${randomUUID()}`;
        await seedTenant(client, tenantB, workspaceB);
        await revertToPreMigrationShape(client);

        const studentId = await seedStudent(client);
        await seedPassedTerm(client, TENANT_DEFAULT, WORKSPACE_DEFAULT, studentId, 5);
        await seedPassedTerm(client, tenantB, workspaceB, studentId, 5);
        const certificateId = await seedLegacyCertificate(client, studentId, 5);

        // Silently assigning it would hand one tenant's certificate to another,
        // and quarantining it by status would break /verify for whoever holds
        // it. The migration names the row and stops instead.
        await assert.rejects(
          client.query(ACADEMY_CERTIFICATE_TENANT_SQL),
          (error: Error) =>
            /ownership is ambiguous/.test(error.message)
            && error.message.includes(certificateId),
          "the migration must name the unresolvable certificate and refuse to proceed",
        );
      });
    },
  );

  it(
    "keeps two locales in one tenant unambiguous",
    { skip: !configured, timeout: 45_000 },
    async () => {
      await withRollback(async (client) => {
        await revertToPreMigrationShape(client);
        const studentId = await seedStudent(client);
        // academy_term_progress is unique per locale, so one tenant can hold two
        // passed rows for the same term. That is one owner, not an ambiguity —
        // counting rows rather than distinct tenants would have failed here.
        await seedPassedTerm(client, TENANT_DEFAULT, WORKSPACE_DEFAULT, studentId, 6, "fa");
        await seedPassedTerm(client, TENANT_DEFAULT, WORKSPACE_DEFAULT, studentId, 6, "en");
        const certificateId = await seedLegacyCertificate(client, studentId, 6);

        await client.query(ACADEMY_CERTIFICATE_TENANT_SQL);

        const row = await client.query<{ tenant_id: string }>(
          "SELECT tenant_id FROM academy_certificates WHERE id = $1",
          [certificateId],
        );
        assert.equal(row.rows[0]?.tenant_id, TENANT_DEFAULT);
      });
    },
  );
});
