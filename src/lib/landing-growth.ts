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
) {
  return {
    locale,
    tools: getFeaturedTraderTools(5),
    coins: getFeaturedLandingCoinsFromNewsItems(locale, newsItems, 5),
    updatedAt: "2026-08-09T08:00:00.000Z",
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
