import type { ContentLocale } from "./content-growth";
import { withDb } from "./db";
import { logger } from "./logger";
import type { NewsArchiveItem } from "./news-growth-authority";
import {
  providerReadinessSummaryForDomain,
  type NewsProviderThumbnailPolicy,
} from "./news-provider-readiness";
import {
  NEWS_SOURCE_REGISTRY,
  isApprovedNewsSourceHost,
} from "./news-source-registry";
import type { NewsTaxonomyMatch } from "./news-taxonomy";

export type NewsArchivePresentationItem = NewsArchiveItem & {
  sourceCoverage: "feed_full" | "feed_summary" | "article_full" | null;
  translationPending: boolean;
  thumbnailUrl: string | null;
  thumbnailAlt: string;
  thumbnailPolicy: NewsProviderThumbnailPolicy;
  thumbnailAttributionRequired: boolean;
};

function sourceForArticleUrl(articleUrl: string) {
  try {
    const hostname = new URL(articleUrl).hostname;
    return NEWS_SOURCE_REGISTRY.find((source) => isApprovedNewsSourceHost(hostname, source)) ?? null;
  } catch {
    return null;
  }
}

function thumbnailPresentation(articleUrl: string): {
  url: string | null;
  policy: NewsProviderThumbnailPolicy;
  attributionRequired: boolean;
} {
  const source = sourceForArticleUrl(articleUrl);
  if (!source || source.continuityMode === "quarantined") {
    return { url: null, policy: "blocked", attributionRequired: true };
  }

  const readiness = providerReadinessSummaryForDomain(source.canonicalDomains[0] ?? "");
  if (readiness.thumbnailPolicy === "blocked") {
    return {
      url: null,
      policy: readiness.thumbnailPolicy,
      attributionRequired: readiness.attributionRequired,
    };
  }

  return {
    url: `/api/crypto-news/thumbnail?article=${encodeURIComponent(articleUrl)}`,
    policy: readiness.thumbnailPolicy,
    attributionRequired: readiness.attributionRequired,
  };
}

function coverage(value: unknown): NewsArchivePresentationItem["sourceCoverage"] {
  return value === "feed_full" || value === "feed_summary" || value === "article_full"
    ? value
    : null;
}

function mapRow(row: Record<string, unknown>, locale: ContentLocale): NewsArchivePresentationItem {
  const taxonomy = typeof row.taxonomy === "string" ? JSON.parse(row.taxonomy) : row.taxonomy;
  const translationStatus = String(row.translation_status ?? "unavailable") as NewsArchiveItem["translationStatus"];
  const useTranslation = locale === "fa"
    && translationStatus === "completed"
    && typeof row.translated_title === "string"
    && typeof row.translated_lead === "string"
    && typeof row.translated_body === "string";
  const articleUrl = String(row.article_url);
  const displayTitle = useTranslation ? String(row.translated_title) : String(row.source_title);
  const thumbnail = thumbnailPresentation(articleUrl);

  return {
    archiveId: String(row.archive_id),
    sourceName: String(row.source_name),
    sourceDomain: String(row.source_domain),
    articleUrl,
    newsUrl: row.news_url ? String(row.news_url) : null,
    sourceLanguage: String(row.source_language),
    sourceTitle: String(row.source_title),
    sourceLead: String(row.source_lead),
    sourceBody: String(row.source_body),
    publishedAt: new Date(row.published_at as string | Date).toISOString(),
    fetchedAt: new Date(row.fetched_at as string | Date).toISOString(),
    day: String(row.published_day_tehran),
    contentHash: String(row.content_hash),
    taxonomy: taxonomy as NewsTaxonomyMatch,
    locale,
    displayTitle,
    displayLead: useTranslation ? String(row.translated_lead) : String(row.source_lead),
    displayBody: useTranslation ? String(row.translated_body) : String(row.source_body),
    translationStatus,
    translationProvider: row.provider_id ? String(row.provider_id) : null,
    translationModel: row.model ? String(row.model) : null,
    sourceCoverage: coverage(row.source_coverage),
    translationPending: locale === "fa" && !useTranslation,
    thumbnailUrl: thumbnail.url,
    thumbnailAlt: displayTitle,
    thumbnailPolicy: thumbnail.policy,
    thumbnailAttributionRequired: thumbnail.attributionRequired,
  };
}

/**
 * Public archive presentation intentionally differs from governed publication.
 *
 * Every captured immutable article version remains discoverable in the daily
 * archive even while Persian enrichment is pending or has failed. This prevents
 * translation/provider incidents from becoming news-loss incidents. A failed or
 * pending Persian translation falls back to publisher text with a visible UI
 * state; it does not gain a governed TecPey detail URL, ranking authority or
 * indexing authority until the normal publication gates pass.
 */
export async function readNewsArchiveDayForPresentationTx(
  client: import("pg").PoolClient,
  day: string,
  locale: ContentLocale,
): Promise<NewsArchivePresentationItem[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("news_archive_day_invalid");

  const result = await client.query<Record<string, unknown>>(
    `WITH latest_article AS (
       SELECT DISTINCT ON (article_url)
              archive_id, source_name, source_domain, article_url, source_language,
              source_title, source_lead, source_body, source_coverage, published_at,
              fetched_at, published_day_tehran, content_hash, taxonomy, created_at
         FROM platform_news_archive_items
        WHERE published_day_tehran = $1::date
        ORDER BY article_url,
                 CASE source_coverage
                   WHEN 'article_full' THEN 3
                   WHEN 'feed_full' THEN 2
                   WHEN 'feed_summary' THEN 1
                   ELSE 0
                 END DESC,
                 fetched_at DESC, created_at DESC
     )
     SELECT article.*,
            translation.status AS translation_status,
            translation.provider_id,
            translation.model,
            translation.translated_title,
            translation.translated_lead,
            translation.translated_body,
            internal_news.news_url
       FROM latest_article article
       LEFT JOIN LATERAL (
         SELECT status, provider_id, model, translated_title, translated_lead, translated_body
           FROM platform_news_archive_translations
          WHERE archive_id = article.archive_id
            AND locale = $2
            AND source_content_hash = article.content_hash
          ORDER BY (status = 'completed') DESC, generated_at DESC, created_at DESC
          LIMIT 1
       ) translation ON TRUE
       LEFT JOIN LATERAL (
         SELECT history.news_url
           FROM platform_news_impact_history_items history
          WHERE history.locale = $2
            AND history.source_url = article.article_url
          ORDER BY history.recorded_at DESC, history.published_at DESC
          LIMIT 1
       ) internal_news ON TRUE
      ORDER BY article.published_at DESC, article.source_name, article.article_url
      LIMIT 1000`,
    [day, locale],
  );

  return result.rows.map((row) => mapRow(row, locale));
}

export async function getNewsArchiveDayForPresentation(
  day: string,
  locale: ContentLocale,
): Promise<NewsArchivePresentationItem[]> {
  try {
    const result = await withDb((client) => readNewsArchiveDayForPresentationTx(client, day, locale));
    return result.enabled ? result.value : [];
  } catch (error) {
    logger.warn("[news-archive] no-loss presentation authority unavailable", {
      day,
      locale,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
