import type { ContentLocale } from "./content-growth";
import { buildGrowthTrendRadarSnapshot, type GrowthTrendRadarSnapshot, type TrendWindow } from "./growth-trend-intelligence";
import { readGrowthTrendSignalsFromAuthority } from "./news-growth-authority";
import { withDb } from "./db";
import { logger } from "./logger";

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

function mapTaxonomy(value: unknown): { coinSymbols: string[]; topicTags: string[] } {
  const taxonomy = typeof value === "string" ? JSON.parse(value) as Record<string, unknown> : (value ?? {}) as Record<string, unknown>;
  const coinSymbols = Array.isArray(taxonomy.coinSymbols) ? taxonomy.coinSymbols.map(String).slice(0, 12) : [];
  const topicTags = Array.isArray(taxonomy.topicTags) ? taxonomy.topicTags.map(String).slice(0, 12) : [];
  return { coinSymbols, topicTags };
}

async function readHighlights(locale: ContentLocale, window: TrendWindow): Promise<GrowthTrendNewsHighlight[]> {
  try {
    const result = await withDb(async (client) => {
      const rows = await client.query<Record<string, unknown>>(
        `WITH ranked AS (
           SELECT DISTINCT ON (archive.article_url)
                  archive.archive_id::text, archive.article_url, archive.source_name,
                  archive.source_title, archive.published_at, archive.published_day_tehran,
                  archive.taxonomy,
                  translation.status AS translation_status,
                  translation.translated_title
             FROM platform_news_archive_items archive
             LEFT JOIN LATERAL (
               SELECT status, translated_title
                 FROM platform_news_archive_translations
                WHERE archive_id = archive.archive_id AND locale = 'fa'
                ORDER BY (status = 'completed') DESC, generated_at DESC, created_at DESC
                LIMIT 1
             ) translation ON TRUE
            WHERE archive.published_at >= NOW() - $1::interval
            ORDER BY archive.article_url, archive.published_at DESC, archive.fetched_at DESC
         )
         SELECT ranked.*,
                impact.news_url, impact.impact_score AS materialized_impact_score,
                impact.priority AS materialized_priority
           FROM ranked
           LEFT JOIN LATERAL (
             SELECT history.news_url, history.impact_score, history.priority
               FROM platform_news_impact_history_items history
              WHERE history.locale = $2
                AND history.source_url = ranked.article_url
              ORDER BY history.recorded_at DESC, history.published_at DESC
              LIMIT 1
           ) impact ON TRUE
         ORDER BY COALESCE(impact.priority, 0) DESC,
                  COALESCE(impact.impact_score, 0) DESC,
                  ranked.published_at DESC
         LIMIT 20`,
        [WINDOW_INTERVAL[window], locale],
      );
      return rows.rows.map((row) => {
        const taxonomy = mapTaxonomy(row.taxonomy);
        const translated = locale === "fa" && row.translation_status === "completed" && row.translated_title;
        const materializedImpact = Number(row.materialized_impact_score);
        const fallbackImpact = Math.min(10, 4 + taxonomy.coinSymbols.length + Math.min(3, taxonomy.topicTags.length));
        const impactScore = Number.isFinite(materializedImpact)
          ? Math.max(0, Math.min(10, materializedImpact))
          : fallbackImpact;
        const materializedPriority = Number(row.materialized_priority);
        const priority = Number.isFinite(materializedPriority)
          ? Math.max(0, Math.min(100, materializedPriority))
          : Math.min(100, Math.round(impactScore * 10));
        const newsUrl = typeof row.news_url === "string" && /^\/(?:en\/)?crypto-news\/[a-z0-9-]+$/.test(row.news_url)
          ? row.news_url
          : null;
        return {
          id: String(row.archive_id),
          title: translated ? String(row.translated_title) : String(row.source_title),
          sourceName: String(row.source_name),
          articleUrl: String(row.article_url),
          publishedAt: new Date(row.published_at as string | Date).toISOString(),
          day: String(row.published_day_tehran),
          impactScore,
          priority,
          newsUrl,
          coinSymbols: taxonomy.coinSymbols,
          topicTags: taxonomy.topicTags,
        } satisfies GrowthTrendNewsHighlight;
      });
    });
    return result.enabled ? result.value : [];
  } catch (error) {
    logger.warn("[growth-trend] news highlight authority unavailable", {
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
