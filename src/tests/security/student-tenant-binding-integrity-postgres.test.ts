import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";

import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { PLATFORM } from "../../lib/platform-config";

// A tenant-scoped row must not be able to name a student that tenant was never
// admitted (#109, roadmap 7.2, migration 0073).
//
// Fourteen tables carry (tenant_id, workspace_id, student_id) and a plain
// foreign key to academy_students. Each half was checked and the pair was not:
// the tenant exists, the student exists, and nothing asked whether that tenant
// had any claim to that student. Reproduced against a migrated database before
// the migration — a certificate naming tenant A and a student bound only to
// tenant B inserted without complaint.
//
// The fix is a composite foreign key into platform_principal_bindings rather
// than a tenant column on academy_students, because the model deliberately
// admits one student into several tenants and a column would forbid that. These
// cases hold both ends of that: the foreign pair is refused, and the
// multi-tenant student still works.

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

/** Every table this migration constrains, so a new one cannot be added untested. */
const CONSTRAINED_TABLES = [
  "academy_certificates",
  "academy_learning_commands",
  "academy_mastery_season_assignments",
  "academy_mastery_season_progress_events",
  "academy_mastery_weakness_signals",
  "academy_student_mastery_profiles",
  "academy_term_progress",
  "notification_center",
] as const;

/**
 * Already protected by migrations 0046/0048 with the identical foreign key, so
 * this migration must NOT touch them — four are DEFERRABLE INITIALLY DEFERRED
 * and a non-deferrable duplicate would reject a transaction that inserts the row
 * before its binding and commits both together.
 */
const ALREADY_PROTECTED = [
  "academy_community_challenge_enrollments",
  "academy_community_reputation_evidence",
  "academy_community_reputation_scoring_consents",
  "academy_public_profiles",
  "learning_events",
  "offline_sync_commands",
] as const;

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

async function seedTenant(
  client: PoolClient,
): Promise<{ tenantId: string; workspaceId: string }> {
  const tenantId = `tenant-bind-${randomUUID()}`;
  const workspaceId = `ws-bind-${randomUUID()}`;
  await client.query(
    `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
       VALUES ($1, $1, $1, 'enterprise', '{}'::text[])`,
    [tenantId],
  );
  await client.query(
    `INSERT INTO platform_workspaces
       (id, tenant_id, slug, display_name, products, settings)
     VALUES ($1, $2, $1, $1, '{}'::text[], '{}'::jsonb)`,
    [workspaceId, tenantId],
  );
  return { tenantId, workspaceId };
}

async function seedStudent(client: PoolClient): Promise<string> {
  const studentId = randomUUID();
  await client.query(
    `INSERT INTO academy_students (id, locale, email, display_name)
       VALUES ($1::uuid, 'fa', $2, 'Binding Probe')`,
    [studentId, `${studentId}@binding-probe.test`],
  );
  return studentId;
}

async function bind(
  client: PoolClient,
  scope: { tenantId: string; workspaceId: string },
  studentId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO platform_principal_bindings
       (tenant_id, workspace_id, principal_type, principal_id, status, source)
     VALUES ($1, $2, 'student', $3, 'active', 'test')
     ON CONFLICT (tenant_id, workspace_id, principal_type, principal_id) DO NOTHING`,
    [scope.tenantId, scope.workspaceId, studentId],
  );
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 2, allowExitOnIdle: true });
  const client = await pool.connect();
  try {
    await applyDatabaseMigrationsWithLock(client);
  } finally {
    client.release();
  }
});

after(async () => {
  await pool?.end();
  pool = null;
});

describe("Student tenant binding integrity", () => {
  it(
    "refuses a certificate naming a student the tenant is not bound to",
    { skip: !configured, timeout: 45_000 },
    async () => {
      await withRollback(async (client) => {
        const tenantA = await seedTenant(client);
        const tenantB = await seedTenant(client);
        const studentId = await seedStudent(client);
        await bind(client, tenantB, studentId);

        // The constraint is deferred, matching the ones already in place, so it
        // is checked at commit. Forcing it immediate is how the refusal becomes
        // observable inside a rolled-back case.
        await client.query("SET CONSTRAINTS ALL IMMEDIATE");

        // The load-bearing negative, and the exact shape reproduced against a
        // migrated database before this migration existed.
        await assert.rejects(
          client.query(
            `INSERT INTO academy_certificates
               (id, student_id, tenant_id, workspace_id, term_number)
             VALUES ($1, $2::uuid, $3, $4, 1)`,
            [`cert-${randomUUID()}`, studentId, tenantA.tenantId, tenantA.workspaceId],
          ),
          /academy_certificates_stu_bind_fk/,
          "a tenant must not hold a certificate for a student it never admitted",
        );
      });
    },
  );

  it(
    "accepts the same row once that tenant admits the student",
    { skip: !configured, timeout: 45_000 },
    async () => {
      await withRollback(async (client) => {
        const tenantA = await seedTenant(client);
        const studentId = await seedStudent(client);
        await bind(client, tenantA, studentId);

        // This is a boundary, not a blanket refusal.
        const inserted = await client.query(
          `INSERT INTO academy_certificates
             (id, student_id, tenant_id, workspace_id, term_number)
           VALUES ($1, $2::uuid, $3, $4, 1)`,
          [`cert-${randomUUID()}`, studentId, tenantA.tenantId, tenantA.workspaceId],
        );
        assert.equal(inserted.rowCount, 1);
      });
    },
  );

  it(
    "still allows one student to hold rows in several tenants",
    { skip: !configured, timeout: 45_000 },
    async () => {
      await withRollback(async (client) => {
        // The reason academy_students does NOT get a tenant column. A learner
        // studying at two white-label academies is a supported shape, and a
        // column on the student would forbid it.
        const tenantA = await seedTenant(client);
        const tenantB = await seedTenant(client);
        const studentId = await seedStudent(client);
        await bind(client, tenantA, studentId);
        await bind(client, tenantB, studentId);

        for (const scope of [tenantA, tenantB]) {
          const inserted = await client.query(
            `INSERT INTO academy_certificates
               (id, student_id, tenant_id, workspace_id, term_number)
             VALUES ($1, $2::uuid, $3, $4, 1)`,
            [`cert-${randomUUID()}`, studentId, scope.tenantId, scope.workspaceId],
          );
          assert.equal(inserted.rowCount, 1);
        }
      });
    },
  );

  it(
    "constrains every table the migration names, under a name Postgres did not truncate",
    { skip: !configured, timeout: 45_000 },
    async () => {
      await withRollback(async (client) => {
        const { rows } = await client.query<{ table_name: string; conname: string }>(
          `SELECT c.conrelid::regclass::text AS table_name, c.conname
             FROM pg_constraint c
            WHERE c.contype = 'f'
              AND c.conname LIKE '%\\_stu\\_bind\\_fk'
            ORDER BY 1`,
        );
        assert.deepEqual(
          rows.map((row) => row.table_name).sort(),
          [...CONSTRAINED_TABLES].sort(),
          "every table in the migration must carry the binding constraint",
        );
        // The first draft named these <table>_student_binding_fk, which runs to
        // 65 characters on the longest table; Postgres truncated it to 63
        // silently, so the constraint existed under a name one character short
        // of the one written. Nothing complained.
        for (const row of rows) {
          assert.ok(
            row.conname.length < 63,
            `${row.conname} is at the identifier limit and may have been truncated`,
          );
        }
      });
    },
  );

  it(
    "keeps the projected key columns out of a caller's hands",
    { skip: !configured, timeout: 45_000 },
    async () => {
      await withRollback(async (client) => {
        // The composite key needs a constant 'student' and a text student_id, so
        // both are generated columns. If either became writable, a caller could
        // point a row at a binding that does not describe it.
        const { rows } = await client.query<{ column_name: string; is_generated: string }>(
          `SELECT column_name, is_generated
             FROM information_schema.columns
            WHERE table_name = 'academy_certificates'
              AND column_name IN ('student_principal_type', 'student_principal_id')
            ORDER BY column_name`,
        );
        assert.equal(rows.length, 2);
        for (const row of rows) {
          assert.equal(
            row.is_generated,
            "ALWAYS",
            `${row.column_name} must be generated, never caller-supplied`,
          );
        }

        await assert.rejects(
          client.query(
            `INSERT INTO academy_certificates
               (id, student_id, tenant_id, workspace_id, term_number, student_principal_type)
             VALUES ($1, $2::uuid, $3, $4, 1, 'admin')`,
            [
              `cert-${randomUUID()}`,
              randomUUID(),
              PLATFORM.DEFAULT_TENANT_ID,
              PLATFORM.DEFAULT_WORKSPACE_ID,
            ],
          ),
          /non-DEFAULT value into column "student_principal_type"/,
          "a caller must not be able to write the projected principal type",
        );
      });
    },
  );

  it(
    "leaves the tables that were already protected alone",
    { skip: !configured, timeout: 45_000 },
    async () => {
      // A first draft constrained these too. Migrations 0046 and 0048 already
      // give them the identical foreign key with principal_type and principal_id
      // pinned to the student, so a second copy rewrites the table for nothing —
      // and on the four deferrable ones it would reject a transaction that
      // inserts the row before its binding and commits both together.
      await withRollback(async (client) => {
        const { rows } = await client.query<{ conname: string }>(
          `SELECT c.conname
             FROM pg_constraint c
            WHERE c.contype = 'f'
              AND c.conname LIKE '%\\_stu\\_bind\\_fk'
              AND c.conrelid::regclass::text = ANY($1::text[])`,
          [[...ALREADY_PROTECTED]],
        );
        assert.deepEqual(
          rows.map((row) => row.conname),
          [],
          "this migration must not duplicate a constraint those tables already carry",
        );

        // And what they do carry is genuinely equivalent, not merely similar.
        const existing = await client.query<{ tbl: string; def: string }>(
          `SELECT c.conrelid::regclass::text AS tbl, pg_get_constraintdef(c.oid) AS def
             FROM pg_constraint c
            WHERE c.contype = 'f'
              AND c.confrelid = 'platform_principal_bindings'::regclass
              AND c.conrelid::regclass::text = ANY($1::text[])
            ORDER BY 1`,
          [[...ALREADY_PROTECTED]],
        );
        assert.equal(existing.rows.length, ALREADY_PROTECTED.length);
        for (const row of existing.rows) {
          assert.match(
            row.def,
            /FOREIGN KEY \(tenant_id, workspace_id, principal_type, principal_id\)/,
            `${row.tbl} must already bind its student to the tenant`,
          );
        }
      });
    },
  );

  it(
    "allows a row to be inserted before its binding within one transaction",
    { skip: !configured, timeout: 45_000 },
    async () => {
      // Why these constraints are DEFERRABLE INITIALLY DEFERRED rather than
      // immediate. A caller may write the row and admit the student in the same
      // transaction, in either order, so long as both are true at commit. A
      // non-deferrable constraint would reject the first statement — which is
      // exactly the regression a first draft of this migration would have
      // introduced on the four tables that were already deferrable.
      const client = await pool!.connect();
      try {
        await client.query("BEGIN");
        const tenant = await seedTenant(client);
        const studentId = await seedStudent(client);

        await client.query(
          `INSERT INTO academy_certificates
             (id, student_id, tenant_id, workspace_id, term_number)
           VALUES ($1, $2::uuid, $3, $4, 1)`,
          [`cert-${randomUUID()}`, studentId, tenant.tenantId, tenant.workspaceId],
        );
        await bind(client, tenant, studentId);

        // The constraint is satisfied by commit, so this must not throw.
        await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
    },
  );
});
