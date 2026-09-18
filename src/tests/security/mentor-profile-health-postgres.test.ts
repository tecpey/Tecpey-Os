import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "@/lib/db-migration-plan";
import {
  evaluateMentorProfileHealth,
  loadMentorProfileHealthSnapshot,
} from "@/lib/mentor-profile-health";

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
      // Preserve the original failure.
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function seedScope(client: PoolClient) {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const tenantId = `mentor-health-${suffix}`;
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
     VALUES ($1::uuid, 'fa', 'Mentor Health Test')`,
    [studentId],
  );
  return { tenantId, workspaceId, studentId, suffix };
}

async function insertEvent(
  client: PoolClient,
  scope: Awaited<ReturnType<typeof seedScope>>,
  ordinal: number,
  status: "pending" | "processing" | "failed_terminal",
): Promise<string> {
  const id = randomUUID();
  const eventId = `mentor.health:${scope.suffix}:${ordinal}`;
  const sourceReference = `health-${scope.suffix}-${ordinal}`;
  const payloadHash = String(ordinal).repeat(64).slice(0, 64);
  const processing = status === "processing";
  const terminal = status === "failed_terminal";
  await client.query(
    `INSERT INTO mentor_profile_update_outbox
       (id, tenant_id, workspace_id, student_id, event_type, event_version,
        event_id, source_reference, reason, payload_hash, occurred_at, status,
        available_at, attempt_count, locked_at, locked_by, lease_expires_at,
        terminal_at, created_at, updated_at, last_error_code)
     VALUES
       ($1::uuid, $2, $3, $4::uuid, 'mentor.conversation', 1, $5, $6,
        'mentor_conversation_saved', $7,
        NOW() - INTERVAL '10 minutes', $8,
        NOW() - INTERVAL '10 minutes', $9,
        CASE WHEN $10 THEN NOW() - INTERVAL '2 minutes' ELSE NULL END,
        CASE WHEN $10 THEN 'mentor-health-test' ELSE NULL END,
        CASE WHEN $10 THEN NOW() - INTERVAL '1 minute' ELSE NULL END,
        CASE WHEN $11 THEN NOW() ELSE NULL END,
        NOW() - INTERVAL '10 minutes', NOW(),
        CASE WHEN $11 THEN 'health_test_terminal' ELSE NULL END)`,
    [
      id,
      scope.tenantId,
      scope.workspaceId,
      scope.studentId,
      eventId,
      sourceReference,
      payloadHash,
      status,
      status === "pending" ? 0 : 1,
      processing,
      terminal,
    ],
  );
  return id;
}

test(
  "Mentor health snapshot exposes aggregate backlog, lease and terminal evidence",
  { skip: !databaseUrl, timeout: 20_000 },
  async () => {
    await withRolledBackTest(async (client) => {
      const scope = await seedScope(client);
      await insertEvent(client, scope, 1, "pending");
      await insertEvent(client, scope, 2, "processing");
      const terminalId = await insertEvent(client, scope, 3, "failed_terminal");
      await client.query(
        `INSERT INTO mentor_profile_update_dead_letters
           (tenant_id, workspace_id, outbox_id, terminal_reason, event_id,
            student_fingerprint, payload_hash)
         SELECT tenant_id, workspace_id, id, 'health_test_terminal', event_id,
                $2, payload_hash
           FROM mentor_profile_update_outbox
          WHERE id = $1::uuid`,
        [terminalId, "a".repeat(64)],
      );

      const snapshot = await loadMentorProfileHealthSnapshot(client);
      assert.equal(snapshot.readyBacklog >= 1, true);
      assert.equal(snapshot.overdueLeases >= 1, true);
      assert.equal(snapshot.failedTerminal >= 1, true);
      assert.equal(snapshot.deadLetters >= 1, true);
      assert.equal((snapshot.oldestReadyAgeSeconds ?? 0) >= 500, true);
      assert.equal((snapshot.maxLeaseOverdueSeconds ?? 0) >= 50, true);

      const evaluation = evaluateMentorProfileHealth(snapshot);
      assert.equal(evaluation.status, "critical");
      assert.equal(
        evaluation.reasonCodes.includes("terminal_projection_failure"),
        true,
      );
      assert.equal(evaluation.reasonCodes.includes("dead_letter_present"), true);
      assert.equal(
        evaluation.reasonCodes.includes("lease_overdue_critical"),
        true,
      );
      assert.equal(evaluation.reasonCodes.includes("ready_age_critical"), true);
    });
  },
);
