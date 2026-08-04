// Adapter from the live crypto-news feed to news-driven quiz questions.
//
// The /api/crypto-news endpoint returns items shaped like NewsItem
// ({ id, title, category, tone, impact, ... }). This module maps that feed into
// validated quiz questions through generateNewsQuizBank, so a page or job can
// turn "today's crypto news" into exam questions. It is pure — no fetch, no I/O
// — so the network boundary stays with the caller and this layer is fully
// testable with in-memory fixtures.
//
// The feed is external and untrusted, so every field is coerced defensively:
// wrong-typed or missing fields degrade to safe defaults rather than throwing,
// and the downstream generator still fails closed (every emitted question clears
// the integrity authority) and strips profit-promise / price-prediction copy.

import type { QuizQuestion } from "@/data/academy/term1Curriculum";
import {
  generateNewsQuizBank,
  type NewsQuizInput,
  type NewsQuizOptions,
} from "./academy-news-quiz-generator";

/** One item as delivered by the crypto-news feed. Untrusted: all fields loose. */
export type CryptoNewsFeedItem = {
  id?: unknown;
  title?: unknown;
  category?: unknown;
  tone?: unknown;
  impact?: unknown;
};

function asTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Coerce one untrusted feed item into the generator's input shape. */
export function toNewsQuizInput(item: CryptoNewsFeedItem): NewsQuizInput {
  // A null/non-object entry (malformed feed) degrades to an empty item rather
  // than throwing; the generator then falls back to a neutral subject.
  const safe: CryptoNewsFeedItem = item && typeof item === "object" ? item : {};
  return {
    id: asTrimmedString(safe.id) ?? "",
    title: asTrimmedString(safe.title) ?? "",
    category: asTrimmedString(safe.category),
    tone: asTrimmedString(safe.tone),
    impact: asFiniteNumber(safe.impact),
  };
}

/**
 * Builds a validated quiz bank from a crypto-news feed's items. A non-array
 * input yields an empty bank; every returned question clears the integrity
 * authority and carries a unique id (duplicate source items collapse).
 */
export function buildNewsQuizBankFromFeed(
  items: readonly CryptoNewsFeedItem[] | null | undefined,
  options: NewsQuizOptions,
): QuizQuestion[] {
  if (!Array.isArray(items)) return [];
  return generateNewsQuizBank(items.map(toNewsQuizInput), options);
}
