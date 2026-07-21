import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import {
  processOfflineSyncCommand,
  type OfflineSyncAuthorityContext,
} from "../../lib/offline-sync-authority";
import type { OfflineSyncItem } from "../../lib/offline-sync";
import { PLATFORM } from "../../lib/platform-config";

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

async function withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

function item(id: string, payload: Record<string, unknown> = {}): OfflineSyncItem {
  return {
    id,
    eventType: "lesson_viewed",
    source: "pwa",
    locale: "fa",
    clientCreatedAt: "2026-07-19T12:00:00.000Z",
    payload,
  };
}

async function createStudent(prefix: string): Promise<string> {
  const studentId = randomUUID();
  await withClient((client) =>
    client.query(
      `INSERT INTO academy_students (id, locale, email, display_name)
       VALUES ($1::uuid, 'fa', $2, $3)`,
      [studentId, `${prefix}-${studentId}@offline.test`, prefix],
    ),
  );
  return studentId;
}

function context(studentId: string): OfflineSyncAuthorityContext {
  return {
    available: true,
    tenantId: PLATFORM.DEFAULT_TENANT_ID,
    workspaceId: PLATFORM.DEFAULT_WORKSPACE_ID,
    principalType: "student",
    principalId: studentId,
    roles: [],
    scopes: ["offline-sync:write"],
    bindingSource: "academy_students_trigger",
    bindingStatus: "active",
    membershipId: null,
    requestId: `request-${randomUUID()}`,
    authEvidence: { strictRevocation: true, sessionPrincipal: true },
  };
}

async function cleanupStudent(studentId: string): Promise<void> {
  await withClient(async (client) => {
    await client.query("DELETE FROM offline_sync_commands WHERE student_id = $1::uuid", [studentId]);
    await client.query("DELETE FROM learning_events WHERE student_id = $1::uuid", [studentId]);
    await client.query("DELETE FROM academy_students WHERE id = $1::uuid", [studentId]);
  });
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 8, allowExitOnIdle: true });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
});

after(async () => {
  await pool?.end();
  pool = null;
});

describe("Offline sync PostgreSQL command authority", () => {
  it(
    "commits one learning event under concurrent duplicate delivery",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const studentId = await createStudent("concurrent");
      const clientEventId = `offline-${randomUUID()}`;
      try {
        const results = await Promise.all(
          Array.from({ length: 4 }, () =>
            processOfflineSyncCommand({ context: context(studentId), item: item(clientEventId) }),
          ),
        );
        assert.equal(results.every((result) => result.status === "committed"), true);
        assert.equal(results.filter((result) => result.replayed === false).length, 1);
        assert.equal(results.filter((result) => result.replayed === true).length, 3);
      } finally {
        await cleanupStudent(studentId);
      }
    },
  );

  it(
    "rejects changed payload reuse of one client event ID",
    { skip: !configured, timeout: 20_000 },
    async () => {
      const studentId = await createStudent("conflict");
      const clientEventId = `offline-${randomUUID()}`;
      try {
        const first = await processOfflineSyncCommand({
          context: context(studentId),
          item: item(clientEventId, { progress: 10 }),
        });
        const changed = await processOfflineSyncCommand({
          context: context(studentId),
          item: item(clientEventId, { progress: 99 }),
        });
        assert.equal(first.status, "committed");
        assert.deepEqual(changed, {
          id: clientEventId,
          status: "rejected",
          reason: "idempotency_conflict",
        });
      } finally {
        await cleanupStudent(studentId);
      }
    },
  );

  it(
    "isolates the same client event identity across tenant and principal contexts",
    { skip: !configured, timeout: 20_000 },
    async () => {
      const firstStudent = await createStudent("principal-a");
      const secondStudent = await createStudent("principal-b");
      const clientEventId = `offline-${randomUUID()}`;
      try {
        const [first, second] = await Promise.all([
          processOfflineSyncCommand({ context: context(firstStudent), item: item(clientEventId) }),
          processOfflineSyncCommand({ context: context(secondStudent), item: item(clientEventId) }),
        ]);
        assert.equal(first.status, "committed");
        assert.equal(second.status, "committed");
        assert.notEqual(first.learningEventId, second.learningEventId);
      } finally {
        await cleanupStudent(firstStudent);
        await cleanupStudent(secondStudent);
      }
    },
  );

  it(
    "rejects a cross-tenant command row at the composite foreign key",
    { skip: !configured, timeout: 20_000 },
    async () => {
      const studentId = await createStudent("cross-tenant");
      const tenantId = `tenant-${randomUUID()}`;
      const workspaceId = `workspace-${randomUUID()}`;
      try {
        await withClient(async (client) => {
          await client.query(
            `INSERT INTO platform_tenants (id, slug, display_name, status, settings)
             VALUES ($1, $1, $1, 'active', '{}'::jsonb)`,
            [tenantId],
          );
          await client.query(
            `INSERT INTO platform_workspaces
               (id, tenant_id, slug, display_name, is_default, products, settings)
             VALUES ($1, $2, $1, $1, TRUE, '{}'::jsonb, '{}'::jsonb)`,
            [workspaceId, tenantId],
          );
          await assert.rejects(
            client.query(
              `INSERT INTO offline_sync_commands
                 (tenant_id, workspace_id, principal_type, student_id,
                  client_event_id, command_hash, event_type, source, locale,
                  client_created_at, payload, status, retain_until)
               VALUES ($1, $2, 'student', $3::uuid, $4, $5, 'lesson_viewed',
                       'pwa', 'fa', NOW(), '{}'::jsonb, 'processing',
                       NOW() + INTERVAL '1 day')`,
              [tenantId, workspaceId, studentId, `offline-${randomUUID()}`, "a".repeat(64)],
            ),
            /offline_sync_commands_principal_binding_fk|foreign key/i,
          );
          await client.query("ROLLBACK").catch(() => undefined);
          await client.query("DELETE FROM platform_tenants WHERE id = $1", [tenantId]);
        });
      } finally {
        await cleanupStudent(studentId);
      }
    },
  );

  it(
    "rolls back command evidence when learning-event application fails",
    { skip: !configured, timeout: 20_000 },
    async () => {
      const studentId = await createStudent("rollback");
      const functionName = `offline_fail_${randomUUID().replaceAll("-", "")}`;
      const triggerName = `${functionName}_trigger`;
      const clientEventId = `offline-${randomUUID()}`;
      try {
        await withClient(async (client) => {
          await client.query(
            `CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
             BEGIN
               IF NEW.student_id = '${studentId}'::uuid THEN
                 RAISE EXCEPTION 'forced offline event failure';
               END IF;
               RETURN NEW;
             END $$`,
          );
          await client.query(
            `CREATE TRIGGER ${triggerName} BEFORE INSERT ON learning_events
             FOR EACH ROW EXECUTE FUNCTION ${functionName}()`,
          );
        });
        const result = await processOfflineSyncCommand({
          context: context(studentId),
          item: item(clientEventId),
        });
        assert.deepEqual(result, {
          id: clientEventId,
          status: "retryable",
          reason: "storage_unavailable",
        });
        const count = await withClient((client) =>
          client.query<{ count: string }>(
            "SELECT COUNT(*)::text AS count FROM offline_sync_commands WHERE student_id = $1::uuid",
            [studentId],
          ),
        );
        assert.equal(Number(count.rows[0]?.count), 0);
      } finally {
        await withClient(async (client) => {
          await client.query(`DROP TRIGGER IF EXISTS ${triggerName} ON learning_events`);
          await client.query(`DROP FUNCTION IF EXISTS ${functionName}()`);
        });
        await cleanupStudent(studentId);
      }
    },
  );

  it("returns retryable evidence when PostgreSQL is unavailable", async () => {
    const invalidContext = {
      ...context(randomUUID()),
      scopes: [],
    };
    const result = await processOfflineSyncCommand({
      context: invalidContext,
      item: item(`offline-${randomUUID()}`),
    });
    assert.deepEqual(result, {
      id: result.id,
      status: "rejected",
      reason: "principal_context_invalid",
    });
  });
});
