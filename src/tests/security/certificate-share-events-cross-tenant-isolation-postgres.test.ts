import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { PLATFORM } from "../../lib/platform-config";

// Load-bearing guard for certificate_share_events (#20 / #109).
//
// certificate_share_events records a share of a certificate. Its certificate_id
// names a row in the tenant-scoped academy_certificates, but the table itself
// carried no tenant boundary and certificate_id was never FK-bound: a share event
// could be read across tenants, and a dangling certificate_id could linger with
// no owning certificate.
//
// Migration 0084 denormalises tenant_id/workspace_id onto the child and binds
// (certificate_id, tenant_id, workspace_id) to academy_certificates
// (id, tenant_id, workspace_id) as one composite foreign key. This suite proves
// that the derived tenant cannot diverge from the certificate's, that a dangling
// certificate_id is rejected, that reads scope cleanly per tenant, and that a
// share event follows its certificate's lifecycle.

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

const TENANT_A = PLATFORM.DEFAULT_TENANT_ID;
const WORKSPACE_A = PLATFORM.DEFAULT_WORKSPACE_ID;
const TENANT_B = `tenant-b-${randomUUID()}`;
const WORKSPACE_B = `ws-b-${randomUUID()}`;

const cleanupStudents = new Set<string>();

async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function seed(client: PoolClient): Promise<{ studentId: string; certA: string; certB: string }> {
  const studentId = randomUUID();
  cleanupStudents.add(studentId);
  await client.query(
    `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
       VALUES ($1, $1, $1, 'enterprise', '{}'::text[]) ON CONFLICT (id) DO NOTHING`,
    [TENANT_B],
  );
  await client.query(
    `INSERT INTO platform_workspaces (id, tenant_id, slug, display_name, products, settings)
       VALUES ($1, $2, $1, $1, '{}'::text[], '{}'::jsonb) ON CONFLICT (id) DO NOTHING`,
    [WORKSPACE_B, TENANT_B],
  );
  await client.query(
    `INSERT INTO academy_students (id, locale, display_name)
       VALUES ($1::uuid, 'fa', 'Certificate Share Tenant Probe') ON CONFLICT (id) DO NOTHING`,
    [studentId],
  );

  // academy_certificates binds (tenant_id, workspace_id, 'student', student_id)
  // to platform_principal_bindings, so the student must be bound in each tenant
  // it holds a certificate under before the certificate can be inserted.
  for (const [tenantId, workspaceId] of [
    [TENANT_A, WORKSPACE_A],
    [TENANT_B, WORKSPACE_B],
  ] as const) {
    await client.query(
      `INSERT INTO platform_principal_bindings
         (tenant_id, workspace_id, principal_type, principal_id, status, source)
       VALUES ($1, $2, 'student', $3, 'active', 'certificate-share-events-test')
       ON CONFLICT (tenant_id, workspace_id, principal_type, principal_id) DO NOTHING`,
      [tenantId, workspaceId, studentId],
    );
  }

  const certA = `cert-a-${randomUUID()}`;
  const certB = `cert-b-${randomUUID()}`;
  await client.query(
    `INSERT INTO academy_certificates (id, student_id, term_number, display_name, tenant_id, workspace_id)
       VALUES ($1, $2::uuid, 1, 'Term 1', $3, $4)`,
    [certA, studentId, TENANT_A, WORKSPACE_A],
  );
  await client.query(
    `INSERT INTO academy_certificates (id, student_id, term_number, display_name, tenant_id, workspace_id)
       VALUES ($1, $2::uuid, 2, 'Term 2', $3, $4)`,
    [certB, studentId, TENANT_B, WORKSPACE_B],
  );
  return { studentId, certA, certB };
}

async function insertShare(
  client: PoolClient,
  certificateId: string,
  studentId: string,
  tenantId: string,
  workspaceId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO certificate_share_events (certificate_id, student_id, platform, tenant_id, workspace_id)
       VALUES ($1, $2::uuid, 'x', $3, $4)`,
    [certificateId, studentId, tenantId, workspaceId],
  );
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 4, allowExitOnIdle: true });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
});

after(async () => {
  if (!pool) return;
  await withClient(async (client) => {
    for (const studentId of cleanupStudents) {
      await client.query("DELETE FROM certificate_share_events WHERE student_id = $1::uuid", [studentId]);
      await client.query("DELETE FROM academy_certificates WHERE student_id = $1::uuid", [studentId]);
      // academy_public_profiles is created for the student's binding and
      // RESTRICT-references it, so it must go before the binding can be removed.
      await client.query("DELETE FROM academy_public_profiles WHERE student_id = $1::uuid", [studentId]);
      await client.query(
        "DELETE FROM platform_principal_bindings WHERE principal_type = 'student' AND principal_id = $1",
        [studentId],
      );
      await client.query("DELETE FROM academy_students WHERE id = $1::uuid", [studentId]);
    }
    await client.query("DELETE FROM platform_workspaces WHERE tenant_id = $1", [TENANT_B]);
    await client.query("DELETE FROM platform_tenants WHERE id = $1", [TENANT_B]);
  });
  await pool.end();
  pool = null;
});

describe("certificate_share_events cross-tenant isolation", { skip: !configured }, () => {
  it("binds the share's tenant to its certificate — a mismatched tenant is rejected", async () => {
    await withClient(async (client) => {
      const { studentId, certA } = await seed(client);
      // certA belongs to tenant A. Claiming it under tenant B has no matching
      // (id, tenant_id, workspace_id) triple, so the composite FK rejects it.
      await assert.rejects(
        () => insertShare(client, certA, studentId, TENANT_B, WORKSPACE_B),
        /certificate_share_events_certificate_tenant_fk|foreign key/i,
        "a share event must not be storable under a tenant that does not own its certificate",
      );
      // The honest lineage is accepted.
      await insertShare(client, certA, studentId, TENANT_A, WORKSPACE_A);
    });
  });

  it("rejects a share of a certificate that does not exist", async () => {
    await withClient(async (client) => {
      const { studentId } = await seed(client);
      await assert.rejects(
        () => insertShare(client, `cert-missing-${randomUUID()}`, studentId, TENANT_A, WORKSPACE_A),
        /certificate_share_events_certificate_tenant_fk|foreign key/i,
        "a dangling certificate_id must be rejected, not stored",
      );
    });
  });

  it("scopes reads per tenant — one tenant never sees the other's shares", async () => {
    await withClient(async (client) => {
      const { studentId, certA, certB } = await seed(client);
      await insertShare(client, certA, studentId, TENANT_A, WORKSPACE_A);
      await insertShare(client, certB, studentId, TENANT_B, WORKSPACE_B);

      const readA = await client.query(
        `SELECT certificate_id FROM certificate_share_events
          WHERE student_id = $1::uuid AND tenant_id = $2 AND workspace_id = $3`,
        [studentId, TENANT_A, WORKSPACE_A],
      );
      const readB = await client.query(
        `SELECT certificate_id FROM certificate_share_events
          WHERE student_id = $1::uuid AND tenant_id = $2 AND workspace_id = $3`,
        [studentId, TENANT_B, WORKSPACE_B],
      );
      assert.deepEqual(readA.rows.map((r) => r.certificate_id), [certA]);
      assert.deepEqual(readB.rows.map((r) => r.certificate_id), [certB]);
    });
  });

  it("binds the share's student to the tenant — a student not bound to the tenant is rejected", async () => {
    await withClient(async (client) => {
      const { studentId, certB } = await seed(client);
      // A second student, bound only to the default tenant (the students table's
      // creation trigger binds every new student there) and to NO other. certB
      // belongs to tenant B, so a share of certB naming this stranger under
      // tenant B satisfies the composite certificate FK — yet the stranger has no
      // tenant-B binding, so the principal-binding FK rejects it. The row cannot
      // associate tenant B with a learner it never admitted.
      const strangerId = randomUUID();
      cleanupStudents.add(strangerId);
      await client.query(
        `INSERT INTO academy_students (id, locale, display_name)
           VALUES ($1::uuid, 'fa', 'Default-Only Stranger') ON CONFLICT (id) DO NOTHING`,
        [strangerId],
      );
      await assert.rejects(
        () => insertShare(client, certB, strangerId, TENANT_B, WORKSPACE_B),
        /certificate_share_events_stu_bind_fk|foreign key/i,
        "a share must not name a student the tenant has no binding for",
      );
      // certB's own owner, who IS bound to tenant B, is accepted.
      await insertShare(client, certB, studentId, TENANT_B, WORKSPACE_B);
    });
  });

  it("follows the certificate's lifecycle — deleting a certificate cascades its shares", async () => {
    await withClient(async (client) => {
      const { studentId, certA } = await seed(client);
      await insertShare(client, certA, studentId, TENANT_A, WORKSPACE_A);
      await client.query("DELETE FROM academy_certificates WHERE id = $1", [certA]);
      const remaining = await client.query(
        "SELECT 1 FROM certificate_share_events WHERE certificate_id = $1",
        [certA],
      );
      assert.equal(remaining.rows.length, 0, "a deleted certificate must not leave orphan share events");
    });
  });
});
