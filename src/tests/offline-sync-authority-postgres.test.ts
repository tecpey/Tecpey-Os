import assert from "node:assert/strict";
import test from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../lib/db-migration-plan";
import {
  normalizeOfflineSyncItem,
  type OfflineSyncItem,
} from "../lib/offline-sync";
import {
  applyOfflineSyncBatch,
  offlineLearningEventId,
} from "../lib/offline-sync-server";

const databaseUrl = process.env.DATABASE_URL;

function validItem(id = crypto.randomUUID()): OfflineSyncItem {
  return {
    id,
    eventType: "lesson_viewed",
    source: "pwa",
    locale: "fa",
    clientCreatedAt: new Date().toISOString(),
    payload: { lessonId: "term-1-lesson-1", progress: 0.5 },
  };
}

async function createStudent(client: PoolClient, id: string): Promise<void> {
  await client.query(
    `INSERT INTO academy_students (id, locale, email, display_name)
     VALUES ($1::uuid, 'fa', $2, 'Offline Sync Red Team')`,
    [id, `${id}@offline-sync.test`],
  );
}

async function cleanupStudent(
  client: PoolClient,
  studentId: string,
): Promise<void> {
  await client.query(
    `DELETE FROM offline_sync_commands WHERE student_id = $1::uuid`,
    [studentId],
  );
  await client.query(
    `DELETE FROM learning_events WHERE student_id = $1::uuid`,
    [studentId],
  );
  await client.query(`DELETE FROM learning_brain WHERE student_id = $1::uuid`, [
    studentId,
  ]);
  await client.query(`DELETE FROM academy_students WHERE id = $1::uuid`, [
    studentId,
  ]);
}

test("offline input rejects unstable identity, unsafe timestamps and oversized payloads", () => {
  assert.deepEqual(
    normalizeOfflineSyncItem({
      eventType: "lesson_viewed",
      source: "web",
      locale: "fa",
      clientCreatedAt: new Date().toISOString(),
      payload: {},
    }),
    { ok: false, reason: "invalid_event_id", id: undefined },
  );

  const serverOnly = normalizeOfflineSyncItem({
    ...validItem(),
    eventType: "lesson_completed",
  });
  assert.equal(serverOnly.ok, false);
  if (!serverOnly.ok) assert.equal(serverOnly.reason, "server_event_only");

  const future = normalizeOfflineSyncItem({
    ...validItem(),
    clientCreatedAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  assert.equal(future.ok, false);
  if (!future.ok) assert.equal(future.reason, "invalid_client_timestamp");

  const oversized = normalizeOfflineSyncItem({
    ...validItem(),
    payload: { note: "x".repeat(9_000) },
  });
  assert.equal(oversized.ok, false);
  if (!oversized.ok) assert.equal(oversized.reason, "invalid_payload");
});

test(
  "concurrent identical offline commands commit one learning event and replay exactly once",
  { skip: !databaseUrl, timeout: 30_000 },
  async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 4 });
    const setup = await pool.connect();
    const first = await pool.connect();
    const second = await pool.connect();
    const studentId = crypto.randomUUID();
    const item = validItem();

    try {
      await applyDatabaseMigrationsWithLock(setup);
      await createStudent(setup, studentId);

      await first.query("BEGIN");
      const firstResult = await applyOfflineSyncBatch(first, studentId, [item]);
      assert.equal(firstResult[0]?.status, "accepted");
      assert.equal(firstResult[0]?.replayed, false);

      await second.query("BEGIN");
      const secondPromise = applyOfflineSyncBatch(second, studentId, [item]);
      await new Promise((resolve) => setTimeout(resolve, 100));
      await first.query("COMMIT");
      const secondResult = await secondPromise;
      await second.query("COMMIT");

      assert.equal(secondResult[0]?.status, "accepted");
      assert.equal(secondResult[0]?.replayed, true);
      assert.equal(
        secondResult[0]?.learningEventId,
        offlineLearningEventId(studentId, item.id),
      );

      const counts = await setup.query<{
        commands: string;
        events: string;
      }>(
        `SELECT
           (SELECT COUNT(*)::text FROM offline_sync_commands
             WHERE student_id = $1::uuid AND client_event_id = $2) AS commands,
           (SELECT COUNT(*)::text FROM learning_events
             WHERE student_id = $1::uuid AND event_id = $3) AS events`,
        [studentId, item.id, offlineLearningEventId(studentId, item.id)],
      );
      assert.equal(counts.rows[0]?.commands, "1");
      assert.equal(counts.rows[0]?.events, "1");

      await setup.query("BEGIN");
      const conflict = await applyOfflineSyncBatch(setup, studentId, [
        { ...item, payload: { lessonId: "term-1-lesson-1", progress: 0.9 } },
      ]);
      await setup.query("COMMIT");
      assert.deepEqual(conflict, [
        {
          id: item.id,
          status: "rejected",
          reason: "idempotency_conflict",
        },
      ]);
    } finally {
      await first.query("ROLLBACK").catch(() => undefined);
      await second.query("ROLLBACK").catch(() => undefined);
      await cleanupStudent(setup, studentId).catch(() => undefined);
      first.release();
      second.release();
      setup.release();
      await pool.end();
    }
  },
);

test(
  "offline command evidence is immutable",
  { skip: !databaseUrl, timeout: 30_000 },
  async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 2 });
    const client = await pool.connect();
    const studentId = crypto.randomUUID();
    const item = validItem();
    try {
      await applyDatabaseMigrationsWithLock(client);
      await createStudent(client, studentId);
      await client.query("BEGIN");
      await applyOfflineSyncBatch(client, studentId, [item]);
      await client.query("COMMIT");

      await client.query("BEGIN");
      await assert.rejects(
        () =>
          client.query(
            `UPDATE offline_sync_commands
                SET payload_hash = $3
              WHERE student_id = $1::uuid AND client_event_id = $2`,
            [studentId, item.id, "0".repeat(64)],
          ),
        /offline_sync_commands_are_immutable/,
      );
      await client.query("ROLLBACK");
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      await cleanupStudent(client, studentId).catch(() => undefined);
      client.release();
      await pool.end();
    }
  },
);
