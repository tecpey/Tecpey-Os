import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0042_withdrawal_execution_attempts.sql";

export const WITHDRAWAL_EXECUTION_ATTEMPTS_SQL = `
CREATE OR REPLACE FUNCTION tecpey_sensitive_audit_has_forbidden_key(document JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  object_entry RECORD;
  array_item JSONB;
BEGIN
  IF jsonb_typeof(document) = 'object' THEN
    FOR object_entry IN
      SELECT object_item.key, object_item.value
        FROM jsonb_each(document) AS object_item(key, value)
    LOOP
      IF lower(object_entry.key) = ANY(ARRAY[
        'token', 'device_token', 'content', 'message', 'messages',
        'conversation', 'conversations', 'secret', 'password',
        'email', 'phone', 'raw', 'body', 'authorization', 'cookie',
        'public_key', 'publickey', 'signature', 'challenge',
        'clientdatajson', 'authenticatordata', 'attestationobject',
        'userhandle', 'credentialid', 'credential_id', 'rawid', 'raw_id',
        'ip', 'useragent', 'user_agent', 'deviceinfo', 'device_info',
        'access_token', 'accesstoken', 'refresh_token', 'refreshtoken',
        'jti', 'sessionid', 'session_id', 'familyid', 'family_id',
        'orderid', 'order_id', 'tradeid', 'trade_id', 'walletid', 'wallet_id',
        'withdrawalid', 'withdrawal_id', 'authorizationid', 'authorization_id',
        'destinationaddress', 'destination_address', 'destinationtag',
        'destination_tag', 'reviewnotes', 'review_notes', 'notes',
        'rawtransaction', 'raw_transaction', 'rawtx', 'raw_tx',
        'unsignedtransaction', 'unsigned_transaction', 'signinghash',
        'signing_hash', 'txhash', 'tx_hash', 'transactionhash',
        'transaction_hash', 'privatekey', 'private_key', 'seed', 'mnemonic',
        'rpcurl', 'rpc_url', 'rpcresponse', 'rpc_response',
        'providerresponse', 'provider_response'
      ]) THEN
        RETURN TRUE;
      END IF;
      IF tecpey_sensitive_audit_has_forbidden_key(object_entry.value) THEN
        RETURN TRUE;
      END IF;
    END LOOP;
  ELSIF jsonb_typeof(document) = 'array' THEN
    FOR array_item IN
      SELECT array_element.value
        FROM jsonb_array_elements(document) AS array_element(value)
    LOOP
      IF tecpey_sensitive_audit_has_forbidden_key(array_item) THEN
        RETURN TRUE;
      END IF;
    END LOOP;
  END IF;
  RETURN FALSE;
END;
$$;

CREATE TABLE IF NOT EXISTS withdrawal_execution_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id TEXT NOT NULL REFERENCES withdrawals(id) ON DELETE RESTRICT,
  tenant_id TEXT NOT NULL DEFAULT 'tecpey',
  service_actor_id TEXT NOT NULL,
  lease_owner TEXT NOT NULL,
  lease_owner_fingerprint CHAR(64) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  policy_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT withdrawal_execution_attempt_actor_check
    CHECK (service_actor_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$'),
  CONSTRAINT withdrawal_execution_attempt_fingerprint_check
    CHECK (lease_owner_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT withdrawal_execution_attempt_request_hash_check
    CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT withdrawal_execution_attempt_unique
    UNIQUE (withdrawal_id, lease_owner)
);

CREATE INDEX IF NOT EXISTS withdrawal_execution_attempts_withdrawal_idx
  ON withdrawal_execution_attempts (withdrawal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS withdrawal_execution_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL
    REFERENCES withdrawal_execution_attempts(id) ON DELETE RESTRICT,
  withdrawal_id TEXT NOT NULL REFERENCES withdrawals(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'claim', 'build', 'sign', 'broadcast_attempt', 'broadcast_accept',
    'broadcast_ambiguous', 'broadcast_reject', 'reconcile', 'confirming',
    'dropped', 'timeout', 'settle', 'complete'
  )),
  outcome TEXT NOT NULL CHECK (outcome IN (
    'started', 'success', 'rejected', 'ambiguous', 'failed', 'no_op'
  )),
  correlation_id TEXT NOT NULL,
  request_hash CHAR(64) NOT NULL,
  expected_tx_hash_fingerprint CHAR(64),
  signed_payload_fingerprint CHAR(64),
  signer_identity_fingerprint CHAR(64),
  provider_policy_fingerprint CHAR(64),
  error_class_fingerprint CHAR(64),
  confirmation_count INTEGER,
  required_confirmations INTEGER,
  block_height TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT withdrawal_execution_event_correlation_check
    CHECK (correlation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'),
  CONSTRAINT withdrawal_execution_event_request_hash_check
    CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT withdrawal_execution_event_tx_hash_check
    CHECK (
      expected_tx_hash_fingerprint IS NULL
      OR expected_tx_hash_fingerprint ~ '^[0-9a-f]{64}$'
    ),
  CONSTRAINT withdrawal_execution_event_payload_check
    CHECK (
      signed_payload_fingerprint IS NULL
      OR signed_payload_fingerprint ~ '^[0-9a-f]{64}$'
    ),
  CONSTRAINT withdrawal_execution_event_signer_check
    CHECK (
      signer_identity_fingerprint IS NULL
      OR signer_identity_fingerprint ~ '^[0-9a-f]{64}$'
    ),
  CONSTRAINT withdrawal_execution_event_provider_check
    CHECK (
      provider_policy_fingerprint IS NULL
      OR provider_policy_fingerprint ~ '^[0-9a-f]{64}$'
    ),
  CONSTRAINT withdrawal_execution_event_error_check
    CHECK (
      error_class_fingerprint IS NULL
      OR error_class_fingerprint ~ '^[0-9a-f]{64}$'
    ),
  CONSTRAINT withdrawal_execution_event_confirmation_check
    CHECK (
      confirmation_count IS NULL OR confirmation_count >= 0
    ),
  CONSTRAINT withdrawal_execution_event_required_confirmation_check
    CHECK (
      required_confirmations IS NULL OR required_confirmations > 0
    ),
  CONSTRAINT withdrawal_execution_event_metadata_check
    CHECK (
      jsonb_typeof(metadata) = 'object'
      AND pg_column_size(metadata) <= 16384
      AND NOT tecpey_sensitive_audit_has_forbidden_key(metadata)
    ),
  CONSTRAINT withdrawal_execution_event_unique
    UNIQUE (attempt_id, event_type, correlation_id)
);

CREATE INDEX IF NOT EXISTS withdrawal_execution_events_withdrawal_idx
  ON withdrawal_execution_events (withdrawal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS withdrawal_execution_events_attempt_idx
  ON withdrawal_execution_events (attempt_id, created_at);

CREATE TABLE IF NOT EXISTS withdrawal_reconciliation_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id TEXT NOT NULL REFERENCES withdrawals(id) ON DELETE RESTRICT,
  attempt_id UUID NOT NULL
    REFERENCES withdrawal_execution_attempts(id) ON DELETE RESTRICT,
  expected_tx_hash_fingerprint CHAR(64) NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN (
    'broadcast_ambiguous', 'broadcast_state_commit_failed',
    'provider_unknown', 'confirmation_unknown', 'manual_review'
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'completed', 'cancelled', 'failed_retryable',
    'failed_terminal'
  )),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error_class_fingerprint CHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT withdrawal_reconciliation_hash_check
    CHECK (expected_tx_hash_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT withdrawal_reconciliation_error_check
    CHECK (
      last_error_class_fingerprint IS NULL
      OR last_error_class_fingerprint ~ '^[0-9a-f]{64}$'
    ),
  CONSTRAINT withdrawal_reconciliation_unique
    UNIQUE (withdrawal_id, attempt_id, reason)
);

CREATE INDEX IF NOT EXISTS withdrawal_reconciliation_pending_idx
  ON withdrawal_reconciliation_outbox (available_at, created_at)
  WHERE status IN ('pending', 'failed_retryable');

CREATE OR REPLACE FUNCTION tecpey_validate_withdrawal_execution_attempt()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  withdrawal_row RECORD;
BEGIN
  SELECT state, execution_lock_owner, execution_lock_expires_at
    INTO withdrawal_row
    FROM withdrawals
   WHERE id = NEW.withdrawal_id
   FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'withdrawal execution attempt target is missing';
  END IF;
  IF withdrawal_row.execution_lock_owner IS DISTINCT FROM NEW.lease_owner THEN
    RAISE EXCEPTION 'withdrawal execution attempt lease owner mismatch';
  END IF;
  IF withdrawal_row.execution_lock_expires_at IS NULL
     OR withdrawal_row.execution_lock_expires_at <= NOW() THEN
    RAISE EXCEPTION 'withdrawal execution attempt lease is expired';
  END IF;
  IF withdrawal_row.state NOT IN (
    'approved', 'building', 'signing', 'retryable'
  ) THEN
    RAISE EXCEPTION 'withdrawal execution attempt state is not executable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS withdrawal_execution_attempt_validate
  ON withdrawal_execution_attempts;
CREATE TRIGGER withdrawal_execution_attempt_validate
  BEFORE INSERT ON withdrawal_execution_attempts
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_validate_withdrawal_execution_attempt();

CREATE OR REPLACE FUNCTION tecpey_validate_withdrawal_execution_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  attempt_row RECORD;
BEGIN
  SELECT withdrawal_id
    INTO attempt_row
    FROM withdrawal_execution_attempts
   WHERE id = NEW.attempt_id;
  IF NOT FOUND OR attempt_row.withdrawal_id <> NEW.withdrawal_id THEN
    RAISE EXCEPTION 'withdrawal execution event attempt binding mismatch';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS withdrawal_execution_event_validate
  ON withdrawal_execution_events;
CREATE TRIGGER withdrawal_execution_event_validate
  BEFORE INSERT ON withdrawal_execution_events
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_validate_withdrawal_execution_event();

CREATE OR REPLACE FUNCTION tecpey_guard_withdrawal_execution_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'withdrawal execution authority is append-only'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS withdrawal_execution_attempts_no_update
  ON withdrawal_execution_attempts;
CREATE TRIGGER withdrawal_execution_attempts_no_update
  BEFORE UPDATE ON withdrawal_execution_attempts
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_guard_withdrawal_execution_append_only();

DROP TRIGGER IF EXISTS withdrawal_execution_attempts_no_delete
  ON withdrawal_execution_attempts;
CREATE TRIGGER withdrawal_execution_attempts_no_delete
  BEFORE DELETE ON withdrawal_execution_attempts
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_guard_withdrawal_execution_append_only();

DROP TRIGGER IF EXISTS withdrawal_execution_events_no_update
  ON withdrawal_execution_events;
CREATE TRIGGER withdrawal_execution_events_no_update
  BEFORE UPDATE ON withdrawal_execution_events
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_guard_withdrawal_execution_append_only();

DROP TRIGGER IF EXISTS withdrawal_execution_events_no_delete
  ON withdrawal_execution_events;
CREATE TRIGGER withdrawal_execution_events_no_delete
  BEFORE DELETE ON withdrawal_execution_events
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_guard_withdrawal_execution_append_only();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runWithdrawalExecutionAttemptMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(WITHDRAWAL_EXECUTION_ATTEMPTS_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-withdrawal-execution-attempts] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-withdrawal-execution-attempts] applying migration", {
    filename: FILENAME,
  });
  await client.query("BEGIN");
  try {
    await client.query(WITHDRAWAL_EXECUTION_ATTEMPTS_SQL);
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
