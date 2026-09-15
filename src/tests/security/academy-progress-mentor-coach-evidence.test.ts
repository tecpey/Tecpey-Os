import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

import { summarizeMemory } from "../../app/api/academy/mentor-memory/route";
import { MENTOR_WEAK_AREA_RULE_IDS } from "../../data/academyMentorIntelligence";

describe("Academy Mentor evidence contract", () => {
  it("does not fabricate confidence when there is no quiz or trade evidence", () => {
    const summary = summarizeMemory([], []);

    assert.equal(summary.confidence, null);
    assert.deepEqual(summary.weakAreas, []);
  });

  it("preserves a genuine zero-percent quiz as evidence and flags academy review", () => {
    const summary = summarizeMemory(
      [{ term_number: 1, percent: 0, status: "failed" }],
      [],
    );

    assert.equal(summary.avgQuiz, 0);
    assert.equal(summary.confidence, 0);
    assert.ok(summary.weakAreas.includes("academy_review"));
  });

  it("does not flag academy review at the 80-percent boundary", () => {
    const summary = summarizeMemory(
      [{ term_number: 1, percent: 80, status: "passed" }],
      [],
    );

    assert.equal(summary.weakAreas.includes("academy_review"), false);
    assert.notEqual(summary.confidence, null);
  });

  it("derives risk, discipline, and psychology weak-area codes from real trade evidence", () => {
    const summary = summarizeMemory([], [
      { risk: 4.5, riskFlag: true, disciplineScore: 35, emotion: "fear" },
      { risk: 4.0, riskFlag: true, disciplineScore: 40, emotion: "revenge" },
    ]);

    assert.ok(summary.weakAreas.includes("risk_management"));
    assert.ok(summary.weakAreas.includes("trading_discipline"));
    assert.ok(summary.weakAreas.includes("trading_psychology"));
    assert.notEqual(summary.confidence, null);
  });
});

describe("Academy Mentor weak-area vocabulary", () => {
  it("maps server codes explicitly and never guesses a topic for academy_review", () => {
    assert.equal(MENTOR_WEAK_AREA_RULE_IDS.risk_management, "risk");
    assert.equal(MENTOR_WEAK_AREA_RULE_IDS.trading_discipline, "risk");
    assert.equal(MENTOR_WEAK_AREA_RULE_IDS.trading_psychology, "psychology");
    assert.equal(MENTOR_WEAK_AREA_RULE_IDS.academy_review, undefined);
  });
});

describe("Academy Mentor partial-failure UI contract", () => {
  it("keeps independent evidence fetches, abort cleanup, and a non-alarming loading state", async () => {
    const source = await readFile(
      path.join(process.cwd(), "src/components/academy/AcademyMentorCoachCenter.tsx"),
      "utf8",
    );

    assert.match(source, /Promise\.allSettled\s*\(/);
    assert.match(source, /new AbortController\s*\(\)/);
    assert.match(source, /controller\.abort\s*\(\)/);
    assert.match(source, /memoryResult\.status === "fulfilled"/);
    assert.match(source, /conversationResult\.status === "fulfilled"/);
    assert.match(source, /Loading evidence…/);
    assert.doesNotMatch(source, /Promise\.all\s*\(\s*\[/);
  });
});
