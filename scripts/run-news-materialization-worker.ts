import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { withTx } from "../src/lib/db";
import type { ContentLocale } from "../src/lib/content-growth";
import type { RawNewsInput, NewsAutomationDecision } from "../src/lib/news-automation";
import { buildNewsAutomationBatch } from "../src/lib/news-automation";
import {
  buildNewsMaterializationFreshnessReport,
  runNewsMaterializationWorkerTx,
  buildNewsMaterializationRunEvidence,
  writeNewsMaterializationLastRun,
  type NewsMaterializationWorkerResult,
  type NewsMaterializationSchedulerFailure,
} from "../src/lib/news-materialization-worker";
import type { NewsMaterializationSourceMode } from "../src/lib/news-materialization-persistence";
import { persistOperationalJobRunTx } from "../src/lib/ops/operational-job-evidence";
import { readBoundedResponseText } from "../src/lib/bounded-http-body";
import { extractNewsTaxonomy } from "../src/lib/news-taxonomy";
import {
  canonicalPublisherUrl,
  getReusableNewsArchiveTranslationsFromAuthority,
  newsArchiveContentHash,
  persistGrowthTrendSignalsTx,
  persistNewsArchiveItemTx,
  persistNewsArchiveTranslationTx,
  reusableNewsArchiveTranslationKey,
} from "../src/lib/news-growth-authority";
import {
  buildReusedPersianNewsTranslation,
  translateNewsFeedToPersian,
  type NewsTranslationResult,
} from "../src/lib/news-translation";
import { submitIndexNowUrls } from "../src/lib/indexnow";
import type { GrowthTrendSignal } from "../src/lib/growth-trend-intelligence";

type ApprovedFeedSource = {
  name: string;
  feedUrl: string;
  fallbackUrl: string;
};

type FetchedArticle = {
  source: ApprovedFeedSource;
  title: string;
  lead: string;
  body: string;
  articleUrl: string;
  publishedAt: string;
  fetchedAt: string;
  sourceCoverage: "feed_full" | "feed_summary";
};

type PreparedArticle = FetchedArticle & {
  taxonomy: ReturnType<typeof extractNewsTaxonomy>;
  translation: Awaited<ReturnType<typeof translateNewsFeedToPersian>>;
  translationReused: boolean;
};

const NEWS_FEED_TIMEOUT_MS = 7_000;
const MAX_NEWS_FEED_BYTES = 2_000_000;
const MAX_ARCHIVE_AGE_MS = 35 * 24 * 60 * 60 * 1_000;

const INTERNATIONAL_FEED_SOURCES: readonly ApprovedFeedSource[] = [
  { name: "CoinDesk", feedUrl: "https://www.coindesk.com/arc/outboundfeeds/rss/", fallbackUrl: "https://www.coindesk.com" },
  { name: "Cointelegraph", feedUrl: "https://cointelegraph.com/rss", fallbackUrl: "https://cointelegraph.com" },
  { name: "Decrypt", feedUrl: "https://decrypt.co/feed", fallbackUrl: "https://decrypt.co" },
  { name: "The Block", feedUrl: "https://www.theblock.co/rss.xml", fallbackUrl: "https://www.theblock.co" },
] as const;

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

function parseSourceMode(): NewsMaterializationSourceMode {
  const raw = process.env.NEWS_MATERIALIZATION_SOURCE_MODE ?? "live";
  if (!(["live", "fallback", "manual_seed", "test"] as const).includes(raw as NewsMaterializationSourceMode)) {
    throw new Error("news_materialization_source_mode_invalid");
  }
  return raw as NewsMaterializationSourceMode;
}

function clean(value: string): string {
  return value
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
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

function validPublishedAt(raw: string, fetchedAt: string): string | null {
  const timestamp = Date.parse(raw);
  const fetched = Date.parse(fetchedAt);
  if (!Number.isFinite(timestamp) || !Number.isFinite(fetched)) return null;
  if (timestamp > fetched + 10 * 60_000 || fetched - timestamp > MAX_ARCHIVE_AGE_MS) return null;
  return new Date(timestamp).toISOString();
}

function safeArticleUrl(rawUrl: string, source: ApprovedFeedSource): string | null {
  try {
    const candidate = canonicalPublisherUrl(rawUrl);
    const host = new URL(candidate).hostname.replace(/^www\./, "").toLowerCase();
    const expected = new URL(source.fallbackUrl).hostname.replace(/^www\./, "").toLowerCase();
    if (host === expected || host.endsWith(`.${expected}`)) return candidate;
  } catch {
    return null;
  }
  return null;
}

async function fetchSourceArticles(source: ApprovedFeedSource, fetchedAt: string, limit: number): Promise<FetchedArticle[]> {
  const response = await fetch(source.feedUrl, {
    headers: { "user-agent": "TecPeyNewsBot/2.0 (+https://tecpey.ir/crypto-news)" },
    signal: AbortSignal.timeout(NEWS_FEED_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`news_feed_failed:${source.name}:${response.status}`);
  const xml = await readBoundedResponseText(response, {
    maxBytes: MAX_NEWS_FEED_BYTES,
    errorCode: `news_feed_too_large:${source.name}`,
  });
  const itemBlocks = Array.from(xml.matchAll(/<item[\s\S]*?<\/item>/gi)).map((match) => match[0]);
  const entryBlocks = Array.from(xml.matchAll(/<entry[\s\S]*?<\/entry>/gi)).map((match) => match[0]);
  const blocks = (itemBlocks.length ? itemBlocks : entryBlocks).slice(0, limit);

  return blocks.flatMap((block): FetchedArticle[] => {
    const title = pick(block, "title");
    if (!title) return [];
    const description = pick(block, "description") || pick(block, "summary");
    const fullContent = pick(block, "content:encoded") || pick(block, "content");
    const body = fullContent || description || title;
    const lead = description || body.slice(0, 1_200) || title;
    const hrefMatch = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i);
    const rawUrl = pick(block, "link") || clean(hrefMatch?.[1] ?? "");
    const publishedAt = validPublishedAt(
      pick(block, "pubDate") || pick(block, "published") || pick(block, "updated"),
      fetchedAt,
    );
    if (!publishedAt) return [];
    const articleUrl = safeArticleUrl(rawUrl, source);
    if (!articleUrl) return [];
    return [{
      source,
      title,
      lead,
      body,
      articleUrl,
      publishedAt,
      fetchedAt,
      sourceCoverage: fullContent && fullContent.length > description.length + 120 ? "feed_full" : "feed_summary",
    }];
  });
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function consume(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => consume()));
  return results;
}

function dedupeArticles(items: FetchedArticle[]): FetchedArticle[] {
  const selected = new Map<string, FetchedArticle>();
  for (const item of items) {
    const key = `${item.articleUrl.toLowerCase()}|${item.title.toLowerCase()}`;
    const previous = selected.get(key);
    if (!previous || Date.parse(previous.publishedAt) < Date.parse(item.publishedAt)) selected.set(key, item);
  }
  return Array.from(selected.values()).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

function toEnglishInput(item: PreparedArticle): RawNewsInput {
  return {
    locale: "en",
    title: item.title,
    summary: item.lead,
    sourceName: item.source.name,
    sourceUrl: item.articleUrl,
    url: item.articleUrl,
    publishedAt: item.publishedAt,
    fetchedAt: item.fetchedAt,
  };
}

function toPersianInput(item: PreparedArticle): RawNewsInput | null {
  if (!item.translation.ok) return null;
  return {
    locale: "fa",
    title: item.translation.translation.title,
    summary: item.translation.translation.lead,
    sourceName: item.source.name,
    sourceUrl: item.articleUrl,
    url: item.articleUrl,
    publishedAt: item.publishedAt,
    fetchedAt: item.fetchedAt,
  };
}

function decisionTrendSignals(decisions: NewsAutomationDecision[], observedAt: string): GrowthTrendSignal[] {
  const signals: GrowthTrendSignal[] = [];
  for (const decision of decisions) {
    const article = decision.article;
    const statusConfidence = decision.status === "publishable" ? 1 : decision.status === "needs_review" ? 0.72 : 0.45;
    const manipulationRisk = article.topicTags.includes("memecoins") ? 0.28 : article.tone === "risk" ? 0.14 : 0.04;
    const common = {
      locale: article.locale as ContentLocale,
      sourceFamily: "news" as const,
      sourceName: article.sourceName,
      sourceUrl: article.canonicalUrl,
      observedAt,
      window: "24h" as const,
      magnitude: Math.min(1, article.impactScore),
      velocity: article.priority / 100,
      confidence: Math.min(1, article.sourceTrust * statusConfidence),
      authority: article.sourceTrust,
      manipulationRisk,
      evidenceLabel: `${article.title} · ${decision.status}`,
    };
    for (const symbol of article.detectedCoins) {
      signals.push({ id: `news:${article.id}:coin:${symbol}`, entityType: "coin", entityId: symbol.toLowerCase(), label: symbol, ...common });
    }
    for (const slug of article.detectedTools) {
      signals.push({ id: `news:${article.id}:tool:${slug}`, entityType: "tool", entityId: slug, label: slug, ...common });
    }
    for (const topic of article.topicTags) {
      signals.push({ id: `news:${article.id}:topic:${topic}`, entityType: "topic", entityId: topic, label: topic, ...common });
    }
  }
  return signals;
}

async function fetchCoinGeckoTrendSignals(observedAt: string): Promise<GrowthTrendSignal[]> {
  const apiKey = process.env.COINGECKO_API_KEY?.trim();
  try {
    const response = await fetch("https://api.coingecko.com/api/v3/search/trending", {
      headers: apiKey ? { "x-cg-demo-api-key": apiKey } : undefined,
      signal: AbortSignal.timeout(6_000),
      cache: "no-store",
    });
    if (!response.ok) return [];
    const payload = await response.json() as {
      coins?: Array<{ item?: { id?: unknown; name?: unknown; symbol?: unknown; market_cap_rank?: unknown } }>;
    };
    const rows = Array.isArray(payload.coins) ? payload.coins.slice(0, 20) : [];
    return rows.flatMap((row, index): GrowthTrendSignal[] => {
      const symbol = String(row.item?.symbol ?? "").trim().toUpperCase();
      const name = String(row.item?.name ?? symbol).trim();
      if (!/^[A-Z0-9]{2,15}$/.test(symbol) || !name) return [];
      const rank = Number(row.item?.market_cap_rank);
      const manipulationRisk = !Number.isFinite(rank) ? 0.5 : rank > 500 ? 0.48 : rank > 150 ? 0.28 : 0.08;
      return [{
        id: `coingecko:${observedAt}:${symbol}`,
        entityType: "coin",
        entityId: symbol.toLowerCase(),
        label: name,
        locale: "global",
        sourceFamily: "market",
        sourceName: "CoinGecko Trending",
        sourceUrl: "https://www.coingecko.com/en/highlights/trending-crypto",
        observedAt,
        window: "24h",
        magnitude: Math.max(0.2, 1 - index / Math.max(1, rows.length)),
        velocity: Math.max(0.2, 1 - index / 24),
        confidence: 0.88,
        authority: 0.88,
        manipulationRisk,
        evidenceLabel: `CoinGecko trending position ${index + 1}`,
      }];
    });
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const sourceMode = parseSourceMode();
  const limitPerSource = boundedIntegerEnv("NEWS_MATERIALIZATION_LIMIT_PER_SOURCE", 100, 1, 250);
  const translationConcurrency = boundedIntegerEnv("NEWS_TRANSLATION_CONCURRENCY", 2, 1, 4);
  const translationRetryMinutes = boundedIntegerEnv("NEWS_TRANSLATION_RETRY_MINUTES", 60, 15, 24 * 60);
  const fetchedAt = new Date(process.env.NEWS_MATERIALIZATION_FETCHED_AT ?? Date.now()).toISOString();
  const results: NewsMaterializationWorkerResult[] = [];
  const failures: NewsMaterializationSchedulerFailure[] = [];

  const settled = await Promise.allSettled(
    INTERNATIONAL_FEED_SOURCES.map((source) => fetchSourceArticles(source, fetchedAt, limitPerSource)),
  );
  settled.forEach((result, index) => {
    if (result.status === "rejected") {
      failures.push({ reasonCode: `news_feed_failed_${INTERNATIONAL_FEED_SOURCES[index].name.toLowerCase().replace(/\W+/g, "_")}` });
    }
  });
  const articles = dedupeArticles(settled.flatMap((result) => result.status === "fulfilled" ? result.value : []));
  const archiveLookupInputs = articles.map((article) => ({
    articleUrl: article.articleUrl,
    sourceTitle: article.title,
    sourceLead: article.lead,
    sourceBody: article.body,
  }));
  const reusableTranslations = await getReusableNewsArchiveTranslationsFromAuthority(archiveLookupInputs);
  const prepared = await mapWithConcurrency(articles, translationConcurrency, async (article): Promise<PreparedArticle> => {
    const contentHash = newsArchiveContentHash({
      articleUrl: article.articleUrl,
      sourceTitle: article.title,
      sourceLead: article.lead,
      sourceBody: article.body,
    });
    const reusable = reusableTranslations.get(reusableNewsArchiveTranslationKey(article.articleUrl, contentHash));
    let translation: NewsTranslationResult;
    let translationReused = false;
    if (
      reusable?.status === "completed" &&
      reusable.translatedTitle && reusable.translatedLead && reusable.translatedBody
    ) {
      translation = buildReusedPersianNewsTranslation({
        title: reusable.translatedTitle,
        lead: reusable.translatedLead,
        body: reusable.translatedBody,
        sourceTitle: article.title,
        sourceLead: article.lead,
        sourceBody: article.body,
        providerId: reusable.providerId,
        model: reusable.model,
        sourceCoverage: article.sourceCoverage,
      });
      translationReused = translation.ok;
    } else if (
      reusable?.status === "failed" &&
      Date.now() - Date.parse(reusable.generatedAt) < translationRetryMinutes * 60_000
    ) {
      translation = {
        ok: false,
        reason: "translation_retry_deferred",
        providerId: reusable.providerId ?? undefined,
        model: reusable.model ?? undefined,
        retryDeferredUntil: new Date(Date.parse(reusable.generatedAt) + translationRetryMinutes * 60_000).toISOString(),
      };
    } else {
      translation = await translateNewsFeedToPersian({
        title: article.title,
        lead: article.lead,
        body: article.body,
        sourceName: article.source.name,
        sourceUrl: article.articleUrl,
        sourceCoverage: article.sourceCoverage,
      });
    }
    return {
      ...article,
      taxonomy: extractNewsTaxonomy(`${article.title} ${article.lead} ${article.body}`),
      translation,
      translationReused,
    };
  });

  let enInputs: RawNewsInput[] = [];
  let faInputs: RawNewsInput[] = [];
  let enDecisions: NewsAutomationDecision[] = [];
  let faDecisions: NewsAutomationDecision[] = [];
  let trendSignals: GrowthTrendSignal[] = [];
  let archiveTransactionCommitted = false;
  const changedArticleUrls = new Set<string>();
  const freshArticleUrls = new Set<string>();
  const marketTrendSignals = await fetchCoinGeckoTrendSignals(fetchedAt);

  try {
    const transaction = await withTx(async (client) => {
      const stablePrepared: PreparedArticle[] = [];
      for (const item of prepared) {
        const archive = await persistNewsArchiveItemTx(client, {
          sourceName: item.source.name,
          feedUrl: item.source.feedUrl,
          articleUrl: item.articleUrl,
          sourceLanguage: "en",
          sourceTitle: item.title,
          sourceLead: item.lead,
          sourceBody: item.body,
          publishedAt: item.publishedAt,
          fetchedAt: item.fetchedAt,
          taxonomy: item.taxonomy,
        });
        if (archive.inserted) {
          changedArticleUrls.add(item.articleUrl);
          freshArticleUrls.add(item.articleUrl);
        }
        let translationInserted = false;
        if (item.translation.ok && !item.translationReused) {
          translationInserted = await persistNewsArchiveTranslationTx(client, {
            archiveId: archive.archiveId,
            locale: "fa",
            status: "completed",
            providerId: item.translation.translation.providerId,
            model: item.translation.translation.model,
            translatedTitle: item.translation.translation.title,
            translatedLead: item.translation.translation.lead,
            translatedBody: item.translation.translation.body,
            sourceContentHash: archive.contentHash,
            generatedAt: fetchedAt,
            evidence: {
              sourceCoverage: item.translation.translation.sourceCoverage,
              numericIntegrity: item.translation.translation.quality.numericIntegrity,
              noAddedAdvice: item.translation.translation.quality.noAddedAdvice,
            },
          });
        } else if (!item.translation.ok && item.translation.reason !== "translation_retry_deferred") {
          await persistNewsArchiveTranslationTx(client, {
            archiveId: archive.archiveId,
            locale: "fa",
            status: "failed",
            providerId: item.translation.providerId ?? null,
            model: item.translation.model ?? null,
            sourceContentHash: archive.contentHash,
            generatedAt: fetchedAt,
            evidence: {
              reason: item.translation.reason,
              retryDeferredUntil: item.translation.retryDeferredUntil ?? null,
            },
          });
        }
        if (translationInserted) changedArticleUrls.add(item.articleUrl);
        stablePrepared.push({ ...item, fetchedAt: archive.firstFetchedAt });
      }

      enInputs = stablePrepared.map(toEnglishInput);
      faInputs = stablePrepared.map(toPersianInput).filter((item): item is RawNewsInput => Boolean(item));
      enDecisions = buildNewsAutomationBatch(enInputs);
      faDecisions = buildNewsAutomationBatch(faInputs);
      trendSignals = [
        ...decisionTrendSignals(
          enDecisions.filter((decision) => freshArticleUrls.has(decision.article.canonicalUrl)),
          fetchedAt,
        ),
        ...marketTrendSignals,
      ];

      if (enInputs.length > 0) {
        results.push(await runNewsMaterializationWorkerTx(client, {
          snapshotId: randomUUID(), locale: "en", fetchedAt, sourceMode, rawInputs: enInputs, historyLimit: 1000, topCoinLimit: 12,
        }));
      }
      if (faInputs.length > 0) {
        results.push(await runNewsMaterializationWorkerTx(client, {
          snapshotId: randomUUID(), locale: "fa", fetchedAt, sourceMode, rawInputs: faInputs, historyLimit: 1000, topCoinLimit: 12,
        }));
      }
      await persistGrowthTrendSignalsTx(client, trendSignals);
    });
    if (!transaction.enabled) {
      failures.push({ reasonCode: "news_materialization_database_unavailable" });
    } else {
      archiveTransactionCommitted = true;
    }
  } catch (error) {
    failures.push({ reasonCode: error instanceof Error ? error.message : "news_materialization_transaction_failed" });
  }

  const indexableUrls = archiveTransactionCommitted ? [...enDecisions, ...faDecisions]
    .filter((decision) =>
      changedArticleUrls.has(decision.article.canonicalUrl)
      && decision.status === "publishable"
      && decision.organicGrowth.readiness.ready
    )
    .map((decision) => decision.organicGrowth.canonicalUrl) : [];
  const indexNow = await submitIndexNowUrls(indexableUrls);

  const completedAt = new Date().toISOString();
  let run = buildNewsMaterializationRunEvidence({ runId, hostName: hostname(), startedAt, completedAt, results, failures });
  let freshness = buildNewsMaterializationFreshnessReport({ completedAt, results });
  const stateDirectory = process.env.TECPEY_OPS_STATE_DIR?.trim();
  let lastRunPath: string | null = null;
  if (stateDirectory) {
    try {
      lastRunPath = await writeNewsMaterializationLastRun(stateDirectory, run, freshness);
    } catch (error) {
      failures.push({ reasonCode: error instanceof Error ? error.message : "news_materialization_last_run_write_failed" });
      run = buildNewsMaterializationRunEvidence({ runId, hostName: hostname(), startedAt, completedAt, results, failures });
      freshness = buildNewsMaterializationFreshnessReport({ completedAt, results });
    }
  }

  let databaseEvidencePersisted = false;
  try {
    const persisted = await withTx((client) => persistOperationalJobRunTx(client, run));
    databaseEvidencePersisted = persisted.enabled;
  } catch {
    databaseEvidencePersisted = false;
  }
  if (!databaseEvidencePersisted && run.resultStatus !== "authority_unavailable") {
    failures.push({ reasonCode: "operational_evidence_unavailable" });
    run = buildNewsMaterializationRunEvidence({ runId, hostName: hostname(), startedAt, completedAt, results, failures });
    freshness = buildNewsMaterializationFreshnessReport({ completedAt, results });
  }

  const exitCode = run.resultStatus === "succeeded" ? 0 : run.resultStatus === "authority_unavailable" ? 1 : 2;
  console.log(JSON.stringify({
    ok: exitCode === 0,
    exitCode,
    runId: run.runId,
    status: run.resultStatus,
    fetchedAt,
    sourceMode,
    archiveInputCount: articles.length,
    translatedFaCount: faInputs.length,
    translationFailedCount: prepared.length - faInputs.length,
    translationReusedCount: prepared.filter((item) => item.translationReused).length,
    translationRetryDeferredCount: prepared.filter(
      (item) => !item.translation.ok && item.translation.reason === "translation_retry_deferred",
    ).length,
    trendSignalCount: trendSignals.length,
    indexNow,
    results,
    freshness,
    databaseEvidencePersisted,
    lastRunPath,
    reasonCodes: run.reasonCodes,
  }));
  process.exitCode = exitCode;
}

void main().catch((error) => {
  console.error("[news-materialization-worker] fatal", {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
