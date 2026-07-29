import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import Decimal from "decimal.js";
import { Pool, type PoolClient } from "pg";
import {
  deriveOfficialJournalChallengeCycle,
  type OfficialJournalChallengeCycle,
} from "../../lib/community-journal-challenge-authority";
import {
  finalizeEndedOfficialJournalChallenges,
  loadLatestFinalizedOfficialJournalChallenge,
} from "../../lib/community-journal-challenge-finalization";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { createArenaExecutionStateV2, type ArenaClosedTradeV2 } from "../../lib/trading-arena-execution-v2";
import type { AvailableTenantPrincipalContext } from "../../lib/security/tenant-principal-context";

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
const WEEK_MS = 7 * 24 * 60 * 60 * 1_000;
let pool: Pool | null = null;

async function withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

function context(identity: Identity): AvailableTenantPrincipalContext {
  return {
    available: true,
    tenantId: identity.tenantId,
    workspaceId: identity.workspaceId,
    principalType: "student",
    principalId: identity.studentId,
    roles: ["student"],
    scopes: ["community:challenge:read"],
    bindingSource: "community_challenge_finalization_test",
    bindingStatus: "active",
    membershipId: null,
    requestId: `challenge-finalization-${randomUUID()}`,
    authEvidence: { strictRevocation: true, sessionPrincipal: true },
  };
}

type Identity = { tenantId: string; workspaceId: string; studentId: string };

async function seedIdentity(label: string): Promise<Identity> {
  const tenantId = `challenge-final-${label}-${randomUUID()}`;
  const workspaceId = `workspace-${randomUUID()}`;
  const studentId = randomUUID();
  const username = `f_${randomUUID().replaceAll("-", "").slice(0, 18)}`;
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
        [studentId, `Finalization ${label}`, username],
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
         VALUES ($1, $2, 'student', $3, 'community_challenge_finalization_test')`,
        [tenantId, workspaceId, studentId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
  return { tenantId, workspaceId, studentId };
}

async function previousCycle(): Promise<OfficialJournalChallengeCycle> {
  return withClient(async (client) => {
    const clock = await client.query<{ now: Date }>("SELECT NOW() AS now");
    const current = deriveOfficialJournalChallengeCycle(new Date(clock.rows[0].now));
    return deriveOfficialJournalChallengeCycle(
      new Date(new Date(current.startsAt).getTime() - WEEK_MS + 60_000),
    );
  });
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
    .div(quoteCommitted).toDecimalPlaces(8, Decimal.ROUND_DOWN);
  return {
    id: `final-trade-${index}-${randomUUID()}`,
    positionId: `final-position-${index}-${randomUUID()}`,
    asset: index % 2 === 0 ? "BTC" : "ETH",
    entryPrice: entryPrice.toFixed(10),
    exitPrice: exitPrice.toFixed(10),
    quantity: quantity.toFixed(18),
    quoteCommitted: quoteCommitted.toFixed(10),
    totalFee: totalFee.toFixed(10),
    realizedPnl: realizedPnl.toFixed(10),
    realizedPnlRate: realizedPnlRate.toFixed(8),
    openedAt: new Date(new Date(closedAt).getTime() - 60_000).toISOString(),
    closedAt,
    closureReason: "manual",
    mentorFlags: ["good-discipline"],
  };
}

async function seedAttempt(studentId: string, trades: ArenaClosedTradeV2[]): Promise<string> {
  return withClient(async (client) => {
    const account = await client.query<{ cycle_id: string }>(
      `INSERT INTO academy_trading_arena_accounts (student_id)
       VALUES ($1::uuid)
       ON CONFLICT (student_id)
       DO UPDATE SET updated_at = academy_trading_arena_accounts.updated_at
       RETURNING cycle_id::text`,
      [studentId],
    );
    const attempt = await client.query<{ id: string }>(
      `INSERT INTO academy_trading_arena_attempts
         (student_id, cycle_id, attempt_number, status, started_at)
       VALUES ($1::uuid, $2::uuid, 1, 'active', $3::timestamptz)
       RETURNING id::text`,
      [studentId, account.rows[0].cycle_id, trades[0].openedAt],
    );
    const state = createArenaExecutionStateV2("100000", trades[0].openedAt);
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
    state.updatedAt = trades.at(-1)?.closedAt ?? trades[0].closedAt;
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
  identity: Identity;
  attemptId: string;
  trade: ArenaClosedTradeV2;
  createdAt: string;
  corrupt?: boolean;
}): Promise<void> {
  await withClient((client) => client.query(
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
        $8::timestamptz, $9::jsonb, $10::timestamptz, $10::timestamptz)`,
    [
      input.identity.studentId,
      input.attemptId,
      input.trade.id,
      input.trade.asset,
      input.corrupt ? "999.0000000000" : input.trade.realizedPnl,
      input.trade.realizedPnlRate,
      input.trade.closureReason,
      input.trade.closedAt,
      JSON.stringify(input.trade.mentorFlags),
      input.createdAt,
    ],
  ));
}

async function seedEnrollment(identity: Identity, cycle: OfficialJournalChallengeCycle): Promise<string> {
  const startedAt = new Date(new Date(cycle.startsAt).getTime() + 60 * 60_000).toISOString();
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
        identity.tenantId,
        identity.workspaceId,
        identity.studentId,
        cycle.key,
        cycle.startsAt,
        cycle.endsAt,
        startedAt,
      ],
    );
    return result.rows[0].id;
  });
}

async function seedCandidate(input: {
  label: string;
  tradeCount: number;
  reflectedCount: number;
  lateReflection?: boolean;
  corrupt?: boolean;
}): Promise<{ identity: Identity; enrollmentId: string }> {
  const identity = await seedIdentity(input.label);
  const cycle = await previousCycle();
  const enrollmentId = await seedEnrollment(identity, cycle);
  const base = new Date(cycle.startsAt).getTime() + 2 * 60 * 60_000;
  const trades = Array.from({ length: input.tradeCount }, (_, index) =>
    trade(index + 1, new Date(base + index * 10 * 60_000).toISOString()),
  );
  const attemptId = await seedAttempt(identity.studentId, trades);
  for (let index = 0; index < input.reflectedCount; index += 1) {
    const selected = trades[index];
    await seedReflection({
      identity,
      attemptId,
      trade: selected,
      corrupt: input.corrupt && index === 0,
      createdAt: new Date(new Date(selected.closedAt).getTime() + 60_000).toISOString(),
    });
  }
  if (input.lateReflection && input.reflectedCount < trades.length) {
    const selected = trades[input.reflectedCount];
    await seedReflection({
      identity,
      attemptId,
      trade: selected,
      createdAt: new Date(new Date(cycle.endsAt).getTime() + 60_000).toISOString(),
    });
  }
  return { identity, enrollmentId };
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 12, allowExitOnIdle: true });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
});

after(async () => {
  await pool?.end();
  pool = null;
});

describe("Journal challenge post-cycle finalizer", () => {
  it("commits healthy terminal results while isolating corrupt evidence", {
    skip: !configured,
    timeout: 45_000,
  }, async () => {
    const completed = await seedCandidate({ label: "completed", tradeCount: 5, reflectedCount: 4 });
    const notCompleted = await seedCandidate({
      label: "not-completed",
      tradeCount: 4,
      reflectedCount: 3,
      lateReflection: true,
    });
    const corrupt = await seedCandidate({
      label: "corrupt",
      tradeCount: 1,
      reflectedCount: 1,
      corrupt: true,
    });

    const runId = randomUUID();
    const summary = await finalizeEndedOfficialJournalChallenges(20, runId);
    assert.equal(summary.available, true);
    if (!summary.available) return;
    assert.equal(summary.finalizedCompleted, 1);
    assert.equal(summary.finalizedNotCompleted, 1);
    assert.equal(summary.failures.length, 1);
    assert.equal(summary.failures[0].reason, "evidence_invalid");

    const rows = await withClient((client) => client.query<{
      id: string;
      status: string;
      eligible_closed_trade_count: number;
      valid_reflection_count: number;
      finalization_source: string | null;
      finalization_run_id: string | null;
    }>(
      `SELECT id::text, status, eligible_closed_trade_count,
              valid_reflection_count, finalization_source,
              finalization_run_id::text
         FROM academy_community_challenge_enrollments
        WHERE id = ANY($1::uuid[])
        ORDER BY id`,
      [[completed.enrollmentId, notCompleted.enrollmentId, corrupt.enrollmentId]],
    ));
    const byId = new Map(rows.rows.map((row) => [row.id, row]));
    assert.equal(byId.get(completed.enrollmentId)?.status, "completed");
    assert.equal(byId.get(completed.enrollmentId)?.eligible_closed_trade_count, 5);
    assert.equal(byId.get(completed.enrollmentId)?.valid_reflection_count, 4);
    assert.equal(byId.get(completed.enrollmentId)?.finalization_source, "worker");
    assert.equal(byId.get(completed.enrollmentId)?.finalization_run_id, runId);
    assert.equal(byId.get(notCompleted.enrollmentId)?.status, "not_completed");
    assert.equal(byId.get(notCompleted.enrollmentId)?.eligible_closed_trade_count, 4);
    assert.equal(byId.get(notCompleted.enrollmentId)?.valid_reflection_count, 3);
    assert.equal(byId.get(corrupt.enrollmentId)?.status, "active");

    const events = await withClient((client) => client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM academy_community_challenge_events
        WHERE enrollment_id = ANY($1::uuid[])
          AND event_type IN ('finalized_completed', 'finalized_not_completed')`,
      [[completed.enrollmentId, notCompleted.enrollmentId, corrupt.enrollmentId]],
    ));
    assert.equal(Number(events.rows[0].count), 2);

    const latestCompleted = await loadLatestFinalizedOfficialJournalChallenge(context(completed.identity));
    assert.equal(latestCompleted.available, true);
    if (latestCompleted.available) assert.equal(latestCompleted.result?.status, "completed");
    const latestNotCompleted = await loadLatestFinalizedOfficialJournalChallenge(context(notCompleted.identity));
    assert.equal(latestNotCompleted.available, true);
    if (latestNotCompleted.available) assert.equal(latestNotCompleted.result?.status, "not_completed");

    const forged = context({
      tenantId: notCompleted.identity.tenantId,
      workspaceId: notCompleted.identity.workspaceId,
      studentId: completed.identity.studentId,
    });
    const isolated = await loadLatestFinalizedOfficialJournalChallenge(forged);
    assert.deepEqual(isolated, { available: true, result: null });

    await assert.rejects(
      withClient((client) => client.query(
        `UPDATE academy_community_challenge_enrollments
            SET revision = revision + 1, valid_reflection_count = 5
          WHERE id = $1::uuid`,
        [completed.enrollmentId],
      )),
      /finalized community challenge enrollment is immutable/,
    );

    const rerun = await finalizeEndedOfficialJournalChallenges(20, randomUUID());
    assert.equal(rerun.available, true);
    if (rerun.available) {
      assert.equal(rerun.finalizedCompleted, 0);
      assert.equal(rerun.finalizedNotCompleted, 0);
      assert.equal(rerun.failures.length >= 1, true);
    }
  });

  it("prevents duplicate finalization across concurrent workers", {
    skip: !configured,
    timeout: 45_000,
  }, async () => {
    const first = await seedCandidate({ label: "concurrent-a", tradeCount: 3, reflectedCount: 3 });
    const second = await seedCandidate({ label: "concurrent-b", tradeCount: 3, reflectedCount: 3 });
    const [left, right] = await Promise.all([
      finalizeEndedOfficialJournalChallenges(50, randomUUID()),
      finalizeEndedOfficialJournalChallenges(50, randomUUID()),
    ]);
    assert.equal(left.available, true);
    assert.equal(right.available, true);
    if (!left.available || !right.available) return;
    assert.equal(left.finalizedCompleted + right.finalizedCompleted, 2);

    const terminal = await withClient((client) => client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM academy_community_challenge_enrollments
        WHERE id = ANY($1::uuid[]) AND status = 'completed'`,
      [[first.enrollmentId, second.enrollmentId]],
    ));
    assert.equal(Number(terminal.rows[0].count), 2);
    const events = await withClient((client) => client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM academy_community_challenge_events
        WHERE enrollment_id = ANY($1::uuid[])
          AND event_type = 'finalized_completed'`,
      [[first.enrollmentId, second.enrollmentId]],
    ));
    assert.equal(Number(events.rows[0].count), 2);
  });
});
