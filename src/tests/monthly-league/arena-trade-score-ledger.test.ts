import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PoolClient } from "pg";
import {
  deriveArenaTradeScoreInput,
  resolveArenaScoreSeasonId,
} from "@/lib/arena-league-score-ledger";
import type { ArenaClosedTradeV2, ArenaOpenPositionV2 } from "@/lib/trading-arena-execution-v2";

const position: ArenaOpenPositionV2 = {
  id: "position-12345678",
  asset: "BTC",
  entryPrice: "100",
  quantity: "10",
  quoteCommitted: "1000",
  openingFee: "1",
  stopLoss: "98",
  takeProfit: "104",
  openedAt: "2026-08-15T10:00:00.000Z",
  preTradePlan: "Risk one unit and exit only at the planned boundary.",
  emotionalState: "calm",
  mentorFlags: ["good-discipline", "proper-sizing"],
};

const trade: ArenaClosedTradeV2 = {
  id: "trade-12345678",
  positionId: position.id,
  asset: "BTC",
  entryPrice: "100",
  exitPrice: "104",
  quantity: "10",
  quoteCommitted: "1000",
  totalFee: "2",
  realizedPnl: "38",
  realizedPnlRate: "0.038",
  openedAt: position.openedAt,
  closedAt: "2026-08-15T11:00:00.000Z",
  closureReason: "take-profit",
  mentorFlags: ["good-discipline", "proper-sizing", "target-hit"],
};

const owner = {
  tenantId: "tenant-a",
  workspaceId: "workspace-a",
  studentId: "11111111-1111-4111-8111-111111111111",
  attemptId: "22222222-2222-4222-8222-222222222222",
};

function seasonResolverClient(rows: Array<{ id: string; scoring_policy_version: string }>): PoolClient {
  return {
    query: async (sql: string, params: unknown[]) => {
      assert.match(sql, /enrollment\.status = 'enrolled'/);
      assert.match(sql, /season\.status IN \('active', 'closing'\)/);
      assert.match(sql, /\$4::timestamptz >= season\.starts_at/);
      assert.match(sql, /\$4::timestamptz < season\.ends_at/);
      assert.deepEqual(params, [owner.tenantId, owner.workspaceId, owner.studentId, trade.closedAt]);
      return { rows };
    },
  } as unknown as PoolClient;
}

describe("Arena trade score ledger adapter", () => {
  it("derives deterministic process and bounded outcome evidence from the canonical close", () => {
    const input = deriveArenaTradeScoreInput({ trade, position, equityBeforeClose: "100000", tradeNumberForDay: 1 });
    assert.equal(input.instrumentKind, "spot");
    assert.equal(input.riskBudgetBps, 100);
    assert.equal(input.outcomeRMultipleBps, 19_000);
    assert.equal(input.hasPreTradePlan, true);
    assert.equal(input.hasStopLoss, true);
    assert.equal(input.journalCompleted, false);
  });

  it("fails closed when numeric source evidence is malformed", () => {
    assert.throws(() => deriveArenaTradeScoreInput({
      trade: { ...trade, realizedPnl: "not-a-number" },
      position,
      equityBeforeClose: "100000",
      tradeNumberForDay: 1,
    }));
  });

  it("binds scoring evidence to the single enrolled active season", async () => {
    const seasonId = "33333333-3333-4333-8333-333333333333";
    const resolved = await resolveArenaScoreSeasonId(
      seasonResolverClient([{ id: seasonId, scoring_policy_version: "arena-league-scoring-v1" }]),
      owner,
      trade.closedAt,
    );
    assert.equal(resolved, seasonId);
  });

  it("leaves non-season Arena activity unranked instead of inventing season authority", async () => {
    const resolved = await resolveArenaScoreSeasonId(
      seasonResolverClient([]),
      owner,
      trade.closedAt,
    );
    assert.equal(resolved, null);
  });

  it("fails closed when overlapping enrolled seasons make score ownership ambiguous", async () => {
    await assert.rejects(
      resolveArenaScoreSeasonId(
        seasonResolverClient([
          { id: "33333333-3333-4333-8333-333333333333", scoring_policy_version: "arena-league-scoring-v1" },
          { id: "44444444-4444-4444-8444-444444444444", scoring_policy_version: "arena-league-scoring-v1" },
        ]),
        owner,
        trade.closedAt,
      ),
      /arena_league_season_ambiguous/,
    );
  });

  it("fails closed when the season requires an unsupported historical scoring policy", async () => {
    await assert.rejects(
      resolveArenaScoreSeasonId(
        seasonResolverClient([
          { id: "33333333-3333-4333-8333-333333333333", scoring_policy_version: "arena-league-scoring-v2" },
        ]),
        owner,
        trade.closedAt,
      ),
      /arena_league_season_scoring_policy_unsupported/,
    );
  });
});
