import { withDb } from "../db";
import type { ApprovedNewsSource } from "../news-automation";
import {
  approvedNewsAutomationSources,
  resolveNewsSourceAuthority,
} from "../../services/news/source-authority";

export const NEWS_PUBLICATION_POLICY_VERSION = "v3" as const;

const NEWS_PUBLICATION_POLICY_VERSION_RE = /^[a-z0-9][a-z0-9._-]{0,31}$/;

function normalizePublicationWatermark(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error("news_publication_watermark_invalid");
  return new Date(timestamp).toISOString().replace(".000Z", "Z");
}

/**
 * Publication idempotency is scoped to policy version + locale + validated
 * translation watermark. Historical snapshots stay immutable while an
 * explicit policy-version bump can re-evaluate the same archive set after a
 * semantic publication-policy change without deleting or relabelling evidence.
 */
export function buildNewsPublicationIdempotencyKey(input: {
  locale: "fa" | "en";
  fetchedAt: string;
  policyVersion?: string;
}): string {
  const policyVersion = (input.policyVersion ?? NEWS_PUBLICATION_POLICY_VERSION).trim().toLowerCase();
  if (!NEWS_PUBLICATION_POLICY_VERSION_RE.test(policyVersion)) {
    throw new Error("news_publication_policy_version_invalid");
  }
  return `crypto-news:publish:archive:${policyVersion}:${input.locale}:${normalizePublicationWatermark(input.fetchedAt)}`;
}

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
  return approvedNewsAutomationSources().filter((source) => {
    const authority = resolveNewsSourceAuthority(source.domain);
    return authority.registryKnown
      && authority.publicationDisposition === "auto_publish_eligible"
      && authority.providerReadiness.persianEditorialAllowed;
  });
}

export function isNewsPublicationSourceEligible(articleUrl: string): boolean {
  const authority = resolveNewsSourceAuthority(articleUrl);
  return authority.registryKnown
    && authority.publicationDisposition === "auto_publish_eligible"
    && authority.providerReadiness.persianEditorialAllowed;
}

/**
 * Publication authority consumes only immutable archive versions that have a
 * completed Persian translation for the exact content hash and explicit local
 * validation evidence. Untranslated/failed/pending rows are invisible here.
 * Source/provider authority is re-evaluated at read time so registry quarantine,
 * rights or readiness changes fail closed even for previously enriched rows.
 */
export async function readValidatedNewsPublicationCandidatesFromAuthority(input: {
  limit?: number;
} = {}): Promise<NewsPublicationCandidate[]> {
  const requestedLimit = boundedLimit(input.limit ?? 500);
  const eligibleSourceNames = Array.from(new Set(
    approvedNewsPublicationSources().map((source) => source.name),
  ));
  if (eligibleSourceNames.length === 0) return [];

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
            AND archive.source_name = ANY($2::text[])
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
      [requestedLimit, eligibleSourceNames],
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
    })).filter((candidate) => isNewsPublicationSourceEligible(candidate.articleUrl));
  });

  if (!result.enabled) throw new Error("news_publication_authority_disabled");
  return result.value;
}
