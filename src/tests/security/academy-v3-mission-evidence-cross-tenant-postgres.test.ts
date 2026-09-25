import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { issueAcademyV3MissionAttemptTx } from "../../lib/academy-v3-mission-evidence-authority";

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

const tenantA = `v3-a-${randomUUID()}`;
const tenantB = `v3-b-${randomUUID()}`;
const workspaceA = `v3-wa-${randomUUID()}`;
const workspaceB = `v3-wb-${randomUUID()}`;
const students = new Set<string>();

async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try { return await fn(client); } finally { client.release(); }
}

async function seed(client: PoolClient, tenant: string, workspace: string, studentId: string) {
  await client.query(
    `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
     VALUES ($1,$1,$1,'enterprise','{}'::text[]) ON CONFLICT (id) DO NOTHING`, [tenant]);
  await client.query(
    `INSERT INTO platform_workspaces (id, tenant_id, slug, display_name, products, settings)
     VALUES ($1,$2,$1,$1,'{}'::text[],'{}'::jsonb) ON CONFLICT (id) DO NOTHING`, [workspace, tenant]);
  await client.query(
    `INSERT INTO academy_students (id, locale) VALUES ($1::uuid,'fa') ON CONFLICT (id) DO NOTHING`, [studentId]);
  await client.query(
    `INSERT INTO platform_principal_bindings
       (tenant_id, workspace_id, principal_type, principal_id, status, source)
     VALUES ($1,$2,'student',$3::text,'active','test')
     ON CONFLICT (tenant_id, workspace_id, principal_type, principal_id)
     DO UPDATE SET status='active'`, [tenant, workspace, studentId]);
}

async function insertAttempt(client: PoolClient, tenant: string, workspace: string, studentId: string) {
  const result = await client.query<{ id: string }>(
    `INSERT INTO academy_v3_mission_attempts
       (tenant_id,workspace_id,principal_type,principal_id,student_id,locale,mission_id,mission_version,
        concept_id,objective_ids,policy_version,mission_sha256,issued_at,idempotency_key)
     VALUES ($1,$2,'student',$3::text,$3::uuid,'fa','MISSION.T6.NO_TRADE.INSUFFICIENT_EVIDENCE',1,
       'T6.NO_TRADE','["O.NOTRADE.IDENTIFY"]'::jsonb,'academy-v3-mission-attempt-v1',$4,NOW(),$5)
     RETURNING id::text`,
    [tenant, workspace, studentId, "a".repeat(64), `attempt-${randomUUID()}`],
  );
  return result.rows[0]!.id;
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 2, allowExitOnIdle: true });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));

  it("serializes concurrent duplicate attempt commands to one canonical row", { skip: !configured }, async () => {
    const student = randomUUID(); students.add(student);
    await withClient((client) => seed(client, tenantA, workspaceA, student));
    const idempotencyKey = `concurrent-attempt-${randomUUID()}`;
    const issuedAt = new Date("2026-09-25T12:00:00.000Z");
    const clientA = await pool!.connect();
    const clientB = await pool!.connect();
    try {
      await clientA.query("BEGIN");
      await clientB.query("BEGIN");
      const firstPromise = issueAcademyV3MissionAttemptTx(clientA, {
        tenantId: tenantA, workspaceId: workspaceA, studentId: student,
        missionId: "MISSION.T6.NO_TRADE.INSUFFICIENT_EVIDENCE", locale: "fa", idempotencyKey, issuedAt,
      });
      await new Promise((resolve) => setTimeout(resolve, 25));
      let secondSettled = false;
      const secondPromise = issueAcademyV3MissionAttemptTx(clientB, {
        tenantId: tenantA, workspaceId: workspaceA, studentId: student,
        missionId: "MISSION.T6.NO_TRADE.INSUFFICIENT_EVIDENCE", locale: "fa", idempotencyKey, issuedAt,
      }).finally(() => { secondSettled = true; });
      await new Promise((resolve) => setTimeout(resolve, 75));
      assert.equal(secondSettled, false, "duplicate command must wait on the transaction advisory lock");
      const first = await firstPromise;
      await clientA.query("COMMIT");
      const second = await secondPromise;
      await clientB.query("COMMIT");
      assert.equal(first.replayed, false);
      assert.equal(second.replayed, true);
      assert.equal(second.attemptId, first.attemptId);
      const count = await pool!.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM academy_v3_mission_attempts
          WHERE tenant_id=$1 AND workspace_id=$2 AND principal_id=$3 AND student_id=$3::uuid AND idempotency_key=$4`,
        [tenantA, workspaceA, student, idempotencyKey],
      );
      assert.equal(count.rows[0]!.count, "1");
    } finally {
      await clientA.query("ROLLBACK").catch(() => undefined);
      await clientB.query("ROLLBACK").catch(() => undefined);
      clientA.release(); clientB.release();
    }
  });
});

after(async () => {
  if (!pool) return;
  await withClient(async (client) => {
    for (const studentId of students) {
      await client.query(`DELETE FROM platform_principal_bindings WHERE principal_type='student' AND principal_id=$1`, [studentId]).catch(() => undefined);
      await client.query(`DELETE FROM academy_students WHERE id=$1::uuid`, [studentId]).catch(() => undefined);
    }
    for (const tenant of [tenantA, tenantB]) {
      await client.query(`DELETE FROM platform_workspaces WHERE tenant_id=$1`, [tenant]).catch(() => undefined);
      await client.query(`DELETE FROM platform_tenants WHERE id=$1`, [tenant]).catch(() => undefined);
    }
  });
  await pool.end();
  pool = null;
});

describe("Academy V3 mission evidence cross-tenant isolation", () => {
  it("rejects wrong student identity and revoked bindings for academy_v3_mission_attempts", { skip: !configured }, async () => {
    await withClient(async (client) => {
      const studentA = randomUUID(); const studentB = randomUUID();
      students.add(studentA); students.add(studentB);
      await seed(client, tenantA, workspaceA, studentA);
      await seed(client, tenantA, workspaceA, studentB);

      await assert.rejects(
        client.query(
          `INSERT INTO academy_v3_mission_attempts
           (tenant_id,workspace_id,principal_type,principal_id,student_id,locale,mission_id,mission_version,
            concept_id,objective_ids,policy_version,mission_sha256,issued_at,idempotency_key)
           VALUES ($1,$2,'student',$3::text,$4::uuid,'fa','MISSION.T6.NO_TRADE.INSUFFICIENT_EVIDENCE',1,
             'T6.NO_TRADE','["O.NOTRADE.IDENTIFY"]'::jsonb,'academy-v3-mission-attempt-v1',$5,NOW(),$6)`,
          [tenantA, workspaceA, studentA, studentB, "a".repeat(64), `wrong-${randomUUID()}`],
        ),
        /academy_v3_mission_attempts_check/,
      );

      await client.query(
        `UPDATE platform_principal_bindings SET status='revoked'
         WHERE tenant_id=$1 AND workspace_id=$2 AND principal_type='student' AND principal_id=$3::text`,
        [tenantA, workspaceA, studentA],
      );
      await client.query("BEGIN");
      try {
        await client.query("SET CONSTRAINTS ALL DEFERRED");
        await insertAttempt(client, tenantA, workspaceA, studentA);
        await assert.rejects(client.query("SET CONSTRAINTS ALL IMMEDIATE"), /principal binding|binding.*active|active.*binding/i);
      } finally {
        await client.query("ROLLBACK").catch(() => undefined);
      }
    });
  });

  it("rejects cross-tenant academy_v3_mission_decision_events and keeps evidence append-only", { skip: !configured }, async () => {
    await withClient(async (client) => {
      const student = randomUUID(); students.add(student);
      await seed(client, tenantA, workspaceA, student);
      await seed(client, tenantB, workspaceB, student);
      const attemptId = await insertAttempt(client, tenantA, workspaceA, student);

      await assert.rejects(
        client.query(
          `INSERT INTO academy_v3_mission_decision_events
           (attempt_id,tenant_id,workspace_id,principal_type,principal_id,student_id,choice_id,correct,
            evidence_kind,policy_version,mission_sha256,submitted_at,reassessment_due_after,idempotency_key,evidence)
           VALUES ($1::uuid,$2,$3,'student',$4::text,$4::uuid,'no-trade-yet',true,'scenario',
             'academy-v3-mission-attempt-v1',$5,NOW(),NOW()+INTERVAL '24 hours',$6,'{}'::jsonb)`,
          [attemptId, tenantB, workspaceB, student, "a".repeat(64), `event-${randomUUID()}`],
        ),
        /foreign key constraint/,
      );

      await assert.rejects(
        client.query(`UPDATE academy_v3_mission_attempts SET locale='en' WHERE id=$1::uuid`, [attemptId]),
        /append-only/,
      );
      await assert.rejects(
        client.query(`DELETE FROM academy_v3_mission_attempts WHERE id=$1::uuid`, [attemptId]),
        /append-only/,
      );
    });
  });
});
