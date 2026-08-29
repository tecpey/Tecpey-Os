import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { withTx } from "../src/lib/db";
import type { ContentLocale } from "../src/lib/content-growth";
import type { RawNewsInput } from "../src/lib/news-automation";
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

type ApprovedFeedSource = {
  locale: ContentLocale;
  name: string;
  feedUrl: string;
  fallbackUrl: string;
};

const NEWS_FEED_TIMEOUT_MS = 7_000;
const MAX_NEWS_FEED_BYTES = 2_000_000;

const INTERNATIONAL_FEED_SOURCES = [
  {
    name: "CoinDesk",
    feedUrl: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    fallbackUrl: "https://www.coindesk.com",
  },
  {
    name: "Cointelegraph",
    feedUrl: "https://cointelegraph.com/rss",
    fallbackUrl: "https://cointelegraph.com",
  },
  {
    name: "Decrypt",
    feedUrl: "https://decrypt.co/feed",
    fallbackUrl: "https://decrypt.co",
  },
  {
    name: "The Block",
    feedUrl: "https://www.theblock.co/rss.xml",
    fallbackUrl: "https://www.theblock.co",
  },
] as const;

const APPROVED_FEED_SOURCES: ApprovedFeedSource[] = (["fa", "en"] as const).flatMap(
  (locale) => INTERNATIONAL_FEED_SOURCES.map((source) => ({ locale, ...source })),
);

function boundedIntegerEnv(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  if (!/^\d+$/.test(raw.trim())) throw new Error(`${name.toLowerCase()}_invalid`);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name.toLowerCase()}_out_of_range`);
  }
  return parsed;
}

function parseLocales(): ContentLocale[] {
  const raw = process.env.NEWS_MATERIALIZATION_LOCALES ?? "fa,en";
  const locales = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (locales.length === 0) throw new Error("news_materialization_locales_empty");
  for (const locale of locales) {
    if (locale !== "fa" && locale !== "en") throw new Error("news_materialization_locale_invalid");
  }
  return Array.from(new Set(locales)) as ContentLocale[];
}

function parseSourceMode(): NewsMaterializationSourceMode {
  const raw = process.env.NEWS_MATERIALIZATION_SOURCE_MODE ?? "live";
  if (raw !== "live" && raw !== "fallback" && raw !== "manual_seed" && raw !== "test") {
    throw new Error("news_materialization_source_mode_invalid");
  }
  return raw;
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
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return clean(match?.[1] ?? "");
}

function persianSummaryFor(title: string, summary: string, sourceName: string): string {
  const text = `${title} ${summary}`.toLowerCase();
  const category = /bitcoin|\bbtc\b/i.test(text)
    ? "بیت‌کوین"
    : /ethereum|\beth\b/i.test(text)
      ? "اتریوم"
      : /etf|blackrock|fidelity|institution/i.test(text)
        ? "صندوق‌های بورسی و نهادهای مالی"
        : /sec|regulation|law|court|ban/i.test(text)
          ? "قوانین و مقررات"
          : /hack|scam|phishing|security/i.test(text)
            ? "امنیت بازار رمزارز"
            : "بازار رمزارز";
  const tone = /surge|rally|gain|approval|inflow|bull|record|rise|\bup\b/i.test(text)
    ? "مثبت"
    : /fall|drop|hack|lawsuit|outflow|bear|crash|fraud|ban|\bdown\b/i.test(text)
      ? "منفی"
      : "خنثی";
  return `خلاصه فارسی تک‌پی از ${sourceName}: این گزارش بین‌المللی درباره ${category} است و لحن کلی آن ${tone} ارزیابی می‌شود. جزئیات منبع اصلی را همراه با داده‌های بازار و اصول مدیریت ریسک بررسی کنید؛ این خلاصه توصیه معاملاتی نیست.`;
}

function normalizePublishedAt(raw: string, fetchedAt: string): string {
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? fetchedAt : parsed.toISOString();
}

function sourceUrlFor(rawUrl: string, source: ApprovedFeedSource): string {
  if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
  return source.fallbackUrl;
}

async function fetchSourceInputs(
  source: ApprovedFeedSource,
  fetchedAt: string,
  limit: number,
): Promise<RawNewsInput[]> {
  const response = await fetch(source.feedUrl, {
    headers: { "user-agent": "TecPeyNewsBot/1.0 (+https://tecpey.ir)" },
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

  return blocks
    .map((block, index): RawNewsInput | null => {
      const title = pick(block, "title");
      if (!title) return null;
      const summary = pick(block, "description") || pick(block, "summary") || pick(block, "content") || title;
      const hrefMatch = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i);
      const rawUrl = pick(block, "link") || clean(hrefMatch?.[1] ?? "");
      const sourceUrl = sourceUrlFor(rawUrl, source);
      const publishedAt = normalizePublishedAt(
        pick(block, "pubDate") || pick(block, "published") || pick(block, "updated"),
        fetchedAt,
      );

      return {
        id: `${source.name}-${index}-${title}`.replace(/\W+/g, "-").slice(0, 90),
        locale: source.locale,
        title,
        summary: source.locale === "fa"
          ? persianSummaryFor(title, summary, source.name)
          : summary,
        sourceName: source.name,
        sourceUrl,
        url: sourceUrl,
        publishedAt,
        fetchedAt,
      };
    })
    .filter((input): input is RawNewsInput => Boolean(input));
}

async function fetchApprovedNewsInputs(
  locale: ContentLocale,
  fetchedAt: string,
  limitPerSource: number,
): Promise<RawNewsInput[]> {
  const settled = await Promise.allSettled(
    APPROVED_FEED_SOURCES
      .filter((source) => source.locale === locale)
      .map((source) => fetchSourceInputs(source, fetchedAt, limitPerSource)),
  );
  const inputs = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  const unique = new Map<string, RawNewsInput>();
  for (const input of inputs) {
    const key = `${input.locale}:${input.url.toLowerCase()}:${input.publishedAt}:${input.title.toLowerCase()}`;
    if (!unique.has(key)) unique.set(key, input);
  }
  return Array.from(unique.values()).sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

async function persistLocale(
  locale: ContentLocale,
  sourceMode: NewsMaterializationSourceMode,
  fetchedAt: string,
  limitPerSource: number,
): Promise<NewsMaterializationWorkerResult> {
  const rawInputs = await fetchApprovedNewsInputs(locale, fetchedAt, limitPerSource);
  const result = await withTx((client) =>
    runNewsMaterializationWorkerTx(client, {
      snapshotId: randomUUID(),
      locale,
      fetchedAt,
      sourceMode,
      rawInputs,
    }),
  );
  if (!result.enabled) throw new Error("news_materialization_database_unavailable");
  return result.value;
}

async function main(): Promise<void> {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const locales = parseLocales();
  const sourceMode = parseSourceMode();
  const limitPerSource = boundedIntegerEnv("NEWS_MATERIALIZATION_LIMIT_PER_SOURCE", 10, 1, 30);
  const fetchedAt = new Date(process.env.NEWS_MATERIALIZATION_FETCHED_AT ?? Date.now()).toISOString();

  const results: NewsMaterializationWorkerResult[] = [];
  const failures: NewsMaterializationSchedulerFailure[] = [];
  for (const locale of locales) {
    try {
      results.push(await persistLocale(locale, sourceMode, fetchedAt, limitPerSource));
    } catch (error) {
      failures.push({
        locale,
        reasonCode: error instanceof Error ? error.message : "news_materialization_locale_failed",
      });
    }
  }
  const completedAt = new Date().toISOString();
  let run = buildNewsMaterializationRunEvidence({
    runId,
    hostName: hostname(),
    startedAt,
    completedAt,
    results,
    failures,
  });
  let freshness = buildNewsMaterializationFreshnessReport({ completedAt, results });
  const stateDirectory = process.env.TECPEY_OPS_STATE_DIR?.trim();
  let lastRunPath: string | null = null;
  if (stateDirectory) {
    try {
      lastRunPath = await writeNewsMaterializationLastRun(stateDirectory, run, freshness);
    } catch (error) {
      failures.push({
        reasonCode: error instanceof Error
          ? error.message
          : "news_materialization_last_run_write_failed",
      });
      run = buildNewsMaterializationRunEvidence({
        runId,
        hostName: hostname(),
        startedAt,
        completedAt,
        results,
        failures,
      });
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
    run = buildNewsMaterializationRunEvidence({
      runId,
      hostName: hostname(),
      startedAt,
      completedAt,
      results,
      failures,
    });
    freshness = buildNewsMaterializationFreshnessReport({ completedAt, results });
    if (stateDirectory) {
      try {
        lastRunPath = await writeNewsMaterializationLastRun(stateDirectory, run, freshness);
      } catch {
        lastRunPath = null;
      }
    }
  }

  const exitCode = run.resultStatus === "succeeded"
    ? 0
    : run.resultStatus === "authority_unavailable"
      ? 1
      : 2;
  console.log(JSON.stringify({
    ok: exitCode === 0,
    exitCode,
    runId: run.runId,
    status: run.resultStatus,
    fetchedAt,
    sourceMode,
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
