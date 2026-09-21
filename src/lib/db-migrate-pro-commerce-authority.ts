import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0113_pro_commerce_authority.sql";

export const PRO_COMMERCE_AUTHORITY_SQL = `
CREATE TABLE IF NOT EXISTS commerce_plan_versions (
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  plan_key TEXT NOT NULL CHECK (plan_key ~ '^[a-z][a-z0-9_-]{1,63}$'),
  version INTEGER NOT NULL CHECK (version >= 1),
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'retired')),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  unit_amount_minor BIGINT NOT NULL CHECK (unit_amount_minor >= 0),
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('month', 'year')),
  capability_grants JSONB NOT NULL CHECK (jsonb_typeof(capability_grants) = 'object'),
  legal_copy_version TEXT NOT NULL CHECK (legal_copy_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$'),
  effective_from TIMESTAMPTZ NOT NULL,
  effective_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, workspace_id, plan_key, version),
  FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES platform_workspaces(tenant_id, id) ON DELETE RESTRICT,
  CHECK (effective_until IS NULL OR effective_until > effective_from),
  CHECK (octet_length(capability_grants::text) <= 16384)
);

CREATE TABLE IF NOT EXISTS commerce_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES academy_auth_accounts(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK (provider ~ '^[a-z][a-z0-9_-]{1,39}$'),
  provider_account_scope TEXT NOT NULL CHECK (char_length(provider_account_scope) BETWEEN 1 AND 160),
  provider_subscription_id TEXT NOT NULL CHECK (char_length(provider_subscription_id) BETWEEN 1 AND 255),
  plan_key TEXT NOT NULL,
  plan_version INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'trialing', 'active', 'grace', 'suspended', 'canceled', 'expired')),
  effective_at TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ,
  cancel_at TIMESTAMPTZ,
  last_provider_event_at TIMESTAMPTZ,
  state_version BIGINT NOT NULL DEFAULT 1 CHECK (state_version >= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES platform_workspaces(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, workspace_id, plan_key, plan_version)
    REFERENCES commerce_plan_versions(tenant_id, workspace_id, plan_key, version) ON DELETE RESTRICT,
  UNIQUE (tenant_id, workspace_id, provider, provider_account_scope, provider_subscription_id),
  UNIQUE (id, tenant_id, workspace_id)
);

CREATE TABLE IF NOT EXISTS commerce_provider_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider ~ '^[a-z][a-z0-9_-]{1,39}$'),
  provider_account_scope TEXT NOT NULL CHECK (char_length(provider_account_scope) BETWEEN 1 AND 160),
  provider_event_id TEXT NOT NULL CHECK (char_length(provider_event_id) BETWEEN 1 AND 255),
  event_type TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 1 AND 120),
  provider_object_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signature_verified BOOLEAN NOT NULL CHECK (signature_verified = TRUE),
  payload_sha256 CHAR(64) NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  payload_redacted JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload_expires_at TIMESTAMPTZ NOT NULL,
  reconciliation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (reconciliation_status IN ('pending', 'applied', 'superseded', 'rejected', 'needs_reconciliation')),
  reconciliation_reason TEXT,
  FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES platform_workspaces(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, workspace_id, provider, provider_account_scope, provider_event_id),
  CHECK (jsonb_typeof(payload_redacted) = 'object'),
  CHECK (octet_length(payload_redacted::text) <= 32768),
  CHECK (payload_expires_at > received_at)
);

CREATE TABLE IF NOT EXISTS commerce_entitlement_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES academy_auth_accounts(id) ON DELETE RESTRICT,
  subscription_id UUID NOT NULL,
  snapshot_version BIGINT NOT NULL CHECK (snapshot_version >= 1),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('commercial_subscription', 'manual_grant')),
  source_event_id UUID REFERENCES commerce_provider_events(id) ON DELETE RESTRICT,
  capabilities JSONB NOT NULL CHECK (jsonb_typeof(capabilities) = 'object'),
  valid_from TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (subscription_id, tenant_id, workspace_id)
    REFERENCES commerce_subscriptions(id, tenant_id, workspace_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES platform_workspaces(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, workspace_id, subscription_id, snapshot_version),
  CHECK (valid_until IS NULL OR valid_until > valid_from),
  CHECK (octet_length(capabilities::text) <= 16384)
);

CREATE TABLE IF NOT EXISTS commerce_provider_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider ~ '^[a-z][a-z0-9_-]{1,39}$'),
  operation_type TEXT NOT NULL CHECK (operation_type IN ('checkout_create', 'cancel', 'refund')),
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 16 AND 180),
  request_sha256 CHAR(64) NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  provider_object_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('started', 'succeeded', 'failed', 'unknown')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES platform_workspaces(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, workspace_id, provider, idempotency_key)
);

CREATE OR REPLACE FUNCTION tecpey_reject_commerce_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'commerce provider events are append-only' USING ERRCODE = '55000';
END;
$$;
DROP TRIGGER IF EXISTS commerce_provider_events_append_only ON commerce_provider_events;
CREATE TRIGGER commerce_provider_events_append_only
BEFORE UPDATE OR DELETE ON commerce_provider_events
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_commerce_event_mutation();

CREATE INDEX IF NOT EXISTS commerce_subscription_account_idx
  ON commerce_subscriptions (tenant_id, workspace_id, account_id, state);
CREATE INDEX IF NOT EXISTS commerce_event_reconcile_idx
  ON commerce_provider_events (tenant_id, workspace_id, reconciliation_status, received_at);
CREATE INDEX IF NOT EXISTS commerce_entitlement_account_idx
  ON commerce_entitlement_snapshots (tenant_id, workspace_id, account_id, valid_from DESC);
`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n?/g, "\n").trim()).digest("hex");
}

export async function runProCommerceAuthorityMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(PRO_COMMERCE_AUTHORITY_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1", [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) throw new Error(`[db-migrate-pro-commerce-authority] checksum mismatch for ${FILENAME}`);
    return;
  }
  await client.query("BEGIN");
  try {
    await client.query(PRO_COMMERCE_AUTHORITY_SQL);
    await client.query("INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)", [FILENAME, cs]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
