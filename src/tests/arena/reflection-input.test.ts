import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseArenaReflectionInput } from "@/lib/trading-arena-reflections";

const valid = {
  attemptId: "22222222-2222-4222-8222-222222222222",
  closedTradeId: "33333333-3333-4333-8333-333333333333",
  expectedRevision: 0,
  decisionReview: "مرور تصمیم",
  learnedLesson: "درس معامله",
  emotionalReview: "مرور احساس",
  mistakeTags: ["none"],
  nextActionCommitment: "برنامه معامله بعدی",
};

describe("Trading Arena reflection strict input boundary", () => {
  it("accepts the documented JSON types", () => {
    assert.ok(parseArenaReflectionInput(valid));
    assert.equal(
      parseArenaReflectionInput({ ...valid, nextActionCommitment: null })?.nextActionCommitment,
      null,
    );
  });

  it("rejects string revisions instead of coercing them", () => {
    assert.equal(parseArenaReflectionInput({ ...valid, expectedRevision: "0" }), null);
  });

  it("rejects object and numeric narrative values instead of stringifying them", () => {
    assert.equal(parseArenaReflectionInput({ ...valid, decisionReview: { forged: true } }), null);
    assert.equal(parseArenaReflectionInput({ ...valid, learnedLesson: 123 }), null);
    assert.equal(parseArenaReflectionInput({ ...valid, emotionalReview: ["forged"] }), null);
    assert.equal(parseArenaReflectionInput({ ...valid, nextActionCommitment: 123 }), null);
    assert.equal(parseArenaReflectionInput({ ...valid, closedTradeId: { forged: true } }), null);
  });

  it("rejects non-string controlled tags", () => {
    assert.equal(parseArenaReflectionInput({ ...valid, mistakeTags: ["none", 1] }), null);
  });
});
