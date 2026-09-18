import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "@/lib/db-migration-plan";
import {
  evaluateMentorProfileFreshnessCalibration,
  loadMentorProfileFreshnessSnapshot,
} from "@/lib/mentor-profile-freshness";

const databaseUrl = process.env.DATABASE_URL;

async function withRolledBackTest(
  callback: (client: PoolClient) => Promise<void>,
): Promise<void> {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    await applyDatabaseMigrationsWithLock(client);
    await client.query("BEGIN");
    await callback(client);
    await client.query("ROLLBACK");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve original failure.
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function seedScope(client: PoolClient) {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const tenantId = `mentor-freshness-${suffix}`;
  const workspaceId = `${tenantId}-main`;
  const studentId = randomUUID();
  await client.query(
    `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
     VALUES ($1, $1, $1, 'enterprise', ARRAY['mentor']::text[])`,
    [tenantId],
  );
  await client.query(
    `INSERT INTO platform_workspaces
       (id, tenant_id, slug, display_name, products, settings)
     VALUES ($1, $2, $1, $1, ARRAY['mentor']::text[], '{}'::jsonb)`,
    [workspaceId, tenantId],
  );
  await client.query(
    `INSERT INTO academy_students (id, locale, display_name)
     VALUES ($1::uuid, 'fa', 'Mentor Freshness Test')`,
    [studentId],
  );
  return { tenantId, workspaceId, studentId, suffix };
}

async function insertProcessed(
  client: PoolClient,
  scope: Awaited<ReturnType<typeof seedScope>>,
  ordinal: number,
  latencySeconds: number,
): Promise<void> {
  const createdAt = new Date(Date.now() - 120_000 - ordinal * 1_000);
  const processedAt = new Date(createdAt.getTime() + latencySeconds * 1_000);
  await client.query(
    `INSERT INTO mentor_profile_update_outbox
       (id, tenant_id, workspace_id, student_id, event_type, event_version,
        event_id, source_reference, reason, payload_hash, occurred_at, status,
        available_at, attempt_count, processed_at, terminal_at,
        profile_result_hash, created_at, updated_at)
     VALUES
       ($1::uuid, $2, $3, $4::uuid, 'mentor.conversation', 1, $5, $6,
        'mentor_conversation_saved', $7, $8::timestamptz, 'processed',
        $8::timestamptz, 1, $9::timestamptz, $9::timestamptz, $10,
        $8::timestamptz, $9::timestamptz)`,
    [
      randomUUID(),
      scope.tenantId,
      scope.workspaceId,
      scope.studentId,
      `mentor.freshness:${scope.suffix}:${ordinal}`,
      `freshness-${scope.suffix}-${ordinal}`,
      String(ordinal).repeat(64).slice(0, 64),
      createdAt.toISOString(),
      processedAt.toISOString(),
      "f".repeat(64),
    ],
  );
}

async function insertPending(
  client: PoolClient,
  scope: Awaited<ReturnType<typeof seedScope>>,
  ordinal: number,
  ageSeconds: number,
): Promise<void> {
  const createdAt = new Date(Date.now() - ageSeconds * 1_000);
  await client.query(
    `INSERT INTO mentor_profile_update_outbox
       (id, tenant_id, workspace_id, student_id, event_type, event_version,
        event_id, source_reference, reason, payload_hash, occurred_at, status,
        available_at, attempt_count, created_at, updated_at)
     VALUES
       ($1::uuid, $2, $3, $4::uuid, 'mentor.conversation', 1, $5, $6,
        'mentor_conversation_saved', $7, $8::timestamptz, 'pending',
        $8::timestamptz, 0, $8::timestamptz, $8::timestamptz)`,
    [
      randomUUID(),
      scope.tenantId,
      scope.workspaceId,
      scope.studentId,
      `mentor.freshness:${scope.suffix}:pending:${ordinal}`,
      `freshness-${scope.suffix}-pending-${ordinal}`,
      String(ordinal + 5).repeat(64).slice(0, 64),
      createdAt.toISOString(),
    ],
  );
}

test(
  "Mentor freshness calibration derives aggregate latency evidence from PostgreSQL",
  { skip: !databaseUrl, timeout: 20_000 },
  async () => {
    await withRolledBackTest(async (client) => {
      const scope = await seedScope(client);
      const baseline = await loadMentorProfileFreshnessSnapshot(client, {
        lookbackSeconds: 300,
        targetSeconds: 60,
      });

      for (const [index, latency] of [10, 30, 60, 120].entries()) {
        await insertProcessed(client, scope, index + 1, latency);
      }
      await insertPending(client, scope, 20, 120);
      await insertPending(client, scope, 21, 10);

      const snapshot = await loadMentorProfileFreshnessSnapshot(client, {
        lookbackSeconds: 300,
        targetSeconds: 60,
      });

      // Four processed samples plus one matured pending sample are eligible.
      // The 10-second-old pending event has not had its full 60-second target
      // opportunity and must not enter the denominator yet.
      assert.equal(snapshot.sampleCount >= baseline.sampleCount + 5, true);
      assert.equal(
        snapshot.processedSampleCount >= baseline.processedSampleCount + 4,
        true,
      );
      assert.equal(
        snapshot.validLatencyCount >= baseline.validLatencyCount + 4,
        true,
      );
      assert.equal(
        snapshot.withinTargetCount >= baseline.withinTargetCount + 3,
        true,
      );
      assert.equal(
        snapshot.missedTargetCount >= baseline.missedTargetCount + 2,
        true,
      );
      assert.equal(snapshot.withinTargetRatio !== null, true);
      assert.equal((snapshot.p50Seconds ?? -1) >= 0, true);
      assert.equal((snapshot.p95Seconds ?? -1) >= 0, true);
      assert.equal((snapshot.maxSeconds ?? -1) >= 120, true);
      assert.equal(
        snapshot.validLatencyCount + snapshot.invalidLatencyCount,
        snapshot.processedSampleCount,
      );
      assert.equal(
        snapshot.withinTargetCount + snapshot.missedTargetCount,
        snapshot.sampleCount,
      );
      assert.equal(
        evaluateMentorProfileFreshnessCalibration(snapshot, 1).status,
        snapshot.invalidLatencyCount > 0 ? "invalid_evidence" : "observed",
      );
    });
  },
);
