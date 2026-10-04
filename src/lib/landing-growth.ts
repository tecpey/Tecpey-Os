import { coinPages, type CoinPage } from "@/data/coins";
import { type ContentLocale } from "./content-growth";
import { getNewsImpactDetailPath, getNewsImpactHistoryItems, type NewsImpactHistoryItem } from "./news-impact-history";
import { getFeaturedTraderTools, type RankedTraderTool } from "./trading-tools-growth";

export type LandingGrowthCoin = CoinPage & {
  newsEvidence: NewsImpactHistoryItem;
  latestNewsTitle: string;
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
  recentNewsEvidenceCount: number;
  authorityFreshnessAgeMs: number | null;
  status: LandingGrowthEvidenceStatus;
}>;

export type LandingGrowthEvidenceInput = Readonly<{
  sourceAuthority?: LandingGrowthSourceAuthority;
  authorityUpdatedAt?: string | null;
  maxAuthorityAgeMs?: number;
  now?: Date | string;
}>;

const REQUIRED_LANDING_COIN_COUNT = 5;
const REQUIRED_LANDING_TOOL_COUNT = 5;
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
  const sourceAuthority = input?.sourceAuthority ?? "news-impact-history:seed-fallback";
  const authorityUpdatedAt = input?.authorityUpdatedAt ?? null;
  const nowMs = input?.now ? Date.parse(String(input.now)) : Date.now();
  const authorityUpdatedAtMs = authorityUpdatedAt ? Date.parse(authorityUpdatedAt) : Number.NaN;
  const authorityFreshnessAgeMs = Number.isFinite(nowMs) && Number.isFinite(authorityUpdatedAtMs)
    ? Math.max(0, nowMs - authorityUpdatedAtMs)
    : null;
  const maxAuthorityAgeMs = input?.maxAuthorityAgeMs ?? LANDING_GROWTH_MAX_AUTHORITY_AGE_MS;
  const hasFreshMaterializedAuthority =
    sourceAuthority === "news-impact-history:materialized" &&
    newsItems.length >= REQUIRED_LANDING_COIN_COUNT &&
    authorityFreshnessAgeMs !== null &&
    authorityFreshnessAgeMs <= maxAuthorityAgeMs;
  const status =
    coins.length >= REQUIRED_LANDING_COIN_COUNT &&
    tools.length >= REQUIRED_LANDING_TOOL_COUNT &&
    newsItems.length >= REQUIRED_LANDING_COIN_COUNT &&
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
    recentNewsEvidenceCount: newsItems.length,
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

  const chronological = [...newsItems].sort((a, b) =>
    Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id),
  );

  for (const newsItem of chronological) {
    for (const symbol of newsItem.relatedCoinSymbols) {
      if (selected.size >= limit) break;
      const normalized = symbol.trim().toUpperCase();
      if (selected.has(normalized)) continue;
      const coin = coinPages.find((item) => item.symbol === normalized);
      if (!coin) continue;

      selected.set(normalized, {
        ...coin,
        newsEvidence: newsItem,
        latestNewsTitle: newsItem.title,
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
  fallbackNewsItems: NewsImpactHistoryItem[] = [],
) {
  const tools = getFeaturedTraderTools(REQUIRED_LANDING_TOOL_COUNT);
  const primaryCoins = getFeaturedLandingCoinsFromNewsItems(
    locale,
    newsItems,
    REQUIRED_LANDING_COIN_COUNT,
  );
  const selectedSymbols = new Set(primaryCoins.map((coin) => coin.symbol));
  const fallbackCoins = getFeaturedLandingCoinsFromNewsItems(
    locale,
    fallbackNewsItems,
    REQUIRED_LANDING_COIN_COUNT,
  ).filter((coin) => !selectedSymbols.has(coin.symbol));
  const coins = [...primaryCoins, ...fallbackCoins].slice(0, REQUIRED_LANDING_COIN_COUNT);
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
      ? `TecPey educational guide for ${coin.name}, surfaced by recent governed news evidence.`
      : `برجسته‌شده بر اساس شواهد خبری تازه: ${coin.latestNewsTitle}`,
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
