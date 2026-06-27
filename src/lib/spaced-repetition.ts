/**
 * SM-2 Spaced Repetition Algorithm
 *
 * Faithfully implements SuperMemo SM-2 (1987 — Peter Wozniak).
 * All state is pure data; storage is the caller's responsibility.
 *
 * Grade scale (0–5):
 *  5 — perfect response, effortless recall
 *  4 — correct with slight hesitation
 *  3 — correct after significant difficulty
 *  2 — incorrect; correct answer remembered immediately after seeing it
 *  1 — incorrect; correct answer barely remembered
 *  0 — complete blackout
 */

export type CardState = {
  cardId: string;
  repetitions: number;   // number of successful repetitions in sequence
  easeFactor: number;    // EF — starts at 2.5, floor 1.3
  intervalDays: number;  // days until next review
  nextReviewAt: number;  // unix timestamp (ms)
  lastGrade: number;     // last grade given (0–5)
  lastReviewedAt: number | null;
};

export type ReviewGrade = 0 | 1 | 2 | 3 | 4 | 5;

const MIN_EASE = 1.3;
const INITIAL_EASE = 2.5;

export function createCard(cardId: string): CardState {
  return {
    cardId,
    repetitions: 0,
    easeFactor: INITIAL_EASE,
    intervalDays: 0,
    nextReviewAt: Date.now(),
    lastGrade: -1,
    lastReviewedAt: null,
  };
}

/**
 * Apply SM-2 update and return the new card state.
 * Grades 0–2 reset the repetition sequence.
 * Grades 3–5 advance the interval.
 */
export function reviewCard(card: CardState, grade: ReviewGrade, now = Date.now()): CardState {
  const newEF = Math.max(
    MIN_EASE,
    card.easeFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)),
  );

  let newRepetitions: number;
  let newInterval: number;

  if (grade < 3) {
    // Failed — reset sequence
    newRepetitions = 0;
    newInterval = 1;
  } else {
    // Passed
    if (card.repetitions === 0) {
      newInterval = 1;
    } else if (card.repetitions === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(card.intervalDays * newEF);
    }
    newRepetitions = card.repetitions + 1;
  }

  return {
    ...card,
    repetitions: newRepetitions,
    easeFactor: newEF,
    intervalDays: newInterval,
    nextReviewAt: now + newInterval * 24 * 60 * 60 * 1000,
    lastGrade: grade,
    lastReviewedAt: now,
  };
}

/** Returns true if the card is due for review at the given timestamp. */
export function isDue(card: CardState, now = Date.now()): boolean {
  return card.nextReviewAt <= now;
}

/** Returns all cards that are due, sorted by most overdue first. */
export function getDueCards(cards: CardState[], now = Date.now()): CardState[] {
  return cards
    .filter((c) => isDue(c, now))
    .sort((a, b) => a.nextReviewAt - b.nextReviewAt);
}

/** Days until the next review (may be negative if overdue). */
export function daysUntilReview(card: CardState, now = Date.now()): number {
  return Math.round((card.nextReviewAt - now) / (24 * 60 * 60 * 1000));
}

// ─── Flashcard deck persistence (localStorage) ───────────────────────────────

const STORAGE_KEY = "tecpey-sr-deck";

export function loadDeck(): CardState[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CardState[]) : [];
  } catch {
    return [];
  }
}

export function saveDeck(cards: CardState[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
  } catch {
    // Storage quota exceeded — no-op
  }
}

export function upsertCard(cards: CardState[], updated: CardState): CardState[] {
  const idx = cards.findIndex((c) => c.cardId === updated.cardId);
  if (idx === -1) return [...cards, updated];
  const next = [...cards];
  next[idx] = updated;
  return next;
}

export function ensureCards(cards: CardState[], ids: string[]): CardState[] {
  let result = [...cards];
  for (const id of ids) {
    if (!result.some((c) => c.cardId === id)) {
      result = [...result, createCard(id)];
    }
  }
  return result;
}
