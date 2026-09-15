import type { ContentLocale } from "./content-growth";
import { withDb } from "./db";
import { logger } from "./logger";
import { classifyFeedSourceCoverage } from "./news-feed-evidence";
import { canonicalPublisherUrl } from "./news-growth-authority";
import { isNewsPublicationSourceEligible } from "./ops/news-publication-authority";

export type NewsDetailBodyAuthority = Readonly<{
  body: string;
  paragraphs: readonly string[];
  sourceCoverage: "feed_full" | "feed_summary" | "article_full";
  bodyCharacterCount: number;
  sourceBodyCharacterCount: number;
  translated: boolean;
}>;

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function newsBodyParagraphs(value: string): string[] {
  const normalized = compact(value);
  if (!normalized) return [];
  const sentences = normalized.match(/[^.!?؟؛]+(?:[.!?؟؛]+|$)/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) ?? [normalized];

  const paragraphs: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (current && candidate.length > 620) {
      paragraphs.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current) paragraphs.push(current);
  return paragraphs;
}

function coverageFromRow(row: Record<string, unknown>): NewsDetailBodyAuthority["sourceCoverage"] {
  const evidence = row.translation_evidence;
  if (evidence && typeof evidence === "object" && !Array.isArray(evidence)) {
    const coverage = (evidence as Record<string, unknown>).sourceCoverage;
    if (coverage === "feed_full" || coverage === "feed_summary" || coverage === "article_full") {
      return coverage;
    }
  }

  const sourceLead = String(row.source_lead ?? "");
  const sourceBody = String(row.source_body ?? "");
  return classifyFeedSourceCoverage({
    fullContent: compact(sourceBody) !== compact(sourceLead) ? sourceBody : "",
    description: sourceLead,
  });
}

export async function getNewsDetailBodyFromAuthority(
  sourceUrl: string,
  locale: ContentLocale,
): Promise<NewsDetailBodyAuthority | null> {
  // English publisher bodies are immutable evidence, not public TecPey copy.
  // Keep this authority deliberately Persian-only until explicit redistribution
  // rights are modelled for English full-body publication.
  if (locale !== "fa") return null;

  let articleUrl: string;
  try {
    articleUrl = canonicalPublisherUrl(sourceUrl);
  } catch {
    return null;
  }

  // Re-evaluate current source/provider policy at read time. A source becoming
  // quarantined, blocked or losing editorial rights must immediately stop
  // serving a public localized body even when an older translation is complete.
  if (!isNewsPublicationSourceEligible(articleUrl)) return null;

  try {
    const result = await withDb(async (client) => {
      const selected = await client.query<Record<string, unknown>>(
        `SELECT archive.source_lead,
                archive.source_body,
                archive.fetched_at,
                translation.translated_lead,
                translation.translated_body,
                translation.evidence AS translation_evidence
           FROM platform_news_archive_items archive
           JOIN LATERAL (
             SELECT translated_lead, translated_body, evidence
               FROM platform_news_archive_translations
              WHERE archive_id = archive.archive_id
                AND locale = $2
                AND source_content_hash = archive.content_hash
                AND status = 'completed'
                AND translated_lead IS NOT NULL
                AND translated_body IS NOT NULL
                AND evidence->>'numericIntegrity' = 'true'
                AND evidence->>'noAddedAdvice' = 'true'
              ORDER BY generated_at DESC, created_at DESC
              LIMIT 1
           ) translation ON TRUE
          WHERE archive.article_url = $1
          ORDER BY char_length(archive.source_body) DESC,
                   archive.fetched_at DESC
          LIMIT 12`,
        [articleUrl, locale],
      );

      for (const row of selected.rows) {
        const sourceLead = compact(String(row.source_lead ?? ""));
        const sourceBody = compact(String(row.source_body ?? ""));
        const translatedLead = compact(String(row.translated_lead ?? ""));
        const translatedBody = compact(String(row.translated_body ?? ""));
        const body = translatedBody;
        const lead = translatedLead;
        if (!body || body === lead) continue;
        const paragraphs = newsBodyParagraphs(body);
        if (paragraphs.length === 0) continue;
        return {
          body,
          paragraphs,
          sourceCoverage: coverageFromRow(row),
          bodyCharacterCount: body.length,
          sourceBodyCharacterCount: sourceBody.length,
          translated: true,
        } satisfies NewsDetailBodyAuthority;
      }

      return null;
    });

    return result.enabled ? result.value : null;
  } catch (error) {
    logger.warn("[news-detail-body] authority read unavailable", {
      locale,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
