import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PoolClient } from "pg";

import { buildNewsAutomationDecision, type ApprovedNewsSource } from "../../lib/news-automation";
import type { NewsImpactHistoryItem } from "../../lib/news-impact-history";
import { materializeNewsAutomationDecisions } from "../../lib/news-materialization";
import { persistMaterializedNewsSnapshotTx } from "../../lib/news-materialization-persistence";
import {
  NEWS_PUBLICATION_POLICY_VERSION,
  buildNewsPublicationIdempotencyKey,
} from "../../lib/ops/news-publication-authority";

const SOURCES: ApprovedNewsSource[] = [
  {
    name: "Cointelegraph",
    domain: "cointelegraph.com",
    tier: "trusted_media",
    trustScore: 0.7,
  },
];

const publishedAt = "2026-09-14T00:54:08.000Z";
const watermark = "2026-09-14T03:30:45.319Z";
const sourceUrl = "https://cointelegraph.com/news/revolut-attackers-threaten-daily-customer-data-leaks";

class FakePublicationPersistenceClient {
  snapshots = new Map<string, { snapshot_id: string; snapshot_hash: string }>();
  history = new Map<string, {
    history_id: string;
    payload_hash: string;
    news_url: string;
    title: string;
    summary: string;
    source_name: string;
    source_url: string;
    published_at: string;
    recorded_at: string;
    priority: number;
    impact_score: number;
    tone: NewsImpactHistoryItem["tone"];
    reason_fa: string;
    reason_en: string;
    related_tool_slugs: string[];
    related_coin_symbols: string[];
    related_lesson_href: string;
  }>();
  snapshotItems: Array<{ snapshotId: string; historyId: string; position: number }> = [];

  async query<T = Record<string, unknown>>(sql: string, values: readonly unknown[] = []): Promise<{ rows: T[] }> {
    if (sql.includes("FROM platform_news_materialization_snapshots") && sql.includes("WHERE idempotency_key")) {
      const row = this.snapshots.get(String(values[0]));
      return { rows: row ? [row as T] : [] };
    }
    if (sql.includes("INSERT INTO platform_news_materialization_snapshots")) {
      this.snapshots.set(String(values[3]), {
        snapshot_id: String(values[0]),
        snapshot_hash: String(values[5]),
      });
      return { rows: [] };
    }
    if (sql.includes("INSERT INTO platform_news_impact_history_items")) {
      const key = `${values[1]}:${values[2]}`;
      if (this.history.has(key)) return { rows: [] };
      const row = {
        history_id: String(values[0]),
        payload_hash: String(values[18]),
        news_url: String(values[3]),
        title: String(values[4]),
        summary: String(values[5]),
        source_name: String(values[6]),
        source_url: String(values[7]),
        published_at: String(values[8]),
        recorded_at: String(values[9]),
        priority: Number(values[10]),
        impact_score: Number(values[11]),
        tone: String(values[12]) as NewsImpactHistoryItem["tone"],
        reason_fa: String(values[13]),
        reason_en: String(values[14]),
        related_tool_slugs: values[15] as string[],
        related_coin_symbols: values[16] as string[],
        related_lesson_href: String(values[17]),
      };
      this.history.set(key, row);
      return { rows: [row as T] };
    }
    if (sql.includes("FROM platform_news_impact_history_items")) {
      const row = this.history.get(`${values[0]}:${values[1]}`);
      return { rows: row ? [row as T] : [] };
    }
    if (sql.includes("INSERT INTO platform_news_materialization_snapshot_items")) {
      this.snapshotItems.push({
        snapshotId: String(values[0]),
        historyId: String(values[1]),
        position: Number(values[2]),
      });
      return { rows: [] };
    }
    throw new Error(`unexpected_fake_query:${sql}`);
  }
}

function revolutSnapshot(locale: "fa" | "en") {
  const decision = buildNewsAutomationDecision(
    locale === "en"
      ? {
          id: "archive-revolut-en",
          locale: "en",
          title: "Revolut attackers threaten daily customer data leaks",
          summary:
            "Attackers say they obtained customer records and threaten recurring data leaks, creating a material security and privacy risk for affected users.",
          sourceName: "Cointelegraph",
          sourceUrl,
          url: sourceUrl,
          publishedAt,
          fetchedAt: watermark,
        }
      : {
          id: "archive-revolut-fa",
          locale: "fa",
          title: "تهدید مهاجمان Revolut به افشای روزانه داده‌های مشتریان",
          summary:
            "مهاجمان می‌گویند به سوابق مشتریان دست یافته‌اند و تهدید کرده‌اند اطلاعات کاربران را به‌صورت روزانه منتشر کنند؛ موضوعی که یک ریسک امنیتی و حریم خصوصی ایجاد می‌کند.",
          sourceName: "Cointelegraph",
          sourceUrl,
          url: sourceUrl,
          publishedAt,
          fetchedAt: watermark,
        },
    SOURCES,
  );

  assert.equal(decision.status, "publishable");
  assert.deepEqual(decision.reasons, []);
  assert.ok(decision.article.topicTags.includes("security"));
  assert.ok(decision.organicGrowth.searchIntents.length > 0);
  assert.equal(decision.organicGrowth.readiness.ready, true);

  return materializeNewsAutomationDecisions([decision], {
    locale,
    generatedAt: watermark,
    historyLimit: 1_000,
    topCoinLimit: 12,
  });
}

function legacyReviewSnapshot() {
  const decision = buildNewsAutomationDecision(
    {
      id: "archive-legacy-review-en",
      locale: "en",
      title: "Company announces a routine office furniture refresh",
      summary:
        "The organization replaced desks and chairs at one office during a routine facilities update unrelated to supported crypto, security, market or learning entities.",
      sourceName: "Cointelegraph",
      sourceUrl: "https://cointelegraph.com/news/routine-office-furniture-refresh",
      url: "https://cointelegraph.com/news/routine-office-furniture-refresh",
      publishedAt,
      fetchedAt: watermark,
    },
    SOURCES,
  );

  assert.equal(decision.status, "needs_review");
  assert.equal(decision.historyItems.length, 0);

  return materializeNewsAutomationDecisions([decision], {
    locale: "en",
    generatedAt: watermark,
    historyLimit: 1_000,
    topCoinLimit: 12,
  });
}

describe("versioned news publication idempotency", () => {
  it("scopes publication keys by explicit policy version without rewriting the historical keyspace", () => {
    const legacyKey = `crypto-news:publish:archive:en:${watermark}`;
    const current = buildNewsPublicationIdempotencyKey({ locale: "en", fetchedAt: watermark });
    const explicitCurrent = buildNewsPublicationIdempotencyKey({
      locale: "en",
      fetchedAt: watermark,
      policyVersion: NEWS_PUBLICATION_POLICY_VERSION,
    });
    const future = buildNewsPublicationIdempotencyKey({
      locale: "en",
      fetchedAt: watermark,
      policyVersion: "v4",
    });

    assert.equal(NEWS_PUBLICATION_POLICY_VERSION, "v3");
    assert.equal(current, `crypto-news:publish:archive:v3:en:${watermark}`);
    assert.equal(explicitCurrent, current);
    assert.notEqual(current, legacyKey);
    assert.notEqual(future, current);
    assert.throws(
      () => buildNewsPublicationIdempotencyKey({ locale: "en", fetchedAt: watermark, policyVersion: "V2!" }),
      /news_publication_policy_version_invalid/,
    );
  });

  it("preserves same-policy replay/conflict semantics while allowing a policy bump to republish Revolut", async () => {
    const client = new FakePublicationPersistenceClient() as unknown as PoolClient & FakePublicationPersistenceClient;
    const reviewSnapshot = legacyReviewSnapshot();
    const enSnapshot = revolutSnapshot("en");
    const faSnapshot = revolutSnapshot("fa");
    const legacyKey = `crypto-news:publish:archive:en:${watermark}`;

    const legacy = await persistMaterializedNewsSnapshotTx(client, {
      snapshotId: "00000000-0000-4000-8000-000000000101",
      idempotencyKey: legacyKey,
      sourceMode: "test",
      snapshot: reviewSnapshot,
    });
    assert.equal(legacy.replayed, false);
    assert.equal(legacy.insertedHistoryItems, 0);

    await assert.rejects(
      () => persistMaterializedNewsSnapshotTx(client, {
        snapshotId: "00000000-0000-4000-8000-000000000102",
        idempotencyKey: legacyKey,
        sourceMode: "test",
        snapshot: enSnapshot,
      }),
      /news_materialization_idempotency_conflict/,
    );

    const enKey = buildNewsPublicationIdempotencyKey({ locale: "en", fetchedAt: watermark });
    const enInput = {
      snapshotId: "00000000-0000-4000-8000-000000000103",
      idempotencyKey: enKey,
      sourceMode: "test" as const,
      snapshot: enSnapshot,
    };
    const firstEn = await persistMaterializedNewsSnapshotTx(client, enInput);
    const replayEn = await persistMaterializedNewsSnapshotTx(client, enInput);

    assert.equal(enSnapshot.publishable, 1);
    assert.equal(enSnapshot.needsReview, 0);
    assert.equal(enSnapshot.historyItems.length, 1);
    assert.match(enSnapshot.historyItems[0].newsUrl, /^\/en\/crypto-news\//);
    assert.equal(firstEn.replayed, false);
    assert.equal(firstEn.insertedHistoryItems, 1);
    assert.deepEqual(firstEn.insertedHistoryPaths, [enSnapshot.historyItems[0].newsUrl]);
    assert.equal(replayEn.replayed, true);
    assert.equal(replayEn.insertedHistoryItems, 0);
    assert.deepEqual(replayEn.insertedHistoryPaths, []);

    const firstFa = await persistMaterializedNewsSnapshotTx(client, {
      snapshotId: "00000000-0000-4000-8000-000000000104",
      idempotencyKey: buildNewsPublicationIdempotencyKey({ locale: "fa", fetchedAt: watermark }),
      sourceMode: "test",
      snapshot: faSnapshot,
    });

    assert.equal(faSnapshot.publishable, 1);
    assert.equal(faSnapshot.needsReview, 0);
    assert.equal(faSnapshot.historyItems.length, 1);
    assert.match(faSnapshot.historyItems[0].newsUrl, /^\/crypto-news\//);
    assert.equal(firstFa.replayed, false);
    assert.equal(firstFa.insertedHistoryItems, 1);
  });
});
