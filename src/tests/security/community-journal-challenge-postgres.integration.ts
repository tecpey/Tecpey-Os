import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import {
  claimJournalChallenge,
  JOURNAL_REFLECTION_CHALLENGE_ID,
  loadJournalChallengeStatus,
  type JournalChallengeClaimAudit,
} from "../../lib/community-journal-challenge-authority";
import { getChallengeCycle } from "../../lib/community-challenges";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { hashSensitiveAuditRequest } from "../../lib/security/sensitive-mutation-audit";
import type { AvailableTenantPrincipalContext } from "../../lib/security/tenant-principal-context";

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
const ACTIVE_NOW = new Date("2026-07-21T12:00:00.000Z");
const INACTIVE_NOW = new Date("2026-01-02T12:00:00.000Z");
let pool: Pool | null = null;
const tenants = new Set<string>();
const students = new Set<string>();

async function withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

function context(input: {
  tenantId: string;
  workspaceId: string;
  studentId: string;
  scope: "community:challenge:read" | "community:challenge:write";
}): AvailableTenantPrincipalContext {
  return {
    available: true,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    principalType: "student",
    principalId: input.studentId,
    roles: ["student"],
    scopes: [input.scope],
    bindingSource: "community_challenge_test",
    bindingStatus: "active",
    membershipId: null,
    requestId: `request-${randomUUID()}`,
    authEvidence: {
      strictRevocation: true,
      sessionPrincipal: true,
    },
  };
}

async function seedTenant(label: string): Promise<{
  tenantId: string;
  workspaceId: string;
}> {
  const tenantId = `challenge-${label}-${randomUUID()}`;
  const workspaceId = `workspace-${randomUUID()}`;
  tenants.add(tenantId);
  await withClient(async (client) => {
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
  });
  return { tenantId, workspaceId };
}

async function seedStudent(input: {
  tenantId: string;
  workspaceId: string;
  label: string;
  consent: boolean;
}): Promise<{ studentId: string; attemptId: string }> {
  const studentId = randomUUID();
  const username = `c_${randomUUID().replaceAll("-", "").slice(0, 18)}`;
  students.add(studentId);
  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO academy_students (id, locale, display_name, username)
         VALUES ($1::uuid, 'fa', $2, $3)`,
        [studentId, `Challenge ${input.label}`, username],
      );
      await client.query("DELETE FROM academy_public_profiles WHERE student_id = $1::uuid", [studentId]);
      await client.query(
        `DELETE FROM platform_principal_bindings
          WHERE principal_type = 'student'
            AND principal_id = $1`,
        [studentId],
      );
      await client.query(
        `INSERT INTO platform_principal_bindings
           (tenant_id, workspace_id, principal_type, principal_id, source)
         VALUES ($1, $2, 'student', $3, 'community_challenge_test')`,
        [input.tenantId, input.workspaceId, studentId],
      );
      await client.query(
        `INSERT INTO academy_public_profiles
           (student_id, tenant_id, workspace_id, principal_type,
            public_profile_id, visibility, leaderboard_visible,
            journal_sharing_enabled, instructor_review_consent,
            challenge_participation, study_group_discovery,
            revision, consent_version, consented_at, created_at, updated_at)
         VALUES
           ($1::uuid, $2, $3, 'student', gen_random_uuid(), 'private', FALSE,
            FALSE, FALSE, $4, FALSE, 1,
            'community-profile-consent-v1', NOW(), NOW(), NOW())`,
        [studentId, input.tenantId, input.workspaceId, input.consent],
      );
      const account = await client.query<{ cycle_id: string }>(
        `INSERT INTO academy_trading_arena_accounts (student_id)
         VALUES ($1::uuid)
         RETURNING cycle_id::text`,
        [studentId],
      );
      const attempt = await client.query<{ id: string }>(
        `INSERT INTO academy_trading_arena_attempts
           (student_id, cycle_id, attempt_number, status, started_at)
         VALUES ($1::uuid, $2::uuid, 1, 'active', NOW())
         RETURNING id::text`,
        [studentId, account.rows[0].cycle_id],
      );
      await client.query("COMMIT");
      return { studentId, attemptId: attempt.rows[0].id };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function seedClosedTrade(input: {
  studentId: string;
  attemptId: string;
  revision: number;
  kind: "manual" | "refresh" | "limit-fill";
  closedAt: string;
  reflected: boolean;
}): Promise<string> {
  const tradeId = `trade-${randomUUID()}`;
  await withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const eventType = input.kind === "manual"
        ? "arena.position_closed"
        : input.kind === "refresh"
          ? "arena.market_refreshed"
          : "arena.limit_order_filled";
      const payload = input.kind === "manual"
        ? { trade: { id: tradeId, closedAt: input.closedAt } }
        : input.kind === "refresh"
          ? { closedTradeIds: [tradeId] }
          : { autoClosedTradeIds: [tradeId] };
      await client.query(
        `INSERT INTO academy_trading_arena_execution_events
           (attempt_id, student_id, revision, event_type, payload, created_at)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb, $6::timestamptz)`,
        [
          input.attemptId,
          input.studentId,
          input.revision,
          eventType,
          JSON.stringify(payload),
          input.closedAt,
        ],
      );
      if (input.reflected) {
        await client.query(
          `INSERT INTO academy_trading_arena_reflections
             (student_id, attempt_id, closed_trade_id, revision,
              decision_review, learned_lesson, emotional_review, mistake_tags,
              next_action_commitment, evidence_asset, evidence_realized_pnl,
              evidence_realized_pnl_rate, evidence_closure_reason,
              evidence_closed_at, evidence_mentor_flags)
           VALUES
             ($1::uuid, $2::uuid, $3, 1,
              'تصمیم مرور شد', 'درس معتبر ثبت شد', 'احساس مرور شد', '["none"]'::jsonb,
              'برنامه را رعایت می‌کنم', 'BTC', 10.0000000000,
              0.01000000, 'manual', $4::timestamptz, '["good-discipline"]'::jsonb)`,
          [input.studentId, input.attemptId, tradeId, input.closedAt],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
  return tradeId;
}

function audit(input: {
  tenantId: string;
  workspaceId: string;
  studentId: string;
  correlationId: string;
  challengeId: string;
  weekKey: string;
}): JournalChallengeClaimAudit {
  return {
    tenantId: input.tenantId,
    actorType: "student",
    actorId: input.studentId,
    correlationId: input.correlationId,
    requestHash: hashSensitiveAuditRequest({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      action: "community.challenge.reward.claim",
      principalId: input.studentId,
      challengeId: input.challengeId,
      weekKey: input.weekKey,
    }),
  };
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 8, allowExitOnIdle: true });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
});

after(async () => {
  if (pool) {
    await withClient(async (client) => {
      for (const studentId of students) {
        await client.query("DELETE FROM academy_students WHERE id = $1::uuid", [studentId]);
      }
      for (const tenantId of tenants) {
        await client.query("DELETE FROM platform_tenants WHERE id = $1", [tenantId]);
      }
    });
  }
  await pool?.end();
  pool = null;
});

describe("Community journal-reflection challenge PostgreSQL authority", () => {
  it("requires current consent and counts manual plus automatic close evidence", {
    skip: !configured,
    timeout: 30_000,
  }, async () => {
    const tenant = await seedTenant("evidence");
    const student = await seedStudent({ ...tenant, label: "evidence", consent: false });
    await seedClosedTrade({ ...student, revision: 1, kind: "manual", closedAt: "2026-07-19T10:00:00Z", reflected: true });
    await seedClosedTrade({ ...student, revision: 2, kind: "refresh", closedAt: "2026-07-19T11:00:00Z", reflected: true });
    await seedClosedTrade({ ...student, revision: 3, kind: "limit-fill", closedAt: "2026-07-19T12:00:00Z", reflected: false });

    const readContext = context({ ...tenant, studentId: student.studentId, scope: "community:challenge:read" });
    const off = await loadJournalChallengeStatus({ context: readContext, now: ACTIVE_NOW });
    assert.equal(off.available, true);
    if (!off.available) return;
    assert.equal(off.status.active, true);
    assert.equal(off.status.consentEnabled, false);
    assert.equal(off.status.closedTradeCount, 3);
    assert.equal(off.status.reflectedTradeCount, 2);
    assert.equal(off.status.score, 67);
    assert.equal(off.status.eligible, false);

    await withClient((client) =>
      client.query(
        `UPDATE academy_public_profiles
            SET challenge_participation = TRUE,
                revision = revision + 1,
                consented_at = NOW(),
                updated_at = NOW()
          WHERE student_id = $1::uuid`,
        [student.studentId],
      ),
    );
    const twoOfThree = await loadJournalChallengeStatus({ context: readContext, now: ACTIVE_NOW });
    assert.equal(twoOfThree.available, true);
    assert.equal(twoOfThree.status?.consentEnabled, true);
    assert.equal(twoOfThree.status?.eligible, false);

    await withClient((client) =>
      client.query(
        `INSERT INTO academy_trading_arena_reflections
           (student_id, attempt_id, closed_trade_id, revision,
            decision_review, learned_lesson, emotional_review, mistake_tags,
            next_action_commitment, evidence_asset, evidence_realized_pnl,
            evidence_realized_pnl_rate, evidence_closure_reason,
            evidence_closed_at, evidence_mentor_flags)
         SELECT event.student_id, event.attempt_id,
                event.payload->'autoClosedTradeIds'->>0, 1,
                'تصمیم مرور شد', 'درس سوم', 'احساس مرور شد', '["none"]'::jsonb,
                NULL, 'ETH', 5.0000000000, 0.00500000, 'take-profit',
                event.created_at, '["target-hit"]'::jsonb
           FROM academy_trading_arena_execution_events event
          WHERE event.student_id = $1::uuid
            AND event.event_type = 'arena.limit_order_filled'
          LIMIT 1`,
        [student.studentId],
      ),
    );
    const threeOfThree = await loadJournalChallengeStatus({ context: readContext, now: ACTIVE_NOW });
    assert.equal(threeOfThree.available, true);
    assert.equal(threeOfThree.status?.closedTradeCount, 3);
    assert.equal(threeOfThree.status?.reflectedTradeCount, 3);
    assert.equal(threeOfThree.status?.score, 100);
    assert.equal(threeOfThree.status?.eligible, true);
  });

  it("keeps tenant/principal evidence isolated and inactive cycles fail closed", {
    skip: !configured,
    timeout: 30_000,
  }, async () => {
    const tenantA = await seedTenant("tenant-a");
    const tenantB = await seedTenant("tenant-b");
    const studentA = await seedStudent({ ...tenantA, label: "a", consent: true });
    const studentB = await seedStudent({ ...tenantB, label: "b", consent: true });
    for (let index = 0; index < 3; index += 1) {
      await seedClosedTrade({
        ...studentB,
        revision: index + 1,
        kind: index === 0 ? "manual" : "refresh",
        closedAt: `2026-07-19T1${index}:00:00Z`,
        reflected: true,
      });
    }
    const statusA = await loadJournalChallengeStatus({
      context: context({ ...tenantA, studentId: studentA.studentId, scope: "community:challenge:read" }),
      now: ACTIVE_NOW,
    });
    assert.equal(statusA.available, true);
    assert.equal(statusA.status?.closedTradeCount, 0);
    assert.equal(statusA.status?.eligible, false);

    const inactive = await loadJournalChallengeStatus({
      context: context({ ...tenantB, studentId: studentB.studentId, scope: "community:challenge:read" }),
      now: INACTIVE_NOW,
    });
    assert.equal(inactive.available, true);
    assert.equal(inactive.status?.active, false);
    assert.equal(inactive.status?.eligible, false);
  });

  it("claims one reward, event and audit atomically with replay and conflict semantics", {
    skip: !configured,
    timeout: 30_000,
  }, async () => {
    const tenant = await seedTenant("claim");
    const student = await seedStudent({ ...tenant, label: "claim", consent: true });
    for (let index = 0; index < 3; index += 1) {
      await seedClosedTrade({
        ...student,
        revision: index + 1,
        kind: index === 0 ? "manual" : index === 1 ? "refresh" : "limit-fill",
        closedAt: `2026-07-19T1${index}:30:00Z`,
        reflected: true,
      });
    }
    const cycle = getChallengeCycle(ACTIVE_NOW);
    assert.equal(cycle.challenge.id, JOURNAL_REFLECTION_CHALLENGE_ID);
    const writeContext = context({ ...tenant, studentId: student.studentId, scope: "community:challenge:write" });
    const correlationId = `challenge-${randomUUID()}`;
    const first = await claimJournalChallenge({
      context: writeContext,
      challengeId: JOURNAL_REFLECTION_CHALLENGE_ID,
      weekKey: cycle.weekKey,
      idempotencyKey: correlationId,
      audit: audit({
        ...tenant,
        studentId: student.studentId,
        correlationId,
        challengeId: JOURNAL_REFLECTION_CHALLENGE_ID,
        weekKey: cycle.weekKey,
      }),
      now: ACTIVE_NOW,
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.changed, true);
    assert.equal(first.replayed, false);
    assert.equal(first.status.completed, true);
    assert.equal(first.status.reward.xp, 200);
    assert.equal(first.progressRevision >= 1, true);
    assert.equal(Number(first.progress.xp) >= 200, true);
    assert.equal(
      Array.isArray(first.progress.earnedBadges) && first.progress.earnedBadges.includes("journal-master"),
      true,
    );

    const replay = await claimJournalChallenge({
      context: writeContext,
      challengeId: JOURNAL_REFLECTION_CHALLENGE_ID,
      weekKey: cycle.weekKey,
      idempotencyKey: correlationId,
      audit: audit({
        ...tenant,
        studentId: student.studentId,
        correlationId,
        challengeId: JOURNAL_REFLECTION_CHALLENGE_ID,
        weekKey: cycle.weekKey,
      }),
      now: ACTIVE_NOW,
    });
    assert.equal(replay.ok, true);
    if (replay.ok) {
      assert.equal(replay.changed, false);
      assert.equal(replay.replayed, true);
    }

    const conflict = await claimJournalChallenge({
      context: writeContext,
      challengeId: JOURNAL_REFLECTION_CHALLENGE_ID,
      weekKey: "2026-cycle-999",
      idempotencyKey: correlationId,
      audit: audit({
        ...tenant,
        studentId: student.studentId,
        correlationId,
        challengeId: JOURNAL_REFLECTION_CHALLENGE_ID,
        weekKey: "2026-cycle-999",
      }),
      now: ACTIVE_NOW,
    });
    assert.deepEqual(conflict, { ok: false, reason: "idempotency_conflict", status: null });

    const counts = await withClient(async (client) => {
      const reward = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM academy_reward_ledger
          WHERE student_id = $1::uuid
            AND reward_key = $2`,
        [student.studentId, `challenge:journal-reflection:${cycle.weekKey}`],
      );
      const event = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM academy_student_events
          WHERE student_id = $1::uuid
            AND event_type = 'community_challenge_completed'`,
        [student.studentId],
      );
      const evidence = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM sensitive_mutation_audit_events
          WHERE tenant_id = $1
            AND action = 'community.challenge.reward.claim'`,
        [tenant.tenantId],
      );
      const command = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM academy_learning_commands
          WHERE student_id = $1::uuid
            AND command_type = $2`,
        [student.studentId, `community_challenge:journal-reflection:${cycle.weekKey}`],
      );
      return {
        reward: reward.rows[0].count,
        event: event.rows[0].count,
        audit: evidence.rows[0].count,
        command: command.rows[0].count,
      };
    });
    assert.deepEqual(counts.value, { reward: 1, event: 1, audit: 1, command: 1 });
  });

  it("serializes concurrent claim identities into one committed reward", {
    skip: !configured,
    timeout: 30_000,
  }, async () => {
    const tenant = await seedTenant("concurrent");
    const student = await seedStudent({ ...tenant, label: "concurrent", consent: true });
    for (let index = 0; index < 3; index += 1) {
      await seedClosedTrade({
        ...student,
        revision: index + 1,
        kind: "manual",
        closedAt: `2026-07-19T0${index + 1}:00:00Z`,
        reflected: true,
      });
    }
    const cycle = getChallengeCycle(ACTIVE_NOW);
    const writeContext = context({ ...tenant, studentId: student.studentId, scope: "community:challenge:write" });
    const keys = [`challenge-${randomUUID()}`, `challenge-${randomUUID()}`];
    const results = await Promise.all(keys.map((key) =>
      claimJournalChallenge({
        context: writeContext,
        challengeId: JOURNAL_REFLECTION_CHALLENGE_ID,
        weekKey: cycle.weekKey,
        idempotencyKey: key,
        audit: audit({
          ...tenant,
          studentId: student.studentId,
          correlationId: key,
          challengeId: JOURNAL_REFLECTION_CHALLENGE_ID,
          weekKey: cycle.weekKey,
        }),
        now: ACTIVE_NOW,
      }),
    ));
    assert.equal(results.every((result) => result.ok), true);
    assert.equal(results.filter((result) => result.ok && result.changed).length, 1);

    const rewardCount = await withClient((client) =>
      client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM academy_reward_ledger
          WHERE student_id = $1::uuid
            AND reward_key = $2`,
        [student.studentId, `challenge:journal-reflection:${cycle.weekKey}`],
      ),
    );
    assert.equal(rewardCount.value.rows[0].count, 1);
  });
});
