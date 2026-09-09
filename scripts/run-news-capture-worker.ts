import { setTimeout as delay } from "node:timers/promises";

import { withTx } from "../src/lib/db";
import { readBoundedResponseText } from "../src/lib/bounded-http-body";
import { extractNewsTaxonomy } from "../src/lib/news-taxonomy";
import { validNewsPublishedAt } from "../src/lib/news-published-at";
import {
  canonicalPublisherUrl,
  persistNewsArchiveItemTx,
} from "../src/lib/news-growth-authority";
import {
  NEWS_SOURCE_REGISTRY,
  isApprovedNewsSourceHost,
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

type CaptureArticle = {
  source: NewsSourceRegistryEntry;
  title: string;
  lead: string;
  body: string;
  articleUrl: string;
  publishedAt: string;
  fetchedAt: string;
};

export type CaptureContinuity =
  | "bootstrap"
  | "proven_overlap"
  | "continuity_unproven"
  | "empty_feed"
  | "source_failed";

type SourceCaptureResult = {
  sourceName: string;
  fetchedCount: number;
  insertedCount: number;
  replayedCount: number;
  continuity: CaptureContinuity;
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

export function captureContinuity(input: {
  sourceFailed: boolean;
  previousHead: PreviousSourceHead | null;
  fetchedCount: number;
  replayedCount: number;
}): CaptureContinuity {
  if (input.sourceFailed) return "source_failed";
  if (!input.previousHead) return "bootstrap";
  if (input.fetchedCount === 0) return "empty_feed";
  if (input.replayedCount > 0) return "proven_overlap";
  return "continuity_unproven";
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

  const sourceResults = new Map<string, SourceCaptureResult>();
  for (const source of NEWS_SOURCE_REGISTRY) {
    sourceResults.set(source.name, {
      sourceName: source.name,
      fetchedCount: fetchedBySource.get(source.name) ?? 0,
      insertedCount: 0,
      replayedCount: 0,
      continuity: failedSources.has(source.name) ? "source_failed" : "bootstrap",
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
      const archive = await persistNewsArchiveItemTx(client, {
        sourceName: article.source.name,
        feedUrl: article.source.feedUrl,
        articleUrl: article.articleUrl,
        sourceLanguage: "en",
        sourceTitle: article.title,
        sourceLead: article.lead,
        sourceBody: article.body,
        publishedAt: article.publishedAt,
        fetchedAt: article.fetchedAt,
        taxonomy: extractNewsTaxonomy(`${article.title} ${article.lead} ${article.body}`),
      });
      const result = sourceResults.get(article.source.name);
      if (!result) continue;
      if (archive.inserted) result.insertedCount += 1;
      else result.replayedCount += 1;
    }

    for (const source of NEWS_SOURCE_REGISTRY) {
      const result = sourceResults.get(source.name);
      if (!result) continue;
      const previousHead = previousBySource.get(source.name) ?? null;
      result.previousLatestArticleUrl = previousHead?.articleUrl ?? null;
      result.previousLatestPublishedAt = previousHead?.publishedAt ?? null;
      result.continuity = captureContinuity({
        sourceFailed: failedSources.has(source.name),
        previousHead,
        fetchedCount: result.fetchedCount,
        replayedCount: result.replayedCount,
      });
    }
  });

  const results = [...sourceResults.values()];
  const insertedCount = results.reduce((sum, item) => sum + item.insertedCount, 0);
  const replayedCount = results.reduce((sum, item) => sum + item.replayedCount, 0);
  const continuityRiskCount = results.filter((item) =>
    item.continuity === "continuity_unproven" || item.continuity === "empty_feed"
  ).length;

  console.log(JSON.stringify({
    status: failures.length === 0 && continuityRiskCount === 0 ? "ok" : "degraded",
    mode: "capture_only",
    aiCalls: 0,
    fetchedAt,
    sourceCount: NEWS_SOURCE_REGISTRY.length,
    successfulSourceCount: NEWS_SOURCE_REGISTRY.length - failures.length,
    fetchedArticleCount: articles.length,
    insertedCount,
    replayedCount,
    continuityRiskCount,
    zeroLossClaim: continuityRiskCount === 0 && failures.length === 0
      ? "continuity_observed"
      : "not_proven",
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
