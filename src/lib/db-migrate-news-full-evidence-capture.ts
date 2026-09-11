import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0103_news_full_evidence_capture_authority.sql";

export const NEWS_FULL_EVIDENCE_CAPTURE_SQL = `
ALTER TABLE platform_news_archive_items
  ADD COLUMN IF NOT EXISTS source_coverage TEXT;

ALTER TABLE platform_news_archive_items
  ADD COLUMN IF NOT EXISTS extraction_method TEXT;

ALTER TABLE platform_news_archive_items
  ADD COLUMN IF NOT EXISTS evidence_character_count INTEGER;

ALTER TABLE platform_news_archive_items
  DROP CONSTRAINT IF EXISTS platform_news_archive_source_coverage_check;

ALTER TABLE platform_news_archive_items
  ADD CONSTRAINT platform_news_archive_source_coverage_check
  CHECK (
    source_coverage IS NULL
    OR source_coverage IN ('feed_summary', 'feed_full', 'article_full')
  );

ALTER TABLE platform_news_archive_items
  DROP CONSTRAINT IF EXISTS platform_news_archive_extraction_method_check;

ALTER TABLE platform_news_archive_items
  ADD CONSTRAINT platform_news_archive_extraction_method_check
  CHECK (
    extraction_method IS NULL
    OR extraction_method IN (
      'feed_description',
      'feed_content',
      'json_ld_article_body',
      'article_paragraphs',
      'main_paragraphs'
    )
  );

ALTER TABLE platform_news_archive_items
  DROP CONSTRAINT IF EXISTS platform_news_archive_evidence_character_count_check;

ALTER TABLE platform_news_archive_items
  ADD CONSTRAINT platform_news_archive_evidence_character_count_check
  CHECK (
    evidence_character_count IS NULL
    OR evidence_character_count BETWEEN 1 AND 20000
  );

CREATE INDEX IF NOT EXISTS platform_news_archive_full_evidence_lookup_idx
  ON platform_news_archive_items (article_url, source_coverage, published_at DESC);

CREATE TABLE IF NOT EXISTS platform_news_hydration_state (
  article_url TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_outcome TEXT,
  last_attempt_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  hydrated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT platform_news_hydration_url_check
    CHECK (article_url ~ '^https://'),

  CONSTRAINT platform_news_hydration_source_check
    CHECK (char_length(source_name) BETWEEN 2 AND 160),

  CONSTRAINT platform_news_hydration_attempt_count_check
    CHECK (attempt_count BETWEEN 0 AND 1000),

  CONSTRAINT platform_news_hydration_outcome_check
    CHECK (
      last_outcome IS NULL
      OR last_outcome IN (
        'hydrated',
        'host_rejected',
        'redirect_rejected',
        'redirect_limit',
        'timeout',
        'network_error',
        'http_failure',
        'content_type_rejected',
        'too_large',
        'extraction_empty',
        'identity_collision'
      )
    ),

  CONSTRAINT platform_news_hydration_attempt_evidence_check
    CHECK (
      (
        attempt_count = 0
        AND last_outcome IS NULL
        AND last_attempt_at IS NULL
      )
      OR (
        attempt_count > 0
        AND last_outcome IS NOT NULL
        AND last_attempt_at IS NOT NULL
      )
    ),

  CONSTRAINT platform_news_hydration_retry_time_check
    CHECK (
      next_retry_at IS NULL
      OR (
        last_attempt_at IS NOT NULL
        AND next_retry_at >= last_attempt_at
      )
    ),

  CONSTRAINT platform_news_hydration_success_check
    CHECK (
      (
        last_outcome = 'hydrated'
        AND hydrated_at IS NOT NULL
        AND next_retry_at IS NULL
      )
      OR (
        last_outcome IS DISTINCT FROM 'hydrated'
        AND hydrated_at IS NULL
      )
    )
);

CREATE INDEX IF NOT EXISTS platform_news_hydration_retry_idx
  ON platform_news_hydration_state (next_retry_at, article_url)
  WHERE hydrated_at IS NULL;
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runNewsFullEvidenceCaptureMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(NEWS_FULL_EVIDENCE_CAPTURE_SQL);

  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );

  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-news-full-evidence-capture] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  await client.query("BEGIN");
  try {
    await client.query(NEWS_FULL_EVIDENCE_CAPTURE_SQL);
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
