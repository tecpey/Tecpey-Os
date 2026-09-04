import { callAiProvider, type AiProviderCallResult, type AiProviderRouterDependencies } from "./ai/provider-router";

export type PersianNewsTranslation = {
  title: string;
  lead: string;
  body: string;
  providerId: "openai" | "anthropic" | "openrouter";
  model: string;
  sourceCoverage: "feed_full" | "feed_summary" | "article_full";
  quality: {
    persian: true;
    numericIntegrity: true;
    noAddedAdvice: true;
  };
};

export type NewsTranslationNumericFailureKind =
  | "missing_title_fact"
  | "missing_lead_fact"
  | "invented_numeric_fact";

export type NewsTranslationResult =
  | { ok: true; translation: PersianNewsTranslation; route?: AiProviderCallResult; reused?: boolean }
  | {
    ok: false;
    reason: string;
    providerId?: string;
    model?: string;
    retryDeferredUntil?: string;
    numericFailureKind?: NewsTranslationNumericFailureKind;
    numericFailureFactKey?: string;
    unsupportedLatinEntities?: string[];
  };

export const MAX_PERSIAN_NEWS_BODY_CHARS = 6_000;

export function isReusableNewsCoverageCompatible(
  previous: "feed_full" | "feed_summary" | "article_full" | null,
  current: "feed_full" | "feed_summary" | "article_full",
): boolean {
  return previous !== null && previous === current;
}

export async function resolveReusableOrFreshPersianNewsTranslation(input: {
  reused: Parameters<typeof buildReusedPersianNewsTranslation>[0];
  fresh: () => Promise<NewsTranslationResult>;
}): Promise<NewsTranslationResult> {
  const reused = buildReusedPersianNewsTranslation(input.reused);
  if (reused.ok) return reused;
  return input.fresh();
}

export function buildReusedPersianNewsTranslation(input: {
  title: string;
  lead: string;
  body: string;
  sourceTitle: string;
  sourceLead: string;
  sourceBody: string;
  providerId: string | null;
  model: string | null;
  sourceCoverage: "feed_full" | "feed_summary" | "article_full";
}): NewsTranslationResult {
  const providerId = input.providerId;
  if (providerId !== "openai" && providerId !== "anthropic" && providerId !== "openrouter") {
    return { ok: false, reason: "translation_reuse_provider_invalid" };
  }
  const title = compact(input.title, 500);
  const lead = compact(input.lead, 4_000);
  const body = compactNewsBodyAtSentenceBoundary(input.body, MAX_PERSIAN_NEWS_BODY_CHARS);
  const integrity = validatePersianNewsTranslationIntegrity({
    sourceTitle: input.sourceTitle,
    sourceLead: input.sourceLead,
    sourceBody: input.sourceBody,
    translatedTitle: title,
    translatedLead: lead,
    translatedBody: body,
  });
  if (!integrity.ok) {
    return {
      ok: false,
      reason: `translation_reuse_${integrity.reason}`,
      providerId,
      model: input.model ?? undefined,
      numericFailureKind: integrity.numericFailureKind,
      numericFailureFactKey: integrity.numericFailureFactKey,
    };
  }

  if (input.sourceCoverage === "feed_summary") {
    const unsupportedLatinEntities = findUnsupportedFeedSummaryLatinEntities({
      sourceTitle: input.sourceTitle,
      sourceLead: input.sourceLead,
      sourceBody: input.sourceBody,
      translatedTitle: title,
      translatedLead: lead,
      translatedBody: body,
    });
    if (unsupportedLatinEntities.length > 0) {
      return {
        ok: false,
        reason: "translation_reuse_summary_unsupported_entity",
        providerId,
        model: input.model ?? undefined,
        unsupportedLatinEntities,
      };
    }
  }

  if (
    input.sourceCoverage === "feed_summary"
    && !isFeedSummaryTranslationBodyLengthAcceptable({
      sourceBody: input.sourceBody,
      translatedBody: body,
    })
  ) {
    return {
      ok: false,
      reason: "translation_reuse_summary_expansion_exceeded",
      providerId,
      model: input.model ?? undefined,
    };
  }

  return {
    ok: true,
    reused: true,
    translation: {
      title,
      lead,
      body,
      providerId,
      model: input.model?.trim() || "reused",
      sourceCoverage: input.sourceCoverage,
      quality: { persian: true, numericIntegrity: true, noAddedAdvice: true },
    },
  };
}

const SUMMARY_LATIN_ENTITY_STOPWORDS = new Set([
  "a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "is", "it",
  "of", "on", "or", "the", "to", "us", "with",
]);

function normalizeLatinEntityToken(token: string): string {
  const trimmed = token.trim();
  if (/^[A-Z][A-Z0-9]{1,}s$/.test(trimmed)) {
    return trimmed.slice(0, -1).toLowerCase();
  }
  return trimmed.toLowerCase();
}

function latinEntityTokens(value: string): Set<string> {
  const tokens = value.match(/\b[A-Za-z][A-Za-z0-9.+&]{1,}\b/g) ?? [];
  return new Set(
    tokens
      .map(normalizeLatinEntityToken)
      .filter((token) => !SUMMARY_LATIN_ENTITY_STOPWORDS.has(token)),
  );
}

export function findUnsupportedFeedSummaryLatinEntities(input: {
  sourceTitle: string;
  sourceLead: string;
  sourceBody: string;
  translatedTitle: string;
  translatedLead: string;
  translatedBody: string;
}): string[] {
  const source = latinEntityTokens([
    input.sourceTitle,
    input.sourceLead,
    input.sourceBody,
  ].join(" "));

  const translated = latinEntityTokens([
    input.translatedTitle,
    input.translatedLead,
    input.translatedBody,
  ].join(" "));

  return [...translated]
    .filter((token) => !source.has(token))
    .sort();
}

export function maxFeedSummaryTranslationBodyChars(sourceBody: string): number {
  const sourceLength = compact(sourceBody, 16_000).length;
  return Math.max(
    sourceLength + 120,
    Math.ceil(sourceLength * 1.35),
  );
}

export function isFeedSummaryTranslationBodyLengthAcceptable(input: {
  sourceBody: string;
  translatedBody: string;
}): boolean {
  return compact(input.translatedBody, MAX_PERSIAN_NEWS_BODY_CHARS).length
    <= maxFeedSummaryTranslationBodyChars(input.sourceBody);
}

function compact(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

export function compactNewsBodyAtSentenceBoundary(value: string, max = MAX_PERSIAN_NEWS_BODY_CHARS): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  if (max < 2) return normalized.slice(0, Math.max(0, max));

  const candidate = normalized.slice(0, max - 1);
  const minimumUsefulBoundary = Math.floor(candidate.length * 0.6);
  const punctuation = Math.max(
    candidate.lastIndexOf("."),
    candidate.lastIndexOf("!"),
    candidate.lastIndexOf("?"),
    candidate.lastIndexOf("؟"),
    candidate.lastIndexOf("؛"),
  );

  if (punctuation >= minimumUsefulBoundary) {
    return candidate.slice(0, punctuation + 1).trim();
  }

  const whitespace = candidate.lastIndexOf(" ");
  const cut = whitespace >= minimumUsefulBoundary ? whitespace : candidate.length;
  return `${candidate.slice(0, cut).trimEnd()}…`;
}

function normalizeDigits(value: string): string {
  const fa = "۰۱۲۳۴۵۶۷۸۹";
  const ar = "٠١٢٣٤٥٦٧٨٩";
  return value.replace(/[۰-۹٠-٩]/g, (digit) => {
    const faIndex = fa.indexOf(digit);
    return faIndex >= 0 ? String(faIndex) : String(ar.indexOf(digit));
  });
}

function decodeHtmlEntitiesForNumericFacts(value: string): string {
  return value
    .replace(/&#x([0-9a-f]{1,6});/gi, (_match, hex: string) => {
      const codePoint = Number.parseInt(hex, 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : "";
    })
    .replace(/&#(\d{1,6});/g, (_match, decimal: string) => {
      const codePoint = Number.parseInt(decimal, 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : "";
    })
    .replace(/&quot;/gi, "\"")
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&");
}

type CanonicalNumericFact = {
  value: string;
  sign: "positive" | "negative" | "unsigned";
  percent: boolean;
  magnitude: "thousand" | "million" | "billion" | "trillion" | null;
  currency: "USD" | "EUR" | "GBP" | null;
};

function canonicalDecimal(value: string): string {
  const normalized = value.replace(/,/g, "");
  const number = Number(normalized);
  if (!Number.isFinite(number)) return normalized;
  return String(number);
}

function visibleTextForNumericFacts(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[^]*?-->/g, " ")
    .replace(/<[^>]*>/g, " ");
}

function canonicalNumericFacts(value: string): CanonicalNumericFact[] {
  const normalized = normalizeDigits(
    decodeHtmlEntitiesForNumericFacts(visibleTextForNumericFacts(value)),
  )
    .replace(/٫/g, ".")
    .replace(/٬/g, ",")
    .replace(/٪/g, "%")
    .toLowerCase();

  const matches = Array.from(
    normalized.matchAll(
      /([+-])?\s*([$€£])?\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(\s*%)?/g,
    ),
  );
  const facts: CanonicalNumericFact[] = [];

  for (const match of matches.slice(0, 80)) {
    const index = match.index ?? 0;
    const end = index + match[0].length;
    const before = normalized.slice(Math.max(0, index - 24), index);
    const after = normalized.slice(end, Math.min(normalized.length, end + 40));

    const sharedRangePercent =
      /^\s*(?:تا|to\b|[-–—])\s*[+-]?\s*\d+(?:\.\d+)?\s*(?:%|(?:percent|percentage)\b|درصد(?=\s|$|[،؛,.!?؟]))/i.test(after);

    const percent =
      Boolean(match[4])
      || /^\s*(?:(?:percent|percentage)\b|درصد(?=\s|$|[،؛,.!?؟]))/i.test(after)
      || sharedRangePercent;

    let magnitude: CanonicalNumericFact["magnitude"] = null;
    let magnitudeMatch: RegExpMatchArray | null = null;
    let sharedRangeMagnitudeTail = "";

    if ((magnitudeMatch = after.match(/^\s*[-+]?\s*(?:(?:k|thousand)\b|هزار(?=\s|$|[،؛,.!?؟]))/i))) {
      magnitude = "thousand";
    } else if ((magnitudeMatch = after.match(/^\s*[-+]?\s*(?:(?:m|mn|million)\b|میلیون(?=\s|$|[،؛,.!?؟]))/i))) {
      magnitude = "million";
    } else if ((magnitudeMatch = after.match(/^\s*[-+]?\s*(?:(?:b|bn|billion)\b|میلیارد(?=\s|$|[،؛,.!?؟]))/i))) {
      magnitude = "billion";
    } else if ((magnitudeMatch = after.match(/^\s*[-+]?\s*(?:(?:t|tn|trillion)\b|تریلیون(?=\s|$|[،؛,.!?؟]))/i))) {
      magnitude = "trillion";
    } else {
      const sharedRangeMagnitudeMatch = after.match(
        /^\s*(?:تا|to\b|and\b|[-–—])\s*[+-]?\s*\d+(?:\.\d+)?\s*(?:(k|thousand|هزار)|(m|mn|million|میلیون)|(b|bn|billion|میلیارد)|(t|tn|trillion|تریلیون))(?=\s|$|[،؛,.!?؟])/i,
      );
      if (sharedRangeMagnitudeMatch) {
        if (sharedRangeMagnitudeMatch[1]) magnitude = "thousand";
        else if (sharedRangeMagnitudeMatch[2]) magnitude = "million";
        else if (sharedRangeMagnitudeMatch[3]) magnitude = "billion";
        else if (sharedRangeMagnitudeMatch[4]) magnitude = "trillion";
        sharedRangeMagnitudeTail = after.slice(sharedRangeMagnitudeMatch[0].length);
      }
    }

    const afterNumericPhrase = magnitudeMatch
      ? after.slice(magnitudeMatch[0].length)
      : sharedRangeMagnitudeTail || after;

    const usdPrefix =
      match[2] === "$"
      || /(?:^|[\s(])usd\s*$/i.test(before)
      || /دلار\s*$/.test(before);
    const eurPrefix =
      match[2] === "€"
      || /(?:^|[\s(])eur\s*$/i.test(before)
      || /یورو\s*$/.test(before);
    const gbpPrefix =
      match[2] === "£"
      || /(?:^|[\s(])gbp\s*$/i.test(before)
      || /پوند\s*$/.test(before);

    const usdSuffix =
      /^\s*(?:\$|usd\b|dollars?\b|دلار(?:ی)?(?=\s|$|[،؛,.!?؟]))/i.test(afterNumericPhrase);
    const eurSuffix =
      /^\s*(?:€|eur\b|euros?\b|euro\s+cents?\b|یورو(?:یی)?(?=\s|$|[،؛,.!?؟])|سنت(?:\s|\u200c)+یورو(?=\s|$|[،؛,.!?؟]))/i.test(afterNumericPhrase);
    const gbpSuffix =
      /^\s*(?:£|gbp\b|pounds?\b|پوند(?:ی)?(?=\s|$|[،؛,.!?؟]))/i.test(afterNumericPhrase);

    let currency: CanonicalNumericFact["currency"] = null;
    if (usdPrefix || usdSuffix) currency = "USD";
    else if (eurPrefix || eurSuffix) currency = "EUR";
    else if (gbpPrefix || gbpSuffix) currency = "GBP";

    const precedingNonWhitespace = normalized.slice(0, index).match(/\S(?=\s*$)/)?.[0] ?? "";
    const immediatelyBefore = index > 0 ? normalized[index - 1] : "";
    const hyphenIsNonSignSeparator =
      match[1] === "-"
      && (
        /[a-z0-9]/i.test(immediatelyBefore)
        || /\d/.test(precedingNonWhitespace)
      );

    facts.push({
      value: canonicalDecimal(match[3]),
      sign:
        match[1] === "-" && !hyphenIsNonSignSeparator
          ? "negative"
          : match[1] === "+"
            ? "positive"
            : "unsigned",
      percent,
      magnitude,
      currency,
    });
  }

  const quarterMatches = Array.from(normalized.matchAll(/\bq([1-4])\b|(?:سه[\s\u200c-]*ماهه|فصل|ربع)\s+(اول|نخست|دوم|سوم|چهارم)(?=\s|$|[،؛,.!?؟])/gi));
  for (const match of quarterMatches.slice(0, 20)) {
    const persianOrdinal = match[2];
    const value = match[1]
      ?? (persianOrdinal === "اول" || persianOrdinal === "نخست"
        ? "1"
        : persianOrdinal === "دوم"
          ? "2"
          : persianOrdinal === "سوم"
            ? "3"
            : "4");
    facts.push({
      value,
      sign: "unsigned",
      percent: false,
      magnitude: null,
      currency: null,
    });
  }

  const key = (fact: CanonicalNumericFact) =>
    [fact.value, fact.sign, fact.percent ? "percent" : "scalar", fact.magnitude ?? "-", fact.currency ?? "-"].join("|");

  return Array.from(new Map(facts.map((fact) => [key(fact), fact])).values()).slice(0, 40);
}

function numericFactKey(fact: CanonicalNumericFact): string {
  return [
    fact.value,
    fact.sign,
    fact.percent ? "percent" : "scalar",
    fact.magnitude ?? "-",
    fact.currency ?? "-",
  ].join("|");
}

function numericFactAbsoluteValue(fact: CanonicalNumericFact): number | null {
  const value = Number(fact.value);
  if (!Number.isFinite(value)) return null;
  const multiplier =
    fact.magnitude === "thousand"
      ? 1_000
      : fact.magnitude === "million"
        ? 1_000_000
        : fact.magnitude === "billion"
          ? 1_000_000_000
          : fact.magnitude === "trillion"
            ? 1_000_000_000_000
            : 1;
  return value * multiplier;
}

function numericFactsEquivalent(left: CanonicalNumericFact, right: CanonicalNumericFact): boolean {
  if (
    left.sign !== right.sign
    || left.percent !== right.percent
    || left.currency !== right.currency
  ) {
    return false;
  }

  if (numericFactKey(left) === numericFactKey(right)) return true;

  const leftAbsolute = numericFactAbsoluteValue(left);
  const rightAbsolute = numericFactAbsoluteValue(right);
  return (
    leftAbsolute !== null
    && rightAbsolute !== null
    && Number.isSafeInteger(leftAbsolute)
    && Number.isSafeInteger(rightAbsolute)
    && leftAbsolute === rightAbsolute
  );
}

function hasPersian(value: string): boolean {
  return /[آ-ی]/.test(value);
}

function safeJsonObject(value: string): Record<string, unknown> | null {
  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function validatePersianNewsTranslationIntegrity(input: {
  sourceTitle: string;
  sourceLead: string;
  sourceBody: string;
  translatedTitle: string;
  translatedLead: string;
  translatedBody: string;
}): { ok: true } | {
  ok: false;
  reason: "language_or_shape_invalid" | "added_financial_advice" | "numeric_integrity_failed";
  numericFailureKind?: NewsTranslationNumericFailureKind;
  numericFailureFactKey?: string;
} {
  const translatedTitle = compact(input.translatedTitle, 500);
  const translatedLead = compact(input.translatedLead, 4_000);
  const translatedBody = compactNewsBodyAtSentenceBoundary(
    input.translatedBody,
    MAX_PERSIAN_NEWS_BODY_CHARS,
  );
  const translatedText = `${translatedTitle} ${translatedLead} ${translatedBody}`;
  if (!translatedTitle || !translatedLead || !translatedBody || !hasPersian(translatedText)) {
    return { ok: false, reason: "language_or_shape_invalid" };
  }
  if (/(سیگنال\s+(خرید|فروش)|سود\s+تضمینی|حتماً\s+(بخرید|بفروشید))/i.test(translatedText)) {
    return { ok: false, reason: "added_financial_advice" };
  }
  const sourceTitleFacts = canonicalNumericFacts(input.sourceTitle);
  const sourceLeadFacts = canonicalNumericFacts(input.sourceLead);
  const translatedTitleFacts = canonicalNumericFacts(translatedTitle);
  const translatedLeadFacts = canonicalNumericFacts(translatedLead);
  const allowedSourceFactList = [
    ...canonicalNumericFacts(input.sourceTitle),
    ...canonicalNumericFacts(input.sourceLead),
    ...canonicalNumericFacts(input.sourceBody),
  ];
  const translatedFacts = [
    ...canonicalNumericFacts(translatedTitle),
    ...canonicalNumericFacts(translatedLead),
    ...canonicalNumericFacts(translatedBody),
  ];

  const missingTitleFact = sourceTitleFacts.find(
    (fact) => !translatedTitleFacts.some((translatedFact) => numericFactsEquivalent(fact, translatedFact)),
  );
  if (missingTitleFact) {
    return {
      ok: false,
      reason: "numeric_integrity_failed",
      numericFailureKind: "missing_title_fact",
      numericFailureFactKey: numericFactKey(missingTitleFact),
    };
  }

  const missingLeadFact = sourceLeadFacts.find(
    (fact) => !translatedLeadFacts.some((translatedFact) => numericFactsEquivalent(fact, translatedFact)),
  );
  if (missingLeadFact) {
    return {
      ok: false,
      reason: "numeric_integrity_failed",
      numericFailureKind: "missing_lead_fact",
      numericFailureFactKey: numericFactKey(missingLeadFact),
    };
  }

  const inventedNumericFact = translatedFacts.find(
    (fact) => !allowedSourceFactList.some((sourceFact) => numericFactsEquivalent(fact, sourceFact)),
  );
  if (inventedNumericFact) {
    return {
      ok: false,
      reason: "numeric_integrity_failed",
      numericFailureKind: "invented_numeric_fact",
      numericFailureFactKey: numericFactKey(inventedNumericFact),
    };
  }
  return { ok: true };
}

function routeConfig(): {
  providerId: "openai" | "anthropic" | "openrouter";
  apiKey: string;
  model: string;
  fallbackModel?: string;
} | null {
  const requested = (process.env.NEWS_TRANSLATION_PROVIDER ?? "openai").trim().toLowerCase();
  if (requested === "openai") {
    const apiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
    if (!apiKey) return null;
    return {
      providerId: "openai",
      apiKey,
      model: process.env.NEWS_TRANSLATION_MODEL?.trim() || "gpt-4.1-mini",
      fallbackModel: process.env.NEWS_TRANSLATION_FALLBACK_MODEL?.trim() || undefined,
    };
  }
  if (requested === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim() ?? "";
    const model = process.env.NEWS_TRANSLATION_MODEL?.trim() ?? "";
    if (!apiKey || !model) return null;
    return { providerId: "anthropic", apiKey, model, fallbackModel: process.env.NEWS_TRANSLATION_FALLBACK_MODEL?.trim() || undefined };
  }
  if (requested === "openrouter") {
    const apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
    const model = process.env.NEWS_TRANSLATION_MODEL?.trim() ?? "";
    if (!apiKey || !model) return null;
    return { providerId: "openrouter", apiKey, model, fallbackModel: process.env.NEWS_TRANSLATION_FALLBACK_MODEL?.trim() || undefined };
  }
  return null;
}

export async function translateNewsFeedToPersian(input: {
  title: string;
  lead: string;
  body: string;
  sourceName: string;
  sourceUrl: string;
  sourceCoverage: "feed_full" | "feed_summary" | "article_full";
  requestSignal?: AbortSignal;
}, dependencies: AiProviderRouterDependencies = {}): Promise<NewsTranslationResult> {
  const config = routeConfig();
  if (!config) return { ok: false, reason: "translation_provider_unavailable" };
  const title = compact(input.title, 500);
  const lead = compact(input.lead, 4_000);
  const body = compact(input.body, 16_000);

  const hasFullEvidence = input.sourceCoverage === "feed_full" || input.sourceCoverage === "article_full";
  const sourceBodyLength = body.length;

  const baseInstructions = [
    "You are TecPey's governed Persian news editor and translator.",
    "Use only the publisher-provided evidence supplied in this request. Do not browse, add unsupported facts, predict prices, or give financial advice.",
    hasFullEvidence
      ? "For full publisher evidence, produce a complete, fluent Persian editorial rendering rather than a compressed summary. Preserve the factual scope and sequence of the source while using natural professional Persian prose."
      : "For summary-only publisher evidence, translate faithfully without artificially expanding the text or inventing context.",
    "Preserve proper nouns, tickers, dates, quantities, percentages, monetary amounts, time windows, reporting periods and uncertainty exactly in meaning.",
    "Field-level numeric contract: every number, percentage, amount, currency, magnitude, ticker quantity and reporting-period marker present in the source title must remain in the Persian title; every one present in the source lead must remain in the Persian lead.",
    "Do not move numbers between title, lead and body. Do not summarize away numeric facts even when the prose sounds repetitive.",
    "Return strict JSON only with keys title, lead, body. All three values must be Persian prose; keep unavoidable proper nouns/tickers in Latin script.",
    "The body must remain fully grounded in the supplied publisher body. Remove navigation, subscription prompts, unrelated boilerplate and obvious repetition, but do not add facts or change meaning.",
    hasFullEvidence
      ? "When full publisher evidence is available, preserve materially all substantive facts, quotations in paraphrased form, dates, quantities, entities, causal statements, uncertainty and chronology. Do not collapse the article into the lead."
      : "Keep the body materially distinct from the lead only when the supplied publisher body contains additional information beyond the lead.",
    hasFullEvidence
      ? `Target a Persian body length broadly comparable to the useful source evidence, normally about 65% to 115% of the source body character count, while never exceeding ${MAX_PERSIAN_NEWS_BODY_CHARS} characters. Do not pad the article merely to hit a length target.`
      : "When the supplied publisher body repeats the lead, the Persian body may repeat or closely match the Persian lead; never expand it just to make it distinct.",
    "Use clear, polished Persian newsroom prose with natural crypto/finance terminology and preserve relevant keywords organically. Do not keyword-stuff.",
    "The Persian body must remain evidence-bound; do not introduce TecPey opinions, causal interpretation not present in the source, or market-impact analysis into the translated news body.",
    `Absolute body limit: ${MAX_PERSIAN_NEWS_BODY_CHARS} characters. Prefer complete sentences and preserve the most material factual information, dates, quantities and uncertainty.`,
  ];

  const runTranslation = async (extraInstructions: string[] = []): Promise<NewsTranslationResult> => {
    const routed = await callAiProvider({
      providerId: config.providerId,
      agentId: "content_reviewer",
      apiKey: config.apiKey,
      model: config.model,
      fallbackModel: config.fallbackModel,
      instructions: [
        ...baseInstructions,
        ...extraInstructions,
      ].join(" "),
      input: JSON.stringify({
        source: input.sourceName,
        sourceUrl: input.sourceUrl,
        sourceCoverage: input.sourceCoverage,
        sourceBodyCharacterCount: sourceBodyLength,
        title,
        lead,
        body,
      }),
      timeoutMs: 20_000,
      maxOutputTokens: 3_200,
      dataClass: "public",
      circuitScope: `news-translation:public:${input.sourceName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "unknown"}`,
      toolsEnabled: false,
      requireZeroDataRetention: true,
      requestSignal: input.requestSignal,
    }, dependencies);

    if (!routed.ok) {
      return {
        ok: false,
        reason: `translation_${routed.reason}`,
        providerId: config.providerId,
        model: routed.model ?? config.model,
      };
    }

    const parsed = safeJsonObject(routed.text);
    const translatedTitle = typeof parsed?.title === "string" ? compact(parsed.title, 500) : "";
    const translatedLead = typeof parsed?.lead === "string" ? compact(parsed.lead, 4_000) : "";
    const translatedBody = typeof parsed?.body === "string"
      ? compactNewsBodyAtSentenceBoundary(parsed.body, MAX_PERSIAN_NEWS_BODY_CHARS)
      : "";
    const integrity = validatePersianNewsTranslationIntegrity({
      sourceTitle: title,
      sourceLead: lead,
      sourceBody: body,
      translatedTitle,
      translatedLead,
      translatedBody,
    });

    if (!integrity.ok) {
      return {
        ok: false,
        reason: `translation_${integrity.reason}`,
        providerId: routed.providerId,
        model: routed.model,
        numericFailureKind: integrity.numericFailureKind,
        numericFailureFactKey: integrity.numericFailureFactKey,
      };
    }

    if (input.sourceCoverage === "feed_summary") {
      const unsupportedLatinEntities = findUnsupportedFeedSummaryLatinEntities({
        sourceTitle: title,
        sourceLead: lead,
        sourceBody: body,
        translatedTitle,
        translatedLead,
        translatedBody,
      });
      if (unsupportedLatinEntities.length > 0) {
        return {
          ok: false,
          reason: "translation_summary_unsupported_entity",
          providerId: routed.providerId,
          model: routed.model,
          unsupportedLatinEntities,
        };
      }
    }

    if (
      input.sourceCoverage === "feed_summary"
      && !isFeedSummaryTranslationBodyLengthAcceptable({
        sourceBody: body,
        translatedBody: translatedBody,
      })
    ) {
      return {
        ok: false,
        reason: "translation_summary_expansion_exceeded",
        providerId: routed.providerId,
        model: routed.model,
      };
    }

    return {
      ok: true,
      translation: {
        title: translatedTitle,
        lead: translatedLead,
        body: translatedBody,
        providerId: routed.providerId as "openai" | "anthropic" | "openrouter",
        model: routed.model,
        sourceCoverage: input.sourceCoverage,
        quality: { persian: true, numericIntegrity: true, noAddedAdvice: true },
      },
      route: routed,
    };
  };

  const first = await runTranslation();

  if (!first.ok && first.reason === "translation_summary_unsupported_entity") {
    return runTranslation([
      "Repair pass: the previous Persian translation introduced Latin-script names, abbreviations, tickers, products, institutions or entities that are absent from the supplied publisher evidence.",
      "Regenerate the JSON using only entities explicitly present in the supplied title, lead and body.",
      "Do not add background institutions, regulators, products, protocols, people, organizations, tickers or acronyms from prior knowledge.",
      "If an entity is not explicitly present in the supplied evidence, omit it.",
      "Do not browse, infer continuation, or reconstruct the rest of a truncated article.",
    ]);
  }

  if (!first.ok && first.reason === "translation_summary_expansion_exceeded") {
    return runTranslation([
      "Repair pass: the previous Persian body expanded beyond the supplied summary evidence.",
      "Regenerate the JSON using only facts explicitly present in the supplied title, lead and body.",
      "For summary-only evidence, do not add background knowledge, regulatory next steps, inferred context, explanations, future plans, institutions, dates, products, or consequences that are absent from the supplied evidence.",
      `Keep the Persian body at or below ${maxFeedSummaryTranslationBodyChars(body)} characters while preserving every material fact actually present in the supplied publisher body.`,
      "Do not pad the text. Do not browse. Do not infer missing continuation from a truncated publisher snippet.",
    ]);
  }

  if (
    !first.ok
    && first.reason === "translation_numeric_integrity_failed"
    && first.numericFailureKind
  ) {
    const repairInstructions =
      first.numericFailureKind === "invented_numeric_fact"
        ? [
            `Repair pass: the previous translation introduced numeric fact ${first.numericFailureFactKey ?? "unknown"} that does not exactly match any canonical numeric fact in the supplied publisher evidence.`,
            "Regenerate all JSON fields from the original source. For every numeric expression, preserve its complete source meaning: numeric value, sign, percent marker, currency, and magnitude such as thousand/million/billion/trillion.",
            "Before deleting the flagged number, check whether the same value exists in the source with a missing qualifier. For example, $736,000 must remain ۷۳۶ هزار دلار, 19% must remain ۱۹ درصد, and $1.3 million must remain ۱٫۳ میلیون دلار.",
            "If the flagged value truly does not exist anywhere in the supplied source evidence, remove it. Never repair it by guessing a different number or qualifier.",
            "Do not add commentary, predictions, advice, or change the publisher's meaning.",
          ]
        : (() => {
            const failedField = first.numericFailureKind === "missing_title_fact" ? "title" : "lead";
            const sourceField = failedField === "title" ? title : lead;
            return [
              `Repair pass: the previous translation failed because numeric fact ${first.numericFailureFactKey ?? "unknown"} was missing from the Persian ${failedField}.`,
              `The authoritative source ${failedField} is exactly: ${JSON.stringify(sourceField)}.`,
              `Regenerate the JSON from the original evidence, with special attention to the Persian ${failedField}. Every numeric fact in that source ${failedField} must remain in the Persian ${failedField}, including dates, day numbers, percentages, currencies and magnitudes.`,
              `The required fact ${first.numericFailureFactKey ?? "unknown"} must be explicitly represented in the Persian ${failedField}; do not paraphrase it away or move it to another field.`,
              "Do not add commentary, do not invent replacement numbers, and do not change meaning.",
            ];
          })();

    return runTranslation(repairInstructions);
  }

  return first;
}
