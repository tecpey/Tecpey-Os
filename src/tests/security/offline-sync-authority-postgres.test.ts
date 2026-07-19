import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import {
  offlineLearningEventId,
  processOfflineSyncCommand,
  purgeExpiredOfflineCommands,
  reconcileStaleOfflineCommands,
} from "../../lib/offline-sync-authority";
import type { OfflineSyncItem } from "../../lib/offline-sync";
import { PLATFORM } from "../../lib/platform-config";

const databaseUrl = process.env.DATABASE_URL?.trim();
const databaseConfigured = Boolean(
  databaseUrl && !databaseUrl.includes("CHANGE_ME"),
);
let pool: Pool | null = null;

function item(
  id: string,
  payload: Record<string, unknown> = { lessonSlug: "lesson-1" },
): OfflineSyncItem {
  return {
    id,
    eventType: "lesson_viewed",
    source: "pwa",
    locale: "fa",
    clientCreatedAt: "2026-07-19T12:00:00.000Z",
    payload,
  };
}

async function createStudent(client: PoolClient, prefix: string): Promise<string> {
  const studentId = randomUUID();
  await client.query(
    `INSERT INTO academy_students (id, locale, email, display_name)
     VALUES ($1::uuid, 'fa', $2, $3)`,
    [studentId, `${prefix}-${studentId}@offline.test`, prefix],
  );
  return studentId;
}

async function cleanupStudent(
  client: PoolClient,
  studentId: string,
): Promise<void> {
  await client.query(
    "DELETE FROM offline_sync_commands WHERE student_id = $1::uuid",
    [studentId],
  );
  await client.query(
    "DELETE FROM learning_events WHERE student_id = $1::uuid",
    [studentId],
  );
  await client.query(
    "DELETE FROM learning_brain_profiles WHERE student_id = $1::uuid",
    [studentId],
  );
  await client.query("DELETE FROM academy_students WHERE id = $1::uuid", [
    studentId,
  ]);
}

async function withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

before(async () => {
  if (!databaseConfigured || !databaseUrl) return;
  pool = new Pool({
    connectionString: databaseUrl,
    max: 6,
    idleTimeoutMillis: 1_000,
    allowExitOnIdle: true,
  });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
});

after(async () => {
  await pool?.end();
  pool = null;
});

describe("Offline sync PostgreSQL command authority", () => {
  it(
    "commits one learning event under concurrent duplicate delivery and replays the original result",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const studentId = await withClient((client) =>
        createStudent(client, "concurrent"),
      );
      const clientEventId = `offline-${randomUUID()}`;
      try {
        const results = await Promise.all(
          Array.from({ length: 4 }, () =>
            processOfflineSyncCommand({
              tenantId: PLATFORM.DEFAULT_TENANT_ID,
              studentId,
              item: item(clientEventId),
            }),
          ),
        );
        assert.equal(
          results.every((result) => result.status === "committed"),
          true,
        );
        assert.equal(
          results.filter((result) => result.replayed === false).length,
          1,
        );
        assert.equal(
          results.filter((result) => result.replayed === true).length,
          3,
        );
        assert.equal(
          new Set(results.map((result) => result.learningEventId)).size,
          1,
        );

        await withClient(async (client) => {
          const commandCount = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM offline_sync_commands
              WHERE tenant_id = $1
                AND student_id = $2::uuid
                AND client_event_id = $3`,
            [PLATFORM.DEFAULT_TENANT_ID, studentId, clientEventId],
          );
          const eventCount = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM learning_events
              WHERE event_id = $1`,
            [results[0]?.learningEventId],
          );
          assert.equal(Number(commandCount.rows[0]?.count), 1);
          assert.equal(Number(eventCount.rows[0]?.count), 1);
        });
      } finally {
        await withClient((client) => cleanupStudent(client, studentId));
      }
    },
  );

  it(
    "rejects changed payload reuse of one client event ID without applying a second event",
    { skip: !databaseConfigured, timeout: 20_000 },
    async () => {
      const studentId = await withClient((client) =>
        createStudent(client, "conflict"),
      );
      const clientEventId = `offline-${randomUUID()}`;
      try {
        const first = await processOfflineSyncCommand({
          tenantId: PLATFORM.DEFAULT_TENANT_ID,
          studentId,
          item: item(clientEventId, { lessonSlug: "lesson-1", progress: 10 }),
        });
        const changed = await processOfflineSyncCommand({
          tenantId: PLATFORM.DEFAULT_TENANT_ID,
          studentId,
          item: item(clientEventId, { lessonSlug: "lesson-1", progress: 99 }),
        });
        assert.equal(first.status, "committed");
        assert.deepEqual(changed, {
          id: clientEventId,
          status: "rejected",
          reason: "idempotency_conflict",
        });

        await withClient(async (client) => {
          const events = await client.query<{ count: string }>(
            "SELECT COUNT(*)::text AS count FROM learning_events WHERE student_id = $1::uuid",
            [studentId],
          );
          assert.equal(Number(events.rows[0]?.count), 1);
        });
      } finally {
        await withClient((client) => cleanupStudent(client, studentId));
      }
    },
  );

  it(
    "isolates the same client event ID across students",
    { skip: !databaseConfigured, timeout: 20_000 },
    async () => {
      const students = await withClient(async (client) => [
        await createStudent(client, "student-a"),
        await createStudent(client, "student-b"),
      ] as const);
      const [firstStudent, secondStudent] = students;
      const clientEventId = `offline-${randomUUID()}`;
      try {
        const [first, second] = await Promise.all([
          processOfflineSyncCommand({
            tenantId: PLATFORM.DEFAULT_TENANT_ID,
            studentId: firstStudent,
            item: item(clientEventId),
          }),
          processOfflineSyncCommand({
            tenantId: PLATFORM.DEFAULT_TENANT_ID,
            studentId: secondStudent,
            item: item(clientEventId),
          }),
        ]);
        assert.equal(first.status, "committed");
        assert.equal(second.status, "committed");
        assert.notEqual(first.learningEventId, second.learningEventId);
      } finally {
        await withClient(async (client) => {
          await cleanupStudent(client, firstStudent);
          await cleanupStudent(client, secondStudent);
        });
      }
    },
  );

  it(
    "rolls back command evidence when learning-event application fails",
    { skip: !databaseConfigured, timeout: 20_000 },
    async () => {
      const studentId = await withClient((client) =>
        createStudent(client, "rollback"),
      );
      const suffix = randomUUID().replaceAll("-", "");
      const functionName = `offline_test_fail_${suffix}`;
      const triggerName = `offline_test_fail_trigger_${suffix}`;
      await withClient(async (client) => {
        await client.query(
          `CREATE FUNCTION ${functionName}() RETURNS trigger
           LANGUAGE plpgsql AS $$
           BEGIN
             IF NEW.student_id = '${studentId}'::uuid THEN
               RAISE EXCEPTION 'forced offline event failure';
             END IF;
             RETURN NEW;
           END $$`,
        );
        await client.query(
          `CREATE TRIGGER ${triggerName}
             BEFORE INSERT ON learning_events
             FOR EACH ROW EXECUTE FUNCTION ${functionName}()`,
        );
      });
      const clientEventId = `offline-${randomUUID()}`;

      try {
        assert.deepEqual(
          await processOfflineSyncCommand({
            tenantId: PLATFORM.DEFAULT_TENANT_ID,
            studentId,
            item: item(clientEventId),
          }),
          {
            id: clientEventId,
            status: "retryable",
            reason: "storage_unavailable",
          },
        );

        await withClient(async (client) => {
          const commands = await client.query<{ count: string }>(
            "SELECT COUNT(*)::text AS count FROM offline_sync_commands WHERE student_id = $1::uuid",
            [studentId],
          );
          const events = await client.query<{ count: string }>(
            "SELECT COUNT(*)::text AS count FROM learning_events WHERE student_id = $1::uuid",
            [studentId],
          );
          assert.equal(Number(commands.rows[0]?.count), 0);
          assert.equal(Number(events.rows[0]?.count), 0);
        });
      } finally {
        await withClient(async (client) => {
          await client.query(
            `DROP TRIGGER IF EXISTS ${triggerName} ON learning_events`,
          );
          await client.query(`DROP FUNCTION IF EXISTS ${functionName}()`);
          await cleanupStudent(client, studentId);
        });
      }
    },
  );

  it(
    "reconciles stale processing evidence and purges expired terminal commands in bounded batches",
    { skip: !databaseConfigured, timeout: 20_000 },
    async () => {
      const studentId = await withClient((client) =>
        createStudent(client, "reconcile"),
      );
      const committedClientId = `offline-${randomUUID()}`;
      const retryableClientId = `offline-${randomUUID()}`;
      const expiredClientId = `offline-${randomUUID()}`;
      const committedEventId = offlineLearningEventId({
        tenantId: PLATFORM.DEFAULT_TENANT_ID,
        studentId,
        clientEventId: committedClientId,
      });

      try {
        await withClient(async (client) => {
          await client.query(
            `INSERT INTO learning_events
               (event_id, student_id, event_type, source, locale, payload)
             VALUES ($1, $2::uuid, 'lesson_viewed', 'pwa', 'fa', '{}'::jsonb)`,
            [committedEventId, studentId],
          );
          for (const [clientEventId, eventId] of [
            [committedClientId, committedEventId],
            [
              retryableClientId,
              offlineLearningEventId({
                tenantId: PLATFORM.DEFAULT_TENANT_ID,
                studentId,
                clientEventId: retryableClientId,
              }),
            ],
          ] as const) {
            await client.query(
              `INSERT INTO offline_sync_commands
                 (tenant_id, student_id, client_event_id, command_hash,
                  event_type, source, locale, client_created_at, payload,
                  status, domain_event_id, processing_started_at, retain_until)
               VALUES ($1, $2::uuid, $3, $4, 'lesson_viewed', 'pwa', 'fa',
                       NOW(), '{}'::jsonb, 'processing', $5,
                       NOW() - INTERVAL '10 minutes', NOW() + INTERVAL '90 days')`,
              [
                PLATFORM.DEFAULT_TENANT_ID,
                studentId,
                clientEventId,
                "a".repeat(64),
                eventId,
              ],
            );
          }
          await client.query(
            `INSERT INTO offline_sync_commands
               (tenant_id, student_id, client_event_id, command_hash,
                event_type, source, locale, client_created_at, payload,
                status, last_error_code, created_at, updated_at, retain_until)
             VALUES ($1, $2::uuid, $3, $4, 'lesson_viewed', 'pwa', 'fa', NOW(),
                     '{}'::jsonb, 'rejected', 'invalid_event',
                     NOW() - INTERVAL '100 days', NOW() - INTERVAL '100 days',
                     NOW() - INTERVAL '1 day')`,
            [
              PLATFORM.DEFAULT_TENANT_ID,
              studentId,
              expiredClientId,
              "b".repeat(64),
            ],
          );

          await client.query("BEGIN");
          try {
            assert.deepEqual(
              await reconcileStaleOfflineCommands(client, { limit: 10 }),
              { committed: 1, retryable: 1 },
            );
            assert.equal(await purgeExpiredOfflineCommands(client, 10), 1);
            await client.query("COMMIT");
          } catch (error) {
            await client.query("ROLLBACK");
            throw error;
          }

          const states = await client.query<{
            client_event_id: string;
            status: string;
          }>(
            `SELECT client_event_id, status
               FROM offline_sync_commands
              WHERE student_id = $1::uuid`,
            [studentId],
          );
          assert.deepEqual(
            new Map(states.rows.map((row) => [row.client_event_id, row.status])),
            new Map([
              [committedClientId, "committed"],
              [retryableClientId, "retryable"],
            ]),
          );
        });
      } finally {
        await withClient((client) => cleanupStudent(client, studentId));
      }
    },
  );

  it("returns retryable and never false success when PostgreSQL is unavailable", () => {
    const script = `
      const module = await import("./src/lib/offline-sync-authority.ts");
      const processCommand = module.processOfflineSyncCommand ?? module.default?.processOfflineSyncCommand;
      const result = await processCommand({
        tenantId: "tecpey",
        studentId: "00000000-0000-4000-8000-000000000001",
        item: {
          id: "offline-00000000-0000-4000-8000-000000000002",
          eventType: "lesson_viewed",
          source: "pwa",
          locale: "fa",
          clientCreatedAt: "2026-07-19T12:00:00.000Z",
          payload: { lessonSlug: "lesson-1" },
        },
      });
      console.log("OFFLINE_RESULT=" + JSON.stringify(result));
    `;
    const child = spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", script],
      {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: "test", DATABASE_URL: "" },
        encoding: "utf8",
        timeout: 10_000,
      },
    );
    assert.equal(child.status, 0, child.stderr);
    const line = child.stdout
      .split(/\r?\n/)
      .find((entry) => entry.startsWith("OFFLINE_RESULT="));
    assert.ok(line, child.stdout);
    assert.deepEqual(JSON.parse(line.slice("OFFLINE_RESULT=".length)), {
      id: "offline-00000000-0000-4000-8000-000000000002",
      status: "retryable",
      reason: "storage_unavailable",
    });
  });
});
