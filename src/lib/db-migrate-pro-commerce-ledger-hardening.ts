import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0114_pro_commerce_ledger_hardening.sql";

export const PRO_COMMERCE_LEDGER_HARDENING_SQL = `
ALTER TABLE commerce_provider_events
  DROP COLUMN IF EXISTS reconciliation_status,
  DROP COLUMN IF EXISTS reconciliation_reason;

CREATE TABLE IF NOT EXISTS commerce_reconciliation_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  provider_event_id UUID NOT NULL REFERENCES commerce_provider_events(id) ON DELETE RESTRICT,
  subscription_id UUID,
  decision TEXT NOT NULL CHECK (decision IN ('applied','superseded','rejected','needs_reconciliation')),
  reason_code TEXT NOT NULL CHECK (reason_code ~ '^[a-z][a-z0-9_]{1,79}$'),
  before_state_version BIGINT,
  after_state_version BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, workspace_id) REFERENCES platform_workspaces(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (subscription_id, tenant_id, workspace_id)
    REFERENCES commerce_subscriptions(id, tenant_id, workspace_id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, workspace_id, provider_event_id),
  CHECK (before_state_version IS NULL OR before_state_version >= 1),
  CHECK (after_state_version IS NULL OR after_state_version >= 1)
);

CREATE TABLE IF NOT EXISTS commerce_manual_entitlement_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES academy_auth_accounts(id) ON DELETE RESTRICT,
  command_type TEXT NOT NULL CHECK (command_type IN ('grant','revoke')),
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 16 AND 180),
  actor_account_id TEXT NOT NULL REFERENCES academy_auth_accounts(id) ON DELETE RESTRICT,
  reason_code TEXT NOT NULL CHECK (reason_code ~ '^[a-z][a-z0-9_]{1,79}$'),
  capabilities JSONB NOT NULL CHECK (jsonb_typeof(capabilities) = 'object'),
  effective_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, workspace_id) REFERENCES platform_workspaces(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, workspace_id, idempotency_key),
  UNIQUE (id, tenant_id, workspace_id),
  CHECK (expires_at IS NULL OR expires_at > effective_at),
  CHECK (octet_length(capabilities::text) <= 16384)
);

ALTER TABLE commerce_entitlement_snapshots
  ALTER COLUMN subscription_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS manual_command_id UUID;

ALTER TABLE commerce_entitlement_snapshots
  ADD CONSTRAINT commerce_entitlement_manual_command_fk
  FOREIGN KEY (manual_command_id, tenant_id, workspace_id)
  REFERENCES commerce_manual_entitlement_commands(id, tenant_id, workspace_id) ON DELETE RESTRICT;

ALTER TABLE commerce_entitlement_snapshots
  ADD CONSTRAINT commerce_entitlement_source_authority_ck CHECK (
    (source_kind = 'commercial_subscription' AND subscription_id IS NOT NULL AND manual_command_id IS NULL)
    OR
    (source_kind = 'manual_grant' AND subscription_id IS NULL AND manual_command_id IS NOT NULL)
  );

ALTER TABLE commerce_reconciliation_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_reconciliation_records FORCE ROW LEVEL SECURITY;
ALTER TABLE commerce_manual_entitlement_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_manual_entitlement_commands FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commerce_reconciliation_records_tenant_scope ON commerce_reconciliation_records;
CREATE POLICY commerce_reconciliation_records_tenant_scope ON commerce_reconciliation_records
USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '') AND workspace_id = NULLIF(current_setting('app.workspace_id', true), ''))
WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '') AND workspace_id = NULLIF(current_setting('app.workspace_id', true), ''));

DROP POLICY IF EXISTS commerce_manual_entitlement_commands_tenant_scope ON commerce_manual_entitlement_commands;
CREATE POLICY commerce_manual_entitlement_commands_tenant_scope ON commerce_manual_entitlement_commands
USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '') AND workspace_id = NULLIF(current_setting('app.workspace_id', true), ''))
WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '') AND workspace_id = NULLIF(current_setting('app.workspace_id', true), ''));

CREATE OR REPLACE FUNCTION tecpey_reject_commerce_immutable_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'commerce authority record is append-only' USING ERRCODE = '55000';
END; $$;

DROP TRIGGER IF EXISTS commerce_reconciliation_records_append_only ON commerce_reconciliation_records;
CREATE TRIGGER commerce_reconciliation_records_append_only BEFORE UPDATE OR DELETE ON commerce_reconciliation_records
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_commerce_immutable_mutation();
DROP TRIGGER IF EXISTS commerce_manual_entitlement_commands_append_only ON commerce_manual_entitlement_commands;
CREATE TRIGGER commerce_manual_entitlement_commands_append_only BEFORE UPDATE OR DELETE ON commerce_manual_entitlement_commands
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_commerce_immutable_mutation();
DROP TRIGGER IF EXISTS commerce_entitlement_snapshots_append_only ON commerce_entitlement_snapshots;
CREATE TRIGGER commerce_entitlement_snapshots_append_only BEFORE UPDATE OR DELETE ON commerce_entitlement_snapshots
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_commerce_immutable_mutation();
DROP TRIGGER IF EXISTS commerce_plan_versions_append_only ON commerce_plan_versions;
CREATE TRIGGER commerce_plan_versions_append_only BEFORE UPDATE OR DELETE ON commerce_plan_versions
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_commerce_immutable_mutation();

CREATE INDEX IF NOT EXISTS commerce_reconciliation_event_idx
  ON commerce_reconciliation_records (tenant_id, workspace_id, provider_event_id);
CREATE INDEX IF NOT EXISTS commerce_manual_entitlement_account_idx
  ON commerce_manual_entitlement_commands (tenant_id, workspace_id, account_id, created_at DESC);
`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n?/g, "\n").trim()).digest("hex");
}
export async function runProCommerceLedgerHardeningMigrations(client: PoolClient): Promise<void> {
  const cs=checksum(PRO_COMMERCE_LEDGER_HARDENING_SQL);
  const applied=await client.query<{checksum:string}>("SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",[FILENAME]);
  if(applied.rows[0]){if(applied.rows[0].checksum!==cs)throw new Error(`[db-migrate-pro-commerce-ledger-hardening] checksum mismatch for ${FILENAME}`);return;}
  await client.query("BEGIN");
  try{await client.query(PRO_COMMERCE_LEDGER_HARDENING_SQL);await client.query("INSERT INTO _migrations (filename, checksum) VALUES ($1,$2)",[FILENAME,cs]);await client.query("COMMIT");}
  catch(error){await client.query("ROLLBACK");throw error;}
}
