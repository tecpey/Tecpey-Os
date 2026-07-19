import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0027_exchange_order_admission_authority.sql";

export const EXCHANGE_ORDER_ADMISSION_SQL = `
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM orders WHERE status IN ('NEW', 'PARTIALLY_FILLED')
  ) THEN
    RAISE EXCEPTION
      'legacy open orders must be reconciled before enabling durable order admission authority'
      USING ERRCODE = '55000';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS exchange_order_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES platform_tenants(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash CHAR(64) NOT NULL,
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
  market TEXT NOT NULL REFERENCES markets(symbol) ON DELETE RESTRICT,
  hold_asset TEXT NOT NULL,
  hold_amount NUMERIC(30,10) NOT NULL CHECK (hold_amount > 0),
  state TEXT NOT NULL DEFAULT 'admitted' CHECK (state IN (
    'admitted', 'processing', 'retryable', 'final', 'failed_terminal'
  )),
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 12 CHECK (max_attempts BETWEEN 1 AND 30),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  lease_expires_at TIMESTAMPTZ,
  finalized_at TIMESTAMPTZ,
  last_error_code TEXT,
  last_error_detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id, idempotency_key),
  CHECK (char_length(idempotency_key) BETWEEN 16 AND 160),
  CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CHECK (char_length(hold_asset) BETWEEN 2 AND 20),
  CHECK (jsonb_typeof(result) = 'object'),
  CHECK (locked_by IS NULL OR char_length(locked_by) BETWEEN 1 AND 200),
  CHECK (last_error_code IS NULL OR char_length(last_error_code) BETWEEN 1 AND 100),
  CHECK (last_error_detail IS NULL OR char_length(last_error_detail) <= 2000),
  CHECK (
    (state = 'processing' AND locked_at IS NOT NULL AND locked_by IS NOT NULL
      AND lease_expires_at IS NOT NULL AND finalized_at IS NULL)
    OR
    (state IN ('final', 'failed_terminal') AND locked_at IS NULL
      AND locked_by IS NULL AND lease_expires_at IS NULL
      AND finalized_at IS NOT NULL)
    OR
    (state IN ('admitted', 'retryable') AND locked_at IS NULL
      AND locked_by IS NULL AND lease_expires_at IS NULL
      AND finalized_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS exchange_order_commands_claim_idx
  ON exchange_order_commands (state, available_at, created_at)
  WHERE state IN ('admitted', 'retryable');
CREATE INDEX IF NOT EXISTS exchange_order_commands_lease_idx
  ON exchange_order_commands (lease_expires_at)
  WHERE state = 'processing';
CREATE INDEX IF NOT EXISTS exchange_order_commands_market_idx
  ON exchange_order_commands (market, state, created_at);
CREATE INDEX IF NOT EXISTS exchange_order_commands_user_idx
  ON exchange_order_commands (tenant_id, user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS exchange_order_command_attempts (
  id BIGSERIAL PRIMARY KEY,
  command_id UUID NOT NULL REFERENCES exchange_order_commands(id) ON DELETE RESTRICT,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  worker_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN (
    'claimed', 'completed', 'retryable_failure', 'terminal_failure', 'lease_recovered'
  )),
  error_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (command_id, attempt_number, outcome),
  CHECK (char_length(worker_id) BETWEEN 1 AND 200),
  CHECK (error_code IS NULL OR char_length(error_code) BETWEEN 1 AND 100),
  CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX IF NOT EXISTS exchange_order_command_attempts_command_idx
  ON exchange_order_command_attempts (command_id, attempt_number DESC, id DESC);

CREATE OR REPLACE FUNCTION tecpey_protect_exchange_order_command_identity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'exchange_order_commands cannot be deleted'
      USING ERRCODE = '55000';
  END IF;

  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
    OR OLD.user_id IS DISTINCT FROM NEW.user_id
    OR OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key
    OR OLD.request_hash IS DISTINCT FROM NEW.request_hash
    OR OLD.order_id IS DISTINCT FROM NEW.order_id
    OR OLD.market IS DISTINCT FROM NEW.market
    OR OLD.hold_asset IS DISTINCT FROM NEW.hold_asset
    OR OLD.hold_amount IS DISTINCT FROM NEW.hold_amount
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
  THEN
    RAISE EXCEPTION 'exchange_order_commands identity and financial admission evidence are immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS exchange_order_commands_identity_no_update
  ON exchange_order_commands;
CREATE TRIGGER exchange_order_commands_identity_no_update
  BEFORE UPDATE ON exchange_order_commands
  FOR EACH ROW EXECUTE FUNCTION tecpey_protect_exchange_order_command_identity();

DROP TRIGGER IF EXISTS exchange_order_commands_no_delete
  ON exchange_order_commands;
CREATE TRIGGER exchange_order_commands_no_delete
  BEFORE DELETE ON exchange_order_commands
  FOR EACH ROW EXECUTE FUNCTION tecpey_protect_exchange_order_command_identity();

CREATE OR REPLACE FUNCTION tecpey_block_exchange_order_attempt_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'exchange_order_command_attempts is append-only'
    USING ERRCODE = '55000';
END;
$$;
DROP TRIGGER IF EXISTS exchange_order_command_attempts_no_update
  ON exchange_order_command_attempts;
CREATE TRIGGER exchange_order_command_attempts_no_update
  BEFORE UPDATE ON exchange_order_command_attempts
  FOR EACH ROW EXECUTE FUNCTION tecpey_block_exchange_order_attempt_mutation();
DROP TRIGGER IF EXISTS exchange_order_command_attempts_no_delete
  ON exchange_order_command_attempts;
CREATE TRIGGER exchange_order_command_attempts_no_delete
  BEFORE DELETE ON exchange_order_command_attempts
  FOR EACH ROW EXECUTE FUNCTION tecpey_block_exchange_order_attempt_mutation();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runExchangeOrderAdmissionMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(EXCHANGE_ORDER_ADMISSION_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-exchange-order-admission] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-exchange-order-admission] applying migration", {
    filename: FILENAME,
  });
  await client.query("BEGIN");
  try {
    await client.query(EXCHANGE_ORDER_ADMISSION_SQL);
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
