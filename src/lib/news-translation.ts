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

export type NewsTranslationResult =
  | { ok: true; translation: PersianNewsTranslation; route?: AiProviderCallResult; reused?: boolean }
  | { ok: false; reason: string; providerId?: string; model?: string; retryDeferredUntil?: string };

export const MAX_PERSIAN_NEWS_BODY_CHARS = 6_000;

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
    return { ok: false, reason: `translation_reuse_${integrity.reason}`, providerId, model: input.model ?? undefined };
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

function numericalTokens(value: string): string[] {
  const normalized = normalizeDigits(value)
    .replace(/٫/g, ".")
    .replace(/٬/g, ",")
    .replace(/٪/g, "%");
  return Array.from(new Set(
    normalized
      .match(/\b\d+(?:[.,]\d+)?%?/g)
      ?.map((token) => token.replace(/,/g, "")) ?? [],
  )).filter((token) => token.length >= 1).slice(0, 40);
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
}): { ok: true } | { ok: false; reason: "language_or_shape_invalid" | "added_financial_advice" | "numeric_integrity_failed" } {
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
  const sourceTitleNumbers = numericalTokens(input.sourceTitle);
  const sourceLeadNumbers = numericalTokens(input.sourceLead);
  const allowedSourceNumbers = new Set(numericalTokens(`${input.sourceTitle} ${input.sourceLead} ${input.sourceBody}`));
  const translatedTitleNumbers = new Set(numericalTokens(translatedTitle));
  const translatedLeadNumbers = new Set(numericalTokens(translatedLead));
  const translatedNumbers = numericalTokens(translatedText);

  if (
    sourceTitleNumbers.some((token) => !translatedTitleNumbers.has(token))
    || sourceLeadNumbers.some((token) => !translatedLeadNumbers.has(token))
    || translatedNumbers.some((token) => !allowedSourceNumbers.has(token))
  ) {
    return { ok: false, reason: "numeric_integrity_failed" };
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
      "Preserve proper nouns, tickers, dates, quantities, percentages and uncertainty exactly in meaning.",
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
    return { ok: false, reason: `translation_${integrity.reason}`, providerId: routed.providerId, model: routed.model };
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
