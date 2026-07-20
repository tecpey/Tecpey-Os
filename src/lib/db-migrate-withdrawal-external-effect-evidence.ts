import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0042_withdrawal_external_effect_evidence.sql";

export const WITHDRAWAL_EXTERNAL_EFFECT_EVIDENCE_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
        'rawtx', 'raw_tx', 'unsignedtx', 'unsigned_tx', 'signedtx', 'signed_tx',
        'txhash', 'tx_hash', 'signinghash', 'signing_hash',
        'signeraddress', 'signer_address', 'privatekey', 'private_key',
        'keymaterial', 'key_material', 'rpcurl', 'rpc_url',
        'rpcendpoint', 'rpc_endpoint', 'providerpayload', 'provider_payload',
        'providerresponse', 'provider_response', 'nonce', 'utxo', 'utxos',
        'scriptpubkey', 'script_pub_key'
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

CREATE TABLE IF NOT EXISTS withdrawal_execution_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT 'tecpey',
  withdrawal_id TEXT NOT NULL REFERENCES withdrawals(id) ON DELETE RESTRICT,
  generation INTEGER NOT NULL CHECK (generation > 0),
  state TEXT NOT NULL CHECK (
    state IN ('claimed', 'building', 'signing', 'prepared', 'failed', 'manual_review')
  ),
  lease_owner_fingerprint TEXT NOT NULL CHECK (
    lease_owner_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  lease_expires_at TIMESTAMPTZ NOT NULL,
  prepared_tx_fingerprint TEXT CHECK (
    prepared_tx_fingerprint IS NULL OR prepared_tx_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  expected_tx_hash_fingerprint TEXT CHECK (
    expected_tx_hash_fingerprint IS NULL OR expected_tx_hash_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  signer_fingerprint TEXT CHECK (
    signer_fingerprint IS NULL OR signer_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  failure_category TEXT CHECK (
    failure_category IS NULL OR failure_category IN (
      'build_failed', 'signer_unavailable', 'signing_failed',
      'prepared_conflict', 'custody_disabled', 'unknown'
    )
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prepared_at TIMESTAMPTZ,
  finalized_at TIMESTAMPTZ,
  UNIQUE (withdrawal_id, generation),
  CHECK (
    (state = 'prepared' AND prepared_tx_fingerprint IS NOT NULL
      AND expected_tx_hash_fingerprint IS NOT NULL
      AND signer_fingerprint IS NOT NULL
      AND prepared_at IS NOT NULL
      AND finalized_at IS NOT NULL)
    OR
    (state IN ('failed', 'manual_review') AND finalized_at IS NOT NULL)
    OR
    (state IN ('claimed', 'building', 'signing') AND finalized_at IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS withdrawal_execution_one_active_generation
  ON withdrawal_execution_intents (withdrawal_id)
  WHERE state IN ('claimed', 'building', 'signing');

CREATE INDEX IF NOT EXISTS withdrawal_execution_lease_due_idx
  ON withdrawal_execution_intents (lease_expires_at)
  WHERE state IN ('claimed', 'building', 'signing');

CREATE TABLE IF NOT EXISTS withdrawal_broadcast_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT 'tecpey',
  withdrawal_id TEXT NOT NULL REFERENCES withdrawals(id) ON DELETE RESTRICT,
  execution_generation INTEGER NOT NULL CHECK (execution_generation > 0),
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  state TEXT NOT NULL CHECK (
    state IN (
      'prepared', 'calling', 'accepted', 'already_known', 'ambiguous',
      'rejected', 'hash_mismatch', 'reconciled_present',
      'reconciled_absent', 'manual_review'
    )
  ),
  prepared_tx_fingerprint TEXT NOT NULL CHECK (
    prepared_tx_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  expected_tx_hash_fingerprint TEXT NOT NULL CHECK (
    expected_tx_hash_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  chain_id TEXT NOT NULL CHECK (char_length(chain_id) BETWEEN 2 AND 32),
  provider_fingerprint TEXT NOT NULL CHECK (
    provider_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  lease_owner_fingerprint TEXT NOT NULL CHECK (
    lease_owner_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  lease_expires_at TIMESTAMPTZ NOT NULL,
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  outcome_category TEXT CHECK (
    outcome_category IS NULL OR outcome_category IN (
      'accepted', 'already_known', 'timeout', 'network_unavailable',
      'rate_limited', 'deterministic_rejection', 'hash_mismatch',
      'provider_unavailable', 'unknown', 'reconciled_present',
      'reconciled_absent', 'manual_review'
    )
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at TIMESTAMPTZ,
  UNIQUE (withdrawal_id, execution_generation, attempt_number),
  CHECK (
    (state IN ('prepared', 'calling', 'ambiguous') AND finalized_at IS NULL)
    OR
    (state IN (
      'accepted', 'already_known', 'rejected', 'hash_mismatch',
      'reconciled_present', 'reconciled_absent', 'manual_review'
    ) AND finalized_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS withdrawal_broadcast_one_active_attempt
  ON withdrawal_broadcast_attempts (withdrawal_id)
  WHERE state IN ('prepared', 'calling', 'ambiguous');

CREATE INDEX IF NOT EXISTS withdrawal_broadcast_ambiguous_idx
  ON withdrawal_broadcast_attempts (updated_at)
  WHERE state = 'ambiguous';

CREATE INDEX IF NOT EXISTS withdrawal_broadcast_lease_due_idx
  ON withdrawal_broadcast_attempts (lease_expires_at)
  WHERE state IN ('prepared', 'calling');

CREATE TABLE IF NOT EXISTS withdrawal_confirmation_outbox (
  withdrawal_id TEXT PRIMARY KEY REFERENCES withdrawals(id) ON DELETE RESTRICT,
  tenant_id TEXT NOT NULL DEFAULT 'tecpey',
  expected_tx_hash_fingerprint TEXT NOT NULL CHECK (
    expected_tx_hash_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  required_confirmations INTEGER NOT NULL CHECK (required_confirmations > 0),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (
    state IN ('pending', 'published', 'claimed', 'completed', 'dead_letter')
  ),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_owner_fingerprint TEXT CHECK (
    lease_owner_fingerprint IS NULL OR lease_owner_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  lease_expires_at TIMESTAMPTZ,
  last_error_category TEXT CHECK (
    last_error_category IS NULL OR last_error_category IN (
      'redis_unavailable', 'queue_unavailable', 'publication_failed',
      'worker_failed', 'policy_rejected', 'unknown'
    )
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS withdrawal_confirmation_outbox_due_idx
  ON withdrawal_confirmation_outbox (available_at, created_at)
  WHERE state IN ('pending', 'dead_letter');

CREATE OR REPLACE FUNCTION tecpey_guard_withdrawal_execution_intent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'withdrawal execution intent rows are append-preserved';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'claimed' THEN
      RAISE EXCEPTION 'withdrawal execution intent must start claimed';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR OLD.withdrawal_id IS DISTINCT FROM NEW.withdrawal_id
     OR OLD.generation IS DISTINCT FROM NEW.generation
     OR OLD.request_hash IS DISTINCT FROM NEW.request_hash
     OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'withdrawal execution intent identity is immutable';
  END IF;

  IF OLD.finalized_at IS NOT NULL THEN
    RAISE EXCEPTION 'finalized withdrawal execution intent is immutable';
  END IF;

  IF NOT (
    (OLD.state = 'claimed' AND NEW.state IN ('building', 'failed', 'manual_review'))
    OR (OLD.state = 'building' AND NEW.state IN ('signing', 'failed', 'manual_review'))
    OR (OLD.state = 'signing' AND NEW.state IN ('prepared', 'failed', 'manual_review'))
  ) THEN
    RAISE EXCEPTION 'invalid withdrawal execution intent transition % -> %', OLD.state, NEW.state;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS withdrawal_execution_intent_guard
  ON withdrawal_execution_intents;
CREATE TRIGGER withdrawal_execution_intent_guard
  BEFORE INSERT OR UPDATE OR DELETE ON withdrawal_execution_intents
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_guard_withdrawal_execution_intent();

CREATE OR REPLACE FUNCTION tecpey_guard_withdrawal_broadcast_attempt()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'withdrawal broadcast attempt rows are append-preserved';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'prepared' THEN
      RAISE EXCEPTION 'withdrawal broadcast attempt must start prepared';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR OLD.withdrawal_id IS DISTINCT FROM NEW.withdrawal_id
     OR OLD.execution_generation IS DISTINCT FROM NEW.execution_generation
     OR OLD.attempt_number IS DISTINCT FROM NEW.attempt_number
     OR OLD.prepared_tx_fingerprint IS DISTINCT FROM NEW.prepared_tx_fingerprint
     OR OLD.expected_tx_hash_fingerprint IS DISTINCT FROM NEW.expected_tx_hash_fingerprint
     OR OLD.chain_id IS DISTINCT FROM NEW.chain_id
     OR OLD.provider_fingerprint IS DISTINCT FROM NEW.provider_fingerprint
     OR OLD.request_hash IS DISTINCT FROM NEW.request_hash
     OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'withdrawal broadcast attempt identity is immutable';
  END IF;

  IF OLD.finalized_at IS NOT NULL THEN
    RAISE EXCEPTION 'finalized withdrawal broadcast attempt is immutable';
  END IF;

  IF NOT (
    (OLD.state = 'prepared' AND NEW.state IN ('calling', 'manual_review'))
    OR (OLD.state = 'calling' AND NEW.state IN (
      'accepted', 'already_known', 'ambiguous', 'rejected',
      'hash_mismatch', 'manual_review'
    ))
    OR (OLD.state = 'ambiguous' AND NEW.state IN (
      'reconciled_present', 'reconciled_absent', 'manual_review'
    ))
  ) THEN
    RAISE EXCEPTION 'invalid withdrawal broadcast attempt transition % -> %', OLD.state, NEW.state;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS withdrawal_broadcast_attempt_guard
  ON withdrawal_broadcast_attempts;
CREATE TRIGGER withdrawal_broadcast_attempt_guard
  BEFORE INSERT OR UPDATE OR DELETE ON withdrawal_broadcast_attempts
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_guard_withdrawal_broadcast_attempt();

CREATE OR REPLACE FUNCTION tecpey_guard_withdrawal_confirmation_outbox()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'withdrawal confirmation outbox rows cannot be deleted';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.withdrawal_id IS DISTINCT FROM NEW.withdrawal_id
       OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
       OR OLD.expected_tx_hash_fingerprint IS DISTINCT FROM NEW.expected_tx_hash_fingerprint
       OR OLD.required_confirmations IS DISTINCT FROM NEW.required_confirmations
       OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
      RAISE EXCEPTION 'withdrawal confirmation outbox identity is immutable';
    END IF;
    IF OLD.state = 'completed' THEN
      RAISE EXCEPTION 'completed withdrawal confirmation outbox is immutable';
    END IF;
    NEW.updated_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS withdrawal_confirmation_outbox_guard
  ON withdrawal_confirmation_outbox;
CREATE TRIGGER withdrawal_confirmation_outbox_guard
  BEFORE UPDATE OR DELETE ON withdrawal_confirmation_outbox
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_guard_withdrawal_confirmation_outbox();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runWithdrawalExternalEffectEvidenceMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(WITHDRAWAL_EXTERNAL_EFFECT_EVIDENCE_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-withdrawal-external-effect-evidence] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info(
    "[db-migrate-withdrawal-external-effect-evidence] applying migration",
    { filename: FILENAME },
  );
  await client.query("BEGIN");
  try {
    await client.query(WITHDRAWAL_EXTERNAL_EFFECT_EVIDENCE_SQL);
    await client.query(
      "INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)",
      [FILENAME, cs],
    );
    await client.query("COMMIT");
    logger.info(
      "[db-migrate-withdrawal-external-effect-evidence] migration applied",
      { filename: FILENAME },
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
