import type { ContentLocale } from "./content-growth";
import { buildGrowthTrendRadarSnapshot, type GrowthTrendRadarSnapshot, type TrendWindow } from "./growth-trend-intelligence";
import { readGrowthTrendSignalsFromAuthority } from "./news-growth-authority";
import { withDb } from "./db";
import { logger } from "./logger";
import {
  approvedNewsPublicationSources,
  isNewsPublicationSourceEligible,
} from "./ops/news-publication-authority";

export type GrowthTrendNewsHighlight = {
  id: string;
  title: string;
  sourceName: string;
  articleUrl: string;
  publishedAt: string;
  day: string;
  impactScore: number;
  priority: number;
  newsUrl: string | null;
  coinSymbols: string[];
  topicTags: string[];
};

export type GrowthTrendRadarAuthority = {
  radar: GrowthTrendRadarSnapshot;
  news: Record<TrendWindow, GrowthTrendNewsHighlight[]>;
  generatedAt: string;
};

const WINDOW_INTERVAL: Record<TrendWindow, string> = {
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
};

function boundedSymbols(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(String).map((item) => item.trim().toUpperCase()).filter(Boolean).slice(0, 12)
    : [];
}

async function readHighlights(locale: ContentLocale, window: TrendWindow): Promise<GrowthTrendNewsHighlight[]> {
  try {
    const result = await withDb(async (client) => {
      // Public trend highlights are downstream of governed publication. Raw
      // archive capture is immutable evidence but is never a public ranking
      // authority by itself. Pre-filter currently eligible source identities
      // before LIMIT so quarantined history cannot starve valid highlights.
      const eligibleSourceNames = Array.from(new Set(
        approvedNewsPublicationSources().map((source) => source.name),
      ));
      if (eligibleSourceNames.length === 0) return [];

      const rows = await client.query<Record<string, unknown>>(
        `SELECT history_id::text,
                title,
                source_name,
                source_url,
                published_at,
                ((published_at AT TIME ZONE 'Asia/Tehran')::date)::text AS published_day_tehran,
                priority,
                impact_score,
                news_url,
                related_coin_symbols
           FROM platform_news_impact_history_items
          WHERE locale = $2
            AND published_at >= NOW() - $1::interval
            AND source_name = ANY($3::text[])
          ORDER BY priority DESC, impact_score DESC, published_at DESC, recorded_at DESC
          LIMIT 40`,
        [WINDOW_INTERVAL[window], locale, eligibleSourceNames],
      );

      return rows.rows.flatMap((row): GrowthTrendNewsHighlight[] => {
        const articleUrl = String(row.source_url ?? "");
        if (!isNewsPublicationSourceEligible(articleUrl)) return [];

        const impactScore = Math.max(0, Math.min(10, Number(row.impact_score) || 0));
        const priority = Math.max(0, Math.min(100, Number(row.priority) || 0));
        const newsUrl = typeof row.news_url === "string" && /^\/(?:en\/)?crypto-news\/[a-z0-9-]+$/.test(row.news_url)
          ? row.news_url
          : null;
        return [{
          id: String(row.history_id),
          title: String(row.title),
          sourceName: String(row.source_name),
          articleUrl,
          publishedAt: new Date(row.published_at as string | Date).toISOString(),
          day: String(row.published_day_tehran),
          impactScore,
          priority,
          newsUrl,
          coinSymbols: boundedSymbols(row.related_coin_symbols),
          topicTags: [],
        }];
      }).slice(0, 20);
    });
    return result.enabled ? result.value : [];
  } catch (error) {
    logger.warn("[growth-trend] governed publication highlight authority unavailable", {
      locale,
      window,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export async function getGrowthTrendRadarFromAuthority(locale: ContentLocale): Promise<GrowthTrendRadarAuthority> {
  const generatedAt = new Date().toISOString();
  const signals = (await readGrowthTrendSignalsFromAuthority(31)).filter(
    (signal) => signal.locale === "global" || signal.locale === locale,
  );
  const radar = buildGrowthTrendRadarSnapshot({ locale, signals, generatedAt, limitPerType: 8 });
  const [h24, d7, d30] = await Promise.all([
    readHighlights(locale, "24h"),
    readHighlights(locale, "7d"),
    readHighlights(locale, "30d"),
  ]);
  return { radar, news: { "24h": h24, "7d": d7, "30d": d30 }, generatedAt };
}
