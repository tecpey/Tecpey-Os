import { callAiProvider, type AiProviderRouterDependencies } from "./provider-router";
import { validatePersianNewsEditorialQuality } from "./news-editorial-quality";
import {
  compactNewsBodyAtSentenceBoundary,
  MAX_PERSIAN_NEWS_BODY_CHARS,
  validatePersianNewsTranslationIntegrity,
  type NewsTranslationProviderConfig,
  type PersianNewsTranslation,
} from "../news-translation";

export type NewsTickerRepairResult =
  | { ok: true; translation: PersianNewsTranslation }
  | { ok: false; reason: string };

function compact(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function safeJsonObject(value: string): Record<string, unknown> | null {
  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

/**
 * One bounded provider repair for a translation that already passed the normal
 * translation integrity authority but failed only because source-grounded market
 * tickers disappeared from the Persian rendering. The repaired output must pass
 * both deterministic authorities again; nothing is patched into prose locally.
 */
export async function repairMissingNewsTickers(input: {
  sourceTitle: string;
  sourceLead: string;
  sourceBody: string;
  sourceName: string;
  sourceUrl: string;
  missingTickers: readonly string[];
  translation: PersianNewsTranslation;
}, dependencies: AiProviderRouterDependencies & {
  providerConfig: NewsTranslationProviderConfig;
}): Promise<NewsTickerRepairResult> {
  const missingTickers = [...new Set(input.missingTickers.map((ticker) => ticker.trim()).filter(Boolean))]
    .sort()
    .slice(0, 16);
  if (missingTickers.length === 0) return { ok: false, reason: "ticker_repair_missing_authority" };

  const routed = await callAiProvider({
    providerId: dependencies.providerConfig.providerId,
    agentId: "content_reviewer",
    apiKey: dependencies.providerConfig.apiKey,
    model: dependencies.providerConfig.model,
    fallbackModel: dependencies.providerConfig.fallbackModel,
    instructions: [
      "You are TecPey's governed Persian news translation repair editor.",
      "Repair the supplied Persian JSON only; use only the supplied publisher evidence.",
      `The deterministic authority proved these source tickers are missing from the Persian rendering: ${missingTickers.join(", ")}.`,
      "Regenerate title, lead and body as natural Persian while preserving every listed ticker verbatim in Latin uppercase wherever its source fact is represented; a natural form such as بیت‌کوین (BTC) is acceptable.",
      "Do not append a ticker as an unrelated token. Do not invent any ticker, entity, number, date, percentage, currency, magnitude, claim, advice or context.",
      "Preserve every existing source-grounded numeric fact and its field placement. Do not move facts between title, lead and body.",
      "Return strict JSON only with keys title, lead, body.",
    ].join(" "),
    input: JSON.stringify({
      source: input.sourceName,
      sourceUrl: input.sourceUrl,
      publisherEvidence: {
        title: input.sourceTitle,
        lead: input.sourceLead,
        body: input.sourceBody,
      },
      previousPersianTranslation: {
        title: input.translation.title,
        lead: input.translation.lead,
        body: input.translation.body,
      },
      requiredSourceTickers: missingTickers,
    }),
    timeoutMs: 20_000,
    maxOutputTokens: 3_200,
    dataClass: "public",
    circuitScope: `news-ticker-repair:public:${input.sourceName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "unknown"}`,
    toolsEnabled: false,
    requireZeroDataRetention: true,
  }, dependencies);

  if (!routed.ok) return { ok: false, reason: `ticker_repair_${routed.reason}` };

  const parsed = safeJsonObject(routed.text);
  const translatedTitle = typeof parsed?.title === "string" ? compact(parsed.title, 500) : "";
  const translatedLead = typeof parsed?.lead === "string" ? compact(parsed.lead, 4_000) : "";
  const translatedBody = typeof parsed?.body === "string"
    ? compactNewsBodyAtSentenceBoundary(parsed.body, MAX_PERSIAN_NEWS_BODY_CHARS)
    : "";

  const integrity = validatePersianNewsTranslationIntegrity({
    sourceTitle: input.sourceTitle,
    sourceLead: input.sourceLead,
    sourceBody: input.sourceBody,
    translatedTitle,
    translatedLead,
    translatedBody,
  });
  if (!integrity.ok) return { ok: false, reason: `ticker_repair_translation_${integrity.reason}` };

  const editorial = validatePersianNewsEditorialQuality({
    sourceTitle: input.sourceTitle,
    sourceLead: input.sourceLead,
    sourceBody: input.sourceBody,
    translatedTitle,
    translatedLead,
    translatedBody,
  });
  if (!editorial.ok) return { ok: false, reason: `ticker_repair_editorial_${editorial.reason}` };

  return {
    ok: true,
    translation: {
      ...input.translation,
      title: translatedTitle,
      lead: translatedLead,
      body: translatedBody,
      providerId: routed.providerId as PersianNewsTranslation["providerId"],
      model: routed.model,
    },
  };
}
