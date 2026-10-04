import { withDb } from "../../lib/db";

export type GovernedPublicationSnapshotAuthority = {
  status: "ready" | "unavailable";
  generatedAt: string | null;
  snapshotHash: string | null;
  publishedArchiveIds: ReadonlySet<string>;
};

const ARCHIVE_DECISION_ID_RE = /^archive-([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})-(fa|en)$/i;
const HASH_RE = /^[0-9a-f]{64}$/;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseDecisions(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function governedArchiveId(value: unknown, locale: "fa" | "en"): string | null {
  if (!record(value)) return null;
  if (value.status !== "publishable") return null;
  if (typeof value.id !== "string") return null;
  const match = value.id.match(ARCHIVE_DECISION_ID_RE);
  if (!match || match[2].toLowerCase() !== locale) return null;

  const intelligence = value.intelligence;
  if (!record(intelligence) || intelligence.status !== "publishable") return null;
  if (!Array.isArray(intelligence.reasons) || intelligence.reasons.length !== 0) return null;
  if (!Array.isArray(intelligence.reviews) || intelligence.reviews.length === 0) return null;
  if (!intelligence.reviews.every((review) => record(review) && review.signedOff === true)) return null;

  const sourceCard = intelligence.sourceCard;
  if (!record(sourceCard)) return null;
  if (typeof sourceCard.canonicalUrl !== "string" || !sourceCard.canonicalUrl.startsWith("https://")) return null;
  if (typeof sourceCard.sourceUrl !== "string" || !sourceCard.sourceUrl.startsWith("https://")) return null;

  return match[1].toLowerCase();
}

export async function readGovernedPublicationSnapshotAuthority(
  locale: "fa" | "en",
): Promise<GovernedPublicationSnapshotAuthority> {
  const result = await withDb(async (client) => {
    const snapshot = await client.query<{
      generated_at: Date | string;
      snapshot_hash: string;
      decisions: unknown;
    }>(
      `SELECT generated_at, snapshot_hash, decisions
         FROM platform_news_materialization_snapshots
        WHERE locale = $1
          AND source_mode = 'live'
        ORDER BY generated_at DESC, created_at DESC, snapshot_id DESC
        LIMIT 1`,
      [locale],
    );

    const row = snapshot.rows[0];
    if (!row) return null;
    const generatedAt = new Date(row.generated_at).toISOString();
    const snapshotHash = String(row.snapshot_hash).toLowerCase();
    if (!Number.isFinite(Date.parse(generatedAt)) || !HASH_RE.test(snapshotHash)) return null;

    const publishedArchiveIds = new Set<string>();
    for (const decision of parseDecisions(row.decisions)) {
      const archiveId = governedArchiveId(decision, locale);
      if (archiveId) publishedArchiveIds.add(archiveId);
    }

    return { generatedAt, snapshotHash, publishedArchiveIds };
  });

  if (!result.enabled || !result.value) {
    return {
      status: "unavailable",
      generatedAt: null,
      snapshotHash: null,
      publishedArchiveIds: new Set(),
    };
  }

  return {
    status: "ready",
    generatedAt: result.value.generatedAt,
    snapshotHash: result.value.snapshotHash,
    publishedArchiveIds: result.value.publishedArchiveIds,
  };
}
