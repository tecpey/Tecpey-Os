import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0043_withdrawal_execution_evidence_gates.sql";

export const WITHDRAWAL_EXECUTION_EVIDENCE_GATES_SQL = `
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

  IF NEW.service_actor_id = 'withdrawal-execution-cutover'
     AND NEW.lease_owner LIKE 'cutover:%'
     AND withdrawal_row.state IN (
       'building', 'signing', 'retryable', 'broadcasted', 'confirming',
       'failed', 'timeout', 'completed'
     ) THEN
    RETURN NEW;
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

CREATE OR REPLACE FUNCTION tecpey_insert_withdrawal_execution_event(
  p_attempt_id UUID,
  p_withdrawal_id TEXT,
  p_event_type TEXT,
  p_outcome TEXT,
  p_correlation_id TEXT,
  p_request_hash TEXT,
  p_expected_tx_hash_fingerprint TEXT,
  p_signed_payload_fingerprint TEXT,
  p_signer_identity_fingerprint TEXT,
  p_provider_policy_fingerprint TEXT,
  p_error_class_fingerprint TEXT,
  p_confirmation_count INTEGER,
  p_required_confirmations INTEGER,
  p_block_height TEXT,
  p_metadata JSONB
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  inserted_id UUID;
  existing RECORD;
BEGIN
  INSERT INTO withdrawal_execution_events
    (attempt_id, withdrawal_id, event_type, outcome, correlation_id,
     request_hash, expected_tx_hash_fingerprint,
     signed_payload_fingerprint, signer_identity_fingerprint,
     provider_policy_fingerprint, error_class_fingerprint,
     confirmation_count, required_confirmations, block_height, metadata)
  VALUES
    (p_attempt_id, p_withdrawal_id, p_event_type, p_outcome,
     p_correlation_id, p_request_hash, p_expected_tx_hash_fingerprint,
     p_signed_payload_fingerprint, p_signer_identity_fingerprint,
     p_provider_policy_fingerprint, p_error_class_fingerprint,
     p_confirmation_count, p_required_confirmations, p_block_height,
     p_metadata)
  ON CONFLICT (attempt_id, event_type, correlation_id) DO NOTHING
  RETURNING id INTO inserted_id;

  IF inserted_id IS NOT NULL THEN
    RETURN;
  END IF;

  SELECT request_hash, expected_tx_hash_fingerprint,
         signed_payload_fingerprint, signer_identity_fingerprint,
         provider_policy_fingerprint, error_class_fingerprint,
         confirmation_count, required_confirmations, block_height, metadata
    INTO existing
    FROM withdrawal_execution_events
   WHERE attempt_id = p_attempt_id
     AND event_type = p_event_type
     AND correlation_id = p_correlation_id
   LIMIT 1;

  IF existing.request_hash IS DISTINCT FROM p_request_hash
     OR existing.expected_tx_hash_fingerprint IS DISTINCT FROM
        p_expected_tx_hash_fingerprint
     OR existing.signed_payload_fingerprint IS DISTINCT FROM
        p_signed_payload_fingerprint
     OR existing.signer_identity_fingerprint IS DISTINCT FROM
        p_signer_identity_fingerprint
     OR existing.provider_policy_fingerprint IS DISTINCT FROM
        p_provider_policy_fingerprint
     OR existing.error_class_fingerprint IS DISTINCT FROM
        p_error_class_fingerprint
     OR existing.confirmation_count IS DISTINCT FROM p_confirmation_count
     OR existing.required_confirmations IS DISTINCT FROM
        p_required_confirmations
     OR existing.block_height IS DISTINCT FROM p_block_height
     OR existing.metadata IS DISTINCT FROM p_metadata THEN
    RAISE EXCEPTION 'withdrawal execution event conflict';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION tecpey_latest_withdrawal_execution_attempt(
  p_withdrawal_id TEXT
)
RETURNS withdrawal_execution_attempts
LANGUAGE sql
STABLE
AS $$
  SELECT attempt.*
    FROM withdrawal_execution_attempts attempt
   WHERE attempt.withdrawal_id = p_withdrawal_id
   ORDER BY attempt.created_at DESC, attempt.id DESC
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION tecpey_append_withdrawal_execution_evidence(
  p_attempt withdrawal_execution_attempts,
  p_action TEXT,
  p_resource_type TEXT,
  p_resource_identity TEXT,
  p_correlation_identity TEXT,
  p_outcome TEXT,
  p_request_hash TEXT,
  p_metadata JSONB
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  suffix TEXT;
  resource_id TEXT;
BEGIN
  suffix := replace(substring(p_action from 12), '.', '-');
  resource_id := CASE p_resource_type
    WHEN 'withdrawal_broadcast_attempt' THEN
      tecpey_withdrawal_evidence_hash(
        'withdrawal-execution-attempt', p_resource_identity
      )
    ELSE
      tecpey_withdrawal_evidence_hash(
        'withdrawal-execution', p_resource_identity
      )
  END;

  PERFORM tecpey_insert_withdrawal_evidence(
    p_attempt.tenant_id,
    'service',
    p_attempt.service_actor_id,
    p_action,
    p_resource_type,
    resource_id,
    p_outcome,
    'withdrawal-' || suffix || ':' || tecpey_withdrawal_evidence_hash(
      'withdrawal-execution-evidence-' || suffix,
      p_correlation_identity
    ),
    p_request_hash,
    jsonb_build_object(
      'policyVersion', 'withdrawal-execution-evidence-v1',
      'executionPolicyVersion', p_attempt.policy_version,
      'attemptFingerprint', tecpey_withdrawal_evidence_hash(
        'withdrawal-execution-attempt', p_attempt.id::text
      )
    ) || COALESCE(p_metadata, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION tecpey_claim_withdrawal_execution_attempt()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  attempt withdrawal_execution_attempts;
  derived_request_hash TEXT;
  lease_fingerprint TEXT;
  correlation_identity TEXT;
BEGIN
  IF NEW.execution_lock_owner IS NULL
     OR NEW.execution_lock_expires_at IS NULL
     OR NEW.execution_lock_expires_at <= NOW()
     OR NEW.state NOT IN ('building', 'signing', 'retryable') THEN
    RETURN NEW;
  END IF;

  IF OLD.execution_lock_owner IS NOT DISTINCT FROM NEW.execution_lock_owner
     AND OLD.execution_lock_expires_at IS NOT DISTINCT FROM
         NEW.execution_lock_expires_at
     AND OLD.state IS NOT DISTINCT FROM NEW.state THEN
    RETURN NEW;
  END IF;

  derived_request_hash := CASE
    WHEN COALESCE(to_jsonb(NEW)->>'request_hash', '') ~ '^[0-9a-f]{64}$'
      THEN to_jsonb(NEW)->>'request_hash'
    ELSE tecpey_withdrawal_evidence_hash(
      'withdrawal-execution-request',
      NEW.id || ':' || NEW.execution_lock_owner || ':' || NEW.state
    )
  END;
  lease_fingerprint := tecpey_withdrawal_evidence_hash(
    'withdrawal-execution-lease-owner', NEW.execution_lock_owner
  );

  INSERT INTO withdrawal_execution_attempts
    (withdrawal_id, tenant_id, service_actor_id, lease_owner,
     lease_owner_fingerprint, request_hash, policy_version)
  VALUES
    (NEW.id, 'tecpey', 'withdrawal-executor', NEW.execution_lock_owner,
     lease_fingerprint, derived_request_hash,
     'withdrawal-execution-attempt-v1')
  ON CONFLICT (withdrawal_id, lease_owner) DO NOTHING;

  SELECT * INTO attempt
    FROM withdrawal_execution_attempts
   WHERE withdrawal_id = NEW.id
     AND lease_owner = NEW.execution_lock_owner
   LIMIT 1;
  IF NOT FOUND
     OR attempt.request_hash <> derived_request_hash
     OR attempt.lease_owner_fingerprint <> lease_fingerprint THEN
    RAISE EXCEPTION 'withdrawal execution attempt conflict';
  END IF;

  correlation_identity := attempt.id::text || ':claim';
  PERFORM tecpey_insert_withdrawal_execution_event(
    attempt.id, NEW.id, 'claim', 'success',
    'withdrawal-execution-claim:' || tecpey_withdrawal_evidence_hash(
      'withdrawal-execution-evidence-claim', correlation_identity
    ),
    derived_request_hash, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    jsonb_build_object(
      'policyVersion', 'withdrawal-execution-attempt-v1',
      'network', lower(NEW.network),
      'asset', upper(NEW.asset),
      'amount', NEW.amount::numeric::text,
      'leaseOwnerFingerprint', lease_fingerprint,
      'leaseExpiresAtFingerprint', tecpey_withdrawal_evidence_hash(
        'withdrawal-execution-lease-expiry',
        NEW.execution_lock_expires_at::text
      )
    )
  );
  PERFORM tecpey_append_withdrawal_execution_evidence(
    attempt,
    'withdrawal.execution.claim',
    'withdrawal_execution',
    NEW.id,
    correlation_identity,
    'success',
    derived_request_hash,
    jsonb_build_object(
      'network', lower(NEW.network),
      'asset', upper(NEW.asset),
      'amount', NEW.amount::numeric::text,
      'leaseOwnerFingerprint', lease_fingerprint
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a_withdrawal_execution_claim_evidence ON withdrawals;
CREATE TRIGGER a_withdrawal_execution_claim_evidence
  AFTER UPDATE ON withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_claim_withdrawal_execution_attempt();

CREATE OR REPLACE FUNCTION tecpey_append_withdrawal_signed_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  attempt withdrawal_execution_attempts;
  new_json JSONB;
  old_json JSONB;
  raw_transaction TEXT;
  old_raw_transaction TEXT;
  expected_tx_hash TEXT;
  tx_fingerprint TEXT;
  payload_fingerprint TEXT;
  signer_fingerprint TEXT;
  provider_fingerprint TEXT;
  correlation_identity TEXT;
  event_metadata JSONB;
BEGIN
  new_json := to_jsonb(NEW);
  old_json := to_jsonb(OLD);
  raw_transaction := COALESCE(
    NULLIF(new_json->>'raw_transaction', ''),
    NULLIF(new_json->>'raw_tx', ''),
    NULLIF(new_json->>'signed_transaction', '')
  );
  old_raw_transaction := COALESCE(
    NULLIF(old_json->>'raw_transaction', ''),
    NULLIF(old_json->>'raw_tx', ''),
    NULLIF(old_json->>'signed_transaction', '')
  );
  expected_tx_hash := COALESCE(
    NULLIF(new_json->>'tx_hash', ''),
    NULLIF(new_json->>'transaction_hash', '')
  );

  IF raw_transaction IS NULL OR expected_tx_hash IS NULL THEN
    RETURN NEW;
  END IF;
  IF raw_transaction IS NOT DISTINCT FROM old_raw_transaction
     AND EXISTS (
       SELECT 1
         FROM withdrawal_execution_events event
        WHERE event.withdrawal_id = NEW.id
          AND event.event_type = 'sign'
     ) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO attempt FROM tecpey_latest_withdrawal_execution_attempt(NEW.id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'withdrawal signed persistence attempt is missing';
  END IF;

  tx_fingerprint := tecpey_withdrawal_evidence_hash(
    'withdrawal-tx-hash', lower(expected_tx_hash)
  );
  payload_fingerprint := tecpey_withdrawal_evidence_hash(
    'withdrawal-signed-payload', raw_transaction
  );
  signer_fingerprint := tecpey_withdrawal_evidence_hash(
    'withdrawal-signer-identity',
    COALESCE(
      NULLIF(new_json->>'signer_identity', ''),
      NULLIF(new_json->>'signed_by', ''),
      NULLIF(new_json->>'signer_type', ''),
      'configured-keystore'
    )
  );
  provider_fingerprint := tecpey_withdrawal_evidence_hash(
    'withdrawal-provider-policy', lower(NEW.network) || ':broadcast-v1'
  );
  event_metadata := jsonb_build_object(
    'policyVersion', 'withdrawal-execution-attempt-v1',
    'network', lower(NEW.network),
    'asset', upper(NEW.asset),
    'amount', NEW.amount::numeric::text
  );

  FOR correlation_identity, event_metadata IN
    SELECT attempt.id::text || ':build',
           event_metadata || jsonb_build_object('stage', 'build')
    UNION ALL
    SELECT attempt.id::text || ':sign',
           event_metadata || jsonb_build_object('stage', 'sign')
    UNION ALL
    SELECT attempt.id::text || ':broadcast-attempt:1',
           event_metadata || jsonb_build_object('stage', 'broadcast_attempt')
  LOOP
    IF correlation_identity LIKE '%:build' THEN
      PERFORM tecpey_insert_withdrawal_execution_event(
        attempt.id, NEW.id, 'build', 'success',
        'withdrawal-transaction-build:' || tecpey_withdrawal_evidence_hash(
          'withdrawal-execution-evidence-transaction-build',
          correlation_identity
        ),
        attempt.request_hash, tx_fingerprint, payload_fingerprint,
        NULL, provider_fingerprint, NULL, NULL, NULL, NULL, event_metadata
      );
      PERFORM tecpey_append_withdrawal_execution_evidence(
        attempt, 'withdrawal.transaction.build', 'withdrawal_execution',
        NEW.id, correlation_identity, 'success', attempt.request_hash,
        event_metadata || jsonb_build_object(
          'expectedTxHashFingerprint', tx_fingerprint,
          'signedPayloadFingerprint', payload_fingerprint,
          'providerPolicyFingerprint', provider_fingerprint
        )
      );
    ELSIF correlation_identity LIKE '%:sign' THEN
      PERFORM tecpey_insert_withdrawal_execution_event(
        attempt.id, NEW.id, 'sign', 'success',
        'withdrawal-transaction-sign:' || tecpey_withdrawal_evidence_hash(
          'withdrawal-execution-evidence-transaction-sign',
          correlation_identity
        ),
        attempt.request_hash, tx_fingerprint, payload_fingerprint,
        signer_fingerprint, provider_fingerprint, NULL, NULL, NULL, NULL,
        event_metadata
      );
      PERFORM tecpey_append_withdrawal_execution_evidence(
        attempt, 'withdrawal.transaction.sign', 'withdrawal_execution',
        NEW.id, correlation_identity, 'success', attempt.request_hash,
        event_metadata || jsonb_build_object(
          'expectedTxHashFingerprint', tx_fingerprint,
          'signedPayloadFingerprint', payload_fingerprint,
          'signerIdentityFingerprint', signer_fingerprint,
          'providerPolicyFingerprint', provider_fingerprint
        )
      );
    ELSE
      PERFORM tecpey_insert_withdrawal_execution_event(
        attempt.id, NEW.id, 'broadcast_attempt', 'started',
        'withdrawal-broadcast-attempt:' || tecpey_withdrawal_evidence_hash(
          'withdrawal-execution-evidence-broadcast-attempt',
          correlation_identity
        ),
        attempt.request_hash, tx_fingerprint, payload_fingerprint,
        signer_fingerprint, provider_fingerprint, NULL, NULL, NULL, NULL,
        event_metadata
      );
      PERFORM tecpey_append_withdrawal_execution_evidence(
        attempt, 'withdrawal.broadcast.attempt',
        'withdrawal_broadcast_attempt', attempt.id::text,
        correlation_identity, 'success', attempt.request_hash,
        event_metadata || jsonb_build_object(
          'classification', 'started',
          'expectedTxHashFingerprint', tx_fingerprint,
          'signedPayloadFingerprint', payload_fingerprint,
          'signerIdentityFingerprint', signer_fingerprint,
          'providerPolicyFingerprint', provider_fingerprint
        )
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS b_withdrawal_signed_persistence_evidence ON withdrawals;
CREATE TRIGGER b_withdrawal_signed_persistence_evidence
  AFTER UPDATE ON withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_append_withdrawal_signed_evidence();

CREATE OR REPLACE FUNCTION tecpey_append_withdrawal_execution_state_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  attempt withdrawal_execution_attempts;
  row_json JSONB;
  expected_tx_hash TEXT;
  tx_fingerprint TEXT;
  provider_fingerprint TEXT;
  error_fingerprint TEXT;
  correlation_identity TEXT;
  event_type TEXT;
  event_outcome TEXT;
  action_name TEXT;
  resource_type_name TEXT;
  evidence_outcome TEXT;
  reconciliation_reason TEXT;
  event_metadata JSONB;
BEGIN
  IF OLD.state IS NOT DISTINCT FROM NEW.state THEN
    RETURN NEW;
  END IF;
  IF NEW.state NOT IN (
    'broadcasted', 'retryable', 'confirming', 'failed', 'timeout'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO attempt FROM tecpey_latest_withdrawal_execution_attempt(NEW.id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'withdrawal execution state attempt is missing';
  END IF;

  row_json := to_jsonb(NEW);
  expected_tx_hash := COALESCE(
    NULLIF(row_json->>'tx_hash', ''),
    NULLIF(row_json->>'transaction_hash', '')
  );
  tx_fingerprint := CASE WHEN expected_tx_hash IS NULL THEN NULL ELSE
    tecpey_withdrawal_evidence_hash(
      'withdrawal-tx-hash', lower(expected_tx_hash)
    )
  END;
  provider_fingerprint := tecpey_withdrawal_evidence_hash(
    'withdrawal-provider-policy', lower(NEW.network) || ':broadcast-v1'
  );
  error_fingerprint := CASE
    WHEN COALESCE(row_json->>'error_code', row_json->>'last_error', '') = ''
      THEN NULL
    ELSE tecpey_withdrawal_evidence_hash(
      'withdrawal-execution-error',
      COALESCE(row_json->>'error_code', row_json->>'last_error')
    )
  END;

  IF NEW.state = 'broadcasted' THEN
    IF expected_tx_hash IS NULL THEN
      RAISE EXCEPTION 'broadcasted withdrawal tx hash is missing';
    END IF;
    event_type := 'broadcast_accept';
    event_outcome := 'success';
    action_name := 'withdrawal.broadcast.accept';
    resource_type_name := 'withdrawal_broadcast_attempt';
    evidence_outcome := 'success';
  ELSIF NEW.state = 'retryable' AND expected_tx_hash IS NOT NULL THEN
    event_type := 'broadcast_ambiguous';
    event_outcome := 'ambiguous';
    action_name := 'withdrawal.broadcast.ambiguous';
    resource_type_name := 'withdrawal_broadcast_attempt';
    evidence_outcome := 'failed';
    reconciliation_reason := 'broadcast_ambiguous';
  ELSIF NEW.state = 'retryable' THEN
    event_type := 'broadcast_reject';
    event_outcome := 'failed';
    action_name := 'withdrawal.broadcast.reject';
    resource_type_name := 'withdrawal_broadcast_attempt';
    evidence_outcome := 'failed';
  ELSIF NEW.state = 'confirming' THEN
    IF expected_tx_hash IS NULL THEN
      RAISE EXCEPTION 'confirming withdrawal tx hash is missing';
    END IF;
    event_type := 'confirming';
    event_outcome := 'success';
    action_name := 'withdrawal.confirming';
    resource_type_name := 'withdrawal_execution';
    evidence_outcome := 'success';
  ELSIF NEW.state = 'timeout' THEN
    event_type := 'timeout';
    event_outcome := 'failed';
    action_name := 'withdrawal.timeout';
    resource_type_name := 'withdrawal_execution';
    evidence_outcome := 'failed';
    reconciliation_reason := 'confirmation_unknown';
  ELSE
    event_type := 'dropped';
    event_outcome := 'failed';
    action_name := 'withdrawal.dropped';
    resource_type_name := 'withdrawal_execution';
    evidence_outcome := 'failed';
    IF expected_tx_hash IS NOT NULL THEN
      reconciliation_reason := 'provider_unknown';
    END IF;
  END IF;

  correlation_identity := attempt.id::text || ':' || event_type || ':' ||
    COALESCE(tx_fingerprint, 'no-tx');
  event_metadata := jsonb_build_object(
    'policyVersion', 'withdrawal-execution-attempt-v1',
    'network', lower(NEW.network),
    'asset', upper(NEW.asset),
    'amount', NEW.amount::numeric::text,
    'previousState', OLD.state,
    'finalState', NEW.state,
    'reservationRetained', NEW.funds_reserved_at IS NOT NULL
  );

  PERFORM tecpey_insert_withdrawal_execution_event(
    attempt.id, NEW.id, event_type, event_outcome,
    'withdrawal-' || replace(action_name, '.', '-') || ':' ||
      tecpey_withdrawal_evidence_hash(
        'withdrawal-execution-state-event', correlation_identity
      ),
    attempt.request_hash, tx_fingerprint, NULL, NULL,
    provider_fingerprint, error_fingerprint,
    CASE WHEN COALESCE(row_json->>'confirmations', '') ~ '^[0-9]+$'
      THEN (row_json->>'confirmations')::integer ELSE NULL END,
    CASE WHEN COALESCE(row_json->>'required_confirmations', '') ~ '^[0-9]+$'
      THEN (row_json->>'required_confirmations')::integer ELSE NULL END,
    NULLIF(row_json->>'block_height', ''), event_metadata
  );
  PERFORM tecpey_append_withdrawal_execution_evidence(
    attempt, action_name, resource_type_name,
    CASE WHEN resource_type_name = 'withdrawal_broadcast_attempt'
      THEN attempt.id::text ELSE NEW.id END,
    correlation_identity, evidence_outcome, attempt.request_hash,
    event_metadata || jsonb_build_object(
      'classification', event_type,
      'expectedTxHashFingerprint', tx_fingerprint,
      'providerPolicyFingerprint', provider_fingerprint,
      'errorClassFingerprint', error_fingerprint
    )
  );

  IF reconciliation_reason IS NOT NULL AND tx_fingerprint IS NOT NULL THEN
    INSERT INTO withdrawal_reconciliation_outbox
      (withdrawal_id, attempt_id, expected_tx_hash_fingerprint, reason,
       last_error_class_fingerprint)
    VALUES
      (NEW.id, attempt.id, tx_fingerprint, reconciliation_reason,
       error_fingerprint)
    ON CONFLICT (withdrawal_id, attempt_id, reason) DO UPDATE
      SET status = CASE
            WHEN withdrawal_reconciliation_outbox.status = 'completed'
              THEN withdrawal_reconciliation_outbox.status
            ELSE 'pending'
          END,
          available_at = LEAST(
            withdrawal_reconciliation_outbox.available_at, NOW()
          ),
          last_error_class_fingerprint = COALESCE(
            EXCLUDED.last_error_class_fingerprint,
            withdrawal_reconciliation_outbox.last_error_class_fingerprint
          ),
          updated_at = NOW();
  ELSIF NEW.state = 'broadcasted' THEN
    UPDATE withdrawal_reconciliation_outbox
       SET status = 'completed', completed_at = COALESCE(completed_at, NOW()),
           updated_at = NOW()
     WHERE withdrawal_id = NEW.id
       AND attempt_id = attempt.id
       AND status IN ('pending', 'processing', 'failed_retryable');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS c_withdrawal_execution_state_evidence ON withdrawals;
CREATE TRIGGER c_withdrawal_execution_state_evidence
  AFTER UPDATE OF state ON withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_append_withdrawal_execution_state_evidence();

CREATE OR REPLACE FUNCTION tecpey_block_unreconciled_withdrawal_rebroadcast()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.state = 'retryable'
     AND NEW.state IN ('building', 'signing')
     AND EXISTS (
       SELECT 1
         FROM withdrawal_reconciliation_outbox reconciliation
        WHERE reconciliation.withdrawal_id = NEW.id
          AND reconciliation.status IN (
            'pending', 'processing', 'failed_retryable'
          )
     ) THEN
    RAISE EXCEPTION 'withdrawal reconciliation is required before rebroadcast';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS withdrawal_unreconciled_rebroadcast_guard
  ON withdrawals;
CREATE TRIGGER withdrawal_unreconciled_rebroadcast_guard
  BEFORE UPDATE OF state ON withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_block_unreconciled_withdrawal_rebroadcast();

CREATE OR REPLACE FUNCTION tecpey_append_withdrawal_settlement_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  attempt withdrawal_execution_attempts;
  row_json JSONB;
  expected_tx_hash TEXT;
  tx_fingerprint TEXT;
  ledger_row RECORD;
  correlation_identity TEXT;
  confirmation_count INTEGER;
  required_count INTEGER;
  block_height TEXT;
  event_metadata JSONB;
BEGIN
  SELECT * INTO attempt FROM tecpey_latest_withdrawal_execution_attempt(NEW.id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'withdrawal settlement execution attempt is missing';
  END IF;

  row_json := to_jsonb(NEW);
  expected_tx_hash := COALESCE(
    NULLIF(row_json->>'tx_hash', ''),
    NULLIF(row_json->>'transaction_hash', '')
  );
  IF expected_tx_hash IS NULL THEN
    RAISE EXCEPTION 'completed withdrawal tx hash is missing';
  END IF;
  tx_fingerprint := tecpey_withdrawal_evidence_hash(
    'withdrawal-tx-hash', lower(expected_tx_hash)
  );

  SELECT COUNT(*)::integer AS ledger_count,
         COALESCE(SUM(amount), 0)::numeric AS ledger_amount
    INTO ledger_row
    FROM wallet_ledger
   WHERE wallet_id = NEW.user_id
     AND asset = NEW.asset
     AND type = 'withdraw'
     AND reference_type = 'withdrawal'
     AND reference_id = NEW.id;
  IF ledger_row.ledger_count <> 1
     OR ledger_row.ledger_amount <> NEW.amount::numeric THEN
    RAISE EXCEPTION 'withdrawal settlement ledger evidence is incomplete';
  END IF;
  IF NEW.funds_reserved_at IS NOT NULL THEN
    RAISE EXCEPTION 'completed withdrawal retains reservation authority';
  END IF;

  confirmation_count := CASE
    WHEN COALESCE(row_json->>'confirmations', '') ~ '^[0-9]+$'
      THEN (row_json->>'confirmations')::integer
    ELSE COALESCE(
      NULLIF(row_json->>'required_confirmations', '')::integer,
      1
    )
  END;
  required_count := CASE
    WHEN COALESCE(row_json->>'required_confirmations', '') ~ '^[0-9]+$'
      THEN (row_json->>'required_confirmations')::integer
    ELSE 1
  END;
  block_height := NULLIF(row_json->>'block_height', '');
  IF confirmation_count < required_count THEN
    RAISE EXCEPTION 'withdrawal settlement finality evidence is incomplete';
  END IF;

  correlation_identity := attempt.id::text || ':settlement:' || tx_fingerprint;
  event_metadata := jsonb_build_object(
    'policyVersion', 'withdrawal-execution-attempt-v1',
    'network', lower(NEW.network),
    'asset', upper(NEW.asset),
    'amount', NEW.amount::numeric::text,
    'expectedTxHashFingerprint', tx_fingerprint,
    'confirmationCount', confirmation_count,
    'requiredConfirmations', required_count,
    'blockHeight', block_height,
    'ledgerCount', ledger_row.ledger_count,
    'ledgerAmount', ledger_row.ledger_amount::text,
    'reservationConsumed', TRUE
  );

  PERFORM tecpey_insert_withdrawal_execution_event(
    attempt.id, NEW.id, 'settle', 'success',
    'withdrawal-settle:' || tecpey_withdrawal_evidence_hash(
      'withdrawal-execution-evidence-settle', correlation_identity
    ),
    attempt.request_hash, tx_fingerprint, NULL, NULL, NULL, NULL,
    confirmation_count, required_count, block_height, event_metadata
  );
  PERFORM tecpey_append_withdrawal_execution_evidence(
    attempt, 'withdrawal.settle', 'withdrawal_settlement', NEW.id,
    correlation_identity || ':settle', 'success', attempt.request_hash,
    event_metadata
  );

  PERFORM tecpey_insert_withdrawal_execution_event(
    attempt.id, NEW.id, 'complete', 'success',
    'withdrawal-complete:' || tecpey_withdrawal_evidence_hash(
      'withdrawal-execution-evidence-complete', correlation_identity
    ),
    attempt.request_hash, tx_fingerprint, NULL, NULL, NULL, NULL,
    confirmation_count, required_count, block_height, event_metadata
  );
  PERFORM tecpey_append_withdrawal_execution_evidence(
    attempt, 'withdrawal.complete', 'withdrawal_settlement', NEW.id,
    correlation_identity || ':complete', 'success', attempt.request_hash,
    event_metadata
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS withdrawal_settlement_mandatory_evidence ON withdrawals;
CREATE CONSTRAINT TRIGGER withdrawal_settlement_mandatory_evidence
  AFTER UPDATE OF state ON withdrawals
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (OLD.state IS DISTINCT FROM NEW.state AND NEW.state = 'completed')
  EXECUTE FUNCTION tecpey_append_withdrawal_settlement_evidence();

-- Cut over any already prepared/broadcasted rows so future confirmation or
-- settlement transitions have an immutable attempt identity. This does not
-- send, rebuild, sign or change financial state.
INSERT INTO withdrawal_execution_attempts
  (withdrawal_id, tenant_id, service_actor_id, lease_owner,
   lease_owner_fingerprint, request_hash, policy_version)
SELECT
  withdrawal.id,
  'tecpey',
  'withdrawal-execution-cutover',
  'cutover:' || withdrawal.id,
  tecpey_withdrawal_evidence_hash(
    'withdrawal-execution-lease-owner', 'cutover:' || withdrawal.id
  ),
  CASE
    WHEN COALESCE(to_jsonb(withdrawal)->>'request_hash', '') ~ '^[0-9a-f]{64}$'
      THEN to_jsonb(withdrawal)->>'request_hash'
    ELSE tecpey_withdrawal_evidence_hash(
      'withdrawal-execution-request',
      withdrawal.id || ':cutover:' || withdrawal.state
    )
  END,
  'withdrawal-execution-attempt-v1'
FROM withdrawals withdrawal
WHERE withdrawal.state IN (
  'building', 'signing', 'retryable', 'broadcasted', 'confirming',
  'failed', 'timeout', 'completed'
)
AND NOT EXISTS (
  SELECT 1 FROM withdrawal_execution_attempts attempt
   WHERE attempt.withdrawal_id = withdrawal.id
)
ON CONFLICT (withdrawal_id, lease_owner) DO NOTHING;
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runWithdrawalExecutionEvidenceGateMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(WITHDRAWAL_EXECUTION_EVIDENCE_GATES_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-withdrawal-execution-evidence-gates] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-withdrawal-execution-evidence-gates] applying migration", {
    filename: FILENAME,
  });
  await client.query("BEGIN");
  try {
    await client.query(WITHDRAWAL_EXECUTION_EVIDENCE_GATES_SQL);
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
