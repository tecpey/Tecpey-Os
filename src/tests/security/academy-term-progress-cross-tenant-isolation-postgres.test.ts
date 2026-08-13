import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { PLATFORM } from "../../lib/platform-config";
import { issueCertificate } from "../../lib/academy-certificates";
import {
  readAcademyMasterySeasonState,
  type AcademyMasteryTenantScope,
} from "../../lib/academy-mastery-seasons-authority";

// Load-bearing guard for academy_term_progress (#109, audit finding F-8).
//
// This table used to carry no tenant column at all: its uniqueness boundary was
// (student_id, term_number, locale), and platform_principal_bindings lets the
// SAME student UUID be bound in two tenants. Both tenants therefore read and
// wrote one shared row set, which contaminated every gate built on top of it —
// most visibly Mastery Season eligibility, where
// `completedTerms >= season.recommendedAfterTerm` meant terms passed in one
// tenant unlocked a season in another tenant that had not earned it.
//
// Migration 0066 moves the uniqueness boundary to
// (tenant_id, workspace_id, student_id, term_number, locale). This suite proves
// the boundary and the gates built on it: independent rows per tenant, no
// cross-tenant season unlock, and no cross-tenant certificate issuance.

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

const TENANT_A = PLATFORM.DEFAULT_TENANT_ID;
const WORKSPACE_A = PLATFORM.DEFAULT_WORKSPACE_ID;
const TENANT_B = `tenant-b-${randomUUID()}`;
const WORKSPACE_B = `ws-b-${randomUUID()}`;

const SCOPE_A: AcademyMasteryTenantScope = { tenantId: TENANT_A, workspaceId: WORKSPACE_A };
const SCOPE_B: AcademyMasteryTenantScope = { tenantId: TENANT_B, workspaceId: WORKSPACE_B };

const SEASON = "risk-repair-season";
const SEASON_UNLOCK_TERM = 4;

const cleanupStudents = new Set<string>();

// issueCertificate refuses to run without a signing secret. Pin it here so the
// certificate assertion tests the tenant boundary rather than whichever
// variables the surrounding environment happens to export.
const CERTIFICATE_SECRET = "tecpey-term-progress-tenant-test-signing-secret";
const ORIGINAL_CERTIFICATE_SECRET = process.env.CERTIFICATE_SIGNING_SECRET;

async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function seedStudentBoundToBothTenants(client: PoolClient): Promise<string> {
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
    `INSERT INTO academy_students (id, locale, display_name) VALUES ($1::uuid, 'fa', 'Term Progress Tenant Probe')
       ON CONFLICT (id) DO NOTHING`,
    [studentId],
  );
  for (const [tenant, workspace] of [[TENANT_A, WORKSPACE_A], [TENANT_B, WORKSPACE_B]]) {
    await client.query(
      `INSERT INTO platform_principal_bindings
         (tenant_id, workspace_id, principal_type, principal_id, status, source)
       VALUES ($1, $2, 'student', $3, 'active', 'test')
       ON CONFLICT (tenant_id, workspace_id, principal_type, principal_id) DO NOTHING`,
      [tenant, workspace, studentId],
    );
  }
  return studentId;
}

async function recordTerm(
  client: PoolClient,
  scope: AcademyMasteryTenantScope,
  studentId: string,
  termNumber: number,
  status: "passed" | "attempted" = "passed",
): Promise<void> {
  await client.query(
    `INSERT INTO academy_term_progress
       (tenant_id, workspace_id, student_id, term_number, locale, score, percent, status, passed_at)
     VALUES ($1, $2, $3::uuid, $4, 'fa', 100, 100, $5,
             CASE WHEN $5 = 'passed' THEN NOW() ELSE NULL END)
     ON CONFLICT (tenant_id, workspace_id, student_id, term_number, locale) DO NOTHING`,
    [scope.tenantId, scope.workspaceId, studentId, termNumber, status],
  );
}

before(async () => {
  process.env.CERTIFICATE_SIGNING_SECRET = CERTIFICATE_SECRET;
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 4, allowExitOnIdle: true });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
});

after(async () => {
  if (ORIGINAL_CERTIFICATE_SECRET === undefined) delete process.env.CERTIFICATE_SIGNING_SECRET;
  else process.env.CERTIFICATE_SIGNING_SECRET = ORIGINAL_CERTIFICATE_SECRET;
  if (!pool) return;
  await withClient(async (client) => {
    for (const studentId of cleanupStudents) {
      await client.query("DELETE FROM academy_certificates WHERE student_id = $1::uuid", [studentId]);
      await client.query("DELETE FROM academy_term_progress WHERE student_id = $1::uuid", [studentId]);
      await client.query("DELETE FROM academy_student_mastery_profiles WHERE student_id = $1::uuid", [studentId]);
      await client.query("DELETE FROM academy_public_profiles WHERE student_id = $1::uuid", [studentId]);
      await client.query("DELETE FROM learning_events WHERE student_id = $1::uuid", [studentId]);
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

describe("academy_term_progress cross-tenant isolation", () => {
  it(
    "gives one student independent term progress in two tenants",
    { skip: !configured, timeout: 45_000 },
    async () => {
      await withClient(async (client) => {
        const studentId = await seedStudentBoundToBothTenants(client);

        // The same student, the same term, the same locale — under two tenants.
        // Before migration 0066 the second insert collided with the first on
        // (student_id, term_number, locale) and was silently dropped.
        await recordTerm(client, SCOPE_A, studentId, 1, "passed");
        await recordTerm(client, SCOPE_B, studentId, 1, "attempted");

        const rows = await client.query<{ tenant_id: string; workspace_id: string; status: string }>(
          `SELECT tenant_id, workspace_id, status
             FROM academy_term_progress
            WHERE student_id = $1::uuid AND term_number = 1 AND locale = 'fa'
            ORDER BY tenant_id`,
          [studentId],
        );
        assert.equal(rows.rows.length, 2, "each tenant must own its own term-progress row");
        const byTenant = new Map(rows.rows.map((row) => [row.tenant_id, row]));
        assert.equal(byTenant.get(TENANT_A)?.status, "passed");
        assert.equal(byTenant.get(TENANT_A)?.workspace_id, WORKSPACE_A);
        assert.equal(byTenant.get(TENANT_B)?.status, "attempted");
        assert.equal(byTenant.get(TENANT_B)?.workspace_id, WORKSPACE_B);
      });
    },
  );

  it(
    "does not let terms passed in one tenant unlock a Mastery Season in another",
    { skip: !configured, timeout: 45_000 },
    async () => {
      await withClient(async (client) => {
        const studentId = await seedStudentBoundToBothTenants(client);

        // Tenant A earns every term the season requires. Tenant B earns none.
        for (let term = 1; term <= SEASON_UNLOCK_TERM; term += 1) {
          await recordTerm(client, SCOPE_A, studentId, term, "passed");
        }

        const stateA = await readAcademyMasterySeasonState(client, SCOPE_A, studentId, "fa");
        const stateB = await readAcademyMasterySeasonState(client, SCOPE_B, studentId, "fa");

        assert.equal(stateA.completedTerms, SEASON_UNLOCK_TERM, "tenant A earned the terms");
        assert.equal(
          stateA.recommendations.find((item) => item.season.id === SEASON)?.eligible,
          true,
          "tenant A must unlock the season it earned",
        );

        // This is the assertion F-8 was about. Before migration 0066 tenant B
        // read tenant A's global progress and unlocked the season for free.
        assert.equal(stateB.completedTerms, 0, "tenant B must not inherit tenant A's term progress");
        // With no signals of its own the season may not even enter tenant B's
        // recommendation list, which is a stronger result than an entry that is
        // present but locked. Both mean "not unlocked".
        assert.equal(
          stateB.recommendations.find((item) => item.season.id === SEASON)?.eligible ?? false,
          false,
          "tenant B must not unlock a season it did not earn",
        );
      });
    },
  );

  it(
    "refuses to issue a certificate from another tenant's term progress",
    { skip: !configured, timeout: 45_000 },
    async () => {
      await withClient(async (client) => {
        const studentId = await seedStudentBoundToBothTenants(client);
        await recordTerm(client, SCOPE_A, studentId, 1, "passed");

        // The owning tenant can issue.
        const issued = await issueCertificate(client, {
          studentId,
          termNumber: 1,
          tenantId: TENANT_A,
          workspaceId: WORKSPACE_A,
        });
        assert.ok(issued.id, "the tenant that recorded the pass can issue a certificate");

        // The other tenant holds no verified progress for this student and must
        // be refused rather than inheriting the pass.
        await assert.rejects(
          issueCertificate(client, {
            studentId,
            termNumber: 1,
            tenantId: TENANT_B,
            workspaceId: WORKSPACE_B,
          }),
          /term_not_verified/,
          "a second tenant must not issue a certificate from another tenant's progress",
        );
      });
    },
  );
});
