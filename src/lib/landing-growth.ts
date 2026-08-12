import { coinPages, type CoinPage } from "@/data/coins";
import { type ContentLocale } from "./content-growth";
import { getNewsImpactDetailPath, getNewsImpactHistoryItems, type NewsImpactHistoryItem } from "./news-impact-history";
import { getFeaturedTraderTools, type RankedTraderTool } from "./trading-tools-growth";

export type LandingGrowthCoin = CoinPage & {
  impactNews: NewsImpactHistoryItem;
  impactRankScore: number;
  latestImpactTitle: string;
  newsDetailPath: string;
};

export type LandingGrowthEvidenceStatus = "ready" | "degraded";
export type LandingGrowthSourceAuthority =
  | "news-impact-history:materialized"
  | "news-impact-history:partial-seed-merged"
  | "news-impact-history:seed-fallback";

export type LandingGrowthEvidence = Readonly<{
  updatedAt: string;
  sourceAuthority: LandingGrowthSourceAuthority;
  requiredCoinCount: number;
  requiredToolCount: number;
  coinCount: number;
  toolCount: number;
  highPriorityNewsCount: number;
  authorityHighPriorityNewsCount: number;
  authorityFreshnessAgeMs: number | null;
  status: LandingGrowthEvidenceStatus;
}>;

export type LandingGrowthEvidenceInput = Readonly<{
  sourceAuthority?: LandingGrowthSourceAuthority;
  authorityUpdatedAt?: string | null;
  authorityHighPriorityNewsCount?: number;
  maxAuthorityAgeMs?: number;
  now?: Date | string;
}>;

const REQUIRED_LANDING_COIN_COUNT = 5;
const REQUIRED_LANDING_TOOL_COUNT = 5;
const HIGH_PRIORITY_NEWS_THRESHOLD = 75;
const LANDING_GROWTH_FALLBACK_UPDATED_AT = "2026-08-09T08:00:00.000Z";
const LANDING_GROWTH_MAX_AUTHORITY_AGE_MS = 24 * 60 * 60 * 1000;

function resolveLandingGrowthUpdatedAt(newsItems: NewsImpactHistoryItem[]) {
  const latest = newsItems
    .flatMap((item) => [item.recordedAt, item.publishedAt])
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)[0];

  return latest ? new Date(latest).toISOString() : LANDING_GROWTH_FALLBACK_UPDATED_AT;
}

function buildLandingGrowthEvidence({
  coins,
  tools,
  newsItems,
  input,
}: {
  coins: LandingGrowthCoin[];
  tools: RankedTraderTool[];
  newsItems: NewsImpactHistoryItem[];
  input?: LandingGrowthEvidenceInput;
}): LandingGrowthEvidence {
  const highPriorityNewsCount = newsItems.filter(
    (item) => item.priority >= HIGH_PRIORITY_NEWS_THRESHOLD,
  ).length;
  const sourceAuthority = input?.sourceAuthority ?? "news-impact-history:seed-fallback";
  const authorityHighPriorityNewsCount = input?.authorityHighPriorityNewsCount ?? 0;
  const authorityUpdatedAt = input?.authorityUpdatedAt ?? null;
  const nowMs = input?.now ? Date.parse(String(input.now)) : Date.now();
  const authorityUpdatedAtMs = authorityUpdatedAt ? Date.parse(authorityUpdatedAt) : Number.NaN;
  const authorityFreshnessAgeMs = Number.isFinite(nowMs) && Number.isFinite(authorityUpdatedAtMs)
    ? Math.max(0, nowMs - authorityUpdatedAtMs)
    : null;
  const maxAuthorityAgeMs = input?.maxAuthorityAgeMs ?? LANDING_GROWTH_MAX_AUTHORITY_AGE_MS;
  const hasFreshMaterializedAuthority =
    sourceAuthority === "news-impact-history:materialized" &&
    authorityHighPriorityNewsCount >= REQUIRED_LANDING_COIN_COUNT &&
    authorityFreshnessAgeMs !== null &&
    authorityFreshnessAgeMs <= maxAuthorityAgeMs;
  const status =
    coins.length >= REQUIRED_LANDING_COIN_COUNT &&
    tools.length >= REQUIRED_LANDING_TOOL_COUNT &&
    highPriorityNewsCount >= REQUIRED_LANDING_COIN_COUNT &&
    hasFreshMaterializedAuthority
      ? "ready"
      : "degraded";

  return {
    updatedAt: resolveLandingGrowthUpdatedAt(newsItems),
    sourceAuthority,
    requiredCoinCount: REQUIRED_LANDING_COIN_COUNT,
    requiredToolCount: REQUIRED_LANDING_TOOL_COUNT,
    coinCount: coins.length,
    toolCount: tools.length,
    highPriorityNewsCount,
    authorityHighPriorityNewsCount,
    authorityFreshnessAgeMs,
    status,
  };
}

export function getFeaturedLandingCoins(
  locale: ContentLocale,
  limit = 5,
): LandingGrowthCoin[] {
  return getFeaturedLandingCoinsFromNewsItems(locale, getNewsImpactHistoryItems(locale), limit);
}

export function getFeaturedLandingCoinsFromNewsItems(
  locale: ContentLocale,
  newsItems: NewsImpactHistoryItem[],
  limit = 5,
): LandingGrowthCoin[] {
  const selected = new Map<string, LandingGrowthCoin>();

  for (const newsItem of newsItems) {
    if (newsItem.priority < 75) continue;

    for (const symbol of newsItem.relatedCoinSymbols) {
      if (selected.size >= limit) break;
      const normalized = symbol.trim().toUpperCase();
      if (selected.has(normalized)) continue;
      const coin = coinPages.find((item) => item.symbol === normalized);
      if (!coin) continue;

      selected.set(normalized, {
        ...coin,
        impactNews: newsItem,
        impactRankScore: Math.min(1, newsItem.priority / 100),
        latestImpactTitle: newsItem.title,
        newsDetailPath: getNewsImpactDetailPath(newsItem),
      });
    }

    if (selected.size >= limit) break;
  }

  return Array.from(selected.values());
}

export function getLandingGrowthRadar(locale: ContentLocale) {
  return getLandingGrowthRadarFromNewsItems(locale, getNewsImpactHistoryItems(locale));
}

export function getLandingGrowthRadarFromNewsItems(
  locale: ContentLocale,
  newsItems: NewsImpactHistoryItem[],
  evidenceInput?: LandingGrowthEvidenceInput,
) {
  const tools = getFeaturedTraderTools(REQUIRED_LANDING_TOOL_COUNT);
  const coins = getFeaturedLandingCoinsFromNewsItems(
    locale,
    newsItems,
    REQUIRED_LANDING_COIN_COUNT,
  );
  const evidence = buildLandingGrowthEvidence({
    coins,
    tools,
    newsItems,
    input: evidenceInput,
  });

  return {
    locale,
    tools,
    coins,
    updatedAt: evidence.updatedAt,
    evidence,
  };
}

export function buildLandingGrowthSchemas(locale: ContentLocale) {
  return buildLandingGrowthSchemasFromRadar(getLandingGrowthRadar(locale));
}

export function buildLandingGrowthSchemasFromRadar(radar: LandingGrowthRadarModel) {
  const locale = radar.locale;
  const isEn = locale === "en";
  const url = isEn ? "https://tecpey.ir/en" : "https://tecpey.ir";
  const coinItems = radar.coins.map((coin, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: isEn ? `${coin.name} (${coin.symbol})` : `${coin.faName} (${coin.symbol})`,
    url: `${url.replace(/\/en$/, "")}${isEn ? "/en" : ""}/coins/${coin.slug}`,
    description: isEn
      ? `TecPey educational guide for ${coin.name}, surfaced by high-priority news impact evidence.`
      : `برجسته‌شده بر اساس خبر اثرگذار: ${coin.latestImpactTitle}`,
  }));
  const toolItems = radar.tools.map((tool, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: tool.name,
    url: `${url.replace(/\/en$/, "")}${isEn ? "/en" : ""}/trading-tools/${tool.slug}`,
    description: isEn ? tool.summaryEn : tool.summaryFa,
  }));

  return [
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "@id": `${url}#featured-coins`,
      name: isEn ? "TecPey featured learning coins" : "ارزهای منتخب آموزشی تک‌پی",
      itemListOrder: "https://schema.org/ItemListOrderDescending",
      numberOfItems: coinItems.length,
      itemListElement: coinItems,
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "@id": `${url}#featured-tools`,
      name: isEn ? "TecPey featured trader tools" : "ابزارهای منتخب معامله‌گر تک‌پی",
      itemListOrder: "https://schema.org/ItemListOrderDescending",
      numberOfItems: toolItems.length,
      itemListElement: toolItems,
    },
  ];
}

export type LandingGrowthRadarModel = ReturnType<typeof getLandingGrowthRadar>;
export type LandingGrowthTool = RankedTraderTool;
