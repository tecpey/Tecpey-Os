import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACADEMY_CORE_TERM_COUNT,
  ACADEMY_INFINITE_GROWTH_CYCLE,
  ACADEMY_INFINITE_GROWTH_TERM_NUMBER,
  ACADEMY_SCORE_CHANNEL_POLICY,
  isAcademyInfiniteGrowthCycleComplete,
  mayScoreChannelCreateAutomaticEntitlement,
  resolveAcademyInfiniteGrowthAccess,
} from "../../lib/academy-infinite-growth-policy";

describe("Academy infinite growth policy", () => {
  it("opens Term 8 only after all seven core terms", () => {
    assert.equal(ACADEMY_CORE_TERM_COUNT, 7);
    assert.equal(ACADEMY_INFINITE_GROWTH_TERM_NUMBER, 8);
    assert.deepEqual(resolveAcademyInfiniteGrowthAccess({
      completedCoreTerms: 6,
      integrityHold: false,
    }), {
      state: "locked",
      reason: "core_terms_incomplete",
      nextRequiredTerm: 7,
    });
    assert.deepEqual(resolveAcademyInfiniteGrowthAccess({
      completedCoreTerms: 7,
      integrityHold: false,
    }), {
      state: "eligible",
      reason: null,
      nextRequiredTerm: null,
    });
  });

  it("fails closed while an integrity review is active", () => {
    assert.equal(resolveAcademyInfiniteGrowthAccess({
      completedCoreTerms: 7,
      integrityHold: true,
    }).state, "review");
  });

  it("requires the complete evidence-led learning cycle in order", () => {
    assert.equal(
      isAcademyInfiniteGrowthCycleComplete(ACADEMY_INFINITE_GROWTH_CYCLE),
      true,
    );
    assert.equal(
      isAcademyInfiniteGrowthCycleComplete([
        "assess",
        "plan",
        "practice",
        "verify",
        "reflect",
        "adapt",
      ]),
      false,
    );
  });

  it("keeps every score channel private by default and non-entitling", () => {
    for (const channel of Object.keys(ACADEMY_SCORE_CHANNEL_POLICY) as Array<
      keyof typeof ACADEMY_SCORE_CHANNEL_POLICY
    >) {
      assert.equal(ACADEMY_SCORE_CHANNEL_POLICY[channel].publicByDefault, false);
      assert.equal(
        mayScoreChannelCreateAutomaticEntitlement(channel),
        false,
      );
    }
  });
});
