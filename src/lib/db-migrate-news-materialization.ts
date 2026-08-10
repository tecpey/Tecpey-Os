import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0058_news_materialization_authority.sql";

export const NEWS_MATERIALIZATION_AUTHORITY_SQL = `
CREATE TABLE IF NOT EXISTS platform_news_materialization_snapshots (
  snapshot_id UUID PRIMARY KEY,
  locale TEXT CHECK (locale IS NULL OR locale IN ('fa', 'en')),
  storage_mode TEXT NOT NULL DEFAULT 'postgres_contract'
    CHECK (storage_mode = 'postgres_contract'),
  source_mode TEXT NOT NULL
    CHECK (source_mode IN ('live', 'fallback', 'manual_seed', 'test')),
  idempotency_key TEXT NOT NULL UNIQUE,
  request_hash CHAR(64) NOT NULL,
  snapshot_hash CHAR(64) NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL,
  publishable_count INTEGER NOT NULL CHECK (publishable_count >= 0),
  needs_review_count INTEGER NOT NULL CHECK (needs_review_count >= 0),
  rejected_count INTEGER NOT NULL CHECK (rejected_count >= 0),
  canonical_slugs JSONB NOT NULL,
  sitemap_entries JSONB NOT NULL,
  top_coins JSONB NOT NULL,
  decisions JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT platform_news_materialization_idempotency_key_check
    CHECK (char_length(idempotency_key) BETWEEN 16 AND 180 AND idempotency_key ~ '^[A-Za-z0-9._:-]+$'),
  CONSTRAINT platform_news_materialization_request_hash_check
    CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT platform_news_materialization_snapshot_hash_check
    CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT platform_news_materialization_counts_check
    CHECK (publishable_count + needs_review_count + rejected_count > 0),
  CONSTRAINT platform_news_materialization_canonical_slugs_check
    CHECK (jsonb_typeof(canonical_slugs) = 'array'),
  CONSTRAINT platform_news_materialization_sitemap_entries_check
    CHECK (jsonb_typeof(sitemap_entries) = 'array'),
  CONSTRAINT platform_news_materialization_top_coins_check
    CHECK (jsonb_typeof(top_coins) = 'array'),
  CONSTRAINT platform_news_materialization_decisions_check
    CHECK (jsonb_typeof(decisions) = 'array')
);

CREATE INDEX IF NOT EXISTS platform_news_materialization_lookup_idx
  ON platform_news_materialization_snapshots (locale, generated_at DESC);

CREATE TABLE IF NOT EXISTS platform_news_impact_history_items (
  history_id TEXT PRIMARY KEY,
  locale TEXT NOT NULL CHECK (locale IN ('fa', 'en')),
  slug TEXT NOT NULL,
  news_url TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  priority INTEGER NOT NULL CHECK (priority BETWEEN 0 AND 100),
  impact_score INTEGER NOT NULL CHECK (impact_score BETWEEN 0 AND 10),
  tone TEXT NOT NULL CHECK (tone IN ('bullish', 'bearish', 'neutral', 'risk')),
  reason_fa TEXT NOT NULL,
  reason_en TEXT NOT NULL,
  related_tool_slugs TEXT[] NOT NULL DEFAULT '{}',
  related_coin_symbols TEXT[] NOT NULL DEFAULT '{}',
  related_lesson_href TEXT NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  first_snapshot_id UUID NOT NULL REFERENCES platform_news_materialization_snapshots(snapshot_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (locale, slug),
  CONSTRAINT platform_news_impact_history_id_check
    CHECK (char_length(history_id) BETWEEN 8 AND 220 AND history_id !~ '[[:cntrl:]]'),
  CONSTRAINT platform_news_impact_history_slug_check
    CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,140}$'),
  CONSTRAINT platform_news_impact_history_news_url_check
    CHECK (news_url ~ '^/(en/)?crypto-news/[a-z0-9][a-z0-9-]{2,140}$'),
  CONSTRAINT platform_news_impact_history_title_check
    CHECK (char_length(title) BETWEEN 8 AND 280),
  CONSTRAINT platform_news_impact_history_summary_check
    CHECK (char_length(summary) BETWEEN 24 AND 1200),
  CONSTRAINT platform_news_impact_history_source_url_check
    CHECK (source_url ~ '^https?://'),
  CONSTRAINT platform_news_impact_history_time_check
    CHECK (recorded_at >= published_at),
  CONSTRAINT platform_news_impact_history_payload_hash_check
    CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT platform_news_impact_history_related_lesson_check
    CHECK (related_lesson_href ~ '^/(en/)?academy/')
);

CREATE INDEX IF NOT EXISTS platform_news_impact_history_priority_idx
  ON platform_news_impact_history_items (locale, priority DESC, recorded_at DESC);
CREATE INDEX IF NOT EXISTS platform_news_impact_history_coin_idx
  ON platform_news_impact_history_items USING GIN (related_coin_symbols);
CREATE INDEX IF NOT EXISTS platform_news_impact_history_tool_idx
  ON platform_news_impact_history_items USING GIN (related_tool_slugs);

CREATE TABLE IF NOT EXISTS platform_news_materialization_snapshot_items (
  snapshot_id UUID NOT NULL REFERENCES platform_news_materialization_snapshots(snapshot_id) ON DELETE RESTRICT,
  history_id TEXT NOT NULL REFERENCES platform_news_impact_history_items(history_id) ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK (position > 0),
  PRIMARY KEY (snapshot_id, history_id),
  UNIQUE (snapshot_id, position)
);

CREATE OR REPLACE FUNCTION tecpey_reject_news_materialization_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'news materialization evidence is append-only'
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS platform_news_materialization_snapshots_immutable
  ON platform_news_materialization_snapshots;
CREATE TRIGGER platform_news_materialization_snapshots_immutable
BEFORE UPDATE OR DELETE ON platform_news_materialization_snapshots
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_news_materialization_mutation();

DROP TRIGGER IF EXISTS platform_news_impact_history_items_immutable
  ON platform_news_impact_history_items;
CREATE TRIGGER platform_news_impact_history_items_immutable
BEFORE UPDATE OR DELETE ON platform_news_impact_history_items
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_news_materialization_mutation();

DROP TRIGGER IF EXISTS platform_news_materialization_snapshot_items_immutable
  ON platform_news_materialization_snapshot_items;
CREATE TRIGGER platform_news_materialization_snapshot_items_immutable
BEFORE UPDATE OR DELETE ON platform_news_materialization_snapshot_items
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_news_materialization_mutation();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runNewsMaterializationMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(NEWS_MATERIALIZATION_AUTHORITY_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-news-materialization] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  await client.query("BEGIN");
  try {
    await client.query(NEWS_MATERIALIZATION_AUTHORITY_SQL);
    await client.query(
      "INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)",
      [FILENAME, cs],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
