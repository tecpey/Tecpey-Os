import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type DatabaseError, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../lib/db-migration-plan";
import { runAcademyV3DecisionInvariantMigrations } from "../lib/db-migrate-academy-v3-decision-invariant";
import { issueAcademyV3MissionAttemptTx } from "../lib/academy-v3-mission-evidence-authority";

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

const tenantId = `v3-invariant-${randomUUID()}`;
const workspaceId = `v3-invariant-ws-${randomUUID()}`;
const studentId = randomUUID();

async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function seed(client: PoolClient): Promise<void> {
  await client.query(
    `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
     VALUES ($1,$1,$1,'enterprise','{}'::text[]) ON CONFLICT (id) DO NOTHING`,
    [tenantId],
  );
  await client.query(
    `INSERT INTO platform_workspaces (id, tenant_id, slug, display_name, products, settings)
     VALUES ($1,$2,$1,$1,'{}'::text[],'{}'::jsonb) ON CONFLICT (id) DO NOTHING`,
    [workspaceId, tenantId],
  );
  await client.query(
    `INSERT INTO academy_students (id, locale) VALUES ($1::uuid,'fa') ON CONFLICT (id) DO NOTHING`,
    [studentId],
  );
  await client.query(
    `INSERT INTO platform_principal_bindings
       (tenant_id, workspace_id, principal_type, principal_id, status, source)
     VALUES ($1,$2,'student',$3::text,'active','test')
     ON CONFLICT (tenant_id, workspace_id, principal_type, principal_id)
     DO UPDATE SET status='active'`,
    [tenantId, workspaceId, studentId],
  );
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 2, allowExitOnIdle: true });
  await withClient(async (client) => {
    await applyDatabaseMigrationsWithLock(client);
    await runAcademyV3DecisionInvariantMigrations(client);
    await seed(client);
  });
});

after(async () => {
  if (!pool) return;
  await withClient(async (client) => {
    await client.query(
      `DELETE FROM platform_principal_bindings
        WHERE tenant_id=$1 AND workspace_id=$2 AND principal_type='student' AND principal_id=$3::text`,
      [tenantId, workspaceId, studentId],
    ).catch(() => undefined);
    await client.query(`DELETE FROM academy_students WHERE id=$1::uuid`, [studentId]).catch(() => undefined);
    await client.query(`DELETE FROM platform_workspaces WHERE id=$1 AND tenant_id=$2`, [workspaceId, tenantId]).catch(() => undefined);
    await client.query(`DELETE FROM platform_tenants WHERE id=$1`, [tenantId]).catch(() => undefined);
  });
  await pool.end();
  pool = null;
});

const insertDecisionSql = `
  INSERT INTO academy_v3_mission_decision_events
    (attempt_id, tenant_id, workspace_id, principal_type, principal_id, student_id,
     choice_id, correct, misconception_id, evidence_kind, policy_version, mission_sha256,
     submitted_at, reassessment_due_after, idempotency_key, evidence)
  VALUES
    ($1::uuid,$2,$3,'student',$4::text,$4::uuid,
     'no-trade-yet',TRUE,NULL,'scenario','test-v001',repeat('0',64),
     $5::timestamptz,$6::timestamptz,$7,'{}'::jsonb)
`;

describe("Academy V3 canonical mission decision database invariant", () => {
  it("permits exactly one row when independent SQL transactions race for one attempt", { skip: !configured }, async () => {
    const attempt = await withClient((client) => issueAcademyV3MissionAttemptTx(client, {
      tenantId,
      workspaceId,
      studentId,
      missionId: "MISSION.T6.NO_TRADE.INSUFFICIENT_EVIDENCE",
      locale: "fa",
      idempotencyKey: `attempt-${randomUUID()}`,
      issuedAt: new Date("2026-09-26T08:00:00.000Z"),
    }));

    const clientA = await pool!.connect();
    const clientB = await pool!.connect();
    try {
      await clientA.query("BEGIN");
      await clientB.query("BEGIN");

      await clientA.query(insertDecisionSql, [
        attempt.attemptId,
        tenantId,
        workspaceId,
        studentId,
        "2026-09-26T08:01:00.000Z",
        "2026-10-03T08:01:00.000Z",
        `decision-a-${randomUUID()}`,
      ]);

      let secondSettled = false;
      const secondInsert = clientB.query(insertDecisionSql, [
        attempt.attemptId,
        tenantId,
        workspaceId,
        studentId,
        "2026-09-26T08:01:01.000Z",
        "2026-10-03T08:01:01.000Z",
        `decision-b-${randomUUID()}`,
      ]).finally(() => { secondSettled = true; });

      await new Promise((resolve) => setTimeout(resolve, 75));
      assert.equal(secondSettled, false, "unique index must serialize an uncommitted competing row");

      await clientA.query("COMMIT");
      await assert.rejects(secondInsert, (error: unknown) => {
        const databaseError = error as DatabaseError;
        return databaseError.code === "23505" &&
          databaseError.constraint === "academy_v3_mission_decision_events_attempt_uidx";
      });
      await clientB.query("ROLLBACK");

      const count = await clientA.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM academy_v3_mission_decision_events
          WHERE tenant_id=$1 AND workspace_id=$2 AND attempt_id=$3::uuid`,
        [tenantId, workspaceId, attempt.attemptId],
      );
      assert.equal(count.rows[0]!.count, "1");
    } finally {
      await clientA.query("ROLLBACK").catch(() => undefined);
      await clientB.query("ROLLBACK").catch(() => undefined);
      clientA.release();
      clientB.release();
    }
  });
});
