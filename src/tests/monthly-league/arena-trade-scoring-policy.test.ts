import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ARENA_MONTHLY_POINTS_CAP,
  aggregateArenaLeaguePoints,
  resolveArenaLeagueTier,
  scoreArenaLeagueTrade,
} from "../../lib/arena-league-scoring-policy";

const disciplinedTrade = {
  tradeId: "trade:00000001",
  instrumentKind: "spot" as const,
  tradeNumberForDay: 1,
  riskBudgetBps: 150,
  ruleComplianceBps: 9_000,
  outcomeRMultipleBps: 10_000,
  hasPreTradePlan: true,
  hasStopLoss: true,
  journalCompleted: true,
  mentorFlags: ["proper-sizing", "good-discipline"] as const,
};

describe("Arena league per-trade scoring policy", () => {
  it("rewards disciplined process while keeping outcome contribution bounded", () => {
    const score = scoreArenaLeagueTrade(disciplinedTrade);
    assert.equal(score.participationPoints, 10);
    assert.equal(score.outcomePoints, 10);
    assert.ok(score.processPoints > score.outcomePoints);
    assert.ok(score.totalPoints > 0 && score.totalPoints <= 100);
  });

  it("caps activity farming after five trades per day", () => {
    assert.equal(scoreArenaLeagueTrade({ ...disciplinedTrade, tradeNumberForDay: 3 }).participationPoints, 10);
    assert.equal(scoreArenaLeagueTrade({ ...disciplinedTrade, tradeNumberForDay: 4 }).participationPoints, 5);
    const capped = scoreArenaLeagueTrade({ ...disciplinedTrade, tradeNumberForDay: 6 });
    assert.equal(capped.participationPoints, 0);
    assert.ok(capped.reasons.includes("daily_activity_points_capped"));
  });

  it("does not reward derivative complexity unless risk controls are complete", () => {
    assert.equal(scoreArenaLeagueTrade({ ...disciplinedTrade, instrumentKind: "perpetual" }).positiveMultiplierBps, 10_500);
    const unsafe = scoreArenaLeagueTrade({
      ...disciplinedTrade,
      instrumentKind: "options",
      hasStopLoss: false,
      riskBudgetBps: 800,
      mentorFlags: ["no-stop-loss", "over-risk"],
    });
    assert.equal(unsafe.positiveMultiplierBps, 10_000);
    assert.equal(unsafe.penaltyMultiplierBps, 13_000);
    assert.ok(unsafe.totalPoints < 0);
  });

  it("penalizes revenge, FOMO and over-risk behavior even after a profitable result", () => {
    const score = scoreArenaLeagueTrade({
      ...disciplinedTrade,
      instrumentKind: "perpetual",
      outcomeRMultipleBps: 50_000,
      riskBudgetBps: 1_500,
      hasStopLoss: false,
      mentorFlags: ["revenge-trade", "fomo-entry", "over-risk", "no-stop-loss"],
    });
    assert.equal(score.outcomePoints, 15);
    assert.ok(score.totalPoints < 0);
  });

  it("rounds positive and negative half-point outcomes symmetrically", () => {
    assert.equal(scoreArenaLeagueTrade({ ...disciplinedTrade, outcomeRMultipleBps: 500 }).outcomePoints, 1);
    assert.equal(scoreArenaLeagueTrade({ ...disciplinedTrade, outcomeRMultipleBps: -500 }).outcomePoints, -1);
  });

  it("caps monthly points in both directions", () => {
    assert.equal(aggregateArenaLeaguePoints(Array.from({ length: 100 }, () => ({ totalPoints: 100 }))), ARENA_MONTHLY_POINTS_CAP);
    assert.equal(aggregateArenaLeaguePoints(Array.from({ length: 100 }, () => ({ totalPoints: -100 }))), -ARENA_MONTHLY_POINTS_CAP);
  });

  it("requires points, finalized seasons and discipline for progression to Legend", () => {
    assert.equal(resolveArenaLeagueTier({ lifetimePoints: 100_000, finalizedMonths: 12, ruleComplianceBps: 9_300 }).tier, "legend");
    assert.equal(resolveArenaLeagueTier({ lifetimePoints: 100_000, finalizedMonths: 11, ruleComplianceBps: 9_300 }).tier, "master");
    assert.equal(resolveArenaLeagueTier({ lifetimePoints: 100_000, finalizedMonths: 12, ruleComplianceBps: 6_000 }).tier, "rookie");
  });

  it("fails closed on malformed evidence and duplicate flags", () => {
    assert.throws(() => scoreArenaLeagueTrade({ ...disciplinedTrade, riskBudgetBps: 10_001 }), /risk_budget_bps_invalid/);
    assert.throws(() => scoreArenaLeagueTrade({ ...disciplinedTrade, mentorFlags: ["over-risk", "over-risk"] }), /mentor_flags_invalid/);
    assert.throws(
      () => scoreArenaLeagueTrade({ ...disciplinedTrade, instrumentKind: "futures" as "spot" }),
      /instrument_kind_invalid/,
    );
    assert.throws(
      () => scoreArenaLeagueTrade({ ...disciplinedTrade, hasStopLoss: false }),
      /stop_loss_evidence_conflict/,
    );
    assert.throws(
      () => scoreArenaLeagueTrade({ ...disciplinedTrade, mentorFlags: ["no-stop-loss"] }),
      /stop_loss_evidence_conflict/,
    );
  });
});
