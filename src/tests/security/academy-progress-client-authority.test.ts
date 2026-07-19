import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import {
  createDefaultAcademyProgressState,
  hydrateProgressStrict,
  loadProgress,
  normalizeAcademyProgressState,
  refreshProgressStrict,
} from "../../lib/academy-progress";

const originalFetch = globalThis.fetch;

after(() => {
  globalThis.fetch = originalFetch;
});

describe("Academy browser progress read model", () => {
  it("hydrates XP, completion and term state only from the server projection", async () => {
    globalThis.fetch = async (input) => {
      assert.equal(String(input), "/api/academy-state?locale=fa");
      return Response.json({
        state: {
          version: 2,
          xp: 275,
          level: 99,
          streak: 4,
          lastStudyDate: "2026-07-19",
          completedLessons: {
            "t1-m1-l1": {
              lessonId: "t1-m1-l1",
              completedAt: 1_753_000_000_000,
              score: 100,
              xpEarned: 25,
            },
          },
          moduleScores: { "t1-m1": 100 },
          termStatus: { 1: "in_progress" },
          earnedBadges: ["first-lesson", "first-lesson"],
          masteryScores: { "t1-m1-l1": 100 },
        },
      });
    };

    const state = await refreshProgressStrict("fa");
    assert.equal(state.xp, 275);
    assert.equal(state.level, 2, "client derives display level from server XP, not a supplied level");
    assert.equal(state.completedLessons["t1-m1-l1"]?.score, 100);
    assert.deepEqual(state.earnedBadges, ["first-lesson"]);
    assert.deepEqual(loadProgress("fa"), state);
  });

  it("fails closed when the authoritative projection cannot be loaded", async () => {
    globalThis.fetch = async () => new Response(null, { status: 503 });
    await assert.rejects(
      () => refreshProgressStrict("en"),
      /academy_state_load_failed:503/,
    );
    assert.deepEqual(loadProgress("en"), createDefaultAcademyProgressState());
  });

  it("normalizes forged display fields without granting client XP or badges", () => {
    const normalized = normalizeAcademyProgressState({
      version: 2,
      xp: -500,
      level: 12,
      streak: -9,
      completedLessons: "forged",
      termStatus: "forged",
      earnedBadges: ["badge-a", 12, "badge-a"],
    });
    assert.equal(normalized.xp, 0);
    assert.equal(normalized.level, 1);
    assert.equal(normalized.streak, 0);
    assert.deepEqual(normalized.completedLessons, {});
    assert.deepEqual(normalized.termStatus, { 1: "unlocked" });
    assert.deepEqual(normalized.earnedBadges, ["badge-a"]);
  });

  it("does not expose any browser persistence API in the progress authority module", async () => {
    const source = await import("node:fs/promises").then(({ readFile }) =>
      readFile("src/lib/academy-progress.ts", "utf8"),
    );
    assert.equal(/localStorage|sessionStorage|indexedDB|CacheStorage/.test(source), false);
    assert.equal(source.includes("hydrateProgressStrict"), true);
    assert.equal(source.includes("method: \"GET\""), true);
  });
});
