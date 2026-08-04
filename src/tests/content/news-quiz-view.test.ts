import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  toSafeNewsQuizBank,
  toSafeNewsQuizQuestion,
} from "../../lib/academy-news-quiz-view";
import { generateNewsQuizBank } from "../../lib/academy-news-quiz-generator";

// The news-quiz board renders the /api/crypto-news?quiz=1 payload interactively.
// The payload is untrusted at the UI boundary, so the view coercion must fail
// closed: an entry it renders is always answerable (its correctAnswer is exactly
// one of its options — the same raw-membership rule the grader uses), and any
// malformed entry is dropped rather than shown.

describe("News-quiz view coercion", () => {
  it("accepts a well-formed single-choice question", () => {
    const safe = toSafeNewsQuizQuestion({
      id: "q1",
      question: "What is the responsible first step?",
      options: ["Review the risk first", "Buy immediately", "Follow a signal"],
      correctAnswer: "Review the risk first",
      explanation: "News is context, not a trade instruction.",
      difficulty: "hard",
    });
    assert.ok(safe, "a valid question must survive coercion");
    assert.equal(safe?.correctAnswer, "Review the risk first");
    assert.equal(safe?.difficulty, "hard");
    assert.ok(safe?.options.includes(safe.correctAnswer), "answer must be an option");
  });

  it("rejects a question whose answer is not one of the options", () => {
    // Exactly the case the grader would be unable to score.
    assert.equal(
      toSafeNewsQuizQuestion({
        id: "q2",
        question: "Unanswerable?",
        options: ["A", "B"],
        correctAnswer: "C",
        explanation: "",
        difficulty: "easy",
      }),
      null,
    );
  });

  it("rejects malformed entries (missing prompt, too few options, wrong types)", () => {
    const malformed: unknown[] = [
      { id: "m1", question: "", options: ["A", "B"], correctAnswer: "A" },
      { id: "m2", question: "Only one option", options: ["A"], correctAnswer: "A" },
      { id: "m3", question: "Bad options", options: "not-an-array", correctAnswer: "A" },
      { id: "m4", question: 123, options: ["A", "B"], correctAnswer: "A" },
      null,
      "not-an-object",
      42,
    ];
    for (const entry of malformed) {
      assert.equal(
        toSafeNewsQuizQuestion(entry as never),
        null,
        `malformed entry ${JSON.stringify(entry)} must be dropped`,
      );
    }
  });

  it("defaults an unknown difficulty to medium and keeps easy/hard", () => {
    const base = {
      id: "d",
      question: "Q",
      options: ["A", "B"],
      correctAnswer: "A",
      explanation: "",
    };
    assert.equal(toSafeNewsQuizQuestion({ ...base, difficulty: "chaotic" })?.difficulty, "medium");
    assert.equal(toSafeNewsQuizQuestion({ ...base, difficulty: undefined })?.difficulty, "medium");
    assert.equal(toSafeNewsQuizQuestion({ ...base, difficulty: "easy" })?.difficulty, "easy");
    assert.equal(toSafeNewsQuizQuestion({ ...base, difficulty: "hard" })?.difficulty, "hard");
  });

  it("toSafeNewsQuizBank drops bad entries and returns [] for a non-array", () => {
    assert.deepEqual(toSafeNewsQuizBank(null), []);
    assert.deepEqual(toSafeNewsQuizBank("nope"), []);
    const mixed = [
      { id: "ok", question: "Q?", options: ["A", "B"], correctAnswer: "A", explanation: "", difficulty: "easy" },
      { id: "bad", question: "Q?", options: ["A", "B"], correctAnswer: "Z", explanation: "", difficulty: "easy" },
    ];
    const bank = toSafeNewsQuizBank(mixed);
    assert.equal(bank.length, 1, "only the answerable entry survives");
    assert.equal(bank[0].id, "ok");
  });

  it("collapses colliding ids so the board never renders a duplicate key", () => {
    // A tampered payload with two individually valid questions sharing an id
    // must not surface both: the board keys cards by id and stores results by
    // id, so a duplicate would render a duplicate React key and an answer the
    // score could never count. The coercion keeps the first and drops the rest.
    const collide = [
      { id: "dup", question: "First?", options: ["A", "B"], correctAnswer: "A", explanation: "", difficulty: "easy" },
      { id: "dup", question: "Second, same id?", options: ["C", "D"], correctAnswer: "C", explanation: "", difficulty: "hard" },
      { id: "unique", question: "Third?", options: ["E", "F"], correctAnswer: "E", explanation: "", difficulty: "medium" },
    ];
    const bank = toSafeNewsQuizBank(collide);
    assert.equal(bank.length, 2, "the duplicate id collapses to one question");
    assert.equal(new Set(bank.map((q) => q.id)).size, bank.length, "every rendered id is unique");
    assert.equal(bank[0].question, "First?", "the first occurrence wins");
  });

  it("passes through every question the real generator emits", () => {
    // End-to-end shape contract: whatever the fail-closed generator produces,
    // the UI coercion accepts it (it never drops a genuinely valid question).
    const generated = generateNewsQuizBank(
      [
        { id: "g1", title: "Bitcoin ETF flows remain a key institutional signal", impact: 8 },
        { id: "g2", title: "Security education stays the first rule", impact: 9 },
        { id: "g3", title: "هدف قیمت جدید: پیش‌بینی رشد ده برابری بیت‌کوین", impact: 6 },
      ],
      { locale: "en" },
    );
    const safe = toSafeNewsQuizBank(generated);
    assert.equal(safe.length, generated.length, "no generator question is dropped by the UI coercion");
    for (const question of safe) {
      assert.ok(question.options.includes(question.correctAnswer));
    }
  });
});
