/**
 * SM-2 Spaced Repetition Algorithm
 *
 * The algorithm is pure. Durable deck state is owned by PostgreSQL and exposed
 * through /api/academy-flashcards. The browser keeps only a disposable in-memory
 * projection for rendering and optimistic interaction.
 */

export type CardState = {
  cardId: string;
  repetitions: number;
  easeFactor: number;
  intervalDays: number;
  nextReviewAt: number;
  lastGrade: number;
  lastReviewedAt: number | null;
};

export type ReviewGrade = 0 | 1 | 2 | 3 | 4 | 5;

const MIN_EASE = 1.3;
const INITIAL_EASE = 2.5;
export const FLASHCARDS_UPDATED_EVENT = "tecpey-flashcards-updated";
export const FLASHCARDS_SYNC_ERROR_EVENT = "tecpey-flashcards-sync-error";

const deckByLocale = new Map<"fa" | "en", CardState[]>();
const revisionByLocale = new Map<"fa" | "en", number>();
const hydrationByLocale = new Map<"fa" | "en", Promise<CardState[]>>();
const writeQueueByLocale = new Map<"fa" | "en", Promise<void>>();

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

export function reviewCard(card: CardState, grade: ReviewGrade, now = Date.now()): CardState {
  const newEF = Math.max(
    MIN_EASE,
    card.easeFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)),
  );

  let newRepetitions: number;
  let newInterval: number;

  if (grade < 3) {
    newRepetitions = 0;
    newInterval = 1;
  } else {
    if (card.repetitions === 0) newInterval = 1;
    else if (card.repetitions === 1) newInterval = 6;
    else newInterval = Math.round(card.intervalDays * newEF);
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

export function isDue(card: CardState, now = Date.now()): boolean {
  return card.nextReviewAt <= now;
}

export function getDueCards(cards: CardState[], now = Date.now()): CardState[] {
  return cards
    .filter((card) => isDue(card, now))
    .sort((a, b) => a.nextReviewAt - b.nextReviewAt);
}

export function daysUntilReview(card: CardState, now = Date.now()): number {
  return Math.round((card.nextReviewAt - now) / (24 * 60 * 60 * 1000));
}

function localeFromBrowser(): "fa" | "en" {
  if (typeof window === "undefined") return "fa";
  return window.location.pathname.startsWith("/en/") ? "en" : "fa";
}

function validCard(value: unknown): value is CardState {
  if (!value || typeof value !== "object") return false;
  const card = value as Partial<CardState>;
  return (
    typeof card.cardId === "string" &&
    card.cardId.length > 0 &&
    card.cardId.length <= 180 &&
    Number.isFinite(card.repetitions) &&
    Number.isFinite(card.easeFactor) &&
    Number.isFinite(card.intervalDays) &&
    Number.isFinite(card.nextReviewAt) &&
    Number.isFinite(card.lastGrade) &&
    (card.lastReviewedAt === null || Number.isFinite(card.lastReviewedAt))
  );
}

export function normalizeDeck(value: unknown): CardState[] {
  if (!Array.isArray(value)) return [];
  const byId = new Map<string, CardState>();
  for (const item of value.slice(0, 2000)) {
    if (!validCard(item)) continue;
    byId.set(item.cardId, {
      cardId: item.cardId,
      repetitions: Math.max(0, Math.round(item.repetitions)),
      easeFactor: Math.max(MIN_EASE, Number(item.easeFactor)),
      intervalDays: Math.max(0, Math.round(item.intervalDays)),
      nextReviewAt: Number(item.nextReviewAt),
      lastGrade: Math.max(-1, Math.min(5, Math.round(item.lastGrade))),
      lastReviewedAt: item.lastReviewedAt === null ? null : Number(item.lastReviewedAt),
    });
  }
  return [...byId.values()];
}

export function mergeCardDecks(local: CardState[], remote: CardState[]): CardState[] {
  const merged = new Map<string, CardState>();
  for (const card of normalizeDeck(remote)) merged.set(card.cardId, card);
  for (const card of normalizeDeck(local)) {
    const previous = merged.get(card.cardId);
    const previousTs = previous?.lastReviewedAt ?? -1;
    const localTs = card.lastReviewedAt ?? -1;
    if (!previous || localTs >= previousTs) merged.set(card.cardId, card);
  }
  return [...merged.values()];
}

function dispatchUpdate(locale: "fa" | "en", source: "server" | "optimistic"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FLASHCARDS_UPDATED_EVENT, { detail: { locale, source } }));
}

function dispatchSyncError(locale: "fa" | "en", error: unknown): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FLASHCARDS_SYNC_ERROR_EVENT, {
    detail: { locale, message: error instanceof Error ? error.message : String(error) },
  }));
}

export function loadDeck(locale = localeFromBrowser()): CardState[] {
  return deckByLocale.get(locale) ?? [];
}

export async function hydrateDeck(locale = localeFromBrowser()): Promise<CardState[]> {
  const existing = hydrationByLocale.get(locale);
  if (existing) return existing;

  const request = (async () => {
    const response = await fetch(`/api/academy-flashcards?locale=${locale}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      if (response.status === 401) return loadDeck(locale);
      throw new Error(`flashcards_load_failed:${response.status}`);
    }
    const body = await response.json() as { cards?: unknown; revision?: unknown };
    const cards = normalizeDeck(body.cards);
    deckByLocale.set(locale, cards);
    revisionByLocale.set(locale, Math.max(0, Number(body.revision) || 0));
    dispatchUpdate(locale, "server");
    return cards;
  })().catch((error) => {
    hydrationByLocale.delete(locale);
    dispatchSyncError(locale, error);
    return loadDeck(locale);
  });

  hydrationByLocale.set(locale, request);
  return request;
}

async function persistDeck(cards: CardState[], locale: "fa" | "en"): Promise<void> {
  let candidate = normalizeDeck(cards);
  let expectedRevision = revisionByLocale.get(locale) ?? 0;

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch("/api/academy-flashcards", {
      method: "PUT",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ locale, expectedRevision, cards: candidate }),
    });
    const body = await response.json().catch(() => ({})) as {
      cards?: unknown;
      revision?: unknown;
      details?: { cards?: unknown; revision?: unknown };
    };

    if (response.ok) {
      const authoritative = normalizeDeck(body.cards);
      deckByLocale.set(locale, authoritative);
      revisionByLocale.set(locale, Math.max(0, Number(body.revision) || expectedRevision + 1));
      dispatchUpdate(locale, "server");
      return;
    }

    if (response.status === 409 && body.details) {
      const remote = normalizeDeck(body.details.cards);
      expectedRevision = Math.max(0, Number(body.details.revision) || 0);
      candidate = mergeCardDecks(candidate, remote);
      deckByLocale.set(locale, candidate);
      continue;
    }

    throw new Error(`flashcards_write_failed:${response.status}`);
  }

  throw new Error("flashcards_revision_conflict");
}

export function saveDeck(cards: CardState[], locale = localeFromBrowser()): void {
  const normalized = normalizeDeck(cards);
  deckByLocale.set(locale, normalized);
  dispatchUpdate(locale, "optimistic");

  const previous = writeQueueByLocale.get(locale) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => persistDeck(normalized, locale))
    .catch((error) => {
      hydrationByLocale.delete(locale);
      dispatchSyncError(locale, error);
    });
  writeQueueByLocale.set(locale, next);
}

export function upsertCard(cards: CardState[], updated: CardState): CardState[] {
  const index = cards.findIndex((card) => card.cardId === updated.cardId);
  if (index === -1) return [...cards, updated];
  const next = [...cards];
  next[index] = updated;
  return next;
}

export function ensureCards(cards: CardState[], ids: string[]): CardState[] {
  let result = [...cards];
  for (const id of ids) {
    if (!result.some((card) => card.cardId === id)) result = [...result, createCard(id)];
  }
  return result;
}
