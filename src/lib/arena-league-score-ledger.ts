import { createHash, randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import type { PoolClient } from "pg";
import {
  ARENA_LEAGUE_SCORING_POLICY_VERSION,
  scoreArenaLeagueTrade,
  type ArenaLeagueTradeScoreInput,
} from "./arena-league-scoring-policy";
import type { ArenaClosedTradeV2, ArenaExecutionStateV2, ArenaOpenPositionV2 } from "./trading-arena-execution-v2";

type ArenaScoreOwner = { tenantId: string; workspaceId: string; studentId: string; attemptId: string };

function clampInteger(value: Decimal, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()));
}

export function deriveArenaTradeScoreInput(input: {
  trade: ArenaClosedTradeV2;
  position: ArenaOpenPositionV2;
  equityBeforeClose: string;
  tradeNumberForDay: number;
}): ArenaLeagueTradeScoreInput {
  const flags = input.trade.mentorFlags;
  const negativeCount = flags.filter((flag) =>
    flag === "no-stop-loss" || flag === "over-risk" || flag === "impulse-entry" ||
    flag === "revenge-trade" || flag === "fomo-entry",
  ).length;
  const equity = new Decimal(input.equityBeforeClose);
  const quote = new Decimal(input.trade.quoteCommitted);
  const riskBudgetBps = equity.gt(0) ? clampInteger(quote.div(equity).mul(10_000), 0, 10_000) : 10_000;
  const plannedRisk = input.position.stopLoss
    ? new Decimal(input.position.entryPrice).minus(input.position.stopLoss).abs().mul(input.position.quantity)
    : quote.mul("0.02");
  const outcomeRMultipleBps = plannedRisk.gt(0)
    ? clampInteger(new Decimal(input.trade.realizedPnl).div(plannedRisk).mul(10_000), -50_000, 50_000)
    : 0;
  return {
    tradeId: input.trade.id,
    instrumentKind: "spot",
    tradeNumberForDay: input.tradeNumberForDay,
    riskBudgetBps,
    ruleComplianceBps: Math.max(0, 10_000 - negativeCount * 1_500),
    outcomeRMultipleBps,
    hasPreTradePlan: input.position.preTradePlan.trim().length > 0,
    hasStopLoss: input.position.stopLoss !== null,
    journalCompleted: false,
    mentorFlags: flags,
  };
}

export async function persistNewArenaTradeScores(
  client: PoolClient,
  owner: ArenaScoreOwner,
  before: ArenaExecutionStateV2,
  after: ArenaExecutionStateV2,
): Promise<void> {
  const previousTradeIds = new Set(before.closedTrades.map(({ id }) => id));
  const positions = new Map(before.openPositions.map((position) => [position.id, position]));
  for (const trade of after.closedTrades.filter(({ id }) => !previousTradeIds.has(id))) {
    const position = positions.get(trade.positionId);
    if (!position) throw new Error("arena_league_source_position_missing");
    const count = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM academy_arena_trade_score_ledger
       WHERE tenant_id = $1 AND workspace_id = $2 AND student_id = $3::uuid
         AND score_day = ($4::timestamptz AT TIME ZONE 'UTC')::date`,
      [owner.tenantId, owner.workspaceId, owner.studentId, trade.closedAt],
    );
    const scoringInput = deriveArenaTradeScoreInput({
      trade,
      position,
      equityBeforeClose: before.equity,
      tradeNumberForDay: Number(count.rows[0]?.count ?? "0") + 1,
    });
    const score = scoreArenaLeagueTrade(scoringInput);
    const digest = createHash("sha256")
      .update(JSON.stringify({ owner, scoringInput, score }))
      .digest("hex");
    await client.query(
      `INSERT INTO academy_arena_trade_score_ledger
        (id, tenant_id, workspace_id, principal_id, student_id, attempt_id,
         closed_trade_id, policy_version, instrument_kind, scored_at,
         trade_number_for_day, total_points, participation_points, process_points,
         outcome_points, penalty_points, positive_multiplier_bps, penalty_multiplier_bps,
         scoring_input, scoring_reasons, source_digest)
       VALUES ($1::uuid, $2, $3, $4, $4::uuid, $5::uuid, $6, $7, $8, $9::timestamptz,
               $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19::jsonb, $20)
       ON CONFLICT (tenant_id, workspace_id, attempt_id, closed_trade_id, policy_version) DO NOTHING`,
      [randomUUID(), owner.tenantId, owner.workspaceId, owner.studentId, owner.attemptId,
        trade.id, ARENA_LEAGUE_SCORING_POLICY_VERSION, scoringInput.instrumentKind, trade.closedAt,
        scoringInput.tradeNumberForDay, score.totalPoints, score.participationPoints,
        score.processPoints, score.outcomePoints, score.penaltyPoints,
        score.positiveMultiplierBps, score.penaltyMultiplierBps,
        JSON.stringify(scoringInput), JSON.stringify(score.reasons), digest],
    );
  }
}
