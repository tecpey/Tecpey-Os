import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Decimal from "decimal.js";
import type { PoolClient } from "pg";
import {
  assertArenaClosedTradeHistoryImmutable,
  assertArenaTradeSourceChronology,
  deriveArenaTradeScoreInput,
  persistNewArenaTradeScores,
  resolveArenaScoreSeasonId,
} from "@/lib/arena-league-score-ledger";
import {
  applyArenaExecutionActionV2,
  createArenaExecutionStateV2,
  type ArenaClosedTradeV2,
  type ArenaExecutionStateV2,
  type ArenaOpenPositionV2,
} from "@/lib/trading-arena-execution-v2";

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
  totalFee: "2.04",
  realizedPnl: "38.96",
  realizedPnlRate: "0.03896",
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

function isScopeQuery(sql: string): boolean {
  return sql.includes("set_config('app.tenant_id'") && sql.includes("set_config('app.workspace_id'");
}

function assertScopeParams(params: unknown[]): void {
  assert.deepEqual(params, [owner.tenantId, owner.workspaceId]);
}

function seasonResolverClient(rows: Array<{ id: string; scoring_policy_version: string }>): PoolClient {
  return {
    query: async (sql: string, params: unknown[]) => {
      if (isScopeQuery(sql)) {
        assertScopeParams(params);
        return { rows: [{ set_config: owner.tenantId }] };
      }
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
  it("rejects removal, duplicate identity and rewriting of immutable closed-trade history", () => {
    const prior = [trade];
    assert.doesNotThrow(() => assertArenaClosedTradeHistoryImmutable(prior, [{ ...trade, mentorFlags: [...trade.mentorFlags] }]));
    assert.throws(() => assertArenaClosedTradeHistoryImmutable(prior, []), /arena_league_historical_trade_removed/);
    assert.throws(() => assertArenaClosedTradeHistoryImmutable([trade, trade], prior), /arena_league_duplicate_prior_trade_id/);
    assert.throws(() => assertArenaClosedTradeHistoryImmutable(prior, [trade, trade]), /arena_league_duplicate_trade_id/);
    const other = { ...trade, id: "trade-other-12345678" };
    assert.throws(() => assertArenaClosedTradeHistoryImmutable([trade, other], [other, trade]),
      /arena_league_historical_trade_order_invalid/);
    assert.throws(() => assertArenaClosedTradeHistoryImmutable(prior, [trade, other]),
      /arena_league_historical_trade_order_invalid/);
    assert.throws(() => assertArenaClosedTradeHistoryImmutable(prior, [{ ...trade, realizedPnl: "39" }]),
      /arena_league_historical_trade_mutated/);
    assert.throws(() => assertArenaClosedTradeHistoryImmutable(prior, [{ ...trade, mentorFlags: ["good-discipline"] }]),
      /arena_league_historical_trade_mutated/);
  });

  it("rejects tampered history before any score-ledger query", async () => {
    const client = { query: () => { throw new Error("unexpected_database_access"); } } as unknown as PoolClient;
    const before = { openPositions: [], closedTrades: [trade], equity: "100000" } as unknown as ArenaExecutionStateV2;
    const after = { closedTrades: [{ ...trade, exitPrice: "105" }] } as unknown as ArenaExecutionStateV2;
    await assert.rejects(persistNewArenaTradeScores(client, owner, before, after),
      /arena_league_historical_trade_mutated/);
  });

  it("allows only oldest-trade eviction at the bounded execution snapshot limit", () => {
    const prior = Array.from({ length: 5_000 }, (_, index) => ({
      ...trade, id: `trade-${String(index).padStart(8, "0")}`,
    }));
    const newTrade = { ...trade, id: "trade-new-12345678" };
    assert.doesNotThrow(() => assertArenaClosedTradeHistoryImmutable(prior, [newTrade, ...prior.slice(0, -1)]));
    assert.throws(() => assertArenaClosedTradeHistoryImmutable(prior, [newTrade, ...prior.slice(1)]),
      /arena_league_historical_trade_removed/);
    assert.throws(() => assertArenaClosedTradeHistoryImmutable(prior, [...prior.slice(0, -1), newTrade]),
      /arena_league_historical_trade_order_invalid/);
  });

  it("rejects impossible close timing and mismatched canonical position evidence", () => {
    assert.doesNotThrow(() => assertArenaTradeSourceChronology(trade, position));
    assert.throws(() => assertArenaTradeSourceChronology({ ...trade, closedAt: "2026-08-15T09:59:59.000Z" }, position),
      /arena_league_trade_source_chronology_invalid/);
    assert.throws(() => assertArenaTradeSourceChronology({ ...trade, openedAt: "invalid" }, position),
      /arena_league_trade_source_chronology_invalid/);
    assert.throws(() => assertArenaTradeSourceChronology(trade, { ...position, openedAt: "2026-08-15T09:00:00.000Z" }),
      /arena_league_trade_source_chronology_invalid/);
    for (const changed of [
      { entryPrice: "99" }, { quantity: "11" }, { quoteCommitted: "1100" },
    ]) {
      assert.throws(() => assertArenaTradeSourceChronology({ ...trade, ...changed }, position),
        /arena_league_trade_source_chronology_invalid/);
    }
  });

  it("rejects mismatched opening capital before reading or writing score evidence", async () => {
    const client = { query: () => { throw new Error("unexpected_database_access"); } } as unknown as PoolClient;
    const before = { openPositions: [position], closedTrades: [], equity: "100000" } as unknown as ArenaExecutionStateV2;
    const after = { closedTrades: [{ ...trade, quoteCommitted: "1100" }] } as unknown as ArenaExecutionStateV2;
    await assert.rejects(persistNewArenaTradeScores(client, owner, before, after),
      /arena_league_trade_source_chronology_invalid/);
  });

  it("rejects added, removed, reordered and duplicated scoring flags", async () => {
    const client = { query: () => { throw new Error("unexpected_database_access"); } } as unknown as PoolClient;
    const before = { openPositions: [position], closedTrades: [], equity: "100000" } as unknown as ArenaExecutionStateV2;
    for (const flags of [
      ["good-discipline", "proper-sizing"],
      ["good-discipline", "proper-sizing", "target-hit", "target-hit"],
      ["target-hit", "good-discipline", "proper-sizing"],
      ["good-discipline", "proper-sizing", "target-hit", "fomo-entry"],
    ] as ArenaClosedTradeV2["mentorFlags"][]) {
      const after = { closedTrades: [{ ...trade, mentorFlags: flags }] } as unknown as ArenaExecutionStateV2;
      await assert.rejects(persistNewArenaTradeScores(client, owner, before, after),
        /arena_league_trade_mentor_flags_invalid/);
    }
    assert.throws(() => assertArenaTradeSourceChronology({
      ...trade, closureReason: "manual", mentorFlags: [...trade.mentorFlags],
    }, position), /arena_league_trade_mentor_flags_invalid/);
  });

  it("rejects forged close settlement before scoring", async () => {
    const client = { query: () => { throw new Error("unexpected_database_access"); } } as unknown as PoolClient;
    const before = { openPositions: [position], closedTrades: [], equity: "100000" } as unknown as ArenaExecutionStateV2;
    for (const changed of [
      { exitPrice: "105" }, { totalFee: "2.03" },
      { realizedPnl: "39.96" }, { realizedPnlRate: "0.03996" },
    ]) {
      const after = { closedTrades: [{ ...trade, ...changed }] } as unknown as ArenaExecutionStateV2;
      await assert.rejects(persistNewArenaTradeScores(client, owner, before, after),
        /arena_league_trade_settlement_invalid/);
    }
  });

  it("accepts engine settlement derived from a fill with hidden precision", () => {
    const preciseFill = "104.00000000009";
    const proceeds = new Decimal(position.quantity).mul(preciseFill);
    const fee = proceeds.mul("0.001");
    const pnl = proceeds.minus(fee).minus(position.quoteCommitted);
    const preciseTrade = {
      ...trade,
      exitPrice: "104.0000000000",
      totalFee: new Decimal(position.openingFee).plus(fee)
        .toDecimalPlaces(10, Decimal.ROUND_DOWN).toFixed(10),
      realizedPnl: pnl.toDecimalPlaces(10, Decimal.ROUND_DOWN).toFixed(10),
      realizedPnlRate: pnl.div(position.quoteCommitted).toDecimalPlaces(8, Decimal.ROUND_DOWN).toFixed(8),
    };
    assert.doesNotThrow(() => assertArenaTradeSourceChronology(preciseTrade, position));
  });

  it("accepts a real engine close and its canonical scoring flags", () => {
    const market = {
      prices: { BTC: "65000.0000000000", ETH: "3500.0000000000" },
      source: "test_feed", observedAt: "2026-08-15T10:00:00.000Z",
    };
    const opened = applyArenaExecutionActionV2(
      createArenaExecutionStateV2("100000", "2026-08-15T10:00:00.000Z"),
      { type: "market_buy", asset: "ETH", quoteAmount: "10000", stopLoss: "3200" },
      { now: "2026-08-15T10:00:01.000Z", operationId: "operation-open-eth", market },
    );
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const sourcePosition = opened.state.openPositions[0];
    assert.ok(sourcePosition);
    const closed = applyArenaExecutionActionV2(opened.state,
      { type: "close_position", positionId: sourcePosition.id, reason: "manual" },
      { now: "2026-08-15T11:00:00.000Z", operationId: "operation-close-eth",
        market: { ...market, prices: { ...market.prices, ETH: "3850.0000000000" },
          observedAt: "2026-08-15T11:00:00.000Z" } },
    );
    assert.equal(closed.ok, true);
    if (!closed.ok) return;
    assert.doesNotThrow(() => assertArenaTradeSourceChronology(closed.state.closedTrades[0], sourcePosition));
  });

  it("accepts an identical score replay and rejects different evidence for the same trade", async () => {
    let persistedDigest: string | null = null;
    let conflictReads = 0;
    const client = {
      query: async (sql: string, params: unknown[]) => {
        if (isScopeQuery(sql)) {
          assertScopeParams(params);
          return { rows: [{ set_config: owner.tenantId }] };
        }
        if (sql.includes("FROM academy_arena_league_seasons season")) return { rows: [] };
        if (sql.includes("current_setting('transaction_isolation')")) return { rows: [{ isolation: "read committed" }] };
        if (sql.includes("pg_advisory_xact_lock")) {
          assert.deepEqual(params, [owner.tenantId, owner.workspaceId, owner.studentId, "2026-08-15"]);
          return { rows: [] };
        }
        if (sql.includes("AS replay_count")) {
          assert.match(sql, /scored_at < \$4::timestamptz/);
          assert.equal(params[5], trade.id);
          return { rows: [{ count: "0", later_count: "0", replay_count: persistedDigest ? "1" : "0" }] };
        }
        if (sql.includes("INSERT INTO academy_arena_trade_score_ledger")) {
          assert.match(sql, /\$4::text, \$4::uuid/);
          const digest = params[19] as string;
          if (!persistedDigest) {
            persistedDigest = digest;
            return { rows: [{ source_digest: digest }] };
          }
          return { rows: [] };
        }
        if (sql.includes("SELECT source_digest FROM academy_arena_trade_score_ledger")) {
          conflictReads++;
          return { rows: [{ source_digest: persistedDigest }] };
        }
        throw new Error(`unexpected_query:${sql}`);
      },
    } as unknown as PoolClient;
    const before = { openPositions: [position], closedTrades: [], equity: "100000" } as unknown as ArenaExecutionStateV2;
    const after = { closedTrades: [trade] } as unknown as ArenaExecutionStateV2;

    await persistNewArenaTradeScores(client, owner, before, after);
    await persistNewArenaTradeScores(client, owner, before, after);
    assert.equal(conflictReads, 1);
    await assert.rejects(
      persistNewArenaTradeScores(client, owner, { ...before, equity: "90000" }, after),
      /arena_league_score_conflicting_replay/,
    );
    assert.equal(conflictReads, 2);
  });

  it("orders same-time trade closes by stable identity before assigning daily ordinal", async () => {
    const persisted: string[] = [];
    const client = {
      query: async (sql: string, params: unknown[]) => {
        if (isScopeQuery(sql)) {
          assertScopeParams(params);
          return { rows: [{ set_config: owner.tenantId }] };
        }
        if (sql.includes("FROM academy_arena_league_seasons season")) return { rows: [] };
        if (sql.includes("current_setting('transaction_isolation')")) return { rows: [{ isolation: "read committed" }] };
        if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
        if (sql.includes("AS replay_count")) {
          return { rows: [{ count: String(persisted.length), later_count: "0", replay_count: "0" }] };
        }
        if (sql.includes("INSERT INTO academy_arena_trade_score_ledger")) {
          persisted.push(params[5] as string);
          assert.equal(params[9], persisted.length);
          return { rows: [{ source_digest: params[19] }] };
        }
        throw new Error(`unexpected_query:${sql}`);
      },
    } as unknown as PoolClient;
    const earlier = { ...trade, id: "trade-a-12345678" };
    const later = { ...trade, id: "trade-b-12345678" };
    const before = { openPositions: [position], closedTrades: [], equity: "100000" } as unknown as ArenaExecutionStateV2;
    const after = { closedTrades: [later, earlier] } as unknown as ArenaExecutionStateV2;
    await persistNewArenaTradeScores(client, owner, before, after);
    assert.deepEqual(persisted, ["trade-a-12345678", "trade-b-12345678"]);
  });

  it("derives deterministic process and bounded outcome evidence from the canonical close", () => {
    const input = deriveArenaTradeScoreInput({ trade, position, equityBeforeClose: "100000", tradeNumberForDay: 1 });
    assert.equal(input.instrumentKind, "spot");
    assert.equal(input.riskBudgetBps, 100);
    assert.equal(input.outcomeRMultipleBps, 19_480);
    assert.equal(input.hasPreTradePlan, true);
    assert.equal(input.hasStopLoss, true);
    assert.equal(input.journalCompleted, false);
  });

  it("refuses retroactive daily scores but permits an identical event replay", async () => {
    let replay = false;
    const calls: string[] = [];
    const client = {
      query: async (sql: string) => {
        calls.push(sql);
        if (isScopeQuery(sql)) return { rows: [] };
        if (sql.includes("FROM academy_arena_league_seasons season")) return { rows: [] };
        if (sql.includes("current_setting('transaction_isolation')")) return { rows: [{ isolation: "read committed" }] };
        if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
        if (sql.includes("AS replay_count")) {
          return { rows: [{ count: "0", later_count: "1", replay_count: replay ? "1" : "0" }] };
        }
        if (sql.includes("INSERT INTO academy_arena_trade_score_ledger")) return { rows: [] };
        if (sql.includes("SELECT source_digest FROM academy_arena_trade_score_ledger")) {
          return { rows: [{ source_digest: "different" }] };
        }
        throw new Error(`unexpected_query:${sql}`);
      },
    } as unknown as PoolClient;
    const before = { openPositions: [position], closedTrades: [], equity: "100000" } as unknown as ArenaExecutionStateV2;
    const after = { closedTrades: [trade] } as unknown as ArenaExecutionStateV2;
    await assert.rejects(persistNewArenaTradeScores(client, owner, before, after),
      /arena_league_retroactive_daily_score_invalid/);
    assert.equal(calls.some((sql) => sql.includes("INSERT INTO academy_arena_trade_score_ledger")), false);
    replay = true;
    await assert.rejects(persistNewArenaTradeScores(client, owner, before, after),
      /arena_league_score_conflicting_replay/);
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
