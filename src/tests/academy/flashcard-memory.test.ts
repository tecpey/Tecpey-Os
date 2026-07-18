import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createCard,
  mergeCardDecks,
  normalizeDeck,
  reviewCard,
} from "@/lib/spaced-repetition";

describe("server-authoritative flashcard memory", () => {
  it("normalizes and deduplicates cards by id", () => {
    const cards = normalizeDeck([
      createCard("btc-1"),
      { ...createCard("btc-1"), repetitions: 2 },
      { cardId: "invalid" },
    ]);

    assert.equal(cards.length, 1);
    assert.equal(cards[0].cardId, "btc-1");
    assert.equal(cards[0].repetitions, 2);
  });

  it("merges revision conflicts using the most recently reviewed card", () => {
    const base = createCard("risk-1");
    const remote = reviewCard(base, 3, 1_000);
    const local = reviewCard(base, 5, 2_000);
    const merged = mergeCardDecks([local], [remote]);

    assert.equal(merged.length, 1);
    assert.equal(merged[0].lastReviewedAt, 2_000);
    assert.equal(merged[0].lastGrade, 5);
  });

  it("preserves cards that exist only on the remote device", () => {
    const local = reviewCard(createCard("local-card"), 4, 2_000);
    const remote = reviewCard(createCard("remote-card"), 3, 1_000);
    const merged = mergeCardDecks([local], [remote]);

    assert.deepEqual(
      merged.map((card) => card.cardId).sort(),
      ["local-card", "remote-card"],
    );
  });
});
