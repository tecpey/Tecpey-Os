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

export type NewsImpactHistoryAuthoritySource =
  | "news-impact-history:materialized"
  | "news-impact-history:partial-seed-merged"
  | "news-impact-history:seed-fallback";

export type NewsImpactHistoryAuthoritySnapshot = Readonly<{
  items: NewsImpactHistoryItem[];
  sourceAuthority: NewsImpactHistoryAuthoritySource;
  persistedCount: number;
  seededCount: number;
  highPriorityPersistedCount: number;
  latestPersistedRecordedAt: string | null;
}>;

export const LIVE_NEWS_IMPACT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

export function filterCurrentNewsImpactItems(
  items: NewsImpactHistoryItem[],
  now = Date.now(),
): NewsImpactHistoryItem[] {
  return items.filter((item) => {
    const publishedAt = Date.parse(item.publishedAt);
    return Number.isFinite(publishedAt)
      && publishedAt <= now
      && now - publishedAt <= LIVE_NEWS_IMPACT_MAX_AGE_MS;
  });
}

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

export async function readNewsImpactHistoryArchiveItemsTx(
  client: PoolClient,
  locale?: ContentLocale,
  limit = 10_000,
): Promise<NewsImpactHistoryItem[]> {
  const boundedLimit = Math.max(1, Math.min(50_000, Math.trunc(limit)));
  const params: Array<string | number> = locale ? [locale, boundedLimit] : [boundedLimit];
  const where = locale ? "WHERE locale = $1" : "";
  const limitParam = locale ? "$2" : "$1";
  const result = await client.query<NewsImpactHistoryRow>(
    `SELECT history_id, locale, slug, news_url, title, summary, source_name, source_url,
            published_at, recorded_at, priority, impact_score, tone, reason_fa, reason_en,
            related_tool_slugs, related_coin_symbols, related_lesson_href
       FROM platform_news_impact_history_items
       ${where}
      ORDER BY published_at DESC, recorded_at DESC, history_id ASC
      LIMIT ${limitParam}`,
    params,
  );
  return result.rows.map(mapNewsImpactHistoryRow);
}

export async function readNewsImpactHistoryItemBySlugTx(
  client: PoolClient,
  slug: string,
  locale: ContentLocale,
): Promise<NewsImpactHistoryItem | undefined> {
  if (!/^[a-z0-9][a-z0-9-]{2,140}$/.test(slug)) return undefined;
  const result = await client.query<NewsImpactHistoryRow>(
    `SELECT history_id, locale, slug, news_url, title, summary, source_name, source_url,
            published_at, recorded_at, priority, impact_score, tone, reason_fa, reason_en,
            related_tool_slugs, related_coin_symbols, related_lesson_href
       FROM platform_news_impact_history_items
      WHERE locale = $1 AND slug = $2
      ORDER BY recorded_at DESC, published_at DESC
      LIMIT 1`,
    [locale, slug],
  );
  return result.rows[0] ? mapNewsImpactHistoryRow(result.rows[0]) : undefined;
}

export async function readNewsImpactHistoryItemBySourceUrlTx(
  client: PoolClient,
  sourceUrl: string,
  locale: ContentLocale,
): Promise<NewsImpactHistoryItem | undefined> {
  if (!/^https:\/\//i.test(sourceUrl)) return undefined;
  const result = await client.query<NewsImpactHistoryRow>(
    `SELECT history_id, locale, slug, news_url, title, summary, source_name, source_url,
            published_at, recorded_at, priority, impact_score, tone, reason_fa, reason_en,
            related_tool_slugs, related_coin_symbols, related_lesson_href
       FROM platform_news_impact_history_items
      WHERE locale = $1 AND source_url = $2
      ORDER BY recorded_at DESC, published_at DESC
      LIMIT 1`,
    [locale, sourceUrl],
  );
  return result.rows[0] ? mapNewsImpactHistoryRow(result.rows[0]) : undefined;
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

export async function getNewsImpactHistoryArchiveItemsFromAuthority(
  locale?: ContentLocale,
  limit = 10_000,
): Promise<NewsImpactHistoryItem[]> {
  const seeded = getNewsImpactHistoryItems(locale);
  try {
    const result = await withDb((client) => readNewsImpactHistoryArchiveItemsTx(client, locale, limit));
    const persisted = result.enabled ? result.value : [];
    return persisted.length > 0 ? mergeNewsImpactHistoryItems(persisted, seeded) : seeded;
  } catch (error) {
    logger.warn("[news-impact-history] archive authority read failed; using seed fallback", {
      locale: locale ?? "all",
      error: error instanceof Error ? error.message : String(error),
    });
    return seeded;
  }
}

export async function getNewsImpactHistoryItemBySlugFromAuthority(
  slug: string,
  locale: ContentLocale,
): Promise<NewsImpactHistoryItem | undefined> {
  try {
    const result = await withDb((client) => readNewsImpactHistoryItemBySlugTx(client, slug, locale));
    if (result.enabled && result.value) return result.value;
  } catch (error) {
    logger.warn("[news-impact-history] slug authority read failed; using seed fallback", { slug, locale, error: error instanceof Error ? error.message : String(error) });
  }
  return getNewsImpactHistoryItems(locale).find((item) => getNewsImpactSlug(item) === slug);
}

export async function getNewsImpactHistoryItemBySourceUrlFromAuthority(
  sourceUrl: string,
  locale: ContentLocale,
): Promise<NewsImpactHistoryItem | undefined> {
  try {
    const result = await withDb((client) => readNewsImpactHistoryItemBySourceUrlTx(client, sourceUrl, locale));
    if (result.enabled && result.value) return result.value;
  } catch (error) {
    logger.warn("[news-impact-history] counterpart authority read failed; using seed fallback", { locale, error: error instanceof Error ? error.message : String(error) });
  }
  return getNewsImpactHistoryItems(locale).find((item) => item.sourceUrl === sourceUrl);
}

export async function getNewsImpactHistoryItemsFromAuthority(
  locale?: ContentLocale,
): Promise<NewsImpactHistoryItem[]> {
  const snapshot = await getNewsImpactHistoryAuthoritySnapshot(locale);
  return snapshot.items;
}

export async function getNewsImpactHistoryAuthoritySnapshot(
  locale?: ContentLocale,
): Promise<NewsImpactHistoryAuthoritySnapshot> {
  // This authority powers "live" cards and rankings. Historical editorial
  // records remain stored, but cannot silently influence current rankings.
  const seeded = filterCurrentNewsImpactItems(getNewsImpactHistoryItems(locale));
  const persisted = filterCurrentNewsImpactItems(await getPostgresNewsImpactHistoryItems(locale));
  if (persisted.length === 0) {
    return {
      items: seeded,
      sourceAuthority: "news-impact-history:seed-fallback",
      persistedCount: 0,
      seededCount: seeded.length,
      highPriorityPersistedCount: 0,
      latestPersistedRecordedAt: null,
    };
  }

  const latestPersistedRecordedAt = persisted
    .map((item) => Date.parse(item.recordedAt))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => right - left)[0];

  return {
    items: mergeNewsImpactHistoryItems(persisted, seeded),
    sourceAuthority: persisted.length >= seeded.length
      ? "news-impact-history:materialized"
      : "news-impact-history:partial-seed-merged",
    persistedCount: persisted.length,
    seededCount: seeded.length,
    highPriorityPersistedCount: persisted.filter((item) => item.priority >= 75).length,
    latestPersistedRecordedAt: latestPersistedRecordedAt
      ? new Date(latestPersistedRecordedAt).toISOString()
      : null,
  };
}
