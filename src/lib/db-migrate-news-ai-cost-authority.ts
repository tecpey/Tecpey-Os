import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0102_news_ai_cost_authority.sql";

export const NEWS_AI_COST_AUTHORITY_SQL = `
CREATE TABLE IF NOT EXISTS platform_news_ai_budget_daily (
  budget_day DATE PRIMARY KEY,
  daily_budget_usd_micros BIGINT NOT NULL
    CHECK (daily_budget_usd_micros BETWEEN 1000 AND 100000000000),
  active_reserved_usd_micros BIGINT NOT NULL DEFAULT 0
    CHECK (active_reserved_usd_micros >= 0),
  settled_usd_micros BIGINT NOT NULL DEFAULT 0
    CHECK (settled_usd_micros >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_news_ai_provider_attempts (
  attempt_id UUID PRIMARY KEY,
  budget_day DATE NOT NULL REFERENCES platform_news_ai_budget_daily(budget_day) ON DELETE RESTRICT,
  archive_id UUID NOT NULL REFERENCES platform_news_archive_items(archive_id) ON DELETE RESTRICT,
  locale TEXT NOT NULL CHECK (locale ~ '^[a-z]{2,3}(?:-[A-Z]{2})?$'),
  source_content_hash CHAR(64) NOT NULL CHECK (source_content_hash ~ '^[0-9a-f]{64}$'),
  translation_attempt SMALLINT NOT NULL CHECK (translation_attempt BETWEEN 1 AND 20),
  network_ordinal SMALLINT NOT NULL CHECK (network_ordinal BETWEEN 1 AND 20),
  provider_id TEXT NOT NULL CHECK (provider_id IN ('openai','anthropic','openrouter','xai','perplexity')),
  requested_model TEXT NOT NULL CHECK (
    char_length(requested_model) BETWEEN 1 AND 160
    AND requested_model ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
  ),
  call_reason TEXT NOT NULL CHECK (call_reason IN ('fresh','repair','retry','fallback')),
  idempotency_key TEXT NOT NULL UNIQUE CHECK (
    char_length(idempotency_key) BETWEEN 8 AND 200
    AND idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{7,199}$'
  ),
  reserved_usd_micros BIGINT NOT NULL CHECK (reserved_usd_micros BETWEEN 1000 AND 100000000000),
  settled_usd_micros BIGINT CHECK (settled_usd_micros IS NULL OR settled_usd_micros >= 0),
  input_tokens BIGINT CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens BIGINT CHECK (output_tokens IS NULL OR output_tokens >= 0),
  cost_source TEXT CHECK (
    cost_source IS NULL OR cost_source IN ('provider','configured_estimate','reservation_fallback')
  ),
  http_status SMALLINT CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  failure_reason TEXT CHECK (
    failure_reason IS NULL OR (
      char_length(failure_reason) BETWEEN 2 AND 160
      AND failure_reason ~ '^[a-z0-9_.:-]+$'
    )
  ),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms BETWEEN 0 AND 600000),
  status TEXT NOT NULL CHECK (status IN ('egress_started','settled')),
  egress_started_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  settled_at TIMESTAMPTZ,
  reconciliation_required BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (archive_id, locale, source_content_hash, translation_attempt, network_ordinal),
  CHECK (expires_at > egress_started_at),
  CHECK (
    (
      status = 'egress_started'
      AND settled_usd_micros IS NULL
      AND settled_at IS NULL
      AND cost_source IS NULL
      AND reconciliation_required = FALSE
    )
    OR (
      status = 'settled'
      AND settled_usd_micros IS NOT NULL
      AND settled_at IS NOT NULL
      AND cost_source IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS platform_news_ai_attempts_budget_idx
  ON platform_news_ai_provider_attempts (budget_day, status, expires_at, attempt_id);
CREATE INDEX IF NOT EXISTS platform_news_ai_attempts_article_idx
  ON platform_news_ai_provider_attempts
    (archive_id, locale, source_content_hash, translation_attempt, network_ordinal);
CREATE INDEX IF NOT EXISTS platform_news_ai_attempts_provider_idx
  ON platform_news_ai_provider_attempts (provider_id, requested_model, created_at DESC);

CREATE OR REPLACE FUNCTION tecpey_guard_news_ai_provider_attempt_identity()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'news AI provider attempt evidence cannot be deleted'
      USING ERRCODE = '55000';
  END IF;
  IF NEW.attempt_id IS DISTINCT FROM OLD.attempt_id
     OR NEW.budget_day IS DISTINCT FROM OLD.budget_day
     OR NEW.archive_id IS DISTINCT FROM OLD.archive_id
     OR NEW.locale IS DISTINCT FROM OLD.locale
     OR NEW.source_content_hash IS DISTINCT FROM OLD.source_content_hash
     OR NEW.translation_attempt IS DISTINCT FROM OLD.translation_attempt
     OR NEW.network_ordinal IS DISTINCT FROM OLD.network_ordinal
     OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
     OR NEW.requested_model IS DISTINCT FROM OLD.requested_model
     OR NEW.call_reason IS DISTINCT FROM OLD.call_reason
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.reserved_usd_micros IS DISTINCT FROM OLD.reserved_usd_micros
     OR NEW.egress_started_at IS DISTINCT FROM OLD.egress_started_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'news AI provider attempt identity is immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS platform_news_ai_provider_attempts_identity_guard
  ON platform_news_ai_provider_attempts;
CREATE TRIGGER platform_news_ai_provider_attempts_identity_guard
BEFORE UPDATE OR DELETE ON platform_news_ai_provider_attempts
FOR EACH ROW EXECUTE FUNCTION tecpey_guard_news_ai_provider_attempt_identity();
`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n?/g, "\n").trim()).digest("hex");
}

export async function runNewsAiCostAuthorityMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(NEWS_AI_COST_AUTHORITY_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-news-ai-cost] checksum mismatch for ${FILENAME}`);
    }
    return;
  }

  await client.query("BEGIN");
  try {
    await client.query(NEWS_AI_COST_AUTHORITY_SQL);
    await client.query("INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)", [FILENAME, cs]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
