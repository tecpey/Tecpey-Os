import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import Decimal from "decimal.js";
import { Pool, type PoolClient } from "pg";
import {
  deriveOfficialJournalChallengeCycle,
  loadOfficialJournalChallengeState,
  processOfficialJournalChallengeCommand,
} from "../../lib/community-journal-challenge-authority";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { createArenaExecutionStateV2, type ArenaClosedTradeV2 } from "../../lib/trading-arena-execution-v2";
import type { AvailableTenantPrincipalContext } from "../../lib/security/tenant-principal-context";

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

function context(input: {
  tenantId: string;
  workspaceId: string;
  studentId: string;
}): AvailableTenantPrincipalContext {
  return {
    available: true,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    principalType: "student",
    principalId: input.studentId,
    roles: ["student"],
    scopes: ["community:challenge:read", "community:challenge:write"],
    bindingSource: "community_challenge_test",
    bindingStatus: "active",
    membershipId: null,
    requestId: `challenge-test-${randomUUID()}`,
    authEvidence: {
      strictRevocation: true,
      sessionPrincipal: true,
    },
  };
}

async function databaseNow(): Promise<Date> {
  return withClient(async (client) => {
    const result = await client.query<{ now: Date }>("SELECT NOW() AS now");
    return new Date(result.rows[0].now);
  });
}

async function seedTenantStudent(label: string, consent = true): Promise<{
  tenantId: string;
  workspaceId: string;
  studentId: string;
}> {
  const tenantId = `challenge-${label}-${randomUUID()}`;
  const workspaceId = `workspace-${randomUUID()}`;
  const studentId = randomUUID();
  const username = `c_${randomUUID().replaceAll("-", "").slice(0, 18)}`;
  await withClient(async (client) => {
    await client.query("BEGIN");
    try {
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
        `INSERT INTO academy_students (id, locale, display_name, username)
         VALUES ($1::uuid, 'fa', $2, $3)`,
        [studentId, `Challenge ${label}`, username],
      );
      await client.query(
        "DELETE FROM academy_public_profiles WHERE student_id = $1::uuid",
        [studentId],
      );
      await client.query(
        `DELETE FROM platform_principal_bindings
          WHERE principal_type = 'student' AND principal_id = $1`,
        [studentId],
      );
      await client.query(
        `INSERT INTO platform_principal_bindings
           (tenant_id, workspace_id, principal_type, principal_id, source)
         VALUES ($1, $2, 'student', $3, 'community_challenge_test')`,
        [tenantId, workspaceId, studentId],
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
        [studentId, tenantId, workspaceId, consent],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
  return { tenantId, workspaceId, studentId };
}

function trade(index: number, closedAt: string): ArenaClosedTradeV2 {
  const entryPrice = new Decimal("100");
  const exitPrice = new Decimal("110");
  const quoteCommitted = new Decimal("100");
  const openingFee = quoteCommitted.mul("0.001").toDecimalPlaces(10, Decimal.ROUND_DOWN);
  const quantity = quoteCommitted.minus(openingFee).div(entryPrice)
    .toDecimalPlaces(18, Decimal.ROUND_DOWN);
  const grossProceeds = quantity.mul(exitPrice);
  const closingFee = grossProceeds.mul("0.001");
  const realizedPnl = grossProceeds.minus(closingFee).minus(quoteCommitted)
    .toDecimalPlaces(10, Decimal.ROUND_DOWN);
  const totalFee = openingFee.plus(closingFee).toDecimalPlaces(10, Decimal.ROUND_DOWN);
  const realizedPnlRate = grossProceeds.minus(closingFee).minus(quoteCommitted)
    .div(quoteCommitted)
    .toDecimalPlaces(8, Decimal.ROUND_DOWN);
  const openedAt = new Date(new Date(closedAt).getTime() - 60_000).toISOString();
  return {
    id: `closed-${index}-${randomUUID()}`,
    positionId: `position-${index}-${randomUUID()}`,
    asset: index % 2 === 0 ? "BTC" : "ETH",
    entryPrice: entryPrice.toFixed(10),
    exitPrice: exitPrice.toFixed(10),
    quantity: quantity.toFixed(18),
    quoteCommitted: quoteCommitted.toFixed(10),
    totalFee: totalFee.toFixed(10),
    realizedPnl: realizedPnl.toFixed(10),
    realizedPnlRate: realizedPnlRate.toFixed(8),
    openedAt,
    closedAt,
    closureReason: "manual",
    mentorFlags: ["good-discipline"],
  };
}

async function seedAttempt(
  studentId: string,
  trades: ArenaClosedTradeV2[],
): Promise<string> {
  return withClient(async (client) => {
    const account = await client.query<{ cycle_id: string }>(
      `INSERT INTO academy_trading_arena_accounts (student_id)
       VALUES ($1::uuid)
       ON CONFLICT (student_id)
       DO UPDATE SET updated_at = academy_trading_arena_accounts.updated_at
       RETURNING cycle_id::text`,
      [studentId],
    );
    let attempt = await client.query<{ id: string }>(
      `SELECT id::text FROM academy_trading_arena_attempts
        WHERE student_id = $1::uuid LIMIT 1`,
      [studentId],
    );
    if (!attempt.rows[0]) {
      attempt = await client.query<{ id: string }>(
        `INSERT INTO academy_trading_arena_attempts
           (student_id, cycle_id, attempt_number, status, started_at)
         VALUES ($1::uuid, $2::uuid, 1, 'active', NOW())
         RETURNING id::text`,
        [studentId, account.rows[0].cycle_id],
      );
    }
    const createdAt = trades.length > 0
      ? new Date(Math.min(...trades.map((entry) => new Date(entry.openedAt).getTime()))).toISOString()
      : new Date().toISOString();
    const updatedAt = trades.length > 0
      ? new Date(Math.max(...trades.map((entry) => new Date(entry.closedAt).getTime()))).toISOString()
      : createdAt;
    const state = createArenaExecutionStateV2("100000", createdAt);
    state.closedTrades = trades;
    state.lastTradeAt = trades.at(-1)?.closedAt ?? null;
    state.totalRealizedPnl = trades.reduce(
      (sum, entry) => sum.plus(entry.realizedPnl),
      new Decimal(0),
    ).toDecimalPlaces(10, Decimal.ROUND_DOWN).toFixed(10);
    state.totalFeesPaid = trades.reduce(
      (sum, entry) => sum.plus(entry.totalFee),
      new Decimal(0),
    ).toDecimalPlaces(10, Decimal.ROUND_DOWN).toFixed(10);
    state.updatedAt = updatedAt;
    await client.query(
      `UPDATE academy_trading_arena_attempts
          SET execution_state = $2::jsonb, updated_at = NOW()
        WHERE id = $1::uuid`,
      [attempt.rows[0].id, JSON.stringify(state)],
    );
    return attempt.rows[0].id;
  });
}

async function seedReflection(input: {
  studentId: string;
  attemptId: string;
  trade: ArenaClosedTradeV2;
  corruptPnl?: boolean;
}): Promise<void> {
  await withClient(async (client) => {
    await client.query(
      `INSERT INTO academy_trading_arena_reflections
         (id, student_id, attempt_id, closed_trade_id, revision,
          decision_review, learned_lesson, emotional_review, mistake_tags,
          next_action_commitment, evidence_asset, evidence_realized_pnl,
          evidence_realized_pnl_rate, evidence_closure_reason,
          evidence_closed_at, evidence_mentor_flags, created_at, updated_at)
       VALUES
         (gen_random_uuid(), $1::uuid, $2::uuid, $3, 1,
          'review', 'lesson', 'calm', '["none"]'::jsonb,
          'follow plan', $4, $5::numeric, $6::numeric, $7,
          $8::timestamptz, $9::jsonb, NOW(), NOW())`,
      [
        input.studentId,
        input.attemptId,
        input.trade.id,
        input.trade.asset,
        input.corruptPnl ? "999.0000000000" : input.trade.realizedPnl,
        input.trade.realizedPnlRate,
        input.trade.closureReason,
        input.trade.closedAt,
        JSON.stringify(input.trade.mentorFlags),
      ],
    );
  });
}

async function seedEnrollment(input: {
  identity: { tenantId: string; workspaceId: string; studentId: string };
  startedAt: string;
  cycle: ReturnType<typeof deriveOfficialJournalChallengeCycle>;
}): Promise<string> {
  return withClient(async (client) => {
    const result = await client.query<{ id: string }>(
      `INSERT INTO academy_community_challenge_enrollments
         (id, tenant_id, workspace_id, principal_type, student_id,
          challenge_id, challenge_version, cycle_key,
          cycle_starts_at, cycle_ends_at, started_at)
       VALUES
         (gen_random_uuid(), $1, $2, 'student', $3::uuid,
          'journal-reflection-week', 'journal-reflection-v1', $4,
          $5::timestamptz, $6::timestamptz, $7::timestamptz)
       RETURNING id::text`,
      [
        input.identity.tenantId,
        input.identity.workspaceId,
        input.identity.studentId,
        input.cycle.key,
        input.cycle.startsAt,
        input.cycle.endsAt,
        input.startedAt,
      ],
    );
    return result.rows[0].id;
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

describe("Official journal challenge PostgreSQL authority", () => {
  it("uses server ISO weeks across year boundaries", () => {
    assert.deepEqual(
      deriveOfficialJournalChallengeCycle(new Date("2021-01-01T12:00:00.000Z")),
      {
        key: "2020-W53",
        startsAt: "2020-12-28T00:00:00.000Z",
        endsAt: "2021-01-04T00:00:00.000Z",
      },
    );
  });

  it("does not count trades that closed before the server join timestamp and replays exactly", {
    skip: !configured,
    timeout: 30_000,
  }, async () => {
    const identity = await seedTenantStudent("no-retroactive");
    const ctx = context(identity);
    const now = await databaseNow();
    const cycle = deriveOfficialJournalChallengeCycle(now);
    const historical = trade(1, new Date(now.getTime() - 5 * 60_000).toISOString());
    await seedAttempt(identity.studentId, [historical]);

    const key = `challenge-join-${randomUUID()}`;
    const joined = await processOfficialJournalChallengeCommand(ctx, {
      action: "join",
      cycleKey: cycle.key,
      idempotencyKey: key,
    });
    assert.equal(joined.ok, true);
    if (!joined.ok) return;
    assert.equal(joined.replayed, false);
    assert.equal(joined.state.progress.eligibleClosedTrades, 0);

    const replay = await processOfficialJournalChallengeCommand(ctx, {
      action: "join",
      cycleKey: cycle.key,
      idempotencyKey: key,
    });
    assert.equal(replay.ok, true);
    if (!replay.ok) return;
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.state, joined.state);
  });

  it("keeps 75 percent active and commits five-with-four at 80 percent immutably", {
    skip: !configured,
    timeout: 30_000,
  }, async () => {
    const identity = await seedTenantStudent("threshold");
    const ctx = context(identity);
    const now = await databaseNow();
    const cycle = deriveOfficialJournalChallengeCycle(now);
    const startedMs = Math.max(
      new Date(cycle.startsAt).getTime() + 1_000,
      now.getTime() - 60 * 60_000,
    );
    const startedAt = new Date(startedMs).toISOString();
    const enrollmentId = await seedEnrollment({ identity, startedAt, cycle });
    const firstFour = [1, 2, 3, 4].map((index) =>
      trade(index, new Date(startedMs + index * 60_000).toISOString()),
    );
    const attemptId = await seedAttempt(identity.studentId, firstFour);
    for (const selected of firstFour.slice(0, 3)) {
      await seedReflection({ studentId: identity.studentId, attemptId, trade: selected });
    }

    const firstEvaluation = await processOfficialJournalChallengeCommand(ctx, {
      action: "evaluate",
      cycleKey: cycle.key,
      idempotencyKey: `challenge-evaluate-${randomUUID()}`,
    });
    assert.equal(firstEvaluation.ok, true);
    if (!firstEvaluation.ok) return;
    assert.equal(firstEvaluation.state.status, "active");
    assert.equal(firstEvaluation.state.progress.eligibleClosedTrades, 4);
    assert.equal(firstEvaluation.state.progress.validReflections, 3);
    assert.equal(firstEvaluation.state.progress.coverageRate, 0.75);
    assert.equal(firstEvaluation.state.progress.eligibleToComplete, false);

    const fifth = trade(5, new Date(startedMs + 5 * 60_000).toISOString());
    await seedAttempt(identity.studentId, [...firstFour, fifth]);
    await seedReflection({ studentId: identity.studentId, attemptId, trade: firstFour[3] });

    const completed = await processOfficialJournalChallengeCommand(ctx, {
      action: "evaluate",
      cycleKey: cycle.key,
      idempotencyKey: `challenge-evaluate-${randomUUID()}`,
    });
    assert.equal(completed.ok, true);
    if (!completed.ok) return;
    assert.equal(completed.state.status, "completed");
    assert.equal(completed.state.progress.eligibleClosedTrades, 5);
    assert.equal(completed.state.progress.validReflections, 4);
    assert.equal(completed.state.progress.coverageRate, 0.8);
    assert.equal(completed.state.rewards.xp, 0);
    assert.equal(completed.state.rewards.badge, null);

    await assert.rejects(
      withClient((client) => client.query(
        `UPDATE academy_community_challenge_enrollments
            SET valid_reflection_count = 5, revision = revision + 1
          WHERE id = $1::uuid`,
        [enrollmentId],
      )),
      /completed community challenge enrollment is immutable/,
    );
    await assert.rejects(
      withClient((client) => client.query(
        `DELETE FROM academy_community_challenge_events
          WHERE enrollment_id = $1::uuid`,
        [enrollmentId],
      )),
      /community challenge events are append-only/,
    );
  });

  it("fails closed when reflection evidence does not match the owned closed trade", {
    skip: !configured,
    timeout: 30_000,
  }, async () => {
    const identity = await seedTenantStudent("corrupt-evidence");
    const ctx = context(identity);
    const now = await databaseNow();
    const cycle = deriveOfficialJournalChallengeCycle(now);
    const startedMs = Math.max(
      new Date(cycle.startsAt).getTime() + 1_000,
      now.getTime() - 60 * 60_000,
    );
    await seedEnrollment({ identity, startedAt: new Date(startedMs).toISOString(), cycle });
    const selected = trade(1, new Date(startedMs + 60_000).toISOString());
    const attemptId = await seedAttempt(identity.studentId, [selected]);
    await seedReflection({
      studentId: identity.studentId,
      attemptId,
      trade: selected,
      corruptPnl: true,
    });

    const loaded = await loadOfficialJournalChallengeState(ctx);
    assert.deepEqual(loaded, { available: false, state: null });
    const evaluated = await processOfficialJournalChallengeCommand(ctx, {
      action: "evaluate",
      cycleKey: cycle.key,
      idempotencyKey: `challenge-evaluate-${randomUUID()}`,
    });
    assert.deepEqual(evaluated, {
      ok: false,
      reason: "challenge_authority_unavailable",
    });
  });

  it("does not resolve another tenant's enrollment through a forged tenant context", {
    skip: !configured,
    timeout: 30_000,
  }, async () => {
    const owner = await seedTenantStudent("tenant-owner");
    const other = await seedTenantStudent("tenant-other");
    const now = await databaseNow();
    const cycle = deriveOfficialJournalChallengeCycle(now);
    const startedAt = new Date(Math.max(
      new Date(cycle.startsAt).getTime() + 1_000,
      now.getTime() - 60_000,
    )).toISOString();
    await seedEnrollment({ identity: owner, startedAt, cycle });

    const forged = context({
      tenantId: other.tenantId,
      workspaceId: other.workspaceId,
      studentId: owner.studentId,
    });
    const loaded = await loadOfficialJournalChallengeState(forged);
    assert.equal(loaded.available, true);
    if (!loaded.available) return;
    assert.equal(loaded.state.status, "not_joined");
    assert.equal(loaded.state.consentEnabled, false);
    assert.equal(loaded.state.enrollmentId, null);
  });

  it("returns an explicit idempotency conflict for a mismatched stored request hash", {
    skip: !configured,
    timeout: 30_000,
  }, async () => {
    const identity = await seedTenantStudent("idempotency-conflict");
    const ctx = context(identity);
    const cycle = deriveOfficialJournalChallengeCycle(await databaseNow());
    const key = `challenge-conflict-${randomUUID()}`;
    await withClient((client) => client.query(
      `INSERT INTO api_command_receipts
         (tenant_id, principal_type, principal_id, operation,
          idempotency_key, request_hash, status)
       VALUES ($1, 'student', $2, 'community.challenge.journal-reflection-v1.join',
               $3, $4, 'processing')`,
      [identity.tenantId, identity.studentId, key, "a".repeat(64)],
    ));
    const result = await processOfficialJournalChallengeCommand(ctx, {
      action: "join",
      cycleKey: cycle.key,
      idempotencyKey: key,
    });
    assert.deepEqual(result, { ok: false, reason: "idempotency_conflict" });
  });
});
