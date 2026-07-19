import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  gradeAcademySectionCheckpoint,
  listAcademyTermCheckpoints,
  resolveAcademySectionCheckpoint,
} from "@/lib/academy-section-checkpoint";

describe("Academy server-owned section checkpoints", () => {
  it("creates stable FA and EN checkpoint catalogs for every official term", () => {
    for (const locale of ["fa", "en"] as const) {
      for (let termNumber = 1; termNumber <= 7; termNumber += 1) {
        const first = listAcademyTermCheckpoints(locale, `term-${termNumber}`);
        const second = listAcademyTermCheckpoints(locale, `term-${termNumber}`);
        assert.ok(first.length > 0, `${locale} term ${termNumber} must have checkpoints`);
        assert.deepEqual(second, first);
        assert.equal(new Set(first.map((item) => item.sectionKey)).size, first.length);
        for (const item of first) {
          assert.equal(item.checkpoint.options.length, 4);
          assert.equal(new Set(item.checkpoint.options.map((option) => option.id)).size, 4);
          assert.equal(item.checkpoint.options.every((option) => /^opt_[0-9a-f]{20}$/.test(option.id)), true);
          assert.equal(
            item.checkpoint.options.some((option) =>
              /outcome|correct|mistake|guaranteed|evidence/i.test(option.id),
            ),
            false,
          );
        }
      }
    }
  });

  it("grades only the opaque server-owned correct option", () => {
    const resolved = resolveAcademySectionCheckpoint("fa", "term-1", "lesson-1");
    assert.ok(resolved);
    const correct = gradeAcademySectionCheckpoint({
      locale: "fa",
      termSlug: "term-1",
      sectionKey: "lesson-1",
      questionVersion: resolved.checkpoint.questionVersion,
      selectedOptionId: resolved.correctOptionId,
    });
    assert.equal(correct.status, "graded");
    if (correct.status === "graded") assert.equal(correct.correct, true);

    const wrongOption = resolved.checkpoint.options.find(
      (option) => option.id !== resolved.correctOptionId,
    );
    assert.ok(wrongOption);
    const wrong = gradeAcademySectionCheckpoint({
      locale: "fa",
      termSlug: "term-1",
      sectionKey: "lesson-1",
      questionVersion: resolved.checkpoint.questionVersion,
      selectedOptionId: wrongOption.id,
    });
    assert.equal(wrong.status, "graded");
    if (wrong.status === "graded") assert.equal(wrong.correct, false);
  });

  it("fails closed for unknown options, stale versions and unknown lessons", () => {
    const resolved = resolveAcademySectionCheckpoint("en", "term-2", "lesson-1");
    assert.ok(resolved);

    const forged = gradeAcademySectionCheckpoint({
      locale: "en",
      termSlug: "term-2",
      sectionKey: "lesson-1",
      questionVersion: resolved.checkpoint.questionVersion,
      selectedOptionId: "opt_00000000000000000000",
    });
    assert.equal(forged.status, "graded");
    if (forged.status === "graded") assert.equal(forged.correct, false);

    const stale = gradeAcademySectionCheckpoint({
      locale: "en",
      termSlug: "term-2",
      sectionKey: "lesson-1",
      questionVersion: "stale-version",
      selectedOptionId: resolved.correctOptionId,
    });
    assert.equal(stale.status, "version_conflict");

    assert.deepEqual(
      gradeAcademySectionCheckpoint({
        locale: "fa",
        termSlug: "term-9",
        sectionKey: "lesson-1",
        questionVersion: "none",
        selectedOptionId: "none",
      }),
      { status: "not_found" },
    );
  });
});
