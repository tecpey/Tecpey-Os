import { createHash } from "crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0023_notification_domain_outbox.sql";

export const NOTIFICATION_DOMAIN_OUTBOX_SQL = `
CREATE TABLE IF NOT EXISTS notification_domain_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_sequence BIGSERIAL NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL REFERENCES platform_tenants(id) ON DELETE RESTRICT,
  principal_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'academy.lesson_available',
    'academy.assessment_completed',
    'academy.certificate_issued',
    'security.new_login',
    'security.credential_changed',
    'security.session_revoked',
    'support.ticket_status_changed'
  )),
  event_version SMALLINT NOT NULL DEFAULT 1 CHECK (event_version = 1),
  event_id TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('fa', 'en')),
  payload JSONB NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'processed', 'failed_retryable', 'failed_terminal'
  )),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 8 CHECK (max_attempts BETWEEN 1 AND 20),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  lease_expires_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  terminal_at TIMESTAMPTZ,
  notification_intent_id UUID REFERENCES notification_intents(id) ON DELETE RESTRICT,
  last_error_code TEXT,
  last_error_detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, principal_id)
    REFERENCES platform_principals(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, event_type, event_id),
  CHECK (char_length(event_id) BETWEEN 8 AND 180),
  CHECK (event_id ~ '^[A-Za-z0-9._:-]+$'),
  CHECK (jsonb_typeof(payload) = 'object'),
  CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  CHECK (locked_by IS NULL OR char_length(locked_by) BETWEEN 1 AND 200),
  CHECK (last_error_code IS NULL OR char_length(last_error_code) BETWEEN 1 AND 100),
  CHECK (last_error_detail IS NULL OR char_length(last_error_detail) <= 2000),
  CHECK (
    (status = 'processing' AND locked_at IS NOT NULL AND locked_by IS NOT NULL
      AND lease_expires_at IS NOT NULL AND processed_at IS NULL AND terminal_at IS NULL)
    OR
    (status = 'processed' AND locked_at IS NULL AND locked_by IS NULL
      AND lease_expires_at IS NULL AND processed_at IS NOT NULL
      AND terminal_at IS NOT NULL AND notification_intent_id IS NOT NULL)
    OR
    (status = 'failed_terminal' AND locked_at IS NULL AND locked_by IS NULL
      AND lease_expires_at IS NULL AND processed_at IS NULL AND terminal_at IS NOT NULL)
    OR
    (status IN ('pending', 'failed_retryable') AND locked_at IS NULL
      AND locked_by IS NULL AND lease_expires_at IS NULL
      AND processed_at IS NULL AND terminal_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS notification_domain_outbox_claim_idx
  ON notification_domain_outbox (status, available_at, event_sequence)
  WHERE status IN ('pending', 'failed_retryable');
CREATE INDEX IF NOT EXISTS notification_domain_outbox_lease_idx
  ON notification_domain_outbox (lease_expires_at)
  WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS notification_domain_outbox_principal_idx
  ON notification_domain_outbox (tenant_id, principal_id, event_sequence DESC);
CREATE INDEX IF NOT EXISTS notification_domain_outbox_terminal_idx
  ON notification_domain_outbox (terminal_at DESC)
  WHERE status = 'failed_terminal';

CREATE TABLE IF NOT EXISTS notification_domain_outbox_attempts (
  id BIGSERIAL PRIMARY KEY,
  domain_outbox_id UUID NOT NULL
    REFERENCES notification_domain_outbox(id) ON DELETE RESTRICT,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  worker_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'claimed', 'processed', 'failed_retryable', 'failed_terminal', 'lease_recovered'
  )),
  error_code TEXT,
  error_detail TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (domain_outbox_id, attempt_number),
  CHECK (char_length(worker_id) BETWEEN 1 AND 200),
  CHECK (error_code IS NULL OR char_length(error_code) BETWEEN 1 AND 100),
  CHECK (error_detail IS NULL OR char_length(error_detail) <= 2000),
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS notification_domain_outbox_attempts_event_idx
  ON notification_domain_outbox_attempts (domain_outbox_id, attempt_number DESC);

CREATE TABLE IF NOT EXISTS notification_domain_dead_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_outbox_id UUID NOT NULL UNIQUE
    REFERENCES notification_domain_outbox(id) ON DELETE RESTRICT,
  terminal_reason TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (char_length(terminal_reason) BETWEEN 1 AND 100),
  CHECK (jsonb_typeof(snapshot) = 'object')
);
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runNotificationDomainOutboxMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(NOTIFICATION_DOMAIN_OUTBOX_SQL);
  const applied = await client.query<{ checksum: string }>(
    `SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1`,
    [FILENAME],
  );

  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-notification-domain-outbox] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-notification-domain-outbox] applying migration", {
    filename: FILENAME,
  });
  await client.query("BEGIN");
  try {
    await client.query(NOTIFICATION_DOMAIN_OUTBOX_SQL);
    await client.query(
      `INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)`,
      [FILENAME, cs],
    );
    await client.query("COMMIT");
    logger.info("[db-migrate-notification-domain-outbox] migration applied", {
      filename: FILENAME,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
