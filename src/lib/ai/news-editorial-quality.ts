export type NewsEditorialQualityFailure =
  | "unsupported_latin_entity"
  | "ticker_integrity_failed"
  | "persian_field_quality_failed"
  | "title_shape_failed"
  | "title_density_failed";

export type NewsEditorialQualityResult =
  | { ok: true; evidence: { sourceTickers: string[]; translatedTickers: string[] } }
  | {
      ok: false;
      reason: NewsEditorialQualityFailure;
      evidence: {
        unsupportedLatinEntities?: string[];
        missingTickers?: string[];
        sourceTickers?: string[];
        translatedTickers?: string[];
        field?: "title" | "lead" | "body";
        titleSentenceBreaks?: number;
        titleChars?: number;
      };
    };

const LATIN_STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have", "in", "into",
  "is", "it", "its", "of", "on", "or", "that", "the", "this", "to", "was", "were", "will", "with",
]);

const NON_TICKER_ACRONYMS = new Set([
  "AI", "API", "CEO", "CFO", "CTO", "DAO", "DEX", "ETF", "ETP", "EU", "FDIC", "GDP", "IPO", "KYC",
  "MiCA", "NFT", "OTC", "RWA", "SEC", "TVL", "UK", "US", "USA", "USD", "EUR", "GBP", "VC", "WEB3",
]);

function normalizeLatinToken(token: string): string {
  const trimmed = token.trim();
  if (/^[A-Z][A-Z0-9]{1,}s$/.test(trimmed)) {
    return trimmed.slice(0, -1).toLowerCase();
  }
  return trimmed.toLowerCase();
}

function latinTokens(value: string): Set<string> {
  // Keep tokenization aligned with the existing feed-summary grounding authority.
  // Deliberately stop at apostrophes/hyphens so possessives such as Bitcoin's
  // and compound prose do not turn a grounded base entity into a false reject.
  const matches = value.match(/\b[A-Za-z][A-Za-z0-9.+&]{1,}\b/g) ?? [];
  return new Set(
    matches
      .map(normalizeLatinToken)
      .filter((token) => !LATIN_STOPWORDS.has(token)),
  );
}

function marketTickerTokens(value: string): Set<string> {
  const matches = value.match(/\b[A-Z][A-Z0-9]{1,7}\b/g) ?? [];
  return new Set(
    matches.filter((token) => !NON_TICKER_ACRONYMS.has(token)),
  );
}

function hasPersian(value: string): boolean {
  return /[آ-ی]/.test(value);
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function countInternalPersianHeadlineSentenceBreaks(value: string): number {
  // Count only punctuation that terminates Persian text and is followed by more
  // headline content. Terminal punctuation is allowed, and Latin abbreviations
  // such as U.S. are deliberately not interpreted as Persian sentence breaks.
  return (value.match(/[آ-ی۰-۹][.!?؟]+(?:["'»”\)\]]*)\s+(?=\S)/gu) ?? []).length;
}

/**
 * Final fail-closed authority before a generated Persian news record is persisted.
 * This intentionally validates only deterministic properties that can be proven
 * from publisher evidence. Subjective newsroom style remains prompt/review work;
 * factual entity and ticker drift is never allowed to publish automatically.
 */
export function validatePersianNewsEditorialQuality(input: {
  sourceTitle: string;
  sourceLead: string;
  sourceBody: string;
  translatedTitle: string;
  translatedLead: string;
  translatedBody: string;
}): NewsEditorialQualityResult {
  const sourceText = [input.sourceTitle, input.sourceLead, input.sourceBody].join(" ");
  const translatedTitle = compact(input.translatedTitle);
  const translatedLead = compact(input.translatedLead);
  const translatedBody = compact(input.translatedBody);
  const translatedText = [translatedTitle, translatedLead, translatedBody].join(" ");

  if (!translatedTitle || !hasPersian(translatedTitle)) {
    return { ok: false, reason: "persian_field_quality_failed", evidence: { field: "title" } };
  }
  if (!translatedLead || !hasPersian(translatedLead)) {
    return { ok: false, reason: "persian_field_quality_failed", evidence: { field: "lead" } };
  }
  if (!translatedBody || !hasPersian(translatedBody)) {
    return { ok: false, reason: "persian_field_quality_failed", evidence: { field: "body" } };
  }

  const titleSentenceBreaks = countInternalPersianHeadlineSentenceBreaks(translatedTitle);
  if (titleSentenceBreaks > 0) {
    return {
      ok: false,
      reason: "title_shape_failed",
      evidence: { titleSentenceBreaks },
    };
  }

  // Very long generated headlines degrade mobile scannability and are commonly a
  // symptom of literal sentence-level translation. Keep this bound generous so
  // factual headlines are not compressed merely to satisfy the UI.
  if (translatedTitle.length > 220) {
    return {
      ok: false,
      reason: "title_density_failed",
      evidence: { titleChars: translatedTitle.length },
    };
  }

  const sourceLatin = latinTokens(sourceText);
  const translatedLatin = latinTokens(translatedText);
  const unsupportedLatinEntities = [...translatedLatin]
    .filter((token) => !sourceLatin.has(token))
    .sort();
  if (unsupportedLatinEntities.length > 0) {
    return {
      ok: false,
      reason: "unsupported_latin_entity",
      evidence: { unsupportedLatinEntities: unsupportedLatinEntities.slice(0, 16) },
    };
  }

  const sourceTickers = [...marketTickerTokens(sourceText)].sort();
  const translatedTickers = [...marketTickerTokens(translatedText)].sort();
  const translatedTickerSet = new Set(translatedTickers);
  const missingTickers = sourceTickers.filter((ticker) => !translatedTickerSet.has(ticker));
  if (missingTickers.length > 0) {
    return {
      ok: false,
      reason: "ticker_integrity_failed",
      evidence: {
        missingTickers,
        sourceTickers,
        translatedTickers,
      },
    };
  }

  return { ok: true, evidence: { sourceTickers, translatedTickers } };
}
