import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0088_communication_provider_config.sql";

export const COMMUNICATION_PROVIDER_CONFIG_SQL = `
CREATE TABLE IF NOT EXISTS communication_provider_configs (
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  provider_id TEXT NOT NULL
    CHECK (provider_id IN ('limoo_sms', 'resend', 'sendgrid')),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  encrypted_api_key TEXT,
  api_key_fingerprint TEXT,
  key_version INTEGER NOT NULL DEFAULT 1 CHECK (key_version > 0),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  rotated_at TIMESTAMPTZ,
  last_test_status TEXT CHECK (last_test_status IN ('passed', 'failed')),
  last_tested_at TIMESTAMPTZ,
  updated_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, workspace_id, provider_id),
  CHECK ((encrypted_api_key IS NULL) = (api_key_fingerprint IS NULL)),
  CHECK (api_key_fingerprint IS NULL OR api_key_fingerprint ~ '^[0-9a-f]{12}$'),
  CHECK (jsonb_typeof(settings) = 'object'),
  CHECK (octet_length(settings::text) <= 8192),
  CHECK (NOT (settings ?| ARRAY['apiKey', 'api_key', 'secret', 'token', 'password', 'credential']))
);

CREATE INDEX IF NOT EXISTS communication_provider_configs_scope_idx
  ON communication_provider_configs (tenant_id, workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS communication_provider_config_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  provider_id TEXT NOT NULL
    CHECK (provider_id IN ('limoo_sms', 'resend', 'sendgrid')),
  event_type TEXT NOT NULL
    CHECK (event_type IN ('configured', 'rotated', 'enabled', 'disabled', 'test_passed', 'test_failed')),
  revision BIGINT NOT NULL CHECK (revision > 0),
  api_key_fingerprint TEXT,
  settings_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (api_key_fingerprint IS NULL OR api_key_fingerprint ~ '^[0-9a-f]{12}$'),
  CHECK (jsonb_typeof(settings_snapshot) = 'object'),
  CHECK (octet_length(settings_snapshot::text) <= 8192),
  CHECK (NOT (settings_snapshot ?| ARRAY['apiKey', 'api_key', 'secret', 'token', 'password', 'credential']))
);

CREATE INDEX IF NOT EXISTS communication_provider_config_events_scope_idx
  ON communication_provider_config_events
    (tenant_id, workspace_id, provider_id, created_at DESC);

CREATE OR REPLACE FUNCTION tecpey_reject_communication_provider_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'communication provider config events are append-only'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS communication_provider_config_events_no_update
  ON communication_provider_config_events;
CREATE TRIGGER communication_provider_config_events_no_update
BEFORE UPDATE ON communication_provider_config_events
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_communication_provider_event_mutation();

DROP TRIGGER IF EXISTS communication_provider_config_events_no_delete
  ON communication_provider_config_events;
CREATE TRIGGER communication_provider_config_events_no_delete
BEFORE DELETE ON communication_provider_config_events
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_communication_provider_event_mutation();
`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n?/g, "\n").trim()).digest("hex");
}

export async function runCommunicationProviderConfigMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(COMMUNICATION_PROVIDER_CONFIG_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error("[db-migrate-communication-provider-config] checksum mismatch for 0088_communication_provider_config.sql");
    }
    return;
  }

  logger.info("[db-migrate-communication-provider-config] applying migration", { filename: FILENAME });
  await client.query("BEGIN");
  try {
    await client.query(COMMUNICATION_PROVIDER_CONFIG_SQL);
    await client.query("INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)", [FILENAME, cs]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
