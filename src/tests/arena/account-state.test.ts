import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ARENA_ATTEMPTS_PER_CYCLE,
  ARENA_INITIAL_BALANCE,
  summarizeArenaDecisions,
  type ArenaDecision,
} from "@/lib/trading-arena-account";

function decision(overrides: Partial<ArenaDecision> = {}): ArenaDecision {
  return {
    id: crypto.randomUUID(),
    studentId: crypto.randomUUID(),
    symbol: "BTC",
    side: "buy",
    orderType: "market",
    size: 1_000,
    risk: 2,
    entryReason: "ورود پس از تأیید ساختار بازار و شکست معتبر مقاومت",
    emotion: "آرام",
    plan: "حد ابطال زیر حمایت و خروج مرحله‌ای در اهداف مشخص",
    mentorNote: "ثبت شد",
    disciplineScore: 88,
    riskFlag: false,
    createdAt: new Date(0).toISOString(),
    ...overrides,
  };
}

describe("Trading Arena authoritative account contract", () => {
  it("starts every subscription cycle with $100k and three attempts", () => {
    assert.equal(ARENA_INITIAL_BALANCE, "100000.0000000000");
    assert.equal(ARENA_ATTEMPTS_PER_CYCLE, 3);
  });

  it("does not fabricate realized win rate from journal quality", () => {
    const summary = summarizeArenaDecisions([decision()]);

    assert.equal(summary.realizedWinRate, null);
    assert.ok(summary.decisionReadiness > 0);
    assert.equal(summary.count, 1);
  });

  it("penalizes repeated risk flags in decision readiness", () => {
    const disciplined = summarizeArenaDecisions([
      decision(),
      decision({ id: crypto.randomUUID(), disciplineScore: 90 }),
    ]);
    const risky = summarizeArenaDecisions([
      decision({ risk: 7, riskFlag: true, disciplineScore: 30 }),
      decision({ id: crypto.randomUUID(), risk: 8, riskFlag: true, disciplineScore: 20 }),
    ]);

    assert.ok(disciplined.decisionReadiness > risky.decisionReadiness);
    assert.equal(risky.riskFlags, 2);
    assert.equal(risky.mentorSnapshot.nextAction, "reduce_risk");
  });

  it("returns an explicit insufficient-data state for a new account", () => {
    const summary = summarizeArenaDecisions([]);

    assert.equal(summary.decisionReadiness, 0);
    assert.equal(summary.mentorSnapshot.strongestSignal, "insufficient_data");
    assert.equal(summary.mentorSnapshot.nextAction, "record_first_decision");
  });
});
