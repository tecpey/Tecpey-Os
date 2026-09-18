import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "@/lib/db-migration-plan";
import {
  claimMentorProfileUpdates,
  enqueueMentorProfileUpdateTx,
  failMentorProfileUpdateClaim,
  processMentorProfileUpdateClaimTx,
  recoverExpiredMentorProfileLeases,
} from "@/lib/mentor-profile-update-outbox";

const databaseUrl = process.env.DATABASE_URL;

async function withRolledBackTest(
  callback: (client: PoolClient) => Promise<void>,
): Promise<void> {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
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
      // Preserve the original test failure.
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function seedScope(
  client: PoolClient,
  label: string,
): Promise<{ tenantId: string; workspaceId: string; studentId: string }> {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const tenantId = `${label}-${suffix}`;
  const workspaceId = `${tenantId}-main`;
  const studentId = randomUUID();

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
  await client.query(
    `INSERT INTO academy_students (id, locale, display_name)
     VALUES ($1::uuid, 'fa', $2)`,
    [studentId, label],
  );
  return { tenantId, workspaceId, studentId };
}

async function count(
  client: PoolClient,
  sql: string,
  values: unknown[] = [],
): Promise<number> {
  const result = await client.query<{ count: string }>(sql, values);
  return Number.parseInt(result.rows[0]?.count ?? "0", 10);
}

test(
  "Mentor profile outbox retries the same authoritative source idempotently",
  { skip: !databaseUrl },
  async () => {
    await withRolledBackTest(async (client) => {
      const scope = await seedScope(client, "mentor-event-replay");
      const first = await enqueueMentorProfileUpdateTx(client, {
        ...scope,
        eventType: "academy.term_progress",
        reason: "authoritative_term_assessment",
        sourceReference: "assessment-replay-0001",
        occurredAt: "2026-09-18T00:00:00.000Z",
      });
      const replay = await enqueueMentorProfileUpdateTx(client, {
        ...scope,
        eventType: "academy.term_progress",
        reason: "authoritative_term_assessment",
        sourceReference: "assessment-replay-0001",
        occurredAt: "2026-09-18T00:05:00.000Z",
      });

      assert.equal(first.replayed, false);
      assert.equal(replay.replayed, true);
      assert.equal(replay.outboxId, first.outboxId);
      assert.equal(replay.eventId, first.eventId);
      assert.equal(
        await count(
          client,
          "SELECT COUNT(*)::text AS count FROM mentor_profile_update_outbox WHERE id = $1",
          [first.outboxId],
        ),
        1,
      );

      const stored = await client.query<{ occurred_at: Date }>(
        "SELECT occurred_at FROM mentor_profile_update_outbox WHERE id = $1",
        [first.outboxId],
      );
      assert.equal(
        stored.rows[0]?.occurred_at.toISOString(),
        "2026-09-18T00:00:00.000Z",
      );

      await assert.rejects(
        enqueueMentorProfileUpdateTx(client, {
          ...scope,
          eventType: "academy.term_progress",
          reason: "mentor_conversation_migrated",
          sourceReference: "assessment-replay-0001",
        }),
        /mentor_profile_event_identity_conflict/,
      );
    });
  },
);

test(
  "Mentor profile outbox rejects a workspace borrowed from another tenant",
  { skip: !databaseUrl },
  async () => {
    await withRolledBackTest(async (client) => {
      const scopeA = await seedScope(client, "mentor-scope-a");
      const scopeB = await seedScope(client, "mentor-scope-b");

      await assert.rejects(
        enqueueMentorProfileUpdateTx(client, {
          tenantId: scopeA.tenantId,
          workspaceId: scopeB.workspaceId,
          studentId: scopeA.studentId,
          eventType: "mentor.conversation",
          reason: "mentor_conversation_saved",
          sourceReference: randomUUID(),
        }),
        (error: unknown) =>
          Boolean(
            error &&
              typeof error === "object" &&
              "code" in error &&
              (error as { code?: string }).code === "23503",
          ),
      );
    });
  },
);

test(
  "Mentor profile worker claims once and commits profile plus attempt evidence atomically",
  { skip: !databaseUrl },
  async () => {
    await withRolledBackTest(async (client) => {
      const scope = await seedScope(client, "mentor-process");
      const queued = await enqueueMentorProfileUpdateTx(client, {
        ...scope,
        eventType: "mentor.conversation",
        reason: "mentor_conversation_saved",
        sourceReference: randomUUID(),
      });

      await client.query(
        "UPDATE mentor_profile_update_outbox SET available_at = TIMESTAMPTZ '2000-01-01T00:00:00Z' WHERE id = $1",
        [queued.outboxId],
      );
      const first = await claimMentorProfileUpdates(client, {
        workerId: "mentor-worker-a",
        limit: 1,
        leaseSeconds: 120,
      });
      assert.equal(first.length, 1);
      assert.equal(first[0]?.outboxId, queued.outboxId);
      assert.equal(
        await count(
          client,
          "SELECT COUNT(*)::text AS count FROM mentor_profile_update_attempts WHERE outbox_id = $1 AND attempt_number = 1 AND status = 'claimed'",
          [queued.outboxId],
        ),
        1,
      );

      const processed = await processMentorProfileUpdateClaimTx(
        client,
        first[0]!,
        "mentor-worker-a",
      );
      assert.equal(processed.studentId, scope.studentId);
      assert.equal(processed.replayed, false);
      assert.match(processed.resultHash, /^[a-f0-9]{64}$/);

      const state = await client.query<{
        status: string;
        tenant_id: string;
        workspace_id: string;
        profile_result_hash: string;
      }>(
        `SELECT status, tenant_id, workspace_id, profile_result_hash
           FROM mentor_profile_update_outbox WHERE id = $1`,
        [queued.outboxId],
      );
      assert.deepEqual(
        {
          status: state.rows[0]?.status,
          tenantId: state.rows[0]?.tenant_id,
          workspaceId: state.rows[0]?.workspace_id,
        },
        {
          status: "processed",
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
        },
      );
      assert.equal(state.rows[0]?.profile_result_hash, processed.resultHash);

      const attempt = await client.query<{
        status: string;
        tenant_id: string;
        workspace_id: string;
        result_hash: string;
      }>(
        `SELECT status, tenant_id, workspace_id, result_hash
           FROM mentor_profile_update_attempts
          WHERE outbox_id = $1 AND attempt_number = 1`,
        [queued.outboxId],
      );
      assert.equal(attempt.rows[0]?.status, "processed");
      assert.equal(attempt.rows[0]?.tenant_id, scope.tenantId);
      assert.equal(attempt.rows[0]?.workspace_id, scope.workspaceId);
      assert.equal(attempt.rows[0]?.result_hash, processed.resultHash);

      const profile = await client.query<{
        confidence_score: number;
        primary_goal: string;
      }>(
        `SELECT confidence_score, primary_goal
           FROM mentor_profiles WHERE student_id = $1::uuid`,
        [scope.studentId],
      );
      assert.equal(profile.rows[0]?.confidence_score, 0);
      assert.equal(profile.rows[0]?.primary_goal, "");
    });
  },
);

test(
  "Mentor profile terminal failure preserves tenant-scoped append-only dead-letter evidence",
  { skip: !databaseUrl },
  async () => {
    await withRolledBackTest(async (client) => {
      const scope = await seedScope(client, "mentor-terminal");
      const queued = await enqueueMentorProfileUpdateTx(client, {
        ...scope,
        eventType: "arena.trade_signal",
        reason: "trading_trade_created",
        sourceReference: randomUUID(),
      });
      await client.query(
        "UPDATE mentor_profile_update_outbox SET max_attempts = 1, available_at = TIMESTAMPTZ '2000-01-01T00:00:00Z' WHERE id = $1",
        [queued.outboxId],
      );

      const claims = await claimMentorProfileUpdates(client, {
        workerId: "mentor-terminal-worker",
        limit: 1,
        leaseSeconds: 120,
      });
      const failed = await failMentorProfileUpdateClaim(
        client,
        claims[0]!,
        "mentor-terminal-worker",
        {
          errorCode: "forced_terminal_fixture",
          errorDetail: null,
          retryable: true,
        },
      );
      assert.equal(failed.terminal, true);

      const dead = await client.query<{
        tenant_id: string;
        workspace_id: string;
        terminal_reason: string;
        student_fingerprint: string;
      }>(
        `SELECT tenant_id, workspace_id, terminal_reason, student_fingerprint
           FROM mentor_profile_update_dead_letters
          WHERE outbox_id = $1`,
        [queued.outboxId],
      );
      assert.equal(dead.rows[0]?.tenant_id, scope.tenantId);
      assert.equal(dead.rows[0]?.workspace_id, scope.workspaceId);
      assert.equal(dead.rows[0]?.terminal_reason, "forced_terminal_fixture");
      assert.match(dead.rows[0]?.student_fingerprint ?? "", /^[a-f0-9]{64}$/);
      assert.equal(dead.rows[0]?.student_fingerprint.includes(scope.studentId), false);

      await client.query("SAVEPOINT mentor_dead_letter_mutation");
      await assert.rejects(
        client.query(
          `UPDATE mentor_profile_update_dead_letters
              SET terminal_reason = 'tampered'
            WHERE outbox_id = $1`,
          [queued.outboxId],
        ),
        /append-only/,
      );
      await client.query("ROLLBACK TO SAVEPOINT mentor_dead_letter_mutation");

      await client.query("SAVEPOINT mentor_event_identity_mutation");
      await assert.rejects(
        client.query(
          "UPDATE mentor_profile_update_outbox SET reason = 'mentor_conversation_saved' WHERE id = $1",
          [queued.outboxId],
        ),
        /event identity is immutable/,
      );
      await client.query("ROLLBACK TO SAVEPOINT mentor_event_identity_mutation");
    });
  },
);

test(
  "Mentor profile expired leases recover without losing the event",
  { skip: !databaseUrl },
  async () => {
    await withRolledBackTest(async (client) => {
      const scope = await seedScope(client, "mentor-lease");
      const queued = await enqueueMentorProfileUpdateTx(client, {
        ...scope,
        eventType: "mentor.challenge_attempt",
        reason: "mentor_challenge_answered",
        sourceReference: randomUUID(),
      });
      await client.query(
        "UPDATE mentor_profile_update_outbox SET available_at = TIMESTAMPTZ '2000-01-01T00:00:00Z' WHERE id = $1",
        [queued.outboxId],
      );
      const first = await claimMentorProfileUpdates(client, {
        workerId: "mentor-lease-a",
        limit: 1,
        leaseSeconds: 60,
      });
      assert.equal(first[0]?.outboxId, queued.outboxId);
      await client.query(
        `UPDATE mentor_profile_update_outbox
            SET lease_expires_at = NOW() - INTERVAL '1 second'
          WHERE id = $1`,
        [queued.outboxId],
      );

      assert.deepEqual(await recoverExpiredMentorProfileLeases(client, 10), {
        recovered: 1,
        terminal: 0,
      });
      const second = await claimMentorProfileUpdates(client, {
        workerId: "mentor-lease-b",
        limit: 1,
        leaseSeconds: 60,
      });
      assert.equal(second[0]?.outboxId, first[0]?.outboxId);
      assert.equal(second[0]?.attemptNumber, 2);

      const attempts = await client.query<{ status: string; attempt_number: number }>(
        `SELECT status, attempt_number
           FROM mentor_profile_update_attempts
          WHERE outbox_id = $1
          ORDER BY attempt_number`,
        [queued.outboxId],
      );
      assert.deepEqual(attempts.rows, [
        { status: "lease_recovered", attempt_number: 1 },
        { status: "claimed", attempt_number: 2 },
      ]);
    });
  },
);

test(
  "Mentor profile outbox participates in the producer transaction rollback",
  { skip: !databaseUrl },
  async () => {
    await withRolledBackTest(async (client) => {
      const scope = await seedScope(client, "mentor-rollback");
      await client.query("SAVEPOINT mentor_event_source");
      await enqueueMentorProfileUpdateTx(client, {
        ...scope,
        eventType: "academy.term_progress",
        reason: "authoritative_term_assessment",
        sourceReference: "assessment-rollback-0001",
      });
      await client.query("ROLLBACK TO SAVEPOINT mentor_event_source");

      assert.equal(
        await count(
          client,
          `SELECT COUNT(*)::text AS count
             FROM mentor_profile_update_outbox
            WHERE student_id = $1::uuid`,
          [scope.studentId],
        ),
        0,
      );
    });
  },
);
