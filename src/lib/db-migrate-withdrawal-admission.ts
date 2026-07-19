import { createHash } from "crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0030_withdrawal_admission_authority.sql";

export const WITHDRAWAL_ADMISSION_AUTHORITY_SQL = `
CREATE TABLE IF NOT EXISTS withdrawal_price_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset TEXT NOT NULL,
  quote_currency TEXT NOT NULL DEFAULT 'USD',
  price NUMERIC(38, 18) NOT NULL CHECK (price > 0),
  source TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  signature TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expires_at > observed_at),
  CHECK (char_length(asset) BETWEEN 2 AND 20),
  CHECK (char_length(source) BETWEEN 2 AND 100),
  CHECK (char_length(signature) = 64),
  CHECK (char_length(policy_version) BETWEEN 1 AND 100)
);

CREATE INDEX IF NOT EXISTS withdrawal_price_snapshots_lookup_idx
  ON withdrawal_price_snapshots (asset, quote_currency, observed_at DESC);
CREATE INDEX IF NOT EXISTS withdrawal_price_snapshots_expiry_idx
  ON withdrawal_price_snapshots (expires_at);

CREATE TABLE IF NOT EXISTS withdrawal_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (char_length(request_hash) = 64),
  CHECK (char_length(policy_version) BETWEEN 1 AND 100),
  CHECK (expires_at > created_at),
  CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

CREATE INDEX IF NOT EXISTS withdrawal_authorizations_consume_idx
  ON withdrawal_authorizations (id, user_id, request_hash, expires_at)
  WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS withdrawal_authorizations_user_idx
  ON withdrawal_authorizations (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS withdrawal_admission_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id TEXT NOT NULL REFERENCES withdrawals(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'compliance_review_required', 'withdrawal_admitted', 'withdrawal_blocked'
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'completed', 'failed_retryable', 'failed_terminal', 'cancelled'
  )),
  idempotency_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (withdrawal_id, event_type),
  CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS withdrawal_admission_outbox_claim_idx
  ON withdrawal_admission_outbox (status, available_at, created_at)
  WHERE status IN ('pending', 'failed_retryable');

ALTER TABLE withdrawals
  ADD COLUMN IF NOT EXISTS request_hash TEXT,
  ADD COLUMN IF NOT EXISTS destination_tag TEXT,
  ADD COLUMN IF NOT EXISTS price_snapshot_id UUID,
  ADD COLUMN IF NOT EXISTS price_usd NUMERIC(38, 18),
  ADD COLUMN IF NOT EXISTS price_observed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admission_policy_version TEXT,
  ADD COLUMN IF NOT EXISTS compliance_policy_version TEXT,
  ADD COLUMN IF NOT EXISTS compliance_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS authorization_id UUID,
  ADD COLUMN IF NOT EXISTS funds_reserved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admission_completed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS withdrawals_user_idempotency_unique_idx
  ON withdrawals (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS withdrawals_request_hash_idx
  ON withdrawals (user_id, request_hash)
  WHERE request_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS withdrawals_admission_state_idx
  ON withdrawals (state, admission_completed_at, created_at)
  WHERE state IN ('pending', 'compliance_review', 'approved');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'withdrawals_price_snapshot_fk'
  ) THEN
    ALTER TABLE withdrawals
      ADD CONSTRAINT withdrawals_price_snapshot_fk
      FOREIGN KEY (price_snapshot_id)
      REFERENCES withdrawal_price_snapshots(id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'withdrawals_authorization_fk'
  ) THEN
    ALTER TABLE withdrawals
      ADD CONSTRAINT withdrawals_authorization_fk
      FOREIGN KEY (authorization_id)
      REFERENCES withdrawal_authorizations(id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'withdrawals_request_hash_format'
  ) THEN
    ALTER TABLE withdrawals
      ADD CONSTRAINT withdrawals_request_hash_format
      CHECK (request_hash IS NULL OR char_length(request_hash) = 64)
      NOT VALID;
  END IF;
END
$$;
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runWithdrawalAdmissionMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(WITHDRAWAL_ADMISSION_AUTHORITY_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );

  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-withdrawal-admission] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-withdrawal-admission] applying migration", {
    filename: FILENAME,
  });
  await client.query("BEGIN");
  try {
    await client.query(WITHDRAWAL_ADMISSION_AUTHORITY_SQL);
    await client.query(
      "INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)",
      [FILENAME, cs],
    );
    await client.query("COMMIT");
    logger.info("[db-migrate-withdrawal-admission] migration applied", {
      filename: FILENAME,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
