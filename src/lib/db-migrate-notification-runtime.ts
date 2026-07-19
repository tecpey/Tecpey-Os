import { createHash } from "crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0021_notification_creation_outbox_runtime.sql";

export const NOTIFICATION_CREATION_OUTBOX_RUNTIME_SQL = `
ALTER TABLE platform_notifications
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

UPDATE platform_notifications
   SET delivered_at = COALESCE(delivered_at, created_at)
 WHERE source_type = 'legacy_notification_center'
   AND delivered_at IS NULL;

CREATE TABLE IF NOT EXISTS notification_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_sequence BIGSERIAL NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL REFERENCES platform_tenants(id) ON DELETE RESTRICT,
  principal_id UUID NOT NULL,
  notification_id UUID REFERENCES platform_notifications(id) ON DELETE RESTRICT,
  outbox_id UUID,
  notification_class TEXT NOT NULL CHECK (notification_class IN (
    'security_critical',
    'financial_transactional',
    'legal_compliance_service',
    'academy',
    'trading_arena',
    'mentor_ai',
    'social',
    'news_market_intelligence',
    'product_support',
    'marketing_campaign',
    'admin_operations'
  )),
  channel TEXT NOT NULL CHECK (channel IN (
    'in_app', 'web_push', 'mobile_push', 'email', 'sms', 'admin_center'
  )),
  audience_scope TEXT NOT NULL CHECK (audience_scope IN (
    'principal', 'principal_list', 'cohort', 'crm_segment',
    'topic_followers', 'role', 'tenant', 'platform', 'emergency_broadcast'
  )),
  dispatch_mode TEXT NOT NULL CHECK (dispatch_mode IN (
    'event', 'automation', 'campaign', 'broadcast', 'emergency'
  )),
  source_type TEXT NOT NULL,
  source_id TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('fa', 'en')),
  action_url TEXT,
  urgency TEXT NOT NULL CHECK (urgency IN ('low', 'normal', 'high', 'critical')),
  priority SMALLINT NOT NULL CHECK (priority BETWEEN 0 AND 10),
  cadence TEXT NOT NULL CHECK (cadence IN ('instant', 'digest')),
  correlation_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  granted_approvals INTEGER NOT NULL DEFAULT 0 CHECK (granted_approvals >= 0),
  template_available BOOLEAN NOT NULL,
  policy_decision TEXT NOT NULL CHECK (policy_decision IN (
    'allow', 'defer', 'digest', 'suppress', 'escalate'
  )),
  policy_reason TEXT NOT NULL,
  mandatory BOOLEAN NOT NULL,
  should_try_fallback_channel BOOLEAN NOT NULL DEFAULT FALSE,
  scheduled_for TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  policy_snapshot JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, principal_id)
    REFERENCES platform_principals(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, principal_id, channel, correlation_key),
  CHECK (char_length(source_type) BETWEEN 1 AND 100),
  CHECK (source_id IS NULL OR char_length(source_id) BETWEEN 1 AND 220),
  CHECK (char_length(title) BETWEEN 1 AND 240),
  CHECK (char_length(body) BETWEEN 1 AND 4000),
  CHECK (action_url IS NULL OR char_length(action_url) BETWEEN 1 AND 1000),
  CHECK (char_length(correlation_key) BETWEEN 8 AND 300),
  CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  CHECK (char_length(policy_reason) BETWEEN 1 AND 100),
  CHECK (jsonb_typeof(policy_snapshot) = 'object'),
  CHECK (jsonb_typeof(metadata) = 'object'),
  CHECK (expires_at IS NULL OR expires_at > created_at),
  CHECK (
    (policy_decision IN ('allow', 'defer', 'digest')
      AND notification_id IS NOT NULL AND outbox_id IS NOT NULL AND scheduled_for IS NOT NULL)
    OR
    (policy_decision IN ('suppress', 'escalate')
      AND notification_id IS NULL AND outbox_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS notification_intents_principal_idx
  ON notification_intents (tenant_id, principal_id, event_sequence DESC);
CREATE INDEX IF NOT EXISTS notification_intents_decision_idx
  ON notification_intents (policy_decision, created_at DESC);

CREATE OR REPLACE FUNCTION tecpey_block_notification_intent_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'notification_intents is append-only'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS notification_intents_no_update ON notification_intents;
CREATE TRIGGER notification_intents_no_update
  BEFORE UPDATE ON notification_intents
  FOR EACH ROW EXECUTE FUNCTION tecpey_block_notification_intent_mutation();

DROP TRIGGER IF EXISTS notification_intents_no_delete ON notification_intents;
CREATE TRIGGER notification_intents_no_delete
  BEFORE DELETE ON notification_intents
  FOR EACH ROW EXECUTE FUNCTION tecpey_block_notification_intent_mutation();

ALTER TABLE notification_outbox
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terminal_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS payload_hash TEXT;

ALTER TABLE notification_outbox
  DROP CONSTRAINT IF EXISTS notification_outbox_max_attempts_check;
ALTER TABLE notification_outbox
  ADD CONSTRAINT notification_outbox_max_attempts_check
  CHECK (max_attempts BETWEEN 1 AND 20);

ALTER TABLE notification_outbox
  DROP CONSTRAINT IF EXISTS notification_outbox_payload_hash_check;
ALTER TABLE notification_outbox
  ADD CONSTRAINT notification_outbox_payload_hash_check
  CHECK (payload_hash IS NULL OR payload_hash ~ '^[a-f0-9]{64}$');

ALTER TABLE notification_outbox
  DROP CONSTRAINT IF EXISTS notification_outbox_processing_lease_check;
ALTER TABLE notification_outbox
  ADD CONSTRAINT notification_outbox_processing_lease_check
  CHECK (
    (status = 'processing' AND locked_at IS NOT NULL AND locked_by IS NOT NULL
      AND lease_expires_at IS NOT NULL)
    OR
    (status <> 'processing' AND locked_at IS NULL AND locked_by IS NULL
      AND lease_expires_at IS NULL)
  );

ALTER TABLE notification_intents
  ADD CONSTRAINT notification_intents_outbox_fk
  FOREIGN KEY (outbox_id) REFERENCES notification_outbox(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS notification_delivery_attempts (
  id BIGSERIAL PRIMARY KEY,
  outbox_id UUID NOT NULL REFERENCES notification_outbox(id) ON DELETE RESTRICT,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  worker_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'claimed', 'provider_accepted', 'failed_retryable',
    'failed_terminal', 'expired', 'lease_recovered'
  )),
  error_code TEXT,
  error_detail TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (outbox_id, attempt_number),
  CHECK (char_length(worker_id) BETWEEN 1 AND 200),
  CHECK (error_code IS NULL OR char_length(error_code) BETWEEN 1 AND 100),
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS notification_delivery_attempts_outbox_idx
  ON notification_delivery_attempts (outbox_id, attempt_number DESC);

CREATE TABLE IF NOT EXISTS notification_dead_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id UUID NOT NULL UNIQUE REFERENCES notification_outbox(id) ON DELETE RESTRICT,
  notification_id UUID NOT NULL REFERENCES platform_notifications(id) ON DELETE RESTRICT,
  terminal_reason TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (char_length(terminal_reason) BETWEEN 1 AND 100),
  CHECK (jsonb_typeof(snapshot) = 'object')
);

CREATE INDEX IF NOT EXISTS notification_outbox_active_lease_idx
  ON notification_outbox (lease_expires_at)
  WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS notification_outbox_terminal_idx
  ON notification_outbox (terminal_at DESC)
  WHERE status IN ('failed_terminal', 'expired', 'cancelled');
CREATE INDEX IF NOT EXISTS platform_notifications_delivered_inbox_idx
  ON platform_notifications (principal_id, delivered_at DESC, created_at DESC)
  WHERE delivered_at IS NOT NULL AND dismissed_at IS NULL;
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runNotificationRuntimeMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(NOTIFICATION_CREATION_OUTBOX_RUNTIME_SQL);
  const applied = await client.query<{ checksum: string }>(
    `SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1`,
    [FILENAME],
  );

  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-notification-runtime] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-notification-runtime] applying migration", {
    filename: FILENAME,
  });
  await client.query("BEGIN");
  try {
    await client.query(NOTIFICATION_CREATION_OUTBOX_RUNTIME_SQL);
    await client.query(
      `INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)`,
      [FILENAME, cs],
    );
    await client.query("COMMIT");
    logger.info("[db-migrate-notification-runtime] migration applied", {
      filename: FILENAME,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
