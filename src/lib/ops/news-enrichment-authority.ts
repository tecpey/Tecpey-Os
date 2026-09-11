import type { PoolClient } from "pg";

import type { ContentLocale } from "../content-growth";
import { withDb } from "../db";
import {
  decideNewsEnrichmentRetry,
  type NewsEnrichmentFailureClass,
} from "./news-enrichment-policy";
import { persistNewsArchiveTranslationTx } from "../news-growth-authority";

export type NewsEnrichmentCandidate = {
  archiveId: string;
  sourceName: string;
  articleUrl: string;
  sourceTitle: string;
  sourceLead: string;
  sourceBody: string;
  contentHash: string;
  publishedAt: string;
  sourceCoverage: "feed_full" | "feed_summary" | "article_full" | null;
};

export type NewsEnrichmentLeaseDecision =
  | { action: "process" }
  | { action: "skip_completed" }
  | { action: "defer"; until: string }
  | { action: "attempt_budget_exhausted"; failures: number }
  | {
      action: "terminal_failure";
      failureClass: Exclude<NewsEnrichmentFailureClass, "transient">;
      reason: string;
    };

function boundedLimit(limit: number): number {
  if (!Number.isSafeInteger(limit)) return 4;
  return Math.max(1, Math.min(100, limit));
}

function mapCandidateRows(rows: Record<string, unknown>[]): NewsEnrichmentCandidate[] {
  return rows.map((row) => ({
    archiveId: String(row.archive_id),
    sourceName: String(row.source_name),
    articleUrl: String(row.article_url),
    sourceTitle: String(row.source_title),
    sourceLead: String(row.source_lead),
    sourceBody: String(row.source_body),
    contentHash: String(row.content_hash),
    publishedAt: new Date(row.published_at as string | Date).toISOString(),
    sourceCoverage:
      row.source_coverage === "feed_full"
      || row.source_coverage === "feed_summary"
      || row.source_coverage === "article_full"
        ? row.source_coverage
        : null,
  }));
}

const CANDIDATE_SELECT = `WITH authoritative AS (
  SELECT archive.archive_id,
         archive.source_name,
         archive.article_url,
         archive.source_title,
         archive.source_lead,
         archive.source_body,
         archive.source_coverage,
         archive.content_hash,
         archive.published_at,
         archive.fetched_at,
         row_number() OVER (
           PARTITION BY archive.article_url
           ORDER BY
             CASE archive.source_coverage
               WHEN 'article_full' THEN 3
               WHEN 'feed_full' THEN 2
               WHEN 'feed_summary' THEN 1
               ELSE 0
             END DESC,
             archive.fetched_at DESC,
             archive.archive_id DESC
         ) AS authority_rank
    FROM platform_news_archive_items archive
)
SELECT archive.archive_id::text,
       archive.source_name,
       archive.article_url,
       archive.source_title,
       archive.source_lead,
       archive.source_body,
       archive.source_coverage,
       archive.content_hash,
       archive.published_at,
       archive.fetched_at
  FROM authoritative archive
 WHERE archive.authority_rank = 1
   AND NOT EXISTS (
   SELECT 1
     FROM platform_news_archive_translations translation
    WHERE translation.archive_id = archive.archive_id
      AND translation.locale = $1
      AND translation.source_content_hash = archive.content_hash
      AND translation.status IN ('completed', 'not_required')
 )`;

/**
 * Reads immutable article versions from durable archive authority.
 *
 * Two lanes are intentionally interleaved: newest pending work keeps breaking
 * news timely while oldest pending work guarantees backlogs cannot starve
 * forever under a continuously arriving feed.
 *
 * DB disabled/unavailable is an error, never an empty list. Paid enrichment
 * therefore cannot interpret authority loss as "nothing translated yet".
 */
export async function readNewsEnrichmentCandidatesFromAuthority(input: {
  locale: ContentLocale;
  limit?: number;
}): Promise<NewsEnrichmentCandidate[]> {
  const limit = boundedLimit(input.limit ?? 4);
  const newestLimit = Math.max(1, Math.ceil(limit / 2));
  const oldestLimit = Math.max(0, limit - newestLimit);

  const result = await withDb(async (client) => {
    const newest = await client.query<Record<string, unknown>>(
      `${CANDIDATE_SELECT}
       ORDER BY archive.published_at DESC, archive.fetched_at DESC
       LIMIT $2`,
      [input.locale, newestLimit],
    );

    const oldest = oldestLimit > 0
      ? await client.query<Record<string, unknown>>(
          `${CANDIDATE_SELECT}
           ORDER BY archive.published_at ASC, archive.fetched_at ASC
           LIMIT $2`,
          [input.locale, oldestLimit],
        )
      : { rows: [] as Record<string, unknown>[] };

    const selected = new Map<string, NewsEnrichmentCandidate>();
    for (const candidate of [
      ...mapCandidateRows(newest.rows),
      ...mapCandidateRows(oldest.rows),
    ]) {
      if (!selected.has(candidate.archiveId)) selected.set(candidate.archiveId, candidate);
    }
    return [...selected.values()].slice(0, limit);
  });

  if (!result.enabled) throw new Error("news_enrichment_authority_disabled");
  return result.value;
}

async function translationState(
  client: PoolClient,
  archiveId: string,
  locale: ContentLocale,
  contentHash: string,
): Promise<{
  status: "completed" | "failed" | "not_required";
  generatedAt: string;
  failureReason: string | null;
  failureCount: number;
} | null> {
  const result = await client.query<Record<string, unknown>>(
    `WITH scoped AS (
       SELECT status, generated_at, created_at, evidence
         FROM platform_news_archive_translations
        WHERE archive_id = $1::uuid
          AND locale = $2
          AND source_content_hash = $3
     ), latest AS (
       SELECT status, generated_at, evidence
         FROM scoped
        ORDER BY (status = 'completed') DESC, generated_at DESC, created_at DESC
        LIMIT 1
     )
     SELECT latest.status,
            latest.generated_at,
            latest.evidence,
            (SELECT count(*)::int FROM scoped WHERE status = 'failed') AS failure_count
       FROM latest`,
    [archiveId, locale, contentHash],
  );
  const row = result.rows[0];
  if (!row) return null;
  const status = String(row.status);
  if (status !== "completed" && status !== "failed" && status !== "not_required") return null;
  const evidence = row.evidence && typeof row.evidence === "object" && !Array.isArray(row.evidence)
    ? row.evidence as Record<string, unknown>
    : {};
  return {
    status,
    generatedAt: new Date(row.generated_at as string | Date).toISOString(),
    failureReason: typeof evidence.reason === "string" ? evidence.reason : null,
    failureCount: Number(row.failure_count ?? 0),
  };
}

/**
 * Paid-work authority for one immutable article-version + locale.
 *
 * Invariants:
 * - authority loss throws before the paid callback can run;
 * - a session advisory lock prevents concurrent double-spend;
 * - completed/not-required work is never repeated;
 * - only transient failures may retry after the configured cooldown;
 * - final validation/provider/configuration failures are terminal for the
 *   immutable version instead of being retried by scheduler cadence;
 * - transient retries have a finite per-version failure budget.
 */
export async function withNewsEnrichmentLease<T>(input: {
  candidate: NewsEnrichmentCandidate;
  locale: ContentLocale;
  retryMinutes: number;
  maximumFailures?: number;
  run: (client: PoolClient) => Promise<T>;
}): Promise<{ decision: NewsEnrichmentLeaseDecision; value?: T }> {
  const authority = await withDb(async (client) => {
    const lockKey = `news-enrichment:${input.locale}:${input.candidate.archiveId}:${input.candidate.contentHash}`;
    const locked = await client.query<{ acquired: boolean }>(
      `SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired`,
      [lockKey],
    );
    if (!locked.rows[0]?.acquired) {
      return {
        decision: {
          action: "defer",
          until: new Date(Date.now() + 60_000).toISOString(),
        } as NewsEnrichmentLeaseDecision,
      };
    }

    try {
      const latest = await translationState(
        client,
        input.candidate.archiveId,
        input.locale,
        input.candidate.contentHash,
      );
      if (latest?.status === "completed" || latest?.status === "not_required") {
        return { decision: { action: "skip_completed" } as NewsEnrichmentLeaseDecision };
      }

      if (latest?.status === "failed") {
        const retry = decideNewsEnrichmentRetry({
          failureReason: latest.failureReason,
          generatedAt: latest.generatedAt,
          failureCount: latest.failureCount,
          retryMinutes: input.retryMinutes,
          maximumFailures: input.maximumFailures ?? 3,
        });
        if (retry.action === "defer") {
          return {
            decision: { action: "defer", until: retry.until } as NewsEnrichmentLeaseDecision,
          };
        }
        if (retry.action === "attempt_budget_exhausted") {
          return {
            decision: {
              action: "attempt_budget_exhausted",
              failures: retry.failures,
            } as NewsEnrichmentLeaseDecision,
          };
        }
        if (retry.action === "terminal_failure") {
          return {
            decision: {
              action: "terminal_failure",
              failureClass: retry.failureClass,
              reason: retry.reason,
            } as NewsEnrichmentLeaseDecision,
          };
        }
      }

      const value = await input.run(client);
      return { decision: { action: "process" } as NewsEnrichmentLeaseDecision, value };
    } finally {
      await client.query(`SELECT pg_advisory_unlock(hashtextextended($1, 0))`, [lockKey]);
    }
  });

  if (!authority.enabled) throw new Error("news_enrichment_authority_disabled");
  return authority.value;
}

export async function persistNewsEnrichmentFailure(input: {
  client: PoolClient;
  candidate: NewsEnrichmentCandidate;
  locale: ContentLocale;
  generatedAt: string;
  providerId?: string | null;
  model?: string | null;
  reason: string;
  evidence?: Record<string, unknown>;
}): Promise<boolean> {
  return persistNewsArchiveTranslationTx(input.client, {
    archiveId: input.candidate.archiveId,
    locale: input.locale,
    status: "failed",
    providerId: input.providerId ?? null,
    model: input.model ?? null,
    sourceContentHash: input.candidate.contentHash,
    generatedAt: input.generatedAt,
    evidence: { reason: input.reason, ...(input.evidence ?? {}) },
  });
}
