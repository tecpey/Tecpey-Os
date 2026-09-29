import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PoolClient } from "pg";
import {
  deriveArenaTradeScoreInput,
  persistNewArenaTradeScores,
  resolveArenaScoreSeasonId,
} from "@/lib/arena-league-score-ledger";
import type { ArenaClosedTradeV2, ArenaExecutionStateV2, ArenaOpenPositionV2 } from "@/lib/trading-arena-execution-v2";

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
        if (sql.includes("COUNT(*)::text AS count")) {
          assert.match(sql, /scored_at < \$4::timestamptz/);
          assert.equal(params[5], trade.id);
          return { rows: [{ count: "0" }] };
        }
        if (sql.includes("INSERT INTO academy_arena_trade_score_ledger")) {
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
      persistNewArenaTradeScores(client, owner, before, {
        ...after,
        closedTrades: [{ ...trade, realizedPnl: "39" }],
      }),
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
        if (sql.includes("COUNT(*)::text AS count")) return { rows: [{ count: String(persisted.length) }] };
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
