import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeLessonId,
  normalizeReflectionMap,
  normalizeReflectionText,
  saveReflectionEntry,
} from "@/lib/academy-reflections";

describe("Academy reflection memory", () => {
  it("preserves intentional line breaks and removes unsafe control characters", () => {
    const text = normalizeReflectionText("  خط اول\r\nخط دوم\u0000  ");
    assert.equal(text, "خط اول\nخط دوم");
  });

  it("accepts stable lesson identifiers and rejects unsafe identifiers", () => {
    assert.equal(normalizeLessonId("term-1/lesson-2"), "term-1/lesson-2");
    assert.equal(normalizeLessonId("../lesson?token=1"), null);
  });

  it("increments only the selected lesson reflection revision", () => {
    const first = saveReflectionEntry({}, "term-1/lesson-1", "یادداشت اول", 1_000);
    const second = saveReflectionEntry(
      { [first.lessonId]: first },
      "term-1/lesson-1",
      "یادداشت ویرایش‌شده",
      2_000,
    );

    assert.equal(first.revision, 1);
    assert.equal(second.revision, 2);
    assert.equal(second.savedAt, 1_000);
    assert.equal(second.updatedAt, 2_000);
  });

  it("drops malformed reflection documents instead of trusting persisted JSON", () => {
    const map = normalizeReflectionMap({
      "term-1/lesson-1": {
        lessonId: "term-1/lesson-1",
        text: "بازتاب معتبر",
        revision: 1,
        savedAt: 1_000,
        updatedAt: 1_000,
      },
      "term-1/lesson-2": {
        lessonId: "different-id",
        text: "نباید پذیرفته شود",
        revision: 1,
        savedAt: 1_000,
        updatedAt: 1_000,
      },
    });

    assert.deepEqual(Object.keys(map), ["term-1/lesson-1"]);
  });
});
