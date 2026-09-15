import type { PoolClient } from "pg";

import type { ContentLocale } from "../../lib/content-growth";
import { withDb } from "../../lib/db";
import { logger } from "../../lib/logger";
import type { NewsArchiveItem } from "../../lib/news-growth-authority";
import {
  providerReadinessSummaryForDomain,
  type NewsProviderReadinessDecision,
  type NewsProviderThumbnailPolicy,
} from "../../lib/news-provider-readiness";
import {
  NEWS_SOURCE_REGISTRY,
  isApprovedNewsSourceHost,
} from "../../lib/news-source-registry";
import type { NewsTaxonomyMatch } from "../../lib/news-taxonomy";

export type NewsArchivePresentationItem = Omit<NewsArchiveItem, "sourceBody"> & {
  sourceCoverage: "feed_full" | "feed_summary" | "article_full" | null;
  translationPending: boolean;
  publicSummaryAllowed: boolean;
  persianEditorialAllowed: boolean;
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

function readinessForArticle(articleUrl: string): NewsProviderReadinessDecision {
  const source = sourceForArticleUrl(articleUrl);
  return providerReadinessSummaryForDomain(source?.canonicalDomains[0] ?? articleUrl);
}

function thumbnailPresentation(
  articleUrl: string,
  readiness: NewsProviderReadinessDecision,
): {
  url: string | null;
  policy: NewsProviderThumbnailPolicy;
  attributionRequired: boolean;
} {
  const source = sourceForArticleUrl(articleUrl);
  if (!source || source.continuityMode === "quarantined") {
    return { url: null, policy: "blocked", attributionRequired: true };
  }

  const sourceMediaAllowed = readiness.thumbnailPolicy === "licensed"
    || readiness.thumbnailPolicy === "official_attribution";
  return {
    url: sourceMediaAllowed
      ? `/crypto-news/media?article=${encodeURIComponent(articleUrl)}`
      : null,
    policy: readiness.thumbnailPolicy,
    attributionRequired: readiness.attributionRequired,
  };
}

function coverage(value: unknown): NewsArchivePresentationItem["sourceCoverage"] {
  return value === "feed_full" || value === "feed_summary" || value === "article_full"
    ? value
    : null;
}

function metadataOnlyLead(locale: ContentLocale, sourceName: string): string {
  return locale === "fa"
    ? `متن این خبر فعلاً برای بازنشر عمومی مجاز نیست؛ برای جزئیات، منبع اصلی ${sourceName} را بررسی کنید.`
    : `Publisher text is not cleared for public redistribution here. Open the original ${sourceName} source for details.`;
}

function mapRow(row: Record<string, unknown>, locale: ContentLocale): NewsArchivePresentationItem {
  const taxonomy = typeof row.taxonomy === "string" ? JSON.parse(row.taxonomy) : row.taxonomy;
  const translationStatus = String(row.translation_status ?? "unavailable") as NewsArchiveItem["translationStatus"];
  const articleUrl = String(row.article_url);
  const readiness = readinessForArticle(articleUrl);
  const translationCompleted = translationStatus === "completed"
    && typeof row.translated_title === "string"
    && typeof row.translated_lead === "string"
    && typeof row.translated_body === "string";
  const useTranslation = locale === "fa"
    && translationCompleted
    && readiness.persianEditorialAllowed;
  const canShowPublisherSummary = readiness.publicSummaryAllowed;
  const displayTitle = useTranslation ? String(row.translated_title) : String(row.source_title);
  const sourceLead = String(row.source_lead);
  const fallbackLead = canShowPublisherSummary
    ? sourceLead
    : metadataOnlyLead(locale, String(row.source_name));
  const thumbnail = thumbnailPresentation(articleUrl, readiness);

  return {
    archiveId: String(row.archive_id),
    sourceName: String(row.source_name),
    sourceDomain: String(row.source_domain),
    articleUrl,
    newsUrl: row.news_url ? String(row.news_url) : null,
    sourceLanguage: String(row.source_language),
    sourceTitle: String(row.source_title),
    sourceLead: canShowPublisherSummary ? sourceLead : "",
    publishedAt: new Date(row.published_at as string | Date).toISOString(),
    fetchedAt: new Date(row.fetched_at as string | Date).toISOString(),
    day: String(row.published_day_tehran),
    contentHash: String(row.content_hash),
    taxonomy: taxonomy as NewsTaxonomyMatch,
    locale,
    displayTitle,
    displayLead: useTranslation ? String(row.translated_lead) : fallbackLead,
    // Full publisher bodies are internal evidence, not public copy. Only the
    // governed Persian rendering may expose a full body on this surface.
    displayBody: useTranslation ? String(row.translated_body) : fallbackLead,
    translationStatus,
    translationProvider: row.provider_id ? String(row.provider_id) : null,
    translationModel: row.model ? String(row.model) : null,
    sourceCoverage: coverage(row.source_coverage),
    translationPending: locale === "fa" && !useTranslation,
    publicSummaryAllowed: readiness.publicSummaryAllowed,
    persianEditorialAllowed: readiness.persianEditorialAllowed,
    thumbnailUrl: thumbnail.url,
    thumbnailAlt: displayTitle,
    thumbnailPolicy: thumbnail.policy,
    thumbnailAttributionRequired: thumbnail.attributionRequired,
  };
}

/**
 * Archive visibility is independent from governed publication.
 *
 * Every captured immutable article remains discoverable even while Persian
 * enrichment is pending or has failed. Public presentation is rights-aware:
 * publisher full bodies never leave the evidence boundary, provider policy can
 * reduce an item to metadata-only, and only a governed Persian rendering may
 * expose a full localized body. None of these presentation states grants a
 * detail URL, ranking, sitemap or indexing authority.
 */
export async function readNewsArchiveDayForPresentationTx(
  client: PoolClient,
  day: string,
  locale: ContentLocale,
): Promise<NewsArchivePresentationItem[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("news_archive_day_invalid");

  const result = await client.query<Record<string, unknown>>(
    `WITH latest_article AS (
       SELECT DISTINCT ON (article_url)
              archive_id, source_name, source_domain, article_url, source_language,
              source_title, source_lead, source_coverage, published_at,
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
