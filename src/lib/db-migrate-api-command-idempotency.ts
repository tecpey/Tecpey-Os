import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0032_api_command_idempotency.sql";

export const API_COMMAND_IDEMPOTENCY_SQL = `
CREATE TABLE IF NOT EXISTS api_command_receipts (
  tenant_id TEXT NOT NULL,
  principal_type TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed')),
  http_status INTEGER,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  retain_until TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '90 days',
  PRIMARY KEY (
    tenant_id,
    principal_type,
    principal_id,
    operation,
    idempotency_key
  ),
  CHECK (tenant_id ~ '^[a-z][a-z0-9._-]{1,79}$'),
  CHECK (length(principal_type) BETWEEN 2 AND 40),
  CHECK (length(principal_id) BETWEEN 1 AND 300),
  CHECK (length(operation) BETWEEN 3 AND 120),
  CHECK (idempotency_key ~ '^[A-Za-z0-9._:-]{16,120}$'),
  CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CHECK (jsonb_typeof(response_body) = 'object' OR response_body IS NULL),
  CHECK (
    (status = 'processing' AND http_status IS NULL AND response_body IS NULL AND completed_at IS NULL)
    OR
    (status = 'completed' AND http_status BETWEEN 200 AND 499 AND response_body IS NOT NULL AND completed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS api_command_receipts_retention_idx
  ON api_command_receipts(retain_until)
  WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS api_command_receipts_operation_idx
  ON api_command_receipts(tenant_id, operation, created_at DESC);

CREATE OR REPLACE FUNCTION tecpey_guard_api_command_receipt()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.principal_type IS DISTINCT FROM OLD.principal_type
    OR NEW.principal_id IS DISTINCT FROM OLD.principal_id
    OR NEW.operation IS DISTINCT FROM OLD.operation
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.request_hash IS DISTINCT FROM OLD.request_hash THEN
    RAISE EXCEPTION 'api command receipt identity is immutable'
      USING ERRCODE = '55000';
  END IF;

  IF OLD.status = 'completed' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'completed api command receipt is immutable'
      USING ERRCODE = '55000';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS api_command_receipts_guard
  ON api_command_receipts;
CREATE TRIGGER api_command_receipts_guard
  BEFORE UPDATE ON api_command_receipts
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_guard_api_command_receipt();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runApiCommandIdempotencyMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(API_COMMAND_IDEMPOTENCY_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-api-command-idempotency] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-api-command-idempotency] applying migration", {
    filename: FILENAME,
  });
  await client.query("BEGIN");
  try {
    await client.query(API_COMMAND_IDEMPOTENCY_SQL);
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
