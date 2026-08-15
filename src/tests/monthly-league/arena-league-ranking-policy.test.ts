import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rankArenaLeagueCandidates } from "@/lib/arena-league-ranking-policy";

const a = "00000000-0000-4000-8000-000000000001";
const b = "00000000-0000-4000-8000-000000000002";

describe("Arena league ranking policy", () => {
  it("caps monthly points and applies stable safety-first tie breakers", () => {
    const ranked = rankArenaLeagueCandidates([
      { studentId: a, rawPoints: 9_000, tradeCount: 12, ruleComplianceBps: 9_000, lifetimePoints: 2_000, finalizedMonths: 2 },
      { studentId: b, rawPoints: 3_000, tradeCount: 8, ruleComplianceBps: 9_000, lifetimePoints: 2_000, finalizedMonths: 2 },
    ], "monthly");
    assert.deepEqual(ranked.map(({ studentId, points, rank }) => ({ studentId, points, rank })), [
      { studentId: b, points: 3_000, rank: 1 },
      { studentId: a, points: 3_000, rank: 2 },
    ]);
  });

  it("does not cap yearly or lifetime totals", () => {
    assert.equal(rankArenaLeagueCandidates([
      { studentId: a, rawPoints: 9_000, tradeCount: 12, ruleComplianceBps: 9_000, lifetimePoints: 9_000, finalizedMonths: 4 },
    ], "yearly")[0]?.points, 9_000);
  });

  it("rejects duplicate principals and invalid numeric evidence", () => {
    const candidate = { studentId: a, rawPoints: 1, tradeCount: 1, ruleComplianceBps: 8_000, lifetimePoints: 1, finalizedMonths: 0 };
    assert.throws(() => rankArenaLeagueCandidates([candidate, candidate], "monthly"));
    assert.throws(() => rankArenaLeagueCandidates([{ ...candidate, tradeCount: 0 }], "monthly"));
  });
});
