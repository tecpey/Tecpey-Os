import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { PLATFORM } from "../../lib/platform-config";
import {
  createSmartNotification,
  prepareLearningOsData,
  recordLearningEvent,
} from "../../lib/learning-os";
import { awardMilestonesAfterCertificate } from "../../lib/phase5-achievement-engine";

// The learning-OS write path against the real migrated schema (audit findings
// F-13 and F-14).
//
// Both writers in src/lib/learning-os.ts had drifted from the schema and every
// call threw:
//
//   recordLearningEvent    -> null value in column "workspace_id" of relation
//                             "learning_events" violates not-null constraint
//   createSmartNotification -> column "channels" is of type text[] but
//                             expression is of type jsonb
//
// Nothing caught it because no test ever drove these functions against a
// migrated database: the isolation suites insert learning_events with explicit
// SQL and call refreshLearningBrain directly, stepping over the writer entirely.
// That is the same gap that hid the certificate contract drift (F-10).
//
// This suite exists to close that gap permanently: it calls the real exported
// functions, with no hand-written INSERT standing in for them.

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

const TENANT = PLATFORM.DEFAULT_TENANT_ID;
const WORKSPACE = PLATFORM.DEFAULT_WORKSPACE_ID;

async function withRollback<T>(
  fn: (client: PoolClient, studentId: string, scope: { tenantId: string; workspaceId: string }) => Promise<T>,
  options: { nonDefaultWorkspace?: boolean } = {},
): Promise<T> {
  const client = await pool!.connect();
  try {
    await client.query("BEGIN");
    await prepareLearningOsData(client);
    let scope: { tenantId: string; workspaceId: string } = { tenantId: TENANT, workspaceId: WORKSPACE };
    if (options.nonDefaultWorkspace) {
      const tenantId = `tenant-b-${randomUUID()}`;
      const workspaceId = `ws-b-${randomUUID()}`;
      await client.query(
        `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
           VALUES ($1, $1, $1, 'enterprise', '{}'::text[])`,
        [tenantId],
      );
      await client.query(
        `INSERT INTO platform_workspaces (id, tenant_id, slug, display_name, products, settings)
           VALUES ($1, $2, $1, $1, '{}'::text[], '{}'::jsonb)`,
        [workspaceId, tenantId],
      );
      scope = { tenantId, workspaceId };
    }
    const studentId = randomUUID();
    await client.query(
      `INSERT INTO academy_students (id, locale, email, display_name)
         VALUES ($1::uuid, 'fa', $2, 'Learning OS Write Contract')`,
      [studentId, `${studentId}@learning-os.test`],
    );
    await client.query(
      `INSERT INTO platform_principal_bindings
         (tenant_id, workspace_id, principal_type, principal_id, status, source)
       VALUES ($1, $2, 'student', $3, 'active', 'learning-os-write-contract-test')
       ON CONFLICT (tenant_id, workspace_id, principal_type, principal_id) DO NOTHING`,
      [scope.tenantId, scope.workspaceId, studentId],
    );
    return await fn(client, studentId, scope);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
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
  if (!pool) return;
  await pool.end();
  pool = null;
});

describe("Learning OS write contract", () => {
  it(
    "records a learning event with its full tenant-principal identity",
    { skip: !configured, timeout: 45_000 },
    async () => {
      await withRollback(async (client, studentId) => {
        const eventId = await recordLearningEvent(client, {
          studentId,
          tenantId: TENANT,
          workspaceId: WORKSPACE,
          eventType: "lesson_completed",
          payload: { probe: true },
        });
        assert.ok(eventId);

        const stored = await client.query<{
          tenant_id: string;
          workspace_id: string;
          principal_type: string;
          principal_id: string;
          student_id: string;
        }>(
          `SELECT tenant_id, workspace_id, principal_type, principal_id, student_id::text AS student_id
             FROM learning_events WHERE event_id = $1`,
          [eventId],
        );
        assert.equal(stored.rows.length, 1, "the event must actually be stored");
        const row = stored.rows[0]!;
        assert.equal(row.tenant_id, TENANT);
        assert.equal(row.workspace_id, WORKSPACE);
        assert.equal(row.principal_type, "student");
        // The table's own CHECK requires these to agree; assert it here too so a
        // future writer cannot satisfy the column while breaking the identity.
        assert.equal(row.principal_id, studentId);
        assert.equal(row.student_id, studentId);
      });
    },
  );

  it(
    "refreshes the learning brain as a side effect of recording",
    { skip: !configured, timeout: 45_000 },
    async () => {
      await withRollback(async (client, studentId) => {
        await recordLearningEvent(client, {
          studentId,
          tenantId: TENANT,
          workspaceId: WORKSPACE,
          eventType: "lesson_completed",
          payload: {},
        });
        // refreshLearningBrain is only ever reached from recordLearningEvent, so
        // while the writer threw, the brain never refreshed for anyone.
        const brain = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM learning_brain_profiles
            WHERE tenant_id = $1 AND student_id = $2::uuid`,
          [TENANT, studentId],
        );
        assert.equal(brain.rows[0]?.count, "1");
      });
    },
  );

  it(
    "stores a notification with its channels as a text array",
    { skip: !configured, timeout: 45_000 },
    async () => {
      await withRollback(async (client, studentId) => {
        const id = await createSmartNotification(client, {
          studentId,
          scope: { tenantId: TENANT, workspaceId: WORKSPACE },
          type: "achievement",
          title: "Probe title",
          body: "Probe body",
          channels: ["in_app", "push"],
          metadata: { probe: true },
        });

        const stored = await client.query<{ channels: string[]; title: string }>(
          `SELECT channels, title FROM notification_center WHERE id = $1::uuid`,
          [id],
        );
        assert.equal(stored.rows.length, 1, "the notification must actually be stored");
        assert.deepEqual(stored.rows[0]?.channels, ["in_app", "push"]);
        assert.equal(stored.rows[0]?.title, "Probe title");
      });
    },
  );

  it(
    "defaults a notification to the in-app channel",
    { skip: !configured, timeout: 45_000 },
    async () => {
      await withRollback(async (client, studentId) => {
        const id = await createSmartNotification(client, {
          studentId,
          scope: { tenantId: TENANT, workspaceId: WORKSPACE },
          type: "learning",
          title: "Default channel",
          body: "Body",
        });
        const stored = await client.query<{ channels: string[] }>(
          `SELECT channels FROM notification_center WHERE id = $1::uuid`,
          [id],
        );
        assert.deepEqual(stored.rows[0]?.channels, ["in_app"]);
      });
    },
  );

  it(
    "completes the post-certificate milestone chain end to end",
    { skip: !configured, timeout: 45_000 },
    async () => {
      await withRollback(async (client, studentId) => {
        // POST /api/academy-certificates calls this immediately after issuing.
        // While the writers threw, the certificate row was written and then the
        // route answered 500, so issuance looked broken to the student even
        // after the schema contract was restored in migration 0067.
        await awardMilestonesAfterCertificate(
          client,
          studentId,
          1,
          "TP-CERT-PROBE",
          { tenantId: TENANT, workspaceId: WORKSPACE },
        );

        const achievement = await client.query<{ code: string }>(
          `SELECT code FROM student_achievements WHERE student_id = $1::uuid`,
          [studentId],
        );
        assert.deepEqual(
          achievement.rows.map((row) => row.code).sort(),
          ["first-certificate"],
        );

        const events = await client.query<{ event_type: string }>(
          `SELECT event_type FROM learning_events WHERE student_id = $1::uuid ORDER BY event_type`,
          [studentId],
        );
        assert.deepEqual(
          events.rows.map((row) => row.event_type),
          ["badge_earned", "certificate_issued"],
        );

        const notifications = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM notification_center WHERE student_id = $1::uuid`,
          [studentId],
        );
        assert.equal(notifications.rows[0]?.count, "2");
      });
    },
  );

  it(
    "writes the milestone chain into a non-default workspace",
    { skip: !configured, timeout: 45_000 },
    async () => {
      await withRollback(
        async (client, studentId, scope) => {
          // The default-workspace cases above cannot see this: while the helpers
          // defaulted the workspace to 'main', a student bound elsewhere had
          // every derived write rejected by learning_events_principal_binding_fk,
          // and because the routes run on withDb rather than a transaction the
          // achievement row survived the failure — so the retry's ON CONFLICT
          // then skipped the event and the notification permanently.
          await awardMilestonesAfterCertificate(
            client,
            studentId,
            1,
            "TP-CERT-PROBE",
            scope,
          );

          const events = await client.query<{ workspace_id: string; tenant_id: string }>(
            `SELECT DISTINCT tenant_id, workspace_id FROM learning_events
              WHERE student_id = $1::uuid`,
            [studentId],
          );
          assert.deepEqual(events.rows, [
            { tenant_id: scope.tenantId, workspace_id: scope.workspaceId },
          ]);
        },
        { nonDefaultWorkspace: true },
      );
    },
  );
});
