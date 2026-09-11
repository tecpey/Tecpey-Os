import { setTimeout as delay } from "node:timers/promises";
import type { PoolClient } from "pg";

import { withTx } from "../src/lib/db";
import { readBoundedResponseText } from "../src/lib/bounded-http-body";
import { extractNewsTaxonomy } from "../src/lib/news-taxonomy";
import { classifyFeedSourceCoverage } from "../src/lib/news-feed-evidence";
import {
  executeNewsHydrationPlan,
  newsHydrationNextRetryAt,
  type NewsHydrationOutcome,
} from "../src/lib/news-full-evidence-capture";
import { fetchNewsPublisherEvidence } from "../src/lib/news-publisher-evidence";
import { validNewsPublishedAt } from "../src/lib/news-published-at";
import {
  canonicalPublisherUrl,
  persistNewsArchiveItemTx,
} from "../src/lib/news-growth-authority";
import {
  NEWS_SOURCE_REGISTRY,
  captureContinuity,
  isApprovedNewsSourceHost,
  isContinuityRisk,
  participatesInContinuity,
  type CaptureContinuity,
  type NewsSourceContinuityMode,
  type NewsSourceRegistryEntry,
} from "../src/lib/news-source-registry";
import {
  DEFAULT_NEWS_FEED_MAX_ATTEMPTS,
  DEFAULT_NEWS_FEED_RETRY_BASE_DELAY_MS,
  newsFeedRetryDelayMs,
  shouldRetryNewsFeedFailure,
} from "../src/lib/ops/news-materialization-runtime-policy";

const NEWS_FEED_TIMEOUT_MS = 7_000;
const MAX_NEWS_FEED_BYTES = 2_000_000;
const DEFAULT_CAPTURE_LIMIT_PER_SOURCE = 300;
const MAX_CAPTURE_LIMIT_PER_SOURCE = 300;
const NEWS_ARTICLE_FETCH_CONCURRENCY = 4;

type CaptureArticle = {
  source: NewsSourceRegistryEntry;
  title: string;
  lead: string;
  body: string;
  articleUrl: string;
  publishedAt: string;
  fetchedAt: string;
  sourceCoverage: "feed_full" | "feed_summary" | "article_full";
  extractionMethod:
    | "feed_description"
    | "feed_content"
    | "json_ld_article_body"
    | "article_paragraphs"
    | "main_paragraphs";
  evidenceCharacterCount: number;
};

type SourceCaptureResult = {
  sourceName: string;
  fetchedCount: number;
  insertedCount: number;
  replayedCount: number;
  continuity: CaptureContinuity;
  continuityMode: NewsSourceContinuityMode;
  quarantineReason: string | null;
  previousLatestArticleUrl: string | null;
  previousLatestPublishedAt: string | null;
};

type PreviousSourceHead = {
  articleUrl: string;
  publishedAt: string;
};

function boundedIntegerEnv(name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  if (!/^\d+$/.test(raw.trim())) throw new Error(`${name.toLowerCase()}_invalid`);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name.toLowerCase()}_out_of_range`);
  }
  return parsed;
}

function clean(value: string): string {
  return value
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function pick(xml: string, tag: string): string {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return clean(match?.[1] ?? "");
}

function safeArticleUrl(rawUrl: string, source: NewsSourceRegistryEntry): string | null {
  try {
    const candidate = canonicalPublisherUrl(rawUrl);
    const host = new URL(candidate).hostname;
    return isApprovedNewsSourceHost(host, source) ? candidate : null;
  } catch {
    return null;
  }
}

function feedFailureHttpStatus(error: unknown): number | null {
  if (!(error instanceof Error)) return null;
  const match = error.message.match(/^news_feed_failed:[^:]+:(\d{3})$/);
  if (!match) return null;
  const status = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(status) ? status : null;
}

function parseFeed(
  xml: string,
  source: NewsSourceRegistryEntry,
  fetchedAt: string,
  limit: number,
): CaptureArticle[] {
  const itemBlocks = Array.from(xml.matchAll(/<item[\s\S]*?<\/item>/gi)).map((match) => match[0]);
  const entryBlocks = Array.from(xml.matchAll(/<entry[\s\S]*?<\/entry>/gi)).map((match) => match[0]);
  const blocks = (itemBlocks.length > 0 ? itemBlocks : entryBlocks).slice(0, limit);

  return blocks.flatMap((block): CaptureArticle[] => {
    const title = pick(block, "title");
    if (!title) return [];

    const description = pick(block, "description") || pick(block, "summary");
    const fullContent = pick(block, "content:encoded") || pick(block, "content");
    const body = fullContent || description || title;
    const lead = description || body.slice(0, 1_200) || title;
    const sourceCoverage = classifyFeedSourceCoverage({
      fullContent,
      description,
    });
    const extractionMethod = fullContent ? "feed_content" : "feed_description";
    const hrefMatch = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i);
    const rawUrl = pick(block, "link") || clean(hrefMatch?.[1] ?? "");
    const articleUrl = safeArticleUrl(rawUrl, source);
    if (!articleUrl) return [];

    const publishedAt = validNewsPublishedAt(
      pick(block, "pubDate") || pick(block, "published") || pick(block, "updated"),
      fetchedAt,
    );
    if (!publishedAt) return [];

    return [{
      source,
      title,
      lead,
      body,
      articleUrl,
      publishedAt,
      fetchedAt,
      sourceCoverage,
      extractionMethod,
      evidenceCharacterCount: body.length,
    }];
  });
}

async function fetchSourceOnce(
  source: NewsSourceRegistryEntry,
  fetchedAt: string,
  limit: number,
): Promise<CaptureArticle[]> {
  const response = await fetch(source.feedUrl, {
    headers: { "user-agent": "TecPeyNewsCaptureBot/1.0 (+https://tecpey.ir/crypto-news)" },
    signal: AbortSignal.timeout(NEWS_FEED_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`news_feed_failed:${source.name}:${response.status}`);

  const xml = await readBoundedResponseText(response, {
    maxBytes: MAX_NEWS_FEED_BYTES,
    errorCode: `news_feed_too_large:${source.name}`,
  });
  return parseFeed(xml, source, fetchedAt, limit);
}

async function fetchSource(
  source: NewsSourceRegistryEntry,
  fetchedAt: string,
  limit: number,
  maximumAttempts: number,
  retryBaseDelayMs: number,
): Promise<CaptureArticle[]> {
  let lastError: unknown = new Error(`news_feed_failed:${source.name}:unknown`);
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      return await fetchSourceOnce(source, fetchedAt, limit);
    } catch (error) {
      lastError = error;
      if (!shouldRetryNewsFeedFailure({
        attempt,
        maximumAttempts,
        httpStatus: feedFailureHttpStatus(error),
      })) throw error;
      await delay(newsFeedRetryDelayMs({ attempt, baseDelayMs: retryBaseDelayMs }));
    }
  }
  throw lastError;
}


type HydrationResult = {
  article: CaptureArticle;
  outcome: NewsHydrationOutcome;
};

async function hydratePublisherEvidence(
  article: CaptureArticle,
): Promise<HydrationResult> {
  const evidence = await fetchNewsPublisherEvidence({
    source: article.source,
    articleUrl: article.articleUrl,
    lead: article.lead,
    body: article.body,
    sourceCoverage: article.sourceCoverage === "article_full"
      ? "feed_full"
      : article.sourceCoverage,
  });

  if (
    evidence.coverage !== "article_full"
    || evidence.hydrationOutcome !== "hydrated"
    || evidence.extractionMethod === null
  ) {
    if (evidence.hydrationOutcome === null) {
      throw new Error(
        `news_hydration_planner_invariant:${article.source.name}`,
      );
    }

    return {
      article,
      outcome: evidence.hydrationOutcome,
    };
  }

  return {
    article: {
      ...article,
      body: evidence.body,
      sourceCoverage: "article_full",
      extractionMethod: evidence.extractionMethod,
      evidenceCharacterCount: evidence.sourceBodyCharacterCount,
    },
    outcome: "hydrated",
  };
}

async function readAlreadyHydratedArticleUrls(
  articleUrls: readonly string[],
): Promise<Set<string>> {
  if (articleUrls.length === 0) return new Set();

  const transaction = await withTx(async (client) => {
    const result = await client.query<{ article_url: string }>(
      `SELECT DISTINCT article_url
         FROM platform_news_archive_items
        WHERE article_url = ANY($1::text[])
          AND source_coverage = 'article_full'`,
      [articleUrls],
    );

    return new Set(result.rows.map((row) => row.article_url));
  });

  if (!transaction.enabled) {
    throw new Error("news_capture_hydration_database_unavailable");
  }

  return transaction.value;
}

export function dedupeCapturedArticles(items: readonly CaptureArticle[]): CaptureArticle[] {
  const selected = new Map<string, CaptureArticle>();
  for (const item of items) {
    const key = `${item.articleUrl.toLowerCase()}|${item.title.toLowerCase()}`;
    const previous = selected.get(key);
    if (!previous || Date.parse(previous.publishedAt) < Date.parse(item.publishedAt)) {
      selected.set(key, item);
    }
  }
  return [...selected.values()].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}


async function readHydrationCooldownArticleUrls(
  articleUrls: readonly string[],
  now: string,
): Promise<Set<string>> {
  if (articleUrls.length === 0) return new Set();

  const transaction = await withTx(async (client) => {
    const result = await client.query<{ article_url: string }>(
      `SELECT article_url
         FROM platform_news_hydration_state
        WHERE article_url = ANY($1::text[])
          AND hydrated_at IS NULL
          AND next_retry_at IS NOT NULL
          AND next_retry_at > $2::timestamptz`,
      [articleUrls, now],
    );

    return new Set(result.rows.map((row) => row.article_url));
  });

  if (!transaction.enabled) {
    throw new Error("news_capture_hydration_database_unavailable");
  }

  return transaction.value;
}

async function persistHydrationAttemptTx(
  client: PoolClient,
  input: {
    article: CaptureArticle;
    outcome: NewsHydrationOutcome;
    attemptedAt: string;
  },
): Promise<void> {
  const state = await client.query<{ attempt_count: number }>(
    `INSERT INTO platform_news_hydration_state
       (article_url, source_name, attempt_count, last_outcome,
        last_attempt_at, next_retry_at, hydrated_at, updated_at)
     VALUES (
       $1, $2, 1, $3, $4::timestamptz, NULL,
       CASE WHEN $3 = 'hydrated' THEN $4::timestamptz ELSE NULL END,
       NOW()
     )
     ON CONFLICT (article_url) DO UPDATE SET
       source_name = EXCLUDED.source_name,
       attempt_count = LEAST(
         platform_news_hydration_state.attempt_count + 1,
         1000
       ),
       last_outcome = EXCLUDED.last_outcome,
       last_attempt_at = EXCLUDED.last_attempt_at,
       next_retry_at = NULL,
       hydrated_at = CASE
         WHEN EXCLUDED.last_outcome = 'hydrated'
           THEN EXCLUDED.last_attempt_at
         ELSE platform_news_hydration_state.hydrated_at
       END,
       updated_at = NOW()
     WHERE platform_news_hydration_state.hydrated_at IS NULL
     RETURNING attempt_count`,
    [
      input.article.articleUrl,
      input.article.source.name,
      input.outcome,
      input.attemptedAt,
    ],
  );

  const persisted = state.rows[0];
  if (!persisted) {
    // A concurrent capture already committed terminal rich evidence.
    return;
  }

  const attemptCount = Number(persisted.attempt_count);
  if (!Number.isSafeInteger(attemptCount) || attemptCount < 1) {
    throw new Error("news_hydration_attempt_count_persist_invalid");
  }

  const nextRetryAt = newsHydrationNextRetryAt({
    outcome: input.outcome,
    attemptCount,
    attemptedAt: input.attemptedAt,
  });

  await client.query(
    `UPDATE platform_news_hydration_state
        SET next_retry_at = $2::timestamptz,
            updated_at = NOW()
      WHERE article_url = $1`,
    [input.article.articleUrl, nextRetryAt],
  );

}

async function main(): Promise<void> {
  const fetchedAt = new Date(process.env.NEWS_CAPTURE_FETCHED_AT ?? Date.now()).toISOString();
  const limitPerSource = boundedIntegerEnv(
    "NEWS_MATERIALIZATION_LIMIT_PER_SOURCE",
    DEFAULT_CAPTURE_LIMIT_PER_SOURCE,
    1,
    MAX_CAPTURE_LIMIT_PER_SOURCE,
  );
  const maximumAttempts = boundedIntegerEnv(
    "NEWS_FEED_MAX_ATTEMPTS",
    DEFAULT_NEWS_FEED_MAX_ATTEMPTS,
    1,
    3,
  );
  const retryBaseDelayMs = boundedIntegerEnv(
    "NEWS_FEED_RETRY_BASE_DELAY_MS",
    DEFAULT_NEWS_FEED_RETRY_BASE_DELAY_MS,
    100,
    2_000,
  );

  const settled = await Promise.allSettled(
    NEWS_SOURCE_REGISTRY.map((source) => fetchSource(
      source,
      fetchedAt,
      limitPerSource,
      maximumAttempts,
      retryBaseDelayMs,
    )),
  );

  const failures = settled.flatMap((result, index) => result.status === "rejected"
    ? [{
        sourceName: NEWS_SOURCE_REGISTRY[index].name,
        reason: result.reason instanceof Error ? result.reason.message : "unknown",
      }]
    : []);
  const failedSources = new Set(failures.map((failure) => failure.sourceName));
  const fetchedBySource = new Map<string, number>();
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    for (const article of result.value) {
      fetchedBySource.set(article.source.name, (fetchedBySource.get(article.source.name) ?? 0) + 1);
    }
  }

  const articles = dedupeCapturedArticles(
    settled.flatMap((result) => result.status === "fulfilled" ? result.value : []),
  );

  const hydrationEligibleArticles = articles.filter(
    (article) =>
      article.sourceCoverage === "feed_summary"
      && article.source.allowFullArticleFetch,
  );

  const hydrationEligibleUrls = hydrationEligibleArticles.map(
    (article) => article.articleUrl,
  );

  const alreadyHydrated = await readAlreadyHydratedArticleUrls(
    hydrationEligibleUrls,
  );

  const cooldownBlocked = await readHydrationCooldownArticleUrls(
    hydrationEligibleUrls,
    fetchedAt,
  );

  const hydrationReadyCount = hydrationEligibleArticles.filter(
    (article) =>
      !alreadyHydrated.has(article.articleUrl)
      && !cooldownBlocked.has(article.articleUrl),
  ).length;

  const hydrationResults = await executeNewsHydrationPlan({
    articles: articles.map((article) => ({
      article,
      articleUrl: article.articleUrl,
      sourceCoverage: article.sourceCoverage,
      allowFullArticleFetch: article.source.allowFullArticleFetch,
    })),
    alreadyHydratedArticleUrls: alreadyHydrated,
    cooldownBlockedArticleUrls: cooldownBlocked,
    concurrency: NEWS_ARTICLE_FETCH_CONCURRENCY,
    hydrate: async ({ article }) => hydratePublisherEvidence(article),
  });

  const hydrationResultByUrl = new Map(
    hydrationResults.map(
      (result) => [result.article.articleUrl, result] as const,
    ),
  );

  const hydratedByUrl = new Map(
    hydrationResults
      .filter((result) => result.outcome === "hydrated")
      .map(
        (result) => [result.article.articleUrl, result.article] as const,
      ),
  );

  const hydrationOutcomeCounts = hydrationResults.reduce<Record<NewsHydrationOutcome, number>>(
    (counts, result) => {
      counts[result.outcome] += 1;
      return counts;
    },
    {
      hydrated: 0,
      host_rejected: 0,
      redirect_rejected: 0,
      redirect_limit: 0,
      timeout: 0,
      network_error: 0,
      http_failure: 0,
      content_type_rejected: 0,
      too_large: 0,
      extraction_empty: 0,
      identity_collision: 0,
    },
  );

  const hydrationAudit = {
    eligibleCount: hydrationEligibleArticles.length,
    readyCount: hydrationReadyCount,
    attemptedCount: hydrationResults.length,
    requestCeilingDeferredCount: Math.max(
      0,
      hydrationReadyCount - hydrationResults.length,
    ),
    skippedPolicyCount: articles.filter(
      (article) =>
        article.sourceCoverage === "feed_summary"
        && !article.source.allowFullArticleFetch,
    ).length,
    skippedExistingRichCount: alreadyHydrated.size,
    skippedCooldownCount: cooldownBlocked.size,
    richVersionInsertedCount: 0,
    richVersionReplayedCount: 0,
    outcomes: hydrationOutcomeCounts,
  };

  const sourceResults = new Map<string, SourceCaptureResult>();
  for (const source of NEWS_SOURCE_REGISTRY) {
    sourceResults.set(source.name, {
      sourceName: source.name,
      fetchedCount: fetchedBySource.get(source.name) ?? 0,
      insertedCount: 0,
      replayedCount: 0,
      continuity: failedSources.has(source.name) ? "source_failed" : "bootstrap",
      continuityMode: source.continuityMode ?? "required",
      quarantineReason: source.quarantineReason ?? null,
      previousLatestArticleUrl: null,
      previousLatestPublishedAt: null,
    });
  }

  await withTx(async (client) => {
    const previous = await client.query<{
      source_name: string;
      article_url: string;
      published_at: string | Date;
    }>(
      `SELECT DISTINCT ON (source_name)
              source_name, article_url, published_at
         FROM platform_news_archive_items
        WHERE source_name = ANY($1::text[])
        ORDER BY source_name, published_at DESC, fetched_at DESC, archive_id DESC`,
      [NEWS_SOURCE_REGISTRY.map((source) => source.name)],
    );
    const previousBySource = new Map<string, PreviousSourceHead>(
      previous.rows.map((row) => [
        row.source_name,
        {
          articleUrl: row.article_url,
          publishedAt: new Date(row.published_at).toISOString(),
        },
      ]),
    );

    for (const article of articles) {
      const feedArchive = await persistNewsArchiveItemTx(client, {
        sourceName: article.source.name,
        feedUrl: article.source.feedUrl,
        articleUrl: article.articleUrl,
        sourceLanguage: "en",
        sourceTitle: article.title,
        sourceLead: article.lead,
        sourceBody: article.body,
        sourceCoverage: article.sourceCoverage,
        extractionMethod: article.extractionMethod,
        evidenceCharacterCount: article.evidenceCharacterCount,
        publishedAt: article.publishedAt,
        fetchedAt: article.fetchedAt,
        taxonomy: extractNewsTaxonomy(
          `${article.title} ${article.lead} ${article.body}`,
        ),
      });

      const result = sourceResults.get(article.source.name);
      if (result) {
        if (feedArchive.inserted) result.insertedCount += 1;
        else result.replayedCount += 1;
      }

      const hydrationResult = hydrationResultByUrl.get(article.articleUrl);
      const hydrated = hydratedByUrl.get(article.articleUrl);

      if (!hydrated || hydrated.sourceCoverage !== "article_full") {
        if (hydrationResult) {
          await persistHydrationAttemptTx(client, {
            article: hydrationResult.article,
            outcome: hydrationResult.outcome,
            attemptedAt: fetchedAt,
          });
        }
        continue;
      }

      const richArchive = await persistNewsArchiveItemTx(client, {
        sourceName: hydrated.source.name,
        feedUrl: hydrated.source.feedUrl,
        articleUrl: hydrated.articleUrl,
        sourceLanguage: "en",
        sourceTitle: hydrated.title,
        sourceLead: hydrated.lead,
        sourceBody: hydrated.body,
        sourceCoverage: hydrated.sourceCoverage,
        extractionMethod: hydrated.extractionMethod,
        evidenceCharacterCount: hydrated.evidenceCharacterCount,
        publishedAt: hydrated.publishedAt,
        fetchedAt: hydrated.fetchedAt,
        taxonomy: extractNewsTaxonomy(
          `${hydrated.title} ${hydrated.lead} ${hydrated.body}`,
        ),
      });

      if (richArchive.inserted) {
        hydrationAudit.richVersionInsertedCount += 1;
      } else {
        hydrationAudit.richVersionReplayedCount += 1;
      }

      await persistHydrationAttemptTx(client, {
        article: hydrated,
        outcome: richArchive.inserted ? "hydrated" : "identity_collision",
        attemptedAt: fetchedAt,
      });
    }

    for (const source of NEWS_SOURCE_REGISTRY) {
      const result = sourceResults.get(source.name);
      if (!result) continue;
      const previousHead = previousBySource.get(source.name) ?? null;
      result.previousLatestArticleUrl = previousHead?.articleUrl ?? null;
      result.previousLatestPublishedAt = previousHead?.publishedAt ?? null;
      result.continuity = captureContinuity({
        sourceFailed: failedSources.has(source.name),
        previousHeadExists: previousHead !== null,
        fetchedCount: result.fetchedCount,
        replayedCount: result.replayedCount,
      });
    }
  });

  const results = [...sourceResults.values()];
  const insertedCount = results.reduce((sum, item) => sum + item.insertedCount, 0);
  const replayedCount = results.reduce((sum, item) => sum + item.replayedCount, 0);
  const requiredSourceNames = new Set(
    NEWS_SOURCE_REGISTRY
      .filter((source) => participatesInContinuity(source.continuityMode))
      .map((source) => source.name),
  );
  const continuityRiskCount = results.filter((item) =>
    requiredSourceNames.has(item.sourceName) && isContinuityRisk(item.continuity)
  ).length;
  const blockingFailureCount = failures.filter((failure) => requiredSourceNames.has(failure.sourceName)).length;
  const quarantinedSourceCount = NEWS_SOURCE_REGISTRY.length - requiredSourceNames.size;
  const continuityObserved = continuityRiskCount === 0 && blockingFailureCount === 0;

  console.log(JSON.stringify({
    status: continuityObserved ? "ok" : "degraded",
    mode: "capture_only",
    aiCalls: 0,
    fetchedAt,
    sourceCount: NEWS_SOURCE_REGISTRY.length,
    requiredSourceCount: requiredSourceNames.size,
    quarantinedSourceCount,
    successfulSourceCount: NEWS_SOURCE_REGISTRY.length - failures.length,
    fetchedArticleCount: articles.length,
    hydrationAudit,
    insertedCount,
    replayedCount,
    continuityRiskCount,
    blockingFailureCount,
    continuityScope: "required_sources_only",
    zeroLossClaim: continuityObserved ? "continuity_observed" : "not_proven",
    sourceResults: results,
    failures,
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: "failed",
    mode: "capture_only",
    aiCalls: 0,
    reason: error instanceof Error ? error.message : "unknown",
  }));
  process.exitCode = 1;
});
