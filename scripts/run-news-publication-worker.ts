import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

import { withTx } from "../src/lib/db";
import {
  buildNewsAutomationBatch,
  type RawNewsInput,
} from "../src/lib/news-automation";
import { materializeNewsAutomationDecisions } from "../src/lib/news-materialization";
import { persistMaterializedNewsSnapshotTx } from "../src/lib/news-materialization-persistence";
import {
  approvedNewsPublicationSources,
  readValidatedNewsPublicationCandidatesFromAuthority,
  type NewsPublicationCandidate,
} from "../src/lib/ops/news-publication-authority";

function boundedIntegerEnv(name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name.toLowerCase()}_invalid`);
  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name.toLowerCase()}_out_of_range`);
  }
  return value;
}

function publicationWatermark(candidates: readonly NewsPublicationCandidate[]): string {
  const latest = Math.max(...candidates.map((item) => Date.parse(item.translationGeneratedAt)));
  if (!Number.isFinite(latest)) throw new Error("news_publication_watermark_invalid");
  return new Date(latest).toISOString();
}

function toEnglishInput(candidate: NewsPublicationCandidate, fetchedAt: string): RawNewsInput {
  return {
    id: `archive-${candidate.archiveId}-en`,
    locale: "en",
    title: candidate.sourceTitle,
    summary: candidate.sourceLead,
    sourceName: candidate.sourceName,
    sourceUrl: candidate.articleUrl,
    url: candidate.articleUrl,
    publishedAt: candidate.publishedAt,
    fetchedAt,
  };
}

function toPersianInput(candidate: NewsPublicationCandidate, fetchedAt: string): RawNewsInput {
  return {
    id: `archive-${candidate.archiveId}-fa`,
    locale: "fa",
    title: candidate.translatedTitle,
    summary: candidate.translatedLead,
    sourceName: candidate.sourceName,
    sourceUrl: candidate.articleUrl,
    url: candidate.articleUrl,
    publishedAt: candidate.publishedAt,
    fetchedAt,
  };
}

function idempotencyKey(locale: "fa" | "en", fetchedAt: string): string {
  return `crypto-news:publish:archive:${locale}:${fetchedAt.replace(".000Z", "Z")}`;
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const limit = boundedIntegerEnv("NEWS_PUBLICATION_LIMIT", 500, 1, 1_000);
  const candidates = await readValidatedNewsPublicationCandidatesFromAuthority({ limit });

  if (candidates.length === 0) {
    console.log(JSON.stringify({
      status: "no_validated_work",
      host: hostname(),
      candidates: 0,
      publishedFaFromUntranslated: 0,
      aiCalls: 0,
      startedAt,
      finishedAt: new Date().toISOString(),
    }));
    return;
  }

  const fetchedAt = publicationWatermark(candidates);
  const sources = approvedNewsPublicationSources();
  const enInputs = candidates.map((candidate) => toEnglishInput(candidate, fetchedAt));
  const faInputs = candidates.map((candidate) => toPersianInput(candidate, fetchedAt));
  const enDecisions = buildNewsAutomationBatch(enInputs, sources);
  const faDecisions = buildNewsAutomationBatch(faInputs, sources);
  const enSnapshot = materializeNewsAutomationDecisions(enDecisions, {
    locale: "en",
    generatedAt: fetchedAt,
    historyLimit: 1_000,
    topCoinLimit: 12,
  });
  const faSnapshot = materializeNewsAutomationDecisions(faDecisions, {
    locale: "fa",
    generatedAt: fetchedAt,
    historyLimit: 1_000,
    topCoinLimit: 12,
  });

  const persisted = await withTx(async (client) => {
    const en = await persistMaterializedNewsSnapshotTx(client, {
      snapshotId: randomUUID(),
      idempotencyKey: idempotencyKey("en", fetchedAt),
      sourceMode: "live",
      snapshot: enSnapshot,
    });
    const fa = await persistMaterializedNewsSnapshotTx(client, {
      snapshotId: randomUUID(),
      idempotencyKey: idempotencyKey("fa", fetchedAt),
      sourceMode: "live",
      snapshot: faSnapshot,
    });
    return { en, fa };
  });
  if (!persisted.enabled) throw new Error("news_publication_database_disabled");

  console.log(JSON.stringify({
    status: "ok",
    host: hostname(),
    candidates: candidates.length,
    validatedFaInputs: faInputs.length,
    publishedFaFromUntranslated: 0,
    sourceAuthorityCount: sources.length,
    watermark: fetchedAt,
    en: {
      publishable: enSnapshot.publishable,
      needsReview: enSnapshot.needsReview,
      rejected: enSnapshot.rejected,
      replayed: persisted.value.en.replayed,
      insertedHistoryItems: persisted.value.en.insertedHistoryItems,
    },
    fa: {
      publishable: faSnapshot.publishable,
      needsReview: faSnapshot.needsReview,
      rejected: faSnapshot.rejected,
      replayed: persisted.value.fa.replayed,
      insertedHistoryItems: persisted.value.fa.insertedHistoryItems,
    },
    aiCalls: 0,
    startedAt,
    finishedAt: new Date().toISOString(),
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: "failed_closed",
    mode: "validated_publication_only",
    aiCalls: 0,
    reason: error instanceof Error ? error.message : String(error),
  }));
  process.exitCode = 1;
});
