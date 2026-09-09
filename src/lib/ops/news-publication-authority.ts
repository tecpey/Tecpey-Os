import { withDb } from "../db";
import type { ApprovedNewsSource } from "../news-automation";
import { NEWS_SOURCE_REGISTRY } from "../news-source-registry";

export type NewsPublicationCandidate = {
  archiveId: string;
  sourceName: string;
  articleUrl: string;
  sourceTitle: string;
  sourceLead: string;
  translatedTitle: string;
  translatedLead: string;
  contentHash: string;
  publishedAt: string;
  translationGeneratedAt: string;
};

function boundedLimit(value: number): number {
  if (!Number.isSafeInteger(value)) return 500;
  return Math.max(1, Math.min(1_000, value));
}

export function approvedNewsPublicationSources(): ApprovedNewsSource[] {
  const trustByTier = {
    tier_1: 0.98,
    tier_2: 0.84,
    tier_3: 0.72,
  } as const;

  return [
    { name: "TecPey Editorial", domain: "tecpey.ir", tier: "tecpey_editorial", trustScore: 0.96 },
    ...NEWS_SOURCE_REGISTRY.map((source): ApprovedNewsSource => ({
      name: source.name,
      domain: source.canonicalDomains[0],
      tier: source.firstParty ? "official" : "trusted_media",
      trustScore: Math.min(0.99, Math.max(0.7, trustByTier[source.trustTier] * source.corroborationWeight)),
    })),
  ];
}

/**
 * Publication authority consumes only immutable archive versions that have a
 * completed Persian translation for the exact content hash and explicit local
 * validation evidence. Untranslated/failed/pending rows are invisible here.
 */
export async function readValidatedNewsPublicationCandidatesFromAuthority(input: {
  limit?: number;
} = {}): Promise<NewsPublicationCandidate[]> {
  const result = await withDb(async (client) => {
    const rows = await client.query<Record<string, unknown>>(
      `WITH eligible AS (
         SELECT archive.archive_id,
                archive.source_name,
                archive.article_url,
                archive.source_title,
                archive.source_lead,
                archive.content_hash,
                archive.published_at,
                archive.fetched_at,
                translation.translated_title,
                translation.translated_lead,
                translation.generated_at AS translation_generated_at
           FROM platform_news_archive_items archive
           JOIN LATERAL (
             SELECT translated_title,
                    translated_lead,
                    translated_body,
                    generated_at,
                    evidence
               FROM platform_news_archive_translations
              WHERE archive_id = archive.archive_id
                AND locale = 'fa'
                AND status = 'completed'
                AND source_content_hash = archive.content_hash
                AND translated_title IS NOT NULL
                AND translated_lead IS NOT NULL
                AND translated_body IS NOT NULL
                AND evidence->>'numericIntegrity' = 'true'
                AND evidence->>'noAddedAdvice' = 'true'
              ORDER BY generated_at DESC, created_at DESC
              LIMIT 1
           ) translation ON TRUE
          WHERE archive.source_language = 'en'
            AND archive.published_at >= now() - interval '7 days'
       ), latest_article AS (
         SELECT DISTINCT ON (article_url) *
           FROM eligible
          ORDER BY article_url, published_at DESC, fetched_at DESC, translation_generated_at DESC
       )
       SELECT archive_id::text,
              source_name,
              article_url,
              source_title,
              source_lead,
              content_hash,
              published_at,
              translated_title,
              translated_lead,
              translation_generated_at
         FROM latest_article
        ORDER BY published_at DESC, translation_generated_at DESC
        LIMIT $1`,
      [boundedLimit(input.limit ?? 500)],
    );

    return rows.rows.map((row) => ({
      archiveId: String(row.archive_id),
      sourceName: String(row.source_name),
      articleUrl: String(row.article_url),
      sourceTitle: String(row.source_title),
      sourceLead: String(row.source_lead),
      translatedTitle: String(row.translated_title),
      translatedLead: String(row.translated_lead),
      contentHash: String(row.content_hash),
      publishedAt: new Date(row.published_at as string | Date).toISOString(),
      translationGeneratedAt: new Date(row.translation_generated_at as string | Date).toISOString(),
    }));
  });

  if (!result.enabled) throw new Error("news_publication_authority_disabled");
  return result.value;
}
