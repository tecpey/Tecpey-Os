import { callAiProvider, type AiProviderCallResult } from "./ai/provider-router";

export type PersianNewsTranslation = {
  title: string;
  lead: string;
  body: string;
  providerId: "openai" | "anthropic" | "openrouter";
  model: string;
  sourceCoverage: "feed_full" | "feed_summary";
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
  };

export const MAX_PERSIAN_NEWS_BODY_CHARS = 6_000;

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
  sourceCoverage: "feed_full" | "feed_summary";
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

function canonicalNumericFacts(value: string): CanonicalNumericFact[] {
  const normalized = normalizeDigits(decodeHtmlEntitiesForNumericFacts(value))
    .replace(/٫/g, ".")
    .replace(/٬/g, ",")
    .replace(/٪/g, "%")
    .toLowerCase();

  const matches = Array.from(normalized.matchAll(/([+-])?\s*([$€£])?\s*(\d+(?:[.,]\d+)?)(\s*%)?/g));
  const facts: CanonicalNumericFact[] = [];

  for (const match of matches.slice(0, 80)) {
    const index = match.index ?? 0;
    const end = index + match[0].length;
    const before = normalized.slice(Math.max(0, index - 24), index);
    const after = normalized.slice(end, Math.min(normalized.length, end + 40));

    const percent =
      Boolean(match[4])
      || /^\s*(?:(?:percent|percentage)\b|درصد(?=\s|$|[،؛,.!?؟]))/i.test(after);

    let magnitude: CanonicalNumericFact["magnitude"] = null;
    let magnitudeMatch: RegExpMatchArray | null = null;

    if ((magnitudeMatch = after.match(/^\s*(?:(?:k|thousand)\b|هزار(?=\s|$|[،؛,.!?؟]))/i))) {
      magnitude = "thousand";
    } else if ((magnitudeMatch = after.match(/^\s*(?:(?:m|mn|million)\b|میلیون(?=\s|$|[،؛,.!?؟]))/i))) {
      magnitude = "million";
    } else if ((magnitudeMatch = after.match(/^\s*(?:(?:b|bn|billion)\b|میلیارد(?=\s|$|[،؛,.!?؟]))/i))) {
      magnitude = "billion";
    } else if ((magnitudeMatch = after.match(/^\s*(?:(?:t|tn|trillion)\b|تریلیون(?=\s|$|[،؛,.!?؟]))/i))) {
      magnitude = "trillion";
    }

    const afterNumericPhrase = magnitudeMatch
      ? after.slice(magnitudeMatch[0].length)
      : after;

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
      /^\s*(?:\$|usd\b|dollars?\b|دلار(?=\s|$|[،؛,.!?؟]))/i.test(afterNumericPhrase);
    const eurSuffix =
      /^\s*(?:€|eur\b|euros?\b|یورو(?=\s|$|[،؛,.!?؟]))/i.test(afterNumericPhrase);
    const gbpSuffix =
      /^\s*(?:£|gbp\b|pounds?\b|پوند(?=\s|$|[،؛,.!?؟]))/i.test(afterNumericPhrase);

    let currency: CanonicalNumericFact["currency"] = null;
    if (usdPrefix || usdSuffix) currency = "USD";
    else if (eurPrefix || eurSuffix) currency = "EUR";
    else if (gbpPrefix || gbpSuffix) currency = "GBP";

    facts.push({
      value: canonicalDecimal(match[3]),
      sign: match[1] === "-" ? "negative" : match[1] === "+" ? "positive" : "unsigned",
      percent,
      magnitude,
      currency,
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
  const allowedSourceFacts = new Set(
    [
      ...canonicalNumericFacts(input.sourceTitle),
      ...canonicalNumericFacts(input.sourceLead),
      ...canonicalNumericFacts(input.sourceBody),
    ].map(numericFactKey),
  );
  const translatedTitleFacts = new Set(canonicalNumericFacts(translatedTitle).map(numericFactKey));
  const translatedLeadFacts = new Set(canonicalNumericFacts(translatedLead).map(numericFactKey));
  const translatedFacts = [
    ...canonicalNumericFacts(translatedTitle),
    ...canonicalNumericFacts(translatedLead),
    ...canonicalNumericFacts(translatedBody),
  ];

  const missingTitleFact = sourceTitleFacts.find((fact) => !translatedTitleFacts.has(numericFactKey(fact)));
  if (missingTitleFact) {
    return {
      ok: false,
      reason: "numeric_integrity_failed",
      numericFailureKind: "missing_title_fact",
    };
  }

  const missingLeadFact = sourceLeadFacts.find((fact) => !translatedLeadFacts.has(numericFactKey(fact)));
  if (missingLeadFact) {
    return {
      ok: false,
      reason: "numeric_integrity_failed",
      numericFailureKind: "missing_lead_fact",
    };
  }

  const inventedNumericFact = translatedFacts.find((fact) => !allowedSourceFacts.has(numericFactKey(fact)));
  if (inventedNumericFact) {
    return {
      ok: false,
      reason: "numeric_integrity_failed",
      numericFailureKind: "invented_numeric_fact",
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
  sourceCoverage: "feed_full" | "feed_summary";
  requestSignal?: AbortSignal;
}): Promise<NewsTranslationResult> {
  const config = routeConfig();
  if (!config) return { ok: false, reason: "translation_provider_unavailable" };
  const title = compact(input.title, 500);
  const lead = compact(input.lead, 4_000);
  const body = compact(input.body, 16_000);
  const routed = await callAiProvider({
    providerId: config.providerId,
    agentId: "content_reviewer",
    apiKey: config.apiKey,
    model: config.model,
    fallbackModel: config.fallbackModel,
    instructions: [
      "You are TecPey's governed Persian news translator.",
      "Translate only the publisher-provided feed text. Do not browse, add facts, predict prices, give financial advice, or rewrite it as TecPey reporting.",
      "Preserve proper nouns, tickers, dates, quantities, percentages, monetary amounts, time windows, reporting periods and uncertainty exactly in meaning.",
      "Field-level numeric contract: every number, percentage, amount, currency, magnitude, ticker quantity and reporting-period marker present in the source title must remain in the Persian title; every one present in the source lead must remain in the Persian lead.",
      "Do not move numbers between title, lead and body. Do not summarize away numeric facts even when the prose sounds repetitive.",
      "Return strict JSON only with keys title, lead, body. All three values must be Persian prose; keep unavoidable proper nouns/tickers in Latin script.",
      "The body must be a faithful, information-dense Persian rendering of the publisher-provided body text. Condense repetition and boilerplate, but do not add facts or change meaning.",
      "Keep the body materially distinct from the lead when the supplied body contains additional information.",
      `Keep the body concise and at most ${MAX_PERSIAN_NEWS_BODY_CHARS} characters; prefer complete sentences and preserve the most material factual information, dates, quantities and uncertainty.`,
    ].join(" "),
    input: JSON.stringify({
      source: input.sourceName,
      sourceUrl: input.sourceUrl,
      sourceCoverage: input.sourceCoverage,
      title,
      lead,
      body,
    }),
    timeoutMs: 20_000,
    maxOutputTokens: 3_200,
    dataClass: "public",
    circuitScope: "news-translation:public",
    toolsEnabled: false,
    requireZeroDataRetention: true,
    requestSignal: input.requestSignal,
  });
  if (!routed.ok) {
    return { ok: false, reason: `translation_${routed.reason}`, providerId: config.providerId, model: routed.model ?? config.model };
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
}
