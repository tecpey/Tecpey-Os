import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0061_withdrawal_tenant_binding.sql";

export const WITHDRAWAL_TENANT_BINDING_SQL = `
ALTER TABLE withdrawals
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tecpey';

UPDATE withdrawals SET tenant_id = 'tecpey' WHERE tenant_id IS NULL;

ALTER TABLE withdrawals
  DROP CONSTRAINT IF EXISTS withdrawals_tenant_fk;
ALTER TABLE withdrawals
  ADD CONSTRAINT withdrawals_tenant_fk
  FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS withdrawals_tenant_user_idx
  ON withdrawals (tenant_id, user_id, created_at DESC);

DROP INDEX IF EXISTS withdrawals_user_idempotency_unique_idx;
CREATE UNIQUE INDEX IF NOT EXISTS withdrawals_tenant_user_idempotency_unique_idx
  ON withdrawals (tenant_id, user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

DROP INDEX IF EXISTS withdrawals_request_hash_idx;
CREATE INDEX IF NOT EXISTS withdrawals_tenant_request_hash_idx
  ON withdrawals (tenant_id, user_id, request_hash)
  WHERE request_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION tecpey_withdrawal_parent_tenant(withdrawal_identifier TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  resolved_tenant TEXT;
BEGIN
  SELECT tenant_id INTO resolved_tenant
    FROM withdrawals
   WHERE id = withdrawal_identifier;
  IF resolved_tenant IS NULL THEN
    RAISE EXCEPTION 'withdrawal parent tenant missing';
  END IF;
  RETURN resolved_tenant;
END;
$$;

CREATE OR REPLACE FUNCTION tecpey_bind_withdrawal_execution_intent_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_tenant TEXT;
BEGIN
  parent_tenant := tecpey_withdrawal_parent_tenant(NEW.withdrawal_id);
  IF TG_OP = 'INSERT' THEN
    NEW.tenant_id := parent_tenant;
  ELSIF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'withdrawal execution tenant is immutable';
  ELSIF NEW.tenant_id IS DISTINCT FROM parent_tenant THEN
    RAISE EXCEPTION 'withdrawal execution tenant must match parent withdrawal';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS withdrawal_execution_intent_tenant_binding
  ON withdrawal_execution_intents;
CREATE TRIGGER withdrawal_execution_intent_tenant_binding
  BEFORE INSERT OR UPDATE ON withdrawal_execution_intents
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_bind_withdrawal_execution_intent_tenant();

CREATE OR REPLACE FUNCTION tecpey_bind_withdrawal_broadcast_attempt_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_tenant TEXT;
BEGIN
  parent_tenant := tecpey_withdrawal_parent_tenant(NEW.withdrawal_id);
  IF TG_OP = 'INSERT' THEN
    NEW.tenant_id := parent_tenant;
  ELSIF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'withdrawal broadcast tenant is immutable';
  ELSIF NEW.tenant_id IS DISTINCT FROM parent_tenant THEN
    RAISE EXCEPTION 'withdrawal broadcast tenant must match parent withdrawal';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS withdrawal_broadcast_attempt_tenant_binding
  ON withdrawal_broadcast_attempts;
CREATE TRIGGER withdrawal_broadcast_attempt_tenant_binding
  BEFORE INSERT OR UPDATE ON withdrawal_broadcast_attempts
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_bind_withdrawal_broadcast_attempt_tenant();

CREATE OR REPLACE FUNCTION tecpey_bind_withdrawal_confirmation_outbox_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_tenant TEXT;
BEGIN
  parent_tenant := tecpey_withdrawal_parent_tenant(NEW.withdrawal_id);
  IF TG_OP = 'INSERT' THEN
    NEW.tenant_id := parent_tenant;
  ELSIF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'withdrawal confirmation tenant is immutable';
  ELSIF NEW.tenant_id IS DISTINCT FROM parent_tenant THEN
    RAISE EXCEPTION 'withdrawal confirmation tenant must match parent withdrawal';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS withdrawal_confirmation_outbox_tenant_binding
  ON withdrawal_confirmation_outbox;
CREATE TRIGGER withdrawal_confirmation_outbox_tenant_binding
  BEFORE INSERT OR UPDATE ON withdrawal_confirmation_outbox
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_bind_withdrawal_confirmation_outbox_tenant();

UPDATE withdrawal_execution_intents evidence
   SET tenant_id = parent.tenant_id
  FROM withdrawals parent
 WHERE evidence.withdrawal_id = parent.id
   AND evidence.tenant_id IS DISTINCT FROM parent.tenant_id;

UPDATE withdrawal_broadcast_attempts evidence
   SET tenant_id = parent.tenant_id
  FROM withdrawals parent
 WHERE evidence.withdrawal_id = parent.id
   AND evidence.tenant_id IS DISTINCT FROM parent.tenant_id;

UPDATE withdrawal_confirmation_outbox evidence
   SET tenant_id = parent.tenant_id
  FROM withdrawals parent
 WHERE evidence.withdrawal_id = parent.id
   AND evidence.tenant_id IS DISTINCT FROM parent.tenant_id;
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runWithdrawalTenantBindingMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(WITHDRAWAL_TENANT_BINDING_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-withdrawal-tenant-binding] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-withdrawal-tenant-binding] applying migration", {
    filename: FILENAME,
    checksum: cs,
  });
  await client.query("BEGIN");
  try {
    await client.query(WITHDRAWAL_TENANT_BINDING_SQL);
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
