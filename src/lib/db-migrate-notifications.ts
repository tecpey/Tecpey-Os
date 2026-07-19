import { createHash } from "crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0020_intelligent_notification_persistence.sql";

export const INTELLIGENT_NOTIFICATION_PERSISTENCE_SQL = `
CREATE TABLE IF NOT EXISTS platform_principals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES platform_tenants(id) ON DELETE CASCADE,
  account_id TEXT,
  student_id UUID REFERENCES academy_students(id) ON DELETE CASCADE,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'disabled', 'deleted')),
  locale TEXT NOT NULL DEFAULT 'fa' CHECK (locale IN ('fa', 'en')),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (account_id IS NOT NULL OR student_id IS NOT NULL),
  CHECK (account_id IS NULL OR char_length(account_id) BETWEEN 3 AND 220),
  CHECK (email IS NULL OR char_length(email) BETWEEN 3 AND 254),
  CHECK (char_length(timezone) BETWEEN 1 AND 100)
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_principals_account_unique_idx
  ON platform_principals (tenant_id, account_id)
  WHERE account_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS platform_principals_student_unique_idx
  ON platform_principals (tenant_id, student_id)
  WHERE student_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS platform_principals_status_idx
  ON platform_principals (tenant_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS notification_settings (
  principal_id UUID PRIMARY KEY REFERENCES platform_principals(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  quiet_start TIME,
  quiet_end TIME,
  digest_time TIME NOT NULL DEFAULT '09:00',
  mute_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((quiet_start IS NULL) = (quiet_end IS NULL)),
  CHECK (char_length(timezone) BETWEEN 1 AND 100)
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  principal_id UUID NOT NULL REFERENCES platform_principals(id) ON DELETE CASCADE,
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
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  cadence TEXT NOT NULL DEFAULT 'instant' CHECK (cadence IN ('instant', 'digest')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (principal_id, notification_class, channel)
);

CREATE TABLE IF NOT EXISTS notification_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_id UUID NOT NULL REFERENCES platform_principals(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('granted', 'revoked')),
  policy_version TEXT NOT NULL,
  source TEXT NOT NULL,
  jurisdiction TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (char_length(purpose) BETWEEN 3 AND 100),
  CHECK (char_length(policy_version) BETWEEN 1 AND 100),
  CHECK (char_length(source) BETWEEN 1 AND 100),
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS notification_consents_principal_idx
  ON notification_consents (principal_id, purpose, occurred_at DESC);

CREATE OR REPLACE FUNCTION tecpey_block_notification_consent_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'notification_consents is append-only'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS notification_consents_no_update ON notification_consents;
CREATE TRIGGER notification_consents_no_update
  BEFORE UPDATE ON notification_consents
  FOR EACH ROW EXECUTE FUNCTION tecpey_block_notification_consent_mutation();

DROP TRIGGER IF EXISTS notification_consents_no_delete ON notification_consents;
CREATE TRIGGER notification_consents_no_delete
  BEFORE DELETE ON notification_consents
  FOR EACH ROW EXECUTE FUNCTION tecpey_block_notification_consent_mutation();

CREATE TABLE IF NOT EXISTS platform_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES platform_tenants(id) ON DELETE CASCADE,
  principal_id UUID NOT NULL REFERENCES platform_principals(id) ON DELETE CASCADE,
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
  source_type TEXT NOT NULL,
  source_id TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'fa' CHECK (locale IN ('fa', 'en')),
  action_url TEXT,
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('low', 'normal', 'high', 'critical')),
  priority SMALLINT NOT NULL DEFAULT 1 CHECK (priority BETWEEN 0 AND 10),
  correlation_key TEXT NOT NULL,
  policy_decision TEXT NOT NULL CHECK (policy_decision IN ('allow', 'defer', 'digest', 'escalate')),
  policy_reason TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  actioned_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, principal_id, correlation_key),
  CHECK (char_length(source_type) BETWEEN 1 AND 100),
  CHECK (source_id IS NULL OR char_length(source_id) BETWEEN 1 AND 220),
  CHECK (char_length(title) BETWEEN 1 AND 240),
  CHECK (char_length(body) BETWEEN 1 AND 4000),
  CHECK (action_url IS NULL OR char_length(action_url) BETWEEN 1 AND 1000),
  CHECK (char_length(correlation_key) BETWEEN 8 AND 300),
  CHECK (char_length(policy_reason) BETWEEN 1 AND 100),
  CHECK (jsonb_typeof(metadata) = 'object'),
  CHECK (expires_at IS NULL OR expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS platform_notifications_inbox_idx
  ON platform_notifications (principal_id, scheduled_for DESC, created_at DESC, id DESC)
  WHERE dismissed_at IS NULL;
CREATE INDEX IF NOT EXISTS platform_notifications_unread_idx
  ON platform_notifications (principal_id, created_at DESC)
  WHERE read_at IS NULL AND dismissed_at IS NULL;
CREATE INDEX IF NOT EXISTS platform_notifications_expiry_idx
  ON platform_notifications (expires_at)
  WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES platform_notifications(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN (
    'in_app', 'web_push', 'mobile_push', 'email', 'sms', 'admin_center'
  )),
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'provider_accepted', 'failed_retryable',
    'failed_terminal', 'cancelled', 'expired'
  )),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  provider_message_id TEXT,
  last_error_code TEXT,
  last_error_detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (char_length(idempotency_key) BETWEEN 8 AND 300),
  CHECK (locked_by IS NULL OR char_length(locked_by) BETWEEN 1 AND 200)
);

CREATE INDEX IF NOT EXISTS notification_outbox_claim_idx
  ON notification_outbox (status, available_at, created_at)
  WHERE status IN ('pending', 'failed_retryable');
CREATE UNIQUE INDEX IF NOT EXISTS notification_outbox_in_app_unique_idx
  ON notification_outbox (notification_id, channel);
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runNotificationMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(INTELLIGENT_NOTIFICATION_PERSISTENCE_SQL);
  const applied = await client.query<{ checksum: string }>(
    `SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1`,
    [FILENAME],
  );

  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-notifications] checksum mismatch for ${FILENAME}`);
    }
    return;
  }

  logger.info("[db-migrate-notifications] applying migration", { filename: FILENAME });
  await client.query("BEGIN");
  try {
    await client.query(INTELLIGENT_NOTIFICATION_PERSISTENCE_SQL);
    await client.query(
      `INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)`,
      [FILENAME, cs],
    );
    await client.query("COMMIT");
    logger.info("[db-migrate-notifications] migration applied", { filename: FILENAME });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
