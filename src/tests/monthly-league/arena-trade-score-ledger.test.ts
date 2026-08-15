import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveArenaTradeScoreInput } from "@/lib/arena-league-score-ledger";
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
});
