import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { withDb } from "./db";
import { logger } from "./logger";
import type { ContentLocale } from "./content-growth";
import type { NewsTaxonomyMatch } from "./news-taxonomy";
import {
  validateGrowthTrendSignal,
  type GrowthTrendSignal,
} from "./growth-trend-intelligence";

export type NewsArchiveTranslationStatus = "completed" | "failed" | "not_required";

export type NewsArchiveRawInput = {
  sourceName: string;
  feedUrl: string;
  articleUrl: string;
  sourceLanguage: string;
  sourceTitle: string;
  sourceLead: string;
  sourceBody: string;
  publishedAt: string;
  fetchedAt: string;
  taxonomy: NewsTaxonomyMatch;
};

export type NewsArchiveTranslationInput = {
  archiveId: string;
  locale: ContentLocale;
  status: NewsArchiveTranslationStatus;
  providerId?: string | null;
  model?: string | null;
  translatedTitle?: string | null;
  translatedLead?: string | null;
  translatedBody?: string | null;
  sourceContentHash: string;
  generatedAt: string;
  evidence?: Record<string, unknown>;
};

export type NewsArchiveItem = {
  archiveId: string;
  sourceName: string;
  sourceDomain: string;
  articleUrl: string;
  newsUrl: string | null;
  sourceLanguage: string;
  sourceTitle: string;
  sourceLead: string;
  sourceBody: string;
  publishedAt: string;
  fetchedAt: string;
  day: string;
  contentHash: string;
  taxonomy: NewsTaxonomyMatch;
  locale: ContentLocale;
  displayTitle: string;
  displayLead: string;
  displayBody: string;
  translationStatus: NewsArchiveTranslationStatus | "unavailable";
  translationProvider: string | null;
  translationModel: string | null;
};

export type ReusableNewsArchiveTranslation = {
  articleUrl: string;
  sourceContentHash: string;
  status: NewsArchiveTranslationStatus;
  providerId: string | null;
  model: string | null;
  translatedTitle: string | null;
  translatedLead: string | null;
  translatedBody: string | null;
  generatedAt: string;
};

function compact(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

export function canonicalPublisherUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("news_archive_article_url_https_required");
  url.username = "";
  url.password = "";
  url.hash = "";
  const tracking = /^(utm_.+|fbclid|gclid|dclid|mc_cid|mc_eid|ref|ref_src|source|campaign)$/i;
  for (const key of [...url.searchParams.keys()]) {
    if (tracking.test(key)) url.searchParams.delete(key);
  }
  return url.toString();
}

function domainFor(value: string): string {
  return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
}

export function tehranCalendarDay(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("news_archive_date_invalid");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (!values.year || !values.month || !values.day) throw new Error("news_archive_tehran_day_invalid");
  return `${values.year}-${values.month}-${values.day}`;
}

export function isValidArchiveDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 2024 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function newsArchiveContentHash(input: Pick<NewsArchiveRawInput, "articleUrl" | "sourceTitle" | "sourceLead" | "sourceBody">): string {
  return createHash("sha256")
    .update([
      canonicalPublisherUrl(input.articleUrl),
      compact(input.sourceTitle, 500),
      compact(input.sourceLead, 4_000),
      compact(input.sourceBody, 20_000),
    ].join("\0"))
    .digest("hex");
}

function translationHash(input: NewsArchiveTranslationInput): string | null {
  if (input.status !== "completed") return null;
  return createHash("sha256")
    .update([
      input.locale,
      compact(input.translatedTitle ?? "", 500),
      compact(input.translatedLead ?? "", 4_000),
      compact(input.translatedBody ?? "", 20_000),
      input.sourceContentHash,
    ].join("\0"))
    .digest("hex");
}

export function resolveNewsArchiveObservationTimes(input: {
  firstFetchedAt: string;
  currentFetchedAt: string;
  publishedAt: string;
}): { firstFetchedAt: string; observedAt: string } {
  const firstFetchedAt = new Date(input.firstFetchedAt).toISOString();
  const observedAt = new Date(input.currentFetchedAt).toISOString();
  const publishedAt = new Date(input.publishedAt).toISOString();

  if (Date.parse(observedAt) < Date.parse(publishedAt)) {
    throw new Error("news_archive_observation_before_publication");
  }

  return { firstFetchedAt, observedAt };
}

export async function persistNewsArchiveItemTx(
  client: PoolClient,
  input: NewsArchiveRawInput,
): Promise<{ archiveId: string; contentHash: string; inserted: boolean; firstFetchedAt: string }> {
  const articleUrl = canonicalPublisherUrl(input.articleUrl);
  const feedUrl = canonicalPublisherUrl(input.feedUrl);
  const contentHash = newsArchiveContentHash({ ...input, articleUrl });
  const archiveId = randomUUID();
  const sourceTitle = compact(input.sourceTitle, 500);
  const sourceLead = compact(input.sourceLead || input.sourceBody || input.sourceTitle, 4_000);
  const sourceBody = compact(input.sourceBody || input.sourceLead || input.sourceTitle, 20_000);
  const publishedAt = new Date(input.publishedAt).toISOString();
  const fetchedAt = new Date(input.fetchedAt).toISOString();
  const inserted = await client.query<{ archive_id: string }>(
    `INSERT INTO platform_news_archive_items
       (archive_id, source_name, source_domain, feed_url, article_url, source_language,
        source_title, source_lead, source_body, published_at, fetched_at, published_day_tehran,
        content_hash, taxonomy)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz, $11::timestamptz,
        $12::date, $13, $14::jsonb)
     ON CONFLICT (article_url, content_hash) DO NOTHING
     RETURNING archive_id::text`,
    [
      archiveId,
      compact(input.sourceName, 160),
      domainFor(articleUrl),
      feedUrl,
      articleUrl,
      compact(input.sourceLanguage.toLowerCase(), 3),
      sourceTitle,
      sourceLead,
      sourceBody,
      publishedAt,
      fetchedAt,
      tehranCalendarDay(publishedAt),
      contentHash,
      JSON.stringify(input.taxonomy),
    ],
  );
  if (inserted.rows[0]) {
    return { archiveId: inserted.rows[0].archive_id, contentHash, inserted: true, firstFetchedAt: fetchedAt };
  }
  const existing = await client.query<{ archive_id: string; fetched_at: Date | string }>(
    `SELECT archive_id::text, fetched_at FROM platform_news_archive_items WHERE article_url = $1 AND content_hash = $2 LIMIT 1`,
    [articleUrl, contentHash],
  );
  if (!existing.rows[0]) throw new Error("news_archive_idempotency_replay_missing");
  return {
    archiveId: existing.rows[0].archive_id,
    contentHash,
    inserted: false,
    firstFetchedAt: new Date(existing.rows[0].fetched_at).toISOString(),
  };
}

export async function persistNewsArchiveTranslationTx(
  client: PoolClient,
  input: NewsArchiveTranslationInput,
): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(input.sourceContentHash)) throw new Error("news_archive_translation_source_hash_invalid");
  const hash = translationHash(input);
  const inserted = await client.query<{ translation_id: string }>(
    `INSERT INTO platform_news_archive_translations
       (translation_id, archive_id, locale, status, provider_id, model,
        translated_title, translated_lead, translated_body, source_content_hash,
        translation_hash, generated_at, evidence)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::timestamptz, $13::jsonb)
     ON CONFLICT DO NOTHING
     RETURNING translation_id::text`,
    [
      randomUUID(),
      input.archiveId,
      input.locale,
      input.status,
      input.providerId ?? null,
      input.model ?? null,
      input.translatedTitle ? compact(input.translatedTitle, 500) : null,
      input.translatedLead ? compact(input.translatedLead, 4_000) : null,
      input.translatedBody ? compact(input.translatedBody, 20_000) : null,
      input.sourceContentHash,
      hash,
      new Date(input.generatedAt).toISOString(),
      JSON.stringify(input.evidence ?? {}),
    ],
  );
  return Boolean(inserted.rows[0]);
}

function reusableTranslationKey(articleUrl: string, contentHash: string): string {
  return `${canonicalPublisherUrl(articleUrl)}\0${contentHash}`;
}

export async function readReusableNewsArchiveTranslationsTx(
  client: PoolClient,
  inputs: Array<Pick<NewsArchiveRawInput, "articleUrl" | "sourceTitle" | "sourceLead" | "sourceBody">>,
): Promise<Map<string, ReusableNewsArchiveTranslation>> {
  if (inputs.length === 0) return new Map();
  const requested = inputs.map((input) => {
    const articleUrl = canonicalPublisherUrl(input.articleUrl);
    return {
      articleUrl,
      contentHash: newsArchiveContentHash({ ...input, articleUrl }),
    };
  });
  const result = await client.query<Record<string, unknown>>(
    `WITH requested AS (
       SELECT article_url, content_hash
         FROM jsonb_to_recordset($1::jsonb) AS x(article_url text, content_hash text)
     ), matched AS (
       SELECT archive.archive_id, archive.article_url, archive.content_hash
         FROM requested
         JOIN platform_news_archive_items archive
           ON archive.article_url = requested.article_url
          AND archive.content_hash = requested.content_hash
     )
     SELECT DISTINCT ON (matched.article_url, matched.content_hash)
            matched.article_url, matched.content_hash, translation.status,
            translation.provider_id, translation.model, translation.translated_title,
            translation.translated_lead, translation.translated_body, translation.generated_at
       FROM matched
       JOIN platform_news_archive_translations translation
         ON translation.archive_id = matched.archive_id
        AND translation.locale = 'fa'
        AND translation.source_content_hash = matched.content_hash
      ORDER BY matched.article_url, matched.content_hash,
               (translation.status = 'completed') DESC,
               translation.generated_at DESC, translation.created_at DESC`,
    [JSON.stringify(requested.map((item) => ({ article_url: item.articleUrl, content_hash: item.contentHash })))],
  );
  const output = new Map<string, ReusableNewsArchiveTranslation>();
  for (const row of result.rows) {
    const articleUrl = String(row.article_url);
    const sourceContentHash = String(row.content_hash);
    const status = String(row.status) as NewsArchiveTranslationStatus;
    if (!(["completed", "failed", "not_required"] as const).includes(status)) continue;
    output.set(reusableTranslationKey(articleUrl, sourceContentHash), {
      articleUrl,
      sourceContentHash,
      status,
      providerId: row.provider_id ? String(row.provider_id) : null,
      model: row.model ? String(row.model) : null,
      translatedTitle: row.translated_title ? String(row.translated_title) : null,
      translatedLead: row.translated_lead ? String(row.translated_lead) : null,
      translatedBody: row.translated_body ? String(row.translated_body) : null,
      generatedAt: new Date(row.generated_at as string | Date).toISOString(),
    });
  }
  return output;
}

export async function getReusableNewsArchiveTranslationsFromAuthority(
  inputs: Array<Pick<NewsArchiveRawInput, "articleUrl" | "sourceTitle" | "sourceLead" | "sourceBody">>,
): Promise<Map<string, ReusableNewsArchiveTranslation>> {
  try {
    const result = await withDb((client) => readReusableNewsArchiveTranslationsTx(client, inputs));
    return result.enabled ? result.value : new Map();
  } catch (error) {
    logger.warn("[news-archive] reusable translation lookup unavailable", {
      requested: inputs.length,
      error: error instanceof Error ? error.message : String(error),
    });
    return new Map();
  }
}

export function reusableNewsArchiveTranslationKey(articleUrl: string, contentHash: string): string {
  return reusableTranslationKey(articleUrl, contentHash);
}

function mapArchiveRow(row: Record<string, unknown>, locale: ContentLocale): NewsArchiveItem {
  const taxonomy = typeof row.taxonomy === "string" ? JSON.parse(row.taxonomy) : row.taxonomy;
  const translationStatus = String(row.translation_status ?? "unavailable") as NewsArchiveItem["translationStatus"];
  const useTranslation = locale === "fa" && translationStatus === "completed";
  return {
    archiveId: String(row.archive_id),
    sourceName: String(row.source_name),
    sourceDomain: String(row.source_domain),
    articleUrl: String(row.article_url),
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
    displayTitle: useTranslation ? String(row.translated_title) : String(row.source_title),
    displayLead: useTranslation ? String(row.translated_lead) : String(row.source_lead),
    displayBody: useTranslation ? String(row.translated_body) : String(row.source_body),
    translationStatus,
    translationProvider: row.provider_id ? String(row.provider_id) : null,
    translationModel: row.model ? String(row.model) : null,
  };
}

export async function readNewsArchiveDayTx(
  client: PoolClient,
  day: string,
  locale: ContentLocale,
): Promise<NewsArchiveItem[]> {
  if (!isValidArchiveDay(day)) throw new Error("news_archive_day_invalid");
  const result = await client.query<Record<string, unknown>>(
    `WITH latest_article AS (
       SELECT DISTINCT ON (article_url)
              archive_id, source_name, source_domain, article_url, source_language,
              source_title, source_lead, source_body, published_at, fetched_at,
              published_day_tehran, content_hash, taxonomy
         FROM platform_news_archive_items
        WHERE published_day_tehran = $1::date
        ORDER BY article_url, published_at DESC, fetched_at DESC, created_at DESC
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
          WHERE archive_id = article.archive_id AND locale = $2
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
      WHERE ($2 <> 'fa' OR translation.status = 'completed')
      ORDER BY article.published_at DESC, article.source_name, article.article_url
      LIMIT 1000`,
    [day, locale],
  );
  return result.rows.map((row) => mapArchiveRow(row, locale));
}

export async function getNewsArchiveDayFromAuthority(day: string, locale: ContentLocale): Promise<NewsArchiveItem[]> {
  try {
    const result = await withDb((client) => readNewsArchiveDayTx(client, day, locale));
    return result.enabled ? result.value : [];
  } catch (error) {
    logger.warn("[news-archive] authority read unavailable", {
      day,
      locale,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export async function getNewsArchiveDaysFromAuthority(limit = 90): Promise<string[]> {
  try {
    const result = await withDb(async (client) => {
      const rows = await client.query<{ day: string }>(
        `SELECT DISTINCT published_day_tehran::text AS day
           FROM platform_news_archive_items
          ORDER BY day DESC
          LIMIT $1`,
        [Math.max(1, Math.min(365, Math.trunc(limit)))],
      );
      return rows.rows.map((row) => row.day);
    });
    return result.enabled ? result.value : [];
  } catch {
    return [];
  }
}

export async function persistGrowthTrendSignalsTx(client: PoolClient, signals: GrowthTrendSignal[]): Promise<number> {
  let inserted = 0;
  for (const signal of signals) {
    if (!validateGrowthTrendSignal(signal)) continue;
    const evidenceHash = createHash("sha256")
      .update(JSON.stringify({
        entityType: signal.entityType,
        entityId: signal.entityId,
        sourceFamily: signal.sourceFamily,
        sourceUrl: signal.sourceUrl,
        observedAt: signal.observedAt,
        window: signal.window,
        magnitude: signal.magnitude,
        velocity: signal.velocity,
        confidence: signal.confidence,
        authority: signal.authority,
        manipulationRisk: signal.manipulationRisk ?? 0,
        evidenceLabel: signal.evidenceLabel ?? null,
      }))
      .digest("hex");
    const result = await client.query(
      `INSERT INTO platform_growth_trend_signals
         (signal_id, entity_type, entity_id, label, locale, source_family, source_name,
          source_url, observed_at, trend_window, magnitude, velocity, confidence, authority,
          manipulation_risk, evidence_label, evidence_hash)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10,
          $11, $12, $13, $14, $15, $16, $17)
       ON CONFLICT DO NOTHING`,
      [
        randomUUID(), signal.entityType, signal.entityId.toLowerCase(), compact(signal.label, 160), signal.locale,
        signal.sourceFamily, compact(signal.sourceName, 160), canonicalPublisherUrl(signal.sourceUrl),
        new Date(signal.observedAt).toISOString(), signal.window, signal.magnitude, signal.velocity,
        signal.confidence, signal.authority, signal.manipulationRisk ?? 0,
        signal.evidenceLabel ? compact(signal.evidenceLabel, 500) : null, evidenceHash,
      ],
    );
    inserted += result.rowCount ?? 0;
  }
  return inserted;
}

export async function readGrowthTrendSignalsFromAuthority(days = 31): Promise<GrowthTrendSignal[]> {
  try {
    const result = await withDb(async (client) => {
      const rows = await client.query<Record<string, unknown>>(
        `SELECT signal_id::text, entity_type, entity_id, label, locale, source_family,
                source_name, source_url, observed_at, trend_window AS "window", magnitude, velocity,
                confidence, authority, manipulation_risk, evidence_label
           FROM platform_growth_trend_signals
          WHERE observed_at >= NOW() - ($1::text || ' days')::interval
          ORDER BY observed_at DESC
          LIMIT 10000`,
        [Math.max(1, Math.min(45, Math.trunc(days)))],
      );
      return rows.rows.map((row) => ({
        id: String(row.signal_id),
        entityType: row.entity_type as GrowthTrendSignal["entityType"],
        entityId: String(row.entity_id),
        label: String(row.label),
        locale: row.locale as GrowthTrendSignal["locale"],
        sourceFamily: row.source_family as GrowthTrendSignal["sourceFamily"],
        sourceName: String(row.source_name),
        sourceUrl: String(row.source_url),
        observedAt: new Date(row.observed_at as string | Date).toISOString(),
        window: row.window as GrowthTrendSignal["window"],
        magnitude: Number(row.magnitude),
        velocity: Number(row.velocity),
        confidence: Number(row.confidence),
        authority: Number(row.authority),
        manipulationRisk: Number(row.manipulation_risk),
        evidenceLabel: row.evidence_label ? String(row.evidence_label) : undefined,
      }));
    });
    return result.enabled ? result.value.filter(validateGrowthTrendSignal) : [];
  } catch {
    return [];
  }
}
