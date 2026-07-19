import { createHash } from "crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0023_offline_sync_command_authority.sql";

export const OFFLINE_SYNC_COMMAND_AUTHORITY_SQL = `
-- Extend the existing learning_events table with a stable, globally unique
-- domain-event identity. Existing rows remain valid because the new fields are
-- nullable; offline authority always supplies all three values.
ALTER TABLE learning_events
  ADD COLUMN IF NOT EXISTS event_id TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS locale TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS learning_events_offline_event_id_idx
  ON learning_events (event_id)
  WHERE event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS offline_sync_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES platform_tenants(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  client_event_id TEXT NOT NULL,
  command_hash CHAR(64) NOT NULL,
  event_type TEXT NOT NULL,
  source TEXT NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('fa', 'en')),
  client_created_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'committed', 'retryable', 'rejected')),
  domain_event_id TEXT,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count >= 1),
  last_error_code TEXT,
  processing_started_at TIMESTAMPTZ,
  committed_at TIMESTAMPTZ,
  retain_until TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, student_id, client_event_id),
  CHECK (char_length(client_event_id) BETWEEN 8 AND 160),
  CHECK (command_hash ~ '^[0-9a-f]{64}$'),
  CHECK (char_length(event_type) BETWEEN 3 AND 100),
  CHECK (char_length(source) BETWEEN 2 AND 40),
  CHECK (jsonb_typeof(payload) = 'object'),
  CHECK (jsonb_typeof(result) = 'object'),
  CHECK (domain_event_id IS NULL OR char_length(domain_event_id) BETWEEN 8 AND 200),
  CHECK (last_error_code IS NULL OR char_length(last_error_code) BETWEEN 1 AND 120),
  CHECK (retain_until > created_at),
  CHECK (
    (status = 'committed' AND domain_event_id IS NOT NULL AND committed_at IS NOT NULL)
    OR status <> 'committed'
  )
);

CREATE INDEX IF NOT EXISTS offline_sync_commands_student_idx
  ON offline_sync_commands (tenant_id, student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS offline_sync_commands_reconcile_idx
  ON offline_sync_commands (status, processing_started_at, updated_at)
  WHERE status IN ('processing', 'retryable');
CREATE INDEX IF NOT EXISTS offline_sync_commands_retention_idx
  ON offline_sync_commands (retain_until)
  WHERE status IN ('committed', 'rejected');
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runOfflineSyncMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(OFFLINE_SYNC_COMMAND_AUTHORITY_SQL);
  const applied = await client.query<{ checksum: string }>(
    `SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1`,
    [FILENAME],
  );

  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-offline-sync] checksum mismatch for ${FILENAME}`);
    }
    return;
  }

  logger.info("[db-migrate-offline-sync] applying migration", { filename: FILENAME });
  await client.query("BEGIN");
  try {
    await client.query(OFFLINE_SYNC_COMMAND_AUTHORITY_SQL);
    await client.query(
      `INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)`,
      [FILENAME, cs],
    );
    await client.query("COMMIT");
    logger.info("[db-migrate-offline-sync] migration applied", { filename: FILENAME });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
