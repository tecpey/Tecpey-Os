import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import {
  getNewsImpactSlug,
  type NewsImpactHistoryItem,
} from "./news-impact-history";
import type { MaterializedNewsSnapshot } from "./news-materialization";
import { validateOrganicGrowthProfile } from "./organic-growth-automation";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_RE = /^[0-9a-f]{64}$/;
const IDEMPOTENCY_RE = /^[A-Za-z0-9._:-]{16,180}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,140}$/;
const TOKEN_RE = /^[A-Za-z0-9._:-]{1,120}$/;

export type NewsMaterializationSourceMode = "live" | "fallback" | "manual_seed" | "test";

export type PersistMaterializedNewsSnapshotInput = {
  snapshotId: string;
  idempotencyKey: string;
  sourceMode: NewsMaterializationSourceMode;
  snapshot: MaterializedNewsSnapshot;
};

export type PersistMaterializedNewsSnapshotResult = {
  replayed: boolean;
  snapshotId: string;
  snapshotHash: string;
  insertedHistoryItems: number;
};

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(",")}}`;
  }
  throw new Error("news_materialization_value_invalid");
}

export function hashNewsMaterializationEvidence(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function iso(value: string, code: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error(code);
  const normalized = new Date(value).toISOString();
  if (normalized !== value) throw new Error(code);
  return normalized;
}

function boundedText(value: string, minimum: number, maximum: number, code: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length < minimum || normalized.length > maximum || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error(code);
  }
  return normalized;
}

function boundedTokens(values: string[], maximum: number, code: string): string[] {
  if (!Array.isArray(values) || values.length > maximum) throw new Error(code);
  const selected = new Set<string>();
  for (const raw of values) {
    const value = raw.trim();
    if (!TOKEN_RE.test(value)) throw new Error(code);
    selected.add(value);
  }
  return Array.from(selected).sort();
}

function validateHistoryItem(item: NewsImpactHistoryItem): NewsImpactHistoryItem {
  const slug = getNewsImpactSlug(item);
  if (!SLUG_RE.test(slug)) throw new Error("news_materialization_slug_invalid");
  if (item.locale !== "fa" && item.locale !== "en") throw new Error("news_materialization_locale_invalid");
  const expectedPrefix = item.locale === "en" ? "/en/crypto-news/" : "/crypto-news/";
  if (!item.newsUrl.startsWith(expectedPrefix) || !item.newsUrl.endsWith(slug)) {
    throw new Error("news_materialization_news_url_invalid");
  }
  const publishedAt = iso(item.publishedAt, "news_materialization_published_at_invalid");
  const recordedAt = iso(item.recordedAt, "news_materialization_recorded_at_invalid");
  if (Date.parse(recordedAt) < Date.parse(publishedAt)) {
    throw new Error("news_materialization_time_order_invalid");
  }
  if (!Number.isInteger(item.priority) || item.priority < 0 || item.priority > 100) {
    throw new Error("news_materialization_priority_invalid");
  }
  if (!Number.isInteger(item.impactScore) || item.impactScore < 0 || item.impactScore > 10) {
    throw new Error("news_materialization_impact_invalid");
  }
  if (!["bullish", "bearish", "neutral", "risk"].includes(item.tone)) {
    throw new Error("news_materialization_tone_invalid");
  }
  if (!/^https?:\/\//i.test(item.sourceUrl)) throw new Error("news_materialization_source_url_invalid");
  const lessonPrefix = item.locale === "en" ? "/en/academy/" : "/academy/";
  if (!item.relatedLessonHref.startsWith(lessonPrefix)) {
    throw new Error("news_materialization_lesson_invalid");
  }
  return {
    ...item,
    id: boundedText(item.id, 8, 220, "news_materialization_history_id_invalid"),
    title: boundedText(item.title, 8, 280, "news_materialization_title_invalid"),
    summary: boundedText(item.summary, 24, 1200, "news_materialization_summary_invalid"),
    sourceName: boundedText(item.sourceName, 2, 160, "news_materialization_source_name_invalid"),
    sourceUrl: item.sourceUrl.trim(),
    publishedAt,
    recordedAt,
    reasonFa: boundedText(item.reasonFa, 8, 600, "news_materialization_reason_fa_invalid"),
    reasonEn: boundedText(item.reasonEn, 8, 600, "news_materialization_reason_en_invalid"),
    relatedToolSlugs: boundedTokens(item.relatedToolSlugs, 20, "news_materialization_tool_slugs_invalid"),
    relatedCoinSymbols: boundedTokens(
      item.relatedCoinSymbols.map((symbol) => symbol.toUpperCase()),
      20,
      "news_materialization_coin_symbols_invalid",
    ),
    relatedLessonHref: item.relatedLessonHref.trim(),
  };
}

function validateSnapshot(input: PersistMaterializedNewsSnapshotInput): {
  snapshotId: string;
  idempotencyKey: string;
  sourceMode: NewsMaterializationSourceMode;
  generatedAt: string;
  historyItems: NewsImpactHistoryItem[];
  requestHash: string;
  snapshotHash: string;
} {
  if (!UUID_RE.test(input.snapshotId)) throw new Error("news_materialization_snapshot_id_invalid");
  if (!IDEMPOTENCY_RE.test(input.idempotencyKey)) {
    throw new Error("news_materialization_idempotency_key_invalid");
  }
  if (!["live", "fallback", "manual_seed", "test"].includes(input.sourceMode)) {
    throw new Error("news_materialization_source_mode_invalid");
  }
  const snapshot = input.snapshot;
  const generatedAt = iso(snapshot.generatedAt, "news_materialization_generated_at_invalid");
  if (snapshot.locale !== undefined && snapshot.locale !== "fa" && snapshot.locale !== "en") {
    throw new Error("news_materialization_locale_invalid");
  }
  if (!Number.isInteger(snapshot.publishable) || !Number.isInteger(snapshot.needsReview) || !Number.isInteger(snapshot.rejected)) {
    throw new Error("news_materialization_counts_invalid");
  }
  if (snapshot.publishable + snapshot.needsReview + snapshot.rejected <= 0) {
    throw new Error("news_materialization_counts_invalid");
  }
  for (const decision of snapshot.decisions) {
    if (decision.status === "publishable" && !validateOrganicGrowthProfile(decision.organicGrowth)) {
      throw new Error("news_materialization_organic_growth_invalid");
    }
  }
  const historyItems = snapshot.historyItems.map(validateHistoryItem);
  const slugs = historyItems.map(getNewsImpactSlug);
  if (new Set(slugs).size !== slugs.length) throw new Error("news_materialization_duplicate_slug");
  const snapshotHash = hashNewsMaterializationEvidence({
    locale: snapshot.locale ?? null,
    generatedAt,
    publishable: snapshot.publishable,
    needsReview: snapshot.needsReview,
    rejected: snapshot.rejected,
    historyItems,
    canonicalSlugs: snapshot.canonicalSlugs,
    sitemapEntries: snapshot.sitemapEntries,
    topCoins: snapshot.topCoins,
    decisions: snapshot.decisions,
  });
  if (!HASH_RE.test(snapshotHash)) throw new Error("news_materialization_snapshot_hash_invalid");
  const requestHash = hashNewsMaterializationEvidence({
    idempotencyKey: input.idempotencyKey,
    sourceMode: input.sourceMode,
    generatedAt,
    decisionIds: snapshot.decisions.map((decision) => decision.id).sort(),
  });
  return {
    snapshotId: input.snapshotId.toLowerCase(),
    idempotencyKey: input.idempotencyKey,
    sourceMode: input.sourceMode,
    generatedAt,
    historyItems,
    requestHash,
    snapshotHash,
  };
}

async function assertExistingSnapshotReplay(
  client: PoolClient,
  idempotencyKey: string,
  snapshotHash: string,
): Promise<{ replayed: true; snapshotId: string; snapshotHash: string } | null> {
  const existing = await client.query<{ snapshot_id: string; snapshot_hash: string }>(
    `SELECT snapshot_id::text, snapshot_hash
       FROM platform_news_materialization_snapshots
      WHERE idempotency_key = $1 LIMIT 1`,
    [idempotencyKey],
  );
  const row = existing.rows[0];
  if (!row) return null;
  if (row.snapshot_hash !== snapshotHash) {
    throw new Error("news_materialization_idempotency_conflict");
  }
  return { replayed: true, snapshotId: row.snapshot_id, snapshotHash: row.snapshot_hash };
}

export async function persistMaterializedNewsSnapshotTx(
  client: PoolClient,
  input: PersistMaterializedNewsSnapshotInput,
): Promise<PersistMaterializedNewsSnapshotResult> {
  const valid = validateSnapshot(input);
  const replay = await assertExistingSnapshotReplay(client, valid.idempotencyKey, valid.snapshotHash);
  if (replay) return { ...replay, insertedHistoryItems: 0 };

  await client.query(
    `INSERT INTO platform_news_materialization_snapshots
       (snapshot_id, locale, source_mode, idempotency_key, request_hash, snapshot_hash,
        generated_at, publishable_count, needs_review_count, rejected_count,
        canonical_slugs, sitemap_entries, top_coins, decisions)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9, $10,
        $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb)`,
    [
      valid.snapshotId,
      input.snapshot.locale ?? null,
      valid.sourceMode,
      valid.idempotencyKey,
      valid.requestHash,
      valid.snapshotHash,
      valid.generatedAt,
      input.snapshot.publishable,
      input.snapshot.needsReview,
      input.snapshot.rejected,
      JSON.stringify(input.snapshot.canonicalSlugs),
      JSON.stringify(input.snapshot.sitemapEntries),
      JSON.stringify(input.snapshot.topCoins),
      JSON.stringify(input.snapshot.decisions),
    ],
  );

  let insertedHistoryItems = 0;
  for (const [index, item] of valid.historyItems.entries()) {
    const slug = getNewsImpactSlug(item);
    const payloadHash = hashNewsMaterializationEvidence(item);
    const inserted = await client.query<{ history_id: string; payload_hash: string }>(
      `INSERT INTO platform_news_impact_history_items
         (history_id, locale, slug, news_url, title, summary, source_name, source_url,
          published_at, recorded_at, priority, impact_score, tone, reason_fa, reason_en,
          related_tool_slugs, related_coin_symbols, related_lesson_href, payload_hash, first_snapshot_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz,
          $11, $12, $13, $14, $15, $16::text[], $17::text[], $18, $19, $20::uuid)
       ON CONFLICT (locale, slug) DO NOTHING
       RETURNING history_id, payload_hash`,
      [
        item.id,
        item.locale,
        slug,
        item.newsUrl,
        item.title,
        item.summary,
        item.sourceName,
        item.sourceUrl,
        item.publishedAt,
        item.recordedAt,
        item.priority,
        item.impactScore,
        item.tone,
        item.reasonFa,
        item.reasonEn,
        item.relatedToolSlugs,
        item.relatedCoinSymbols,
        item.relatedLessonHref,
        payloadHash,
        valid.snapshotId,
      ],
    );
    const row = inserted.rows[0];
    let historyId = row?.history_id ?? item.id;
    if (row) {
      insertedHistoryItems += 1;
    } else {
      const existing = await client.query<{ history_id: string; payload_hash: string }>(
        `SELECT history_id, payload_hash
           FROM platform_news_impact_history_items
          WHERE locale = $1 AND slug = $2 LIMIT 1`,
        [item.locale, slug],
      );
      if (existing.rows[0]?.payload_hash !== payloadHash) {
        throw new Error("news_materialization_history_conflict");
      }
      historyId = existing.rows[0].history_id;
    }
    await client.query(
      `INSERT INTO platform_news_materialization_snapshot_items
         (snapshot_id, history_id, position)
       VALUES ($1::uuid, $2, $3)
       ON CONFLICT (snapshot_id, history_id) DO NOTHING`,
      [valid.snapshotId, historyId, index + 1],
    );
  }

  return {
    replayed: false,
    snapshotId: valid.snapshotId,
    snapshotHash: valid.snapshotHash,
    insertedHistoryItems,
  };
}
