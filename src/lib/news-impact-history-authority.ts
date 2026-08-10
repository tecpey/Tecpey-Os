import type { PoolClient } from "pg";
import type { ContentLocale } from "./content-growth";
import { withDb } from "./db";
import { logger } from "./logger";
import {
  getNewsImpactHistoryItems,
  getNewsImpactSlug,
  sortNewsImpactHistoryItems,
  type NewsImpactHistoryItem,
  type NewsImpactTone,
} from "./news-impact-history";

type NewsImpactHistoryRow = {
  history_id: string;
  locale: ContentLocale;
  slug: string;
  news_url: string;
  title: string;
  summary: string;
  source_name: string;
  source_url: string;
  published_at: Date | string;
  recorded_at: Date | string;
  priority: number;
  impact_score: number;
  tone: NewsImpactTone;
  reason_fa: string;
  reason_en: string;
  related_tool_slugs: string[] | null;
  related_coin_symbols: string[] | null;
  related_lesson_href: string;
};

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function mapNewsImpactHistoryRow(row: NewsImpactHistoryRow): NewsImpactHistoryItem {
  return {
    id: row.history_id,
    locale: row.locale,
    title: row.title,
    summary: row.summary,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    newsUrl: row.news_url,
    publishedAt: toIso(row.published_at),
    recordedAt: toIso(row.recorded_at),
    priority: Number(row.priority),
    impactScore: Number(row.impact_score),
    tone: row.tone,
    reasonFa: row.reason_fa,
    reasonEn: row.reason_en,
    relatedToolSlugs: Array.isArray(row.related_tool_slugs) ? row.related_tool_slugs : [],
    relatedCoinSymbols: Array.isArray(row.related_coin_symbols)
      ? row.related_coin_symbols.map((symbol) => symbol.toUpperCase())
      : [],
    relatedLessonHref: row.related_lesson_href,
  };
}

export async function readNewsImpactHistoryItemsTx(
  client: PoolClient,
  locale?: ContentLocale,
): Promise<NewsImpactHistoryItem[]> {
  const params = locale ? [locale] : [];
  const where = locale ? "WHERE locale = $1" : "";
  const result = await client.query<NewsImpactHistoryRow>(
    `SELECT history_id, locale, slug, news_url, title, summary, source_name, source_url,
            published_at, recorded_at, priority, impact_score, tone, reason_fa, reason_en,
            related_tool_slugs, related_coin_symbols, related_lesson_href
       FROM platform_news_impact_history_items
       ${where}
      ORDER BY priority DESC, recorded_at DESC, published_at DESC, history_id ASC
      LIMIT 240`,
    params,
  );

  return result.rows.map(mapNewsImpactHistoryRow).sort(sortNewsImpactHistoryItems);
}

export function mergeNewsImpactHistoryItems(
  persisted: NewsImpactHistoryItem[],
  seeded: NewsImpactHistoryItem[],
): NewsImpactHistoryItem[] {
  const bySlug = new Map<string, NewsImpactHistoryItem>();
  for (const item of seeded) bySlug.set(`${item.locale}:${getNewsImpactSlug(item)}`, item);
  for (const item of persisted) bySlug.set(`${item.locale}:${getNewsImpactSlug(item)}`, item);
  return Array.from(bySlug.values()).sort(sortNewsImpactHistoryItems);
}

export async function getPostgresNewsImpactHistoryItems(
  locale?: ContentLocale,
): Promise<NewsImpactHistoryItem[]> {
  try {
    const result = await withDb((client) => readNewsImpactHistoryItemsTx(client, locale));
    return result.enabled ? result.value : [];
  } catch (error) {
    logger.warn("[news-impact-history] postgres authority read failed; using seed fallback", {
      locale: locale ?? "all",
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export async function getNewsImpactHistoryItemsFromAuthority(
  locale?: ContentLocale,
): Promise<NewsImpactHistoryItem[]> {
  const seeded = getNewsImpactHistoryItems(locale);
  const persisted = await getPostgresNewsImpactHistoryItems(locale);
  if (persisted.length === 0) return seeded;
  return mergeNewsImpactHistoryItems(persisted, seeded);
}
